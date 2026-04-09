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

// ═══ CRM: LEADS ═══

router.get('/dashboard/api/leads', async (req, res) => {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant' });
    const leads = await db.getLeads(tenant.id, {
      status: req.query.status || undefined,
      score_min: req.query.score_min ? parseInt(req.query.score_min) : undefined,
      niche: req.query.niche || undefined,
      source: req.query.source || undefined,
      limit: parseInt(req.query.limit) || 50,
    });
    res.json({ leads });
  } catch (e) { res.json({ leads: [], error: e.message }); }
});

router.get('/dashboard/api/leads/stats', async (req, res) => {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant' });
    const stats = await db.getLeadStats(tenant.id);
    res.json(stats);
  } catch (e) { res.json({ total: 0, error: e.message }); }
});

router.post('/dashboard/api/leads', async (req, res) => {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant' });
    const lead = await db.createLead(tenant.id, req.body);
    // Auto-score if scorer is available
    try {
      const scorer = require('../core/scorer');
      const scored = await scorer.scoreLead(tenant.id, lead);
      if (scored && scored.score) {
        await db.updateLead(lead.id, { score: scored.score, score_reason: scored.reason });
        lead.score = scored.score;
        lead.score_reason = scored.reason;
      }
    } catch (e) { /* scorer may not be ready */ }
    res.json({ success: true, lead });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/dashboard/api/leads/:id/activities', async (req, res) => {
  try {
    const activities = await db.getLeadActivities(req.params.id);
    res.json({ activities });
  } catch (e) { res.json({ activities: [], error: e.message }); }
});

// ═══ CRM: APPOINTMENTS ═══

router.get('/dashboard/api/appointments', async (req, res) => {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant' });
    const hours = parseInt(req.query.hours) || 72;
    const appts = await db.getUpcomingAppointments(tenant.id, hours);
    res.json({ appointments: appts });
  } catch (e) { res.json({ appointments: [], error: e.message }); }
});

router.post('/dashboard/api/appointments', async (req, res) => {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant' });
    const appt = await db.createAppointment(tenant.id, req.body.lead_id, req.body.scheduled_at, req.body.notes);
    // Try to create Google Calendar event
    try {
      const calendar = require('../core/calendar');
      const lead = await db.getLead(tenant.id, req.body.lead_id);
      if (lead) await calendar.createAppointment(tenant.id, lead, req.body.scheduled_at, 30, req.body.notes);
    } catch (e) { /* calendar may not be configured */ }
    res.json({ success: true, appointment: appt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ DIALER ═══

router.post('/dashboard/api/dialer/call', async (req, res) => {
  try {
    const dialer = require('../core/dialer');
    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant' });
    const lead = await db.getLead(tenant.id, req.body.lead_id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const script = await dialer.generateCallScript(lead, lead.niche || 'solar', req.body.goal || 'book a free consultation');
    const result = await dialer.dialLead(tenant.id, lead, script);
    res.json({ success: true, ...result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Dialer webhook (Bland.ai calls back here)
router.post('/webhooks/call-complete', async (req, res) => {
  res.sendStatus(200); // ACK immediately
  try {
    const dialer = require('../core/dialer');
    await dialer.handleCallResult(req.body);
  } catch (e) { console.error('[WEBHOOK] Call complete error:', e.message); }
});

// ═══ EMAIL SEQUENCES ═══

router.get('/dashboard/api/sequences', async (req, res) => {
  try {
    const { data } = await require('../db/supabase').supabase
      .from('email_sequences').select('*').order('created_at', { ascending: false });
    res.json({ sequences: data || [] });
  } catch (e) { res.json({ sequences: [], error: e.message }); }
});

router.post('/dashboard/api/sequences/generate', aiLimiter, async (req, res) => {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant' });
    const sequencer = require('../core/sequencer');
    const seq = await sequencer.generateSequence(tenant.id, req.body.niche || 'solar', req.body.businessType || 'solar installer', req.body.numSteps || 5);
    res.json({ success: true, sequence: seq });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ META ADS ═══

router.post('/webhooks/meta-leads', async (req, res) => {
  res.sendStatus(200); // ACK immediately
  try {
    const metaAds = require('../core/meta-ads');
    await metaAds.handleLeadFormWebhook(req.body);
  } catch (e) { console.error('[WEBHOOK] Meta lead error:', e.message); }
});

// ═══ BUSINESS LAUNCH ═══

router.get('/dashboard/api/business/configs', (req, res) => {
  try {
    const config = require('../core/business-config');
    res.json({ configs: config.listConfigs() });
  } catch (e) { res.json({ configs: [], error: e.message }); }
});

router.post('/dashboard/api/business/launch', aiLimiter, async (req, res) => {
  try {
    const config = require('../core/business-config');
    const result = await config.launchBusiness(req.body.slug);
    res.json({ success: true, ...result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ ADD AGENT (from dashboard) ═══

router.post('/dashboard/api/agents/add', async (req, res) => {
  try {
    const { name, role, room, tools, apiKeys } = req.body;
    if (!name) return res.status(400).json({ error: 'Agent name required' });

    // Create worker in agent_workers table
    const { supabase } = require('../db/supabase');
    const { data, error } = await supabase.from('agent_workers').insert({
      name,
      type: role || 'custom',
      system_prompt: `You are ${name}, a specialized AI agent. Role: ${role || 'general assistant'}. You work autonomously inside the Jarvis ecosystem.`,
      tools: tools || ['brave_search', 'analyze', 'store_finding'],
      status: 'active',
      tasks_completed: 0,
      tasks_failed: 0,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });

    // Store API keys in env-like config (saved to worker config)
    if (apiKeys && Object.keys(apiKeys).length > 0) {
      await supabase.from('agent_workers').update({
        config: { api_keys: apiKeys, room: room || 'custom' },
      }).eq('id', data.id);
    }

    res.json({ success: true, agent: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// List all agents/workers
router.get('/dashboard/api/agents', async (req, res) => {
  try {
    const { supabase } = require('../db/supabase');
    const { data } = await supabase.from('agent_workers').select('*').order('created_at', { ascending: false });
    res.json({ agents: data || [] });
  } catch (e) { res.json({ agents: [], error: e.message }); }
});

// Delete an agent
router.delete('/dashboard/api/agents/:id', async (req, res) => {
  try {
    const { supabase } = require('../db/supabase');
    await supabase.from('agent_workers').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ ADD BUSINESS (from dashboard) ═══

router.post('/dashboard/api/business/create', async (req, res) => {
  try {
    const config = require('../core/business-config');
    const { slug, name, type, offer, cta, targetCPL, dailyBudget, audiences, meta, email, dialer, sms } = req.body;
    if (!slug || !name) return res.status(400).json({ error: 'Slug and name required' });

    const newConfig = {
      id: slug,
      name,
      type: type || 'custom',
      tenantId: null,
      offer: offer || '',
      cta: cta || 'Learn More',
      targetCPL: targetCPL || 30,
      dailyBudget: dailyBudget || 50,
      meta: meta || { adAccountId: '', pageId: '', pixelId: '' },
      audiences: audiences || [],
      leadScoring: { criteria: ['has_phone', 'has_email', 'location_match'], highPriorityScore: 8, autoDialThreshold: 8 },
      dialer: dialer || { provider: 'bland', voice: 'maya', maxDuration: 5, callGoal: 'book a consultation' },
      email: email || { fromName: name, tone: 'friendly', sequenceLength: 5 },
      sms: sms || { tone: 'casual, friendly' },
    };

    config.saveConfig(slug, newConfig);
    res.json({ success: true, config: newConfig });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ ROOM DETAIL (aggregated data for a room) ═══

router.get('/dashboard/api/room/:id', async (req, res) => {
  try {
    const roomId = req.params.id;
    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant' });

    const response = { room: roomId, agents: [], recentJobs: [], stats: {}, apiConnections: [] };

    // Get workers assigned to this room
    try {
      const { supabase } = require('../db/supabase');
      const { data: workers } = await supabase.from('agent_workers').select('*').eq('status', 'active');
      // Map room names to workers
      const roomWorkerMap = { command: 'jarvis', research: 'hawk', marketing: 'ghost', ops: 'pulse', etsy: 'forge', printify: 'pixel' };
      const workerName = roomWorkerMap[roomId] || roomId;
      response.agents = (workers || []).filter(w => w.name.toLowerCase().includes(workerName));
    } catch (e) {}

    // Get recent jobs for this room's agents
    try {
      const { supabase } = require('../db/supabase');
      const { data: jobs } = await supabase.from('agent_jobs').select('*')
        .order('created_at', { ascending: false }).limit(10);
      response.recentJobs = jobs || [];
    } catch (e) {}

    // API connection status
    response.apiConnections = [
      { name: 'Claude API', key: 'ANTHROPIC_API_KEY', connected: !!process.env.ANTHROPIC_API_KEY },
      { name: 'Brave Search', key: 'BRAVE_SEARCH_API_KEY', connected: !!process.env.BRAVE_SEARCH_API_KEY },
      { name: 'ElevenLabs', key: 'ELEVENLABS_API_KEY', connected: !!process.env.ELEVENLABS_API_KEY },
      { name: 'Twilio SMS', key: 'TWILIO_ACCOUNT_SID', connected: !!process.env.TWILIO_ACCOUNT_SID },
      { name: 'Gmail', key: 'GMAIL_CLIENT_ID', connected: !!process.env.GMAIL_CLIENT_ID },
      { name: 'Meta Ads', key: 'META_ACCESS_TOKEN', connected: !!process.env.META_ACCESS_TOKEN },
      { name: 'Bland.ai Dialer', key: 'BLAND_API_KEY', connected: !!process.env.BLAND_API_KEY },
      { name: 'Printify', key: 'PRINTIFY_API_KEY', connected: !!process.env.PRINTIFY_API_KEY },
      { name: 'Discord', key: 'DISCORD_BOT_TOKEN', connected: !!process.env.DISCORD_BOT_TOKEN },
      { name: 'OpenAI (Whisper)', key: 'OPENAI_API_KEY', connected: !!process.env.OPENAI_API_KEY },
    ];

    // Lead stats for research room
    if (roomId === 'research' || roomId === 'solar') {
      try { response.stats = await db.getLeadStats(tenant.id); } catch (e) {}
    }

    // Cost stats
    try {
      const since = new Date(Date.now() - 86400000).toISOString();
      response.stats.costs = await db.getApiCostSummary(tenant.id, since);
    } catch (e) {}

    res.json(response);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ PROACTIVITY STATUS ═══

router.get('/dashboard/api/proactive/status', async (req, res) => {
  try {
    const proactive = require('../core/proactive');
    const schedule = proactive.getCronSchedule();
    res.json({ crons: schedule.length, schedule });
  } catch (e) { res.json({ crons: 0, error: e.message }); }
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
