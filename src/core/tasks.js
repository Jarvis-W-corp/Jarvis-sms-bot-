// tasks.js — Background task runner with progress tracking
// Prevents Jarvis from getting stuck on long-running jobs (Drive processing, bulk analysis)
// Tasks run async, report progress, have timeouts, and finish cleanly.

const db = require('../db/queries');

// In-memory task tracker (also persisted to agent_tasks table)
const activeTasks = new Map();

const TASK_TIMEOUT = 10 * 60 * 1000; // 10 min max per task
const FILE_TIMEOUT = 3 * 60 * 1000;  // 3 min max per file

// Start a background task — returns immediately with task ID
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
    startedAt: Date.now(),
  };
  activeTasks.set(taskId, state);

  // Run in background — don't await
  _executeTask(taskId, tenantId, params, runFn).catch(err => {
    console.error('[TASKS] Fatal error in task ' + taskId + ':', err.message);
    state.status = 'failed';
    state.error = err.message;
    db.updateAgentTask(taskId, { status: 'failed', result: 'Fatal: ' + err.message }).catch(() => {});
  });

  return { taskId, status: 'running', title };
}

async function _executeTask(taskId, tenantId, params, runFn) {
  const state = activeTasks.get(taskId);
  if (!state) return;

  // Master timeout
  const timer = setTimeout(() => {
    if (state.status === 'running') {
      state.status = 'timeout';
      console.log('[TASKS] Task ' + taskId + ' timed out after ' + (TASK_TIMEOUT / 1000) + 's');
      const resultSummary = _buildSummary(state);
      db.updateAgentTask(taskId, {
        status: 'timeout',
        result: resultSummary,
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
    state.status = 'failed';
    state.error = err.message;
    console.error('[TASKS] Task failed:', err.message);
  } finally {
    clearTimeout(timer);
    const resultSummary = _buildSummary(state);
    await db.updateAgentTask(taskId, {
      status: state.status,
      result: resultSummary,
      completed_at: new Date().toISOString(),
    }).catch(() => {});
    // Keep in memory for 30 min so status can be checked
    setTimeout(() => activeTasks.delete(taskId), 30 * 60 * 1000);
  }
}

function _buildSummary(state) {
  const done = state.results.length;
  const failed = state.errors.length;
  const parts = [`${done}/${state.total} files processed`];
  if (failed > 0) parts.push(`${failed} failed: ${state.errors.map(e => e.name).join(', ')}`);
  if (state.results.length > 0) {
    parts.push('\n\nResults:\n' + state.results.map(r =>
      '• ' + r.name + ': ' + (r.summary || 'done')
    ).join('\n'));
  }
  return parts.join('. ');
}

// Get task status (checks memory first, falls back to DB)
async function getTaskStatus(taskId) {
  const mem = activeTasks.get(taskId);
  if (mem) {
    return {
      id: mem.id,
      status: mem.status,
      progress: mem.progress,
      total: mem.total,
      currentFile: mem.currentFile,
      results: mem.results.length,
      errors: mem.errors.length,
      elapsed: Math.round((Date.now() - mem.startedAt) / 1000),
      summary: mem.status !== 'running' ? _buildSummary(mem) : null,
    };
  }
  // Fallback to DB
  const tasks = await db.getAgentTasks(null, null, 1);
  // Try to find by ID
  return { id: taskId, status: 'unknown', message: 'Task not found in memory — may have completed' };
}

// Get all active tasks
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
      elapsed: Math.round((Date.now() - state.startedAt) / 1000),
    });
  }
  return tasks;
}

// ═══ Built-in task runners ═══

// Process all files in a Google Drive folder
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

  // 2. Process each file with per-file timeout
  for (let i = 0; i < processable.length; i++) {
    if (state.status !== 'running') break; // task was cancelled/timed out
    const file = processable[i];
    state.progress = i;
    state.currentFile = file.name;
    console.log('[TASKS] (' + (i + 1) + '/' + processable.length + ') Processing: ' + file.name);

    try {
      const result = await Promise.race([
        _processOneFile(file, tenantId, purpose),
        new Promise((_, reject) => setTimeout(() => reject(new Error('File timeout (3min)')), FILE_TIMEOUT)),
      ]);

      state.results.push({
        name: file.name,
        summary: result.substring(0, 200),
      });

      // Store analysis to memory
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
    // Download → Whisper → Analyze
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
    // Other binary — skip with note
    return 'Binary file skipped: ' + file.name;
  }
  // Text content
  const textInput = typeof fileContent.content === 'string'
    ? fileContent.content.substring(0, 15000)
    : fileContent.content.toString().substring(0, 15000);
  const result = await content.processContent(textInput, purpose || '', tenantId);
  return result.analysis;
}

module.exports = {
  startTask,
  getTaskStatus,
  getActiveTasks,
  processDriveFolder,
  FILE_TIMEOUT,
  TASK_TIMEOUT,
};
