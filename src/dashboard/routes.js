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
    res.json(summary);
  } catch (error) {
    res.json({ totalLeads: 0, totalDeals: 0, totalInstalls: 0, recentLeads: [], recentDeals: [], recentInstalls: [], error: error.message });
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
          { name: 'Enerflo solar CRM', status: 'partial', note: 'API returns 0 data' },
        ],
      },
      {
        name: 'Phase 3 — Voice & Appointments',
        status: 'in-progress',
        features: [
          { name: 'Mission Control dashboard', status: 'done' },
          { name: 'Autonomous agent loop', status: 'done' },
          { name: 'Agent tool system', status: 'done' },
          { name: 'Agent dashboard + monitoring', status: 'done' },
          { name: 'Voice calls (Twilio)', status: 'planned' },
          { name: 'Appointment booking', status: 'planned' },
          { name: 'Calendar integration', status: 'planned' },
          { name: 'Lead qualification flow', status: 'planned' },
        ],
      },
      {
        name: 'Phase 4 — Scale & Sell',
        status: 'planned',
        features: [
          { name: 'Multi-tenant onboarding UI', status: 'planned' },
          { name: 'Analytics & reporting', status: 'planned' },
          { name: 'Webhook integrations', status: 'planned' },
          { name: 'Stripe billing', status: 'planned' },
          { name: 'White label support', status: 'planned' },
        ],
      },
    ],
  });
});

module.exports = router;
