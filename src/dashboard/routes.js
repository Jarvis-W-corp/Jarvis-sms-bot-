const express = require('express');
const path = require('path');
const os = require('os');
const db = require('../db/queries');
const multer = require('multer');
const { aiLimiter, uploadLimiter } = require('../middleware/ratelimit');

const router = express.Router();
const upload = multer({ dest: '/tmp/jarvis-uploads/', limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB max (reduced from 100)

// Serve dashboard HTML + inject API key + static assets
router.get('/dashboard', (req, res) => {
  // If API key is set, require it as query param to access dashboard
  const key = process.env.DASHBOARD_API_KEY;
  if (key && req.query.key !== key) {
    return res.status(401).send('<html><body style="background:#0b1120;color:#fff;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;"><div style="text-align:center"><h1>JARVIS</h1><p>Access denied. Add ?key=YOUR_KEY to the URL.</p></div></body></html>');
  }
  // Set cookie so subsequent API calls are authenticated
  if (key) res.cookie('jarvis_key', key, { httpOnly: true, sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.sendFile(path.join(__dirname, 'index.html'));
});
router.use('/dashboard/assets', express.static(path.join(__dirname, 'assets')));

// API: system health + DB stats
router.get('/dashboard/api/health', async (req, res) => {
  try {
    const tenant = await db.getDefaultTenant();
    const stats = tenant ? await db.getStats(tenant.id) : null;
    const tasks = tenant ? await db.getOpenTasks(tenant.id) : [];

    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const heap = process.memoryUsage();

    // Simple CPU % estimate from load average
    const load1m = os.loadavg()[0];
    const cpuPercent = Math.min(100, Math.round((load1m / cpus.length) * 100));

    res.json({
      cpu: { percent: cpuPercent, cores: cpus.length, load: os.loadavg() },
      memory: {
        total: Math.round(totalMem / 1024 / 1024),
        used: Math.round(usedMem / 1024 / 1024),
        free: Math.round(freeMem / 1024 / 1024),
        usedPercent: Math.round((usedMem / totalMem) * 100),
      },
      heap: { used: heap.heapUsed, total: heap.heapTotal, rss: heap.rss },
      uptime: Math.floor(process.uptime()),
      stats,
      tasks: tasks.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: activity feed (emails received + Jarvis responses)
router.get('/dashboard/api/activity', async (req, res) => {
  try {
    let received = [];
    try {
      const gmail = require('../core/gmail');
      const emails = await gmail.getEmails(10);
      received = emails.map(e => ({
        from: e.from || 'Unknown',
        subject: e.subject || '(no subject)',
        time: e.date || '',
      }));
    } catch (e) {
      // Gmail may not be configured
    }

    let sent = [];
    try {
      const tenant = await db.getDefaultTenant();
      if (tenant) {
        const convos = await db.getRecentRawConversations(tenant.id, null, 20);
        sent = convos
          .filter(c => c.role === 'assistant')
          .slice(0, 10)
          .map(c => ({
            user: c.user_id || 'user',
            preview: (c.message || '').substring(0, 100),
            time: c.created_at ? new Date(c.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '',
          }));
      }
    } catch (e) {
      // DB may not have data yet
    }

    res.json({ received, sent });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Enerflo pipeline stats
router.get('/dashboard/api/pipeline', async (req, res) => {
  try {
    const enerflo = require('../core/enerflo');
    const summary = await enerflo.getPipelineSummary();
    res.json(summary || { total: 0, error: 'No data' });
  } catch (error) {
    res.json({ total: 0, error: error.message });
  }
});

// API: drip campaign stats
router.get('/dashboard/api/drip', async (req, res) => {
  try {
    const drip = require('../core/drip');
    const stats = await drip.getDripStats();
    res.json(stats);
  } catch (error) {
    res.json({ active: 0, completed: 0, converted: 0, totalSent: 0, campaigns: [], error: error.message });
  }
});

// API: log stream (recent conversations)
router.get('/dashboard/api/logs', async (req, res) => {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.json({ logs: [] });

    const convos = await db.getRecentRawConversations(tenant.id, null, 50);
    const logs = convos.map(c => ({
      created_at: c.created_at,
      platform: c.platform || 'unknown',
      user: c.user_id || '—',
      message: (c.message || '').substring(0, 200),
      role: c.role,
    }));

    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: agent activity
router.get('/dashboard/api/agent', async (req, res) => {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.json({ cycles: [], tasks: {}, stats: {} });

    const [cycles, pending, running, completed, failed] = await Promise.all([
      db.getRecentAgentCycles(tenant.id, 10),
      db.getAgentTasks(tenant.id, 'pending', 20),
      db.getAgentTasks(tenant.id, 'running', 5),
      db.getAgentTasks(tenant.id, 'completed', 20),
      db.getAgentTasks(tenant.id, 'failed', 10),
    ]);

    res.json({
      cycles: cycles.map(c => ({
        id: c.cycle_id,
        created_at: c.created_at,
        completed_at: c.completed_at,
        tool_log: c.tool_log || [],
        result: c.result,
      })),
      tasks: {
        pending,
        running,
        completed: completed.filter(t => t.type !== 'cycle').slice(0, 10),
        failed: failed.slice(0, 5),
      },
      stats: {
        total_cycles: cycles.length,
        pending_tasks: pending.length,
        completed_tasks: completed.filter(t => t.type !== 'cycle').length,
        last_cycle: cycles[0]?.created_at || null,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: crew (sub-agent) status
router.get('/dashboard/api/crew', async (req, res) => {
  try {
    const crew = require('../core/crew');
    const status = await crew.getCrewStatus();
    res.json(status);
  } catch (error) {
    res.json({ workers: [], jobs: { pending: 0, running: 0, completed: 0, failed: 0, total: 0 }, recentJobs: [], error: error.message });
  }
});

// API: create crew job (POST)
router.post('/dashboard/api/crew/job', async (req, res) => {
  try {
    const crew = require('../core/crew');
    const { worker, title, description, input, priority } = req.body;
    const jobId = await crew.createJob(worker, title, description, input || {}, priority || 5);
    res.json({ success: true, jobId });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// API: trigger crew queue processing
router.post('/dashboard/api/crew/run', async (req, res) => {
  try {
    const crew = require('../core/crew');
    const results = await crew.processQueue();
    res.json({ success: true, results });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// API: voice chat — browser sends text (from Web Speech API), Jarvis replies with text + audio
router.post('/dashboard/api/voice', aiLimiter, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'No text provided' });

    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant' });

    const brain = require('../core/brain');
    const reply = await brain.chat(tenant.id, 'dashboard_voice', 'dashboard', text, 'Boss');

    // Generate audio via ElevenLabs
    let audioBase64 = null;
    try {
      const voice = require('../core/voice');
      const audioBuffer = await voice.textToSpeech(reply.substring(0, 1000));
      audioBase64 = audioBuffer.toString('base64');
    } catch (voiceErr) {
      console.error('[DASHBOARD] TTS error:', voiceErr.message);
      // Still return text even if voice fails
    }

    res.json({ reply, audio: audioBase64 });
  } catch (error) {
    console.error('[DASHBOARD] Voice error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API: text chat — same as voice but no audio
router.post('/dashboard/api/chat', aiLimiter, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'No text provided' });

    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant' });

    const brain = require('../core/brain');
    const reply = await brain.chat(tenant.id, 'dashboard_chat', 'dashboard', text, 'Boss');
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: feed — file upload (video, PDF, images)
router.post('/dashboard/api/feed/upload', uploadLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant' });

    const contentModule = require('../core/content');
    const fs = require('fs');
    const context = req.body.context || '';
    const filePath = req.file.path;
    const fileName = req.file.originalname || 'upload';
    const mime = req.file.mimetype || '';
    let result;

    if (mime.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv)$/i.test(fileName)) {
      result = await contentModule.processVideoAttachment('file://' + filePath, context, tenant.id, fileName);
    } else if (mime === 'application/pdf' || fileName.endsWith('.pdf')) {
      const buffer = fs.readFileSync(filePath);
      result = await contentModule.processContent(buffer, context, tenant.id);
    } else {
      const text = fs.readFileSync(filePath, 'utf-8').substring(0, 10000);
      result = await contentModule.processContent(text, context, tenant.id);
    }

    try { fs.unlinkSync(filePath); } catch(e) {}
    res.json({ success: true, analysis: result.analysis, source: result.source });
  } catch (error) {
    console.error('[DASHBOARD] Feed upload error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API: feed — URL submission (YouTube, TikTok, website, etc)
router.post('/dashboard/api/feed/url', async (req, res) => {
  try {
    const { url, context } = req.body;
    if (!url) return res.status(400).json({ error: 'No URL provided' });
    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant' });

    const contentModule = require('../core/content');
    const result = await contentModule.processContent(url, context || '', tenant.id);
    res.json({ success: true, analysis: result.analysis, source: result.source });
  } catch (error) {
    console.error('[DASHBOARD] Feed URL error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API: feed — process video from a direct URL (no upload needed)
router.post('/dashboard/api/feed/url-video', async (req, res) => {
  try {
    const { url, context } = req.body;
    if (!url) return res.status(400).json({ error: 'No URL' });
    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant' });
    const content = require('../core/content');
    const result = await content.processVideoAttachment(url, context || '', tenant.id, url.split('/').pop());
    res.json({ success: true, analysis: result.analysis, transcript: result.content?.transcript, source: result.source });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══ BACKGROUND TASKS ═══

// Start a background task
router.post('/dashboard/api/task/start', aiLimiter, async (req, res) => {
  try {
    const { type, params } = req.body;
    if (!type) return res.status(400).json({ error: 'Task type required' });
    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant' });

    const tasks = require('../core/tasks');
    let result;
    if (type === 'drive_folder') {
      result = await tasks.startTask(tenant.id, 'drive_folder', 'Process Drive folder', params, tasks.processDriveFolder);
    } else {
      return res.status(400).json({ error: 'Unknown task type: ' + type });
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Task status
router.get('/dashboard/api/task/:id/status', async (req, res) => {
  try {
    const tasks = require('../core/tasks');
    const status = await tasks.getTaskStatus(req.params.id);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all active tasks
router.get('/dashboard/api/tasks/active', (req, res) => {
  const tasks = require('../core/tasks');
  res.json({ tasks: tasks.getActiveTasks() });
});

// Kill a background task
router.post('/dashboard/api/task/:id/kill', (req, res) => {
  const tasks = require('../core/tasks');
  const killed = tasks.killTask(req.params.id);
  res.json({ killed, id: req.params.id });
});

// ═══ KILL SWITCH — stop any crew job ═══

router.post('/dashboard/api/crew/kill/:jobId', (req, res) => {
  const crew = require('../core/crew');
  crew.killJob(req.params.jobId);
  res.json({ killed: true, jobId: req.params.jobId });
});

// Kill ALL running crew jobs
router.post('/dashboard/api/crew/kill-all', (req, res) => {
  const crew = require('../core/crew');
  const killed = [];
  for (const [id] of crew.runningJobs) {
    crew.killJob(id);
    killed.push(id);
  }
  res.json({ killed });
});

// ═══ API COST TRACKING ═══

// Get cost summary (default: last 24h)
router.get('/dashboard/api/costs', async (req, res) => {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant' });
    const hours = parseInt(req.query.hours) || 24;
    const since = new Date(Date.now() - hours * 3600000).toISOString();
    const summary = await db.getApiCostSummary(tenant.id, since);
    res.json({ period_hours: hours, ...summary });
  } catch (error) {
    // Table may not exist yet — return empty
    res.json({ total_cost: 0, total_calls: 0, by_agent: {}, error: 'Cost tracking not set up yet — run setup-v2.sql in Supabase' });
  }
});

// Get detailed cost log
router.get('/dashboard/api/costs/log', async (req, res) => {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant' });
    const hours = parseInt(req.query.hours) || 24;
    const since = new Date(Date.now() - hours * 3600000).toISOString();
    const costs = await db.getApiCosts(tenant.id, since, req.query.agent || null);
    res.json({ entries: costs });
  } catch (error) {
    res.json({ entries: [], error: 'Cost tracking not set up yet' });
  }
});

// ═══ PROCESSED FILES ═══

router.get('/dashboard/api/processed', async (req, res) => {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant' });
    const files = await db.getProcessedFiles(tenant.id, req.query.source || null, parseInt(req.query.limit) || 50);
    res.json({ files });
  } catch (error) {
    res.json({ files: [], error: 'Processed file tracking not set up yet' });
  }
});

// ═══ WORKFLOWS (Agent Chaining Pipelines) ═══

// List available workflow templates
router.get('/dashboard/api/workflows', (req, res) => {
  try {
    const workflows = require('../core/workflows');
    res.json({ templates: workflows.getTemplates() });
  } catch (error) {
    res.json({ templates: [], error: error.message });
  }
});

// Start a workflow
router.post('/dashboard/api/workflow/start', async (req, res) => {
  try {
    const workflows = require('../core/workflows');
    const { template, params } = req.body;
    if (!template) return res.status(400).json({ error: 'Template ID required (e.g. solar_pipeline)' });
    const result = await workflows.startWorkflow(template, params || {});
    res.json({ success: true, ...result });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Get workflow status
router.get('/dashboard/api/workflow/:id/status', async (req, res) => {
  try {
    const workflows = require('../core/workflows');
    const status = await workflows.getWorkflowStatus(req.params.id);
    if (!status) return res.status(404).json({ error: 'Workflow not found' });
    res.json(status);
  } catch (error) {
    res.json({ error: error.message });
  }
});

// List recent workflows
router.get('/dashboard/api/workflow/history', async (req, res) => {
  try {
    const workflows = require('../core/workflows');
    const limit = parseInt(req.query.limit) || 20;
    const list = await workflows.listWorkflows(limit);
    res.json({ workflows: list });
  } catch (error) {
    res.json({ workflows: [], error: error.message });
  }
});

// API: feature progress (static manifest)
router.get('/dashboard/api/progress', (req, res) => {
  res.json({
    phases: [
      {
        name: 'Phase 1 — Foundation',
        status: 'complete',
        features: [
          { name: 'Express server + health check', status: 'done' },
          { name: 'Supabase DB + pgvector', status: 'done' },
          { name: 'Multi-tenant architecture', status: 'done' },
          { name: 'Discord bot + commands', status: 'done' },
          { name: 'SMS via Twilio', status: 'done' },
          { name: 'Claude AI brain (chat)', status: 'done' },
          { name: 'Vector memory system', status: 'done' },
        ],
      },
      {
        name: 'Phase 2 — Intelligence',
        status: 'complete',
        features: [
          { name: 'Brave web search', status: 'done' },
          { name: 'Auto-learn from conversations', status: 'done' },
          { name: 'Memory recall (facts/tasks/decisions)', status: 'done' },
          { name: 'Daily briefing (9 AM ET)', status: 'done' },
          { name: 'Ideas engine (8h cycle)', status: 'done' },
          { name: 'App monitor (keep-alive)', status: 'done' },
          { name: 'Gmail integration', status: 'done' },
          { name: 'Enerflo solar CRM (v3 API)', status: 'done' },
        ],
      },
      {
        name: 'Phase 3 — Tools & Integrations',
        status: 'in-progress',
        features: [
          { name: 'Mission Control dashboard', status: 'done' },
          { name: 'Dashboard voice chat (push-to-talk + ElevenLabs)', status: 'done' },
          { name: 'Dashboard media feed (drop videos/PDFs/URLs)', status: 'done' },
          { name: 'Whisper video transcription (OpenAI STT)', status: 'done' },
          { name: 'Autonomous agent loop (50+ tools)', status: 'done' },
          { name: 'Content ingestion (YouTube/TikTok/PDF/Video)', status: 'done' },
          { name: 'Self-editing via GitHub API (Jarvis edits own code)', status: 'done' },
          { name: 'Meta Ad Library scraper + ad pipeline', status: 'done' },
          { name: 'Google Drive multi-tenant access', status: 'done' },
          { name: 'Business ops (research/plans/ads)', status: 'done' },
          { name: 'Trading engine (stocks/crypto)', status: 'done' },
          { name: 'Enerflo pipeline dashboard', status: 'done' },
          { name: 'Remittance PDF parser', status: 'done' },
          { name: 'HC Sales Tracker (KPIs, leads, goals)', status: 'done' },
          { name: 'Roofing pipeline + Roof Admin role', status: 'done' },
          { name: 'Notification system (lead updates)', status: 'done' },
          { name: 'Voice calls (Twilio + ElevenLabs)', status: 'done' },
          { name: 'Meta Ads API (create/manage campaigns)', status: 'in-progress' },
          { name: 'GoHighLevel CRM integration', status: 'planned' },
          { name: 'Google Ads API', status: 'planned' },
          { name: 'Alpaca broker API (live trading)', status: 'planned' },
          { name: 'Calendar + appointments', status: 'planned' },
        ],
      },
      {
        name: 'Phase 4 — Sub-Agent System (AI Employees)',
        status: 'in-progress',
        features: [
          { name: 'Sub-agent task queue + orchestrator', status: 'done' },
          { name: 'Hawk — Research Agent (7 tools, ad scraping)', status: 'done' },
          { name: 'Ghost — Marketing Agent (11 tools, full ad pipeline)', status: 'done' },
          { name: 'Pulse — Ops Agent (monitoring, alerts, reports)', status: 'done' },
          { name: 'Proactive monitoring (morning plan, EOD recap, alerts)', status: 'done' },
          { name: 'Auto-delegate (Jarvis assigns crew work on schedule)', status: 'done' },
          { name: 'Lead scraping + outreach pipeline', status: 'in-progress' },
          { name: 'Workflow pipelines — agent chaining (Hawk→Ghost→Pulse)', status: 'done' },
          { name: 'Per-agent tool scoping (Ghost/Hawk/Pulse isolated)', status: 'done' },
          { name: 'Per-tool + per-job + per-cycle timeouts', status: 'done' },
          { name: 'Kill switch (stop any job/task from dashboard)', status: 'done' },
          { name: 'API cost tracking per agent ($USD)', status: 'done' },
          { name: 'Idempotent file processing (never re-process)', status: 'done' },
          { name: 'Background task runner with progress tracking', status: 'done' },
          { name: 'Crew follow-up + stale job cleanup', status: 'done' },
          { name: '4 workflow templates (solar, medspa, AI workforce, content)', status: 'done' },
          { name: 'Dialer Agent (AI phone calls, appt setting)', status: 'planned' },
          { name: 'Agent learning system (get smarter over time)', status: 'planned' },
        ],
      },
      {
        name: 'Phase 5 — Business Ventures',
        status: 'in-progress',
        features: [
          { name: 'Snack AI — submitted to App Store (waiting review)', status: 'done' },
          { name: 'Snack AI ad campaigns (Meta/Google)', status: 'planned' },
          { name: 'Luxe Level Aesthetics — first B2B client', status: 'in-progress' },
          { name: 'Med spa multi-offer package', status: 'in-progress' },
          { name: 'AI Workforce — white-label Jarvis for businesses', status: 'in-progress' },
          { name: 'E-commerce venture (trending products)', status: 'planned' },
          { name: 'Autonomous ad spend optimization', status: 'planned' },
          { name: 'Cross-venture P&L dashboard', status: 'planned' },
        ],
      },
      {
        name: 'Phase 6 — Scale & Sell',
        status: 'planned',
        features: [
          { name: 'Multi-tenant onboarding UI', status: 'planned' },
          { name: 'Stripe billing + subscription management', status: 'planned' },
          { name: 'White label support', status: 'planned' },
          { name: 'Webhook integrations', status: 'planned' },
          { name: 'Client analytics dashboard', status: 'planned' },
          { name: 'Self-service bot builder', status: 'planned' },
        ],
      },
    ],
  });
});

module.exports = router;
