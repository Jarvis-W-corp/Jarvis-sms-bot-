// tasks.js — Background task runner with idempotency, progress tracking, timeouts
// Never re-processes a file already done. Tracks everything. Finishes cleanly.

const db = require('../db/queries');

const activeTasks = new Map();
const TASK_TIMEOUT = 10 * 60 * 1000; // 10 min max per task
const FILE_TIMEOUT = 3 * 60 * 1000;  // 3 min max per file

// ═══ START TASK ═══
async function startTask(tenantId, type, title, params, runFn) {
  const task = await db.createAgentTask(tenantId, {
    type,
    title,
    description: JSON.stringify(params),
    status: 'running',
    priority: 8,
  });

  const taskId = task.id;
  const state = {
    id: taskId,
    type,
    title,
    status: 'running',
    progress: 0,
    total: 0,
    currentFile: null,
    results: [],
    errors: [],
    skipped: [],
    startedAt: Date.now(),
    killed: false,
  };
  activeTasks.set(taskId, state);

  // Run in background
  _executeTask(taskId, tenantId, params, runFn).catch(err => {
    console.error('[TASKS] Fatal error in task ' + taskId + ':', err.message);
    state.status = 'failed';
    state.error = err.message;
    db.updateAgentTask(taskId, { status: 'failed', result: 'Fatal: ' + err.message }).catch(() => {});
  });

  return { taskId, status: 'running', title };
}

// Kill a running task
function killTask(taskId) {
  const state = activeTasks.get(taskId);
  if (state && state.status === 'running') {
    state.killed = true;
    state.status = 'killed';
    return true;
  }
  return false;
}

async function _executeTask(taskId, tenantId, params, runFn) {
  const state = activeTasks.get(taskId);
  if (!state) return;

  const timer = setTimeout(() => {
    if (state.status === 'running') {
      state.status = 'timeout';
      console.log('[TASKS] Task ' + taskId + ' timed out');
      db.updateAgentTask(taskId, {
        status: 'timeout',
        result: _buildSummary(state),
        completed_at: new Date().toISOString(),
      }).catch(() => {});
    }
  }, TASK_TIMEOUT);

  try {
    await runFn(state, tenantId, params);
    if (state.status === 'running') {
      state.status = 'completed';
      state.progress = state.total;
    }
  } catch (err) {
    if (state.status === 'running') {
      state.status = 'failed';
      state.error = err.message;
    }
  } finally {
    clearTimeout(timer);
    const summary = _buildSummary(state);
    await db.updateAgentTask(taskId, {
      status: state.status,
      result: summary,
      completed_at: new Date().toISOString(),
    }).catch(() => {});
    // Keep in memory 30 min for status checks
    setTimeout(() => activeTasks.delete(taskId), 30 * 60 * 1000);
  }
}

function _buildSummary(state) {
  const parts = [`${state.results.length}/${state.total} processed`];
  if (state.skipped.length > 0) parts.push(`${state.skipped.length} skipped (already done)`);
  if (state.errors.length > 0) parts.push(`${state.errors.length} failed: ${state.errors.map(e => e.name).join(', ')}`);
  if (state.results.length > 0) {
    parts.push('\n\nResults:\n' + state.results.map(r => '• ' + r.name + ': ' + (r.summary || 'done')).join('\n'));
  }
  return parts.join('. ');
}

// ═══ STATUS ═══

async function getTaskStatus(taskId) {
  const mem = activeTasks.get(taskId);
  if (mem) {
    return {
      id: mem.id,
      status: mem.status,
      progress: mem.progress,
      total: mem.total,
      currentFile: mem.currentFile,
      completed: mem.results.length,
      skipped: mem.skipped.length,
      errors: mem.errors.length,
      elapsed: Math.round((Date.now() - mem.startedAt) / 1000),
      summary: mem.status !== 'running' ? _buildSummary(mem) : null,
    };
  }
  return { id: taskId, status: 'unknown', message: 'Task not in memory — may have completed' };
}

function getActiveTasks() {
  const tasks = [];
  for (const [id, state] of activeTasks) {
    tasks.push({
      id,
      type: state.type,
      title: state.title,
      status: state.status,
      progress: state.progress,
      total: state.total,
      currentFile: state.currentFile,
      completed: state.results.length,
      skipped: state.skipped.length,
      errors: state.errors.length,
      elapsed: Math.round((Date.now() - state.startedAt) / 1000),
    });
  }
  return tasks;
}

// ═══ DRIVE FOLDER PROCESSOR (with idempotency) ═══

async function processDriveFolder(state, tenantId, params) {
  const drive = require('./drive');
  const content = require('./content');
  const memory = require('./memory');

  const { folderId, purpose } = params;

  // 1. List files
  const files = await drive.listFiles(folderId, { limit: 100 }, tenantId);
  const processable = files.filter(f =>
    !f.mimeType.includes('folder') &&
    (f.mimeType.includes('video') || f.mimeType.includes('pdf') ||
     f.mimeType.includes('image') || f.mimeType.includes('text') ||
     f.mimeType.includes('document') || f.mimeType.includes('spreadsheet') ||
     f.name.match(/\.(mp4|mov|webm|avi|pdf|txt|csv|doc|docx|png|jpg|jpeg)$/i))
  );

  state.total = processable.length;
  console.log('[TASKS] Processing ' + processable.length + ' files from Drive folder');

  // 2. Process each file — skip already-processed ones
  for (let i = 0; i < processable.length; i++) {
    if (state.killed || state.status !== 'running') break;
    const file = processable[i];
    state.progress = i + 1;
    state.currentFile = file.name;

    // Idempotency check
    try {
      const alreadyDone = await db.isFileProcessed(tenantId, file.id);
      if (alreadyDone) {
        console.log('[TASKS] Skipping (already processed): ' + file.name);
        state.skipped.push({ name: file.name, fileId: file.id });
        continue;
      }
    } catch (e) { /* table may not exist, continue processing */ }

    console.log('[TASKS] (' + (i + 1) + '/' + processable.length + ') Processing: ' + file.name);

    try {
      const result = await Promise.race([
        _processOneFile(file, tenantId, purpose),
        new Promise((_, reject) => setTimeout(() => reject(new Error('File timeout (3min)')), FILE_TIMEOUT)),
      ]);

      state.results.push({ name: file.name, summary: result.substring(0, 200) });

      // Mark as processed (idempotency)
      try {
        await db.markFileProcessed(tenantId, file.id, file.name, 'drive', result.substring(0, 500));
      } catch (e) { /* table may not exist */ }

      // Store to memory
      await memory.storeMemory(
        tenantId, 'training',
        'Drive file "' + file.name + '": ' + result.substring(0, 400),
        7, 'task_processor'
      ).catch(() => {});

    } catch (err) {
      console.error('[TASKS] File failed: ' + file.name + ' — ' + err.message);
      state.errors.push({ name: file.name, error: err.message });
    }
  }

  state.progress = processable.length;
}

async function _processOneFile(file, tenantId, purpose) {
  const drive = require('./drive');
  const content = require('./content');
  const fs = require('fs');

  const isVideo = file.mimeType.includes('video') || file.name.match(/\.(mp4|mov|webm|avi)$/i);

  if (isVideo) {
    const destPath = '/tmp/jarvis_task_' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9.]/g, '_');
    const dl = await drive.downloadFile(file.id, destPath, tenantId);
    try {
      const result = await content.processVideoAttachment('file://' + dl.path, purpose || '', tenantId, file.name);
      return result.analysis;
    } finally {
      try { fs.unlinkSync(dl.path); } catch (e) {}
    }
  }

  // PDF / text / doc
  const fileContent = await drive.readFileContent(file.id, tenantId);
  if (Buffer.isBuffer(fileContent.content)) {
    if (fileContent.mimeType === 'application/pdf' || file.name.endsWith('.pdf')) {
      const result = await content.processContent(fileContent.content, purpose || '', tenantId);
      return result.analysis;
    }
    return 'Binary file skipped: ' + file.name;
  }
  const textInput = typeof fileContent.content === 'string'
    ? fileContent.content.substring(0, 15000)
    : fileContent.content.toString().substring(0, 15000);
  const result = await content.processContent(textInput, purpose || '', tenantId);
  return result.analysis;
}

module.exports = {
  startTask,
  killTask,
  getTaskStatus,
  getActiveTasks,
  processDriveFolder,
  FILE_TIMEOUT,
  TASK_TIMEOUT,
};
