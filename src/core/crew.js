const Anthropic = require('@anthropic-ai/sdk').default;
const { supabase } = require('../db/supabase');
const { searchWeb } = require('./search');
const { sendBossMessage, logToDiscord } = require('../channels/discord');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Worker Tools (what sub-agents can use) ──

const workerTools = {
  brave_search: async ({ query }) => {
    const results = await searchWeb(query);
    if (!results.length) return 'No results for: ' + query;
    return results.map(r => r.title + '\n' + r.url + '\n' + r.snippet).join('\n\n');
  },

  web_fetch: async ({ url }) => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const text = await res.text();
      return text.substring(0, 5000);
    } catch (e) { return 'Error fetching: ' + e.message; }
  },

  analyze: async ({ data, question }) => {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: 'Analyze this data and answer the question.\n\nData:\n' + (data || '').substring(0, 4000) + '\n\nQuestion: ' + question }],
    });
    return res.content[0].text;
  },

  content_create: async ({ type, brief }) => {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: 'Create the following content. Be specific, compelling, and ready to use.\n\nType: ' + type + '\nBrief: ' + brief }],
    });
    return res.content[0].text;
  },

  alert: async ({ message, channel }) => {
    if (channel === 'boss') await sendBossMessage(message);
    else await logToDiscord('daily-reports', message);
    return 'Alert sent';
  },
};

// ── Get Workers ──

async function getWorkers() {
  const { data } = await supabase.from('agent_workers').select('*').eq('status', 'active');
  return data || [];
}

async function getWorker(workerId) {
  const { data } = await supabase.from('agent_workers').select('*').eq('id', workerId).single();
  return data;
}

// ── Job Queue ──

async function createJob(workerId, title, description, input, priority, parentJobId) {
  const id = 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const { error } = await supabase.from('agent_jobs').insert({
    id, worker_id: workerId, title, description,
    status: 'pending', priority: priority || 5,
    input: input || {}, parent_job_id: parentJobId || '',
  });
  if (error) { console.error('[CREW] Create job error:', error.message); return null; }
  console.log('[CREW] Job created: ' + title + ' -> ' + workerId);
  return id;
}

async function getPendingJobs(workerId) {
  let q = supabase.from('agent_jobs').select('*').eq('status', 'pending').order('priority', { ascending: false }).order('created_at').limit(5);
  if (workerId) q = q.eq('worker_id', workerId);
  const { data } = await q;
  return data || [];
}

async function getAllJobs(limit) {
  const { data } = await supabase.from('agent_jobs').select('*').order('created_at', { ascending: false }).limit(limit || 20);
  return data || [];
}

async function updateJob(jobId, updates) {
  const { error } = await supabase.from('agent_jobs').update(updates).eq('id', jobId);
  if (error) console.error('[CREW] Update job error:', error.message);
}

async function updateWorkerStats(workerId, success) {
  const field = success ? 'tasks_completed' : 'tasks_failed';
  const worker = await getWorker(workerId);
  if (worker) {
    await supabase.from('agent_workers').update({ [field]: (worker[field] || 0) + 1 }).eq('id', workerId);
  }
}

// ── Execute a Job (run a sub-agent) ──

const MAX_WORKER_ITERATIONS = 8;

async function executeJob(job) {
  const worker = await getWorker(job.worker_id);
  if (!worker) {
    await updateJob(job.id, { status: 'failed', error: 'Worker not found: ' + job.worker_id });
    return null;
  }

  console.log('[CREW] ' + worker.name + ' starting: ' + job.title);
  await updateJob(job.id, { status: 'running', started_at: new Date().toISOString() });

  const availableTools = (worker.tools || []).filter(t => workerTools[t]);
  const toolDescriptions = availableTools.map(t => '  ' + t + ' — call with {"tool": "' + t + '", "input": {...}}').join('\n');

  const systemPrompt = worker.system_prompt + '\n\nAVAILABLE TOOLS:\n' + toolDescriptions +
    '\n\nTo use a tool, respond with ONLY a JSON block: {"tool": "tool_name", "input": {...}}' +
    '\nWhen done, respond with ONLY: {"done": true, "result": "your findings/output"}' +
    '\nYou have up to ' + MAX_WORKER_ITERATIONS + ' tool uses. Be efficient.';

  const messages = [{
    role: 'user',
    content: 'TASK: ' + job.title + '\n\nDETAILS: ' + job.description +
      (job.input && Object.keys(job.input).length ? '\n\nINPUT: ' + JSON.stringify(job.input) : ''),
  }];

  const toolLog = [];

  for (let i = 0; i < MAX_WORKER_ITERATIONS; i++) {
    let response;
    try {
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages,
      });
    } catch (err) {
      console.error('[CREW] ' + worker.name + ' API error:', err.message);
      await updateJob(job.id, { status: 'failed', error: err.message, completed_at: new Date().toISOString() });
      await updateWorkerStats(worker.id, false);
      return null;
    }

    const text = response.content[0].text;
    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch { parsed = null; }

    if (!parsed) {
      // Plain text = treat as final result
      await updateJob(job.id, {
        status: 'completed',
        output: { result: text.substring(0, 5000), tools_used: toolLog.length },
        completed_at: new Date().toISOString(),
      });
      await updateWorkerStats(worker.id, true);
      console.log('[CREW] ' + worker.name + ' finished (plain text): ' + job.title);
      return text;
    }

    if (parsed.done) {
      await updateJob(job.id, {
        status: 'completed',
        output: { result: parsed.result || '', tools_used: toolLog.length },
        completed_at: new Date().toISOString(),
      });
      await updateWorkerStats(worker.id, true);
      console.log('[CREW] ' + worker.name + ' completed: ' + job.title + ' (' + toolLog.length + ' tools)');
      return parsed.result;
    }

    if (parsed.tool && workerTools[parsed.tool] && availableTools.indexOf(parsed.tool) !== -1) {
      console.log('[CREW] ' + worker.name + ' using: ' + parsed.tool);
      let result;
      try {
        result = await workerTools[parsed.tool](parsed.input || {});
      } catch (err) {
        result = 'Error: ' + err.message;
      }

      const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
      toolLog.push({ tool: parsed.tool, timestamp: new Date().toISOString() });
      messages.push({ role: 'assistant', content: text });
      messages.push({ role: 'user', content: 'Tool result (' + parsed.tool + '):\n' + resultStr.substring(0, 4000) });
    } else {
      console.log('[CREW] ' + worker.name + ' bad tool call:', text.substring(0, 80));
      break;
    }
  }

  // Ran out of iterations
  await updateJob(job.id, {
    status: 'completed',
    output: { result: 'Max iterations reached', tools_used: toolLog.length },
    completed_at: new Date().toISOString(),
  });
  await updateWorkerStats(worker.id, true);
  return null;
}

// ── Process Queue (run all pending jobs) ──

async function processQueue() {
  const jobs = await getPendingJobs();
  if (!jobs.length) {
    console.log('[CREW] No pending jobs');
    return [];
  }

  console.log('[CREW] Processing ' + jobs.length + ' pending jobs');
  const results = [];

  for (const job of jobs) {
    try {
      const result = await executeJob(job);
      results.push({ jobId: job.id, worker: job.worker_id, title: job.title, result: result ? 'success' : 'no result' });
    } catch (err) {
      console.error('[CREW] Job failed:', job.title, err.message);
      await updateJob(job.id, { status: 'failed', error: err.message, completed_at: new Date().toISOString() });
      await updateWorkerStats(job.worker_id, false);
      results.push({ jobId: job.id, worker: job.worker_id, title: job.title, result: 'error: ' + err.message });
    }
  }

  return results;
}

// ── Get crew status for dashboard ──

async function getCrewStatus() {
  const [workers, recentJobs] = await Promise.all([
    getWorkers(),
    getAllJobs(30),
  ]);

  const pending = recentJobs.filter(j => j.status === 'pending').length;
  const running = recentJobs.filter(j => j.status === 'running').length;
  const completed = recentJobs.filter(j => j.status === 'completed').length;
  const failed = recentJobs.filter(j => j.status === 'failed').length;

  return {
    workers: workers.map(w => ({
      id: w.id, name: w.name, type: w.type,
      completed: w.tasks_completed || 0, failed: w.tasks_failed || 0,
      successRate: (w.tasks_completed || 0) > 0
        ? Math.round(((w.tasks_completed || 0) / ((w.tasks_completed || 0) + (w.tasks_failed || 0))) * 100)
        : 0,
    })),
    jobs: { pending, running, completed, failed, total: recentJobs.length },
    recentJobs: recentJobs.slice(0, 10).map(j => ({
      id: j.id, worker: j.worker_id, title: j.title, status: j.status,
      result: j.output?.result ? String(j.output.result).substring(0, 200) : '',
      created: j.created_at, completed: j.completed_at,
    })),
  };
}

module.exports = {
  createJob,
  getPendingJobs,
  getAllJobs,
  executeJob,
  processQueue,
  getWorkers,
  getCrewStatus,
  updateJob,
};
