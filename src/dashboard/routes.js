const express = require('express');
const path = require('path');
const os = require('os');
const db = require('../db/queries');

const router = express.Router();

// Serve dashboard HTML
router.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

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
          { name: 'Autonomous agent loop (22 tools)', status: 'done' },
          { name: 'Content ingestion (YouTube/TikTok/PDF)', status: 'done' },
          { name: 'Code execution (read/write/shell)', status: 'done' },
          { name: 'Business ops (research/plans/ads)', status: 'done' },
          { name: 'Trading engine (stocks/crypto)', status: 'done' },
          { name: 'Enerflo pipeline dashboard', status: 'done' },
          { name: 'Remittance PDF parser', status: 'done' },
          { name: 'HC Sales Tracker (KPIs, leads, goals)', status: 'done' },
          { name: 'Roofing pipeline + Roof Admin role', status: 'done' },
          { name: 'Notification system (lead updates)', status: 'done' },
          { name: 'Meta Ads API (create/manage campaigns)', status: 'planned' },
          { name: 'Google Ads API', status: 'planned' },
          { name: 'Alpaca broker API (live trading)', status: 'planned' },
          { name: 'Shopify API (store/product management)', status: 'planned' },
          { name: 'App Store Connect API (deploy apps)', status: 'planned' },
          { name: 'Voice calls (Twilio + ElevenLabs)', status: 'planned' },
          { name: 'Calendar + appointments', status: 'planned' },
        ],
      },
      {
        name: 'Phase 4 — Sub-Agent System (AI Employees)',
        status: 'planned',
        features: [
          { name: 'Sub-agent task queue + orchestrator', status: 'done' },
          { name: 'Research Agent (market scanning, opportunities)', status: 'done' },
          { name: 'Marketing Agent (ad copy, content, social)', status: 'done' },
          { name: 'Ads Agent (campaign creation, A/B test, optimize)', status: 'planned' },
          { name: 'Commerce Agent (Shopify stores, product sourcing)', status: 'planned' },
          { name: 'Ops Agent — Pulse (revenue tracking, P&L, alerts)', status: 'done' },
          { name: 'Proactive monitoring (morning plan, EOD recap, alerts)', status: 'done' },
          { name: 'Auto-delegate (Jarvis assigns crew work on schedule)', status: 'done' },
          { name: 'Dialer Agent (AI phone calls, appt setting)', status: 'planned' },
          { name: 'Agent learning system (get smarter over time)', status: 'planned' },
          { name: 'Agent performance metrics + kill switch', status: 'planned' },
        ],
      },
      {
        name: 'Phase 5 — Business Ventures',
        status: 'planned',
        features: [
          { name: 'Intake App (fitness tracker, App Store deploy)', status: 'planned' },
          { name: 'Intake ad campaigns (Meta/Google)', status: 'planned' },
          { name: 'Intake feature iteration (auto-improve from data)', status: 'planned' },
          { name: 'E-commerce venture (trending products, Shopify)', status: 'planned' },
          { name: 'Custom Business Bot (SaaS product)', status: 'planned' },
          { name: 'Business Bot tiered pricing + onboarding', status: 'planned' },
          { name: 'AI Dialer package (add-on for businesses)', status: 'planned' },
          { name: 'Clothing brand (design, market, sell)', status: 'planned' },
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
