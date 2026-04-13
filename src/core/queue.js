// queue.js — BullMQ job queue system
// Replaces 2-hour Supabase polling with instant job execution via Redis
// Every job is persistent, retried on failure, and prioritized

const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');

// Redis connection — Mac Mini via Tailscale, fallback to env var, fallback to localhost
const REDIS_URL = process.env.REDIS_URL || 'redis://100.99.236.79:6379';

let connection;
let crewQueue;
let crewWorker;
let ideaQueue;
let ideaWorker;
let isReady = false;
let isFrozen = false;

function getConnection() {
  if (connection) return connection;
  connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
    retryStrategy: (times) => {
      if (times > 10) {
        console.error('[QUEUE] Redis connection failed after 10 retries');
        return null;
      }
      return Math.min(times * 500, 5000);
    },
  });

  connection.on('connect', () => console.log('[QUEUE] Redis connected: ' + REDIS_URL));
  connection.on('error', (err) => console.error('[QUEUE] Redis error:', err.message));

  return connection;
}

// ═══ CREW QUEUE — agent jobs (Hawk, Ghost, Pulse) ═══

function initCrewQueue() {
  const conn = getConnection();

  crewQueue = new Queue('jarvis:crew', {
    connection: conn,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  });

  return crewQueue;
}

function initCrewWorker(processJob) {
  // Worker needs its own connection (BullMQ requirement)
  const workerConn = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  crewWorker = new Worker('jarvis:crew', async (job) => {
    if (isFrozen) {
      console.log('[QUEUE] System frozen — skipping job: ' + job.data.title);
      return { skipped: true, reason: 'frozen' };
    }
    return processJob(job);
  }, {
    connection: workerConn,
    concurrency: 2,          // Hawk + Ghost can work in parallel
    limiter: {
      max: 10,               // max 10 jobs per minute (API budget protection)
      duration: 60000,
    },
  });

  crewWorker.on('completed', (job, result) => {
    console.log('[QUEUE] Job completed: ' + job.data.title + ' (' + job.id + ')');
  });

  crewWorker.on('failed', (job, err) => {
    console.error('[QUEUE] Job failed: ' + (job?.data?.title || '?') + ' — ' + err.message +
      ' (attempt ' + (job?.attemptsMade || '?') + '/' + (job?.opts?.attempts || '?') + ')');
  });

  crewWorker.on('error', (err) => {
    console.error('[QUEUE] Worker error:', err.message);
  });

  return crewWorker;
}

// ═══ IDEA QUEUE — scored ideas that auto-execute ═══

function initIdeaQueue() {
  const conn = getConnection();

  ideaQueue = new Queue('jarvis:ideas', {
    connection: conn,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 10000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 },
    },
  });

  return ideaQueue;
}

function initIdeaWorker(processIdea) {
  const workerConn = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  ideaWorker = new Worker('jarvis:ideas', async (job) => {
    if (isFrozen) {
      console.log('[QUEUE] System frozen — skipping idea: ' + job.data.title);
      return { skipped: true, reason: 'frozen' };
    }
    return processIdea(job);
  }, {
    connection: workerConn,
    concurrency: 1,
    limiter: {
      max: 5,
      duration: 3600000,
    },
  });

  ideaWorker.on('completed', (job) => {
    console.log('[QUEUE] Idea executed: ' + job.data.title);
  });

  ideaWorker.on('failed', (job, err) => {
    console.error('[QUEUE] Idea failed: ' + (job?.data?.title || '?') + ' — ' + err.message);
  });

  return ideaWorker;
}

// ═══ ADD JOBS ═══

async function addCrewJob(data, opts = {}) {
  if (!crewQueue) {
    console.error('[QUEUE] Crew queue not initialized — job dropped: ' + data.title);
    return null;
  }

  const priority = opts.priority || data.priority || 5;
  // BullMQ: lower number = higher priority. Our system: higher = higher.
  const bullPriority = Math.max(1, 11 - priority);

  const job = await crewQueue.add('crew_job', data, {
    priority: bullPriority,
    jobId: data.jobId || undefined,
    ...opts,
  });

  console.log('[QUEUE] Job queued: ' + data.title + ' (priority ' + priority + ')');
  return job;
}

async function addIdeaJob(data, opts = {}) {
  if (!ideaQueue) {
    console.error('[QUEUE] Idea queue not initialized — idea dropped: ' + data.title);
    return null;
  }

  const priority = Math.max(1, 11 - Math.round((data.priority_score || 0.5) * 10));

  const job = await ideaQueue.add('execute_idea', data, {
    priority,
    ...opts,
  });

  console.log('[QUEUE] Idea queued: ' + data.title + ' (score ' + data.priority_score + ')');
  return job;
}

// ═══ FREEZE / UNFREEZE ═══

function freeze() {
  isFrozen = true;
  console.log('[QUEUE] System FROZEN — no new jobs will execute');
  return true;
}

function unfreeze() {
  isFrozen = false;
  console.log('[QUEUE] System UNFROZEN — jobs resuming');
  return true;
}

function isFrozenState() {
  return isFrozen;
}

// ═══ STATUS ═══

async function getQueueStatus() {
  const status = { crew: null, ideas: null, frozen: isFrozen, redis: false };

  try {
    if (crewQueue) {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        crewQueue.getWaitingCount(),
        crewQueue.getActiveCount(),
        crewQueue.getCompletedCount(),
        crewQueue.getFailedCount(),
        crewQueue.getDelayedCount(),
      ]);
      status.crew = { waiting, active, completed, failed, delayed };
    }

    if (ideaQueue) {
      const [waiting, active, completed, failed] = await Promise.all([
        ideaQueue.getWaitingCount(),
        ideaQueue.getActiveCount(),
        ideaQueue.getCompletedCount(),
        ideaQueue.getFailedCount(),
      ]);
      status.ideas = { waiting, active, completed, failed };
    }

    status.redis = true;
  } catch (err) {
    console.error('[QUEUE] Status error:', err.message);
  }

  return status;
}

// ═══ CLEANUP ═══

async function shutdown() {
  console.log('[QUEUE] Shutting down...');
  if (crewWorker) await crewWorker.close();
  if (ideaWorker) await ideaWorker.close();
  if (crewQueue) await crewQueue.close();
  if (ideaQueue) await ideaQueue.close();
  if (connection) await connection.quit();
  console.log('[QUEUE] Shutdown complete');
}

// ═══ INIT ═══

async function init(crewProcessor, ideaProcessor) {
  try {
    initCrewQueue();
    initCrewWorker(crewProcessor);

    if (ideaProcessor) {
      initIdeaQueue();
      initIdeaWorker(ideaProcessor);
    }

    isReady = true;
    console.log('[QUEUE] BullMQ initialized — crew + idea queues ready');
    return true;
  } catch (err) {
    console.error('[QUEUE] Init failed:', err.message);
    console.error('[QUEUE] Will fall back to Supabase polling mode');
    isReady = false;
    return false;
  }
}

function isQueueReady() {
  return isReady;
}

module.exports = {
  init,
  isQueueReady,
  addCrewJob,
  addIdeaJob,
  getQueueStatus,
  freeze,
  unfreeze,
  isFrozenState,
  shutdown,
  getConnection,
};
