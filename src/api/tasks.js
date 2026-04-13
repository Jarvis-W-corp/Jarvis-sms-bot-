// tasks.js — REST API for task submission, status, and system control
// POST /api/task — submit a task to any agent
// GET  /api/status — system health + queue depth
// POST /api/freeze — emergency freeze
// POST /api/unfreeze — resume operations
// GET  /api/ideas — list ideas from the idea bank
// POST /api/ideas — add an idea

const express = require('express');
const router = express.Router();
const crew = require('../core/crew');
const queue = require('../core/queue');
const db = require('../db/queries');

// ── Submit a task ──
// POST /api/task { worker: "hawk", title: "...", description: "...", priority: 7 }
router.post('/task', async (req, res) => {
  try {
    const { worker, title, description, input, priority } = req.body;

    if (!title) return res.status(400).json({ error: 'title is required' });

    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant configured' });

    const jobId = await crew.createJob(
      worker || 'hawk',
      title,
      description || title,
      { ...(input || {}), tenant_id: tenant.id, source: 'api' },
      priority || 5
    );

    if (!jobId) return res.status(500).json({ error: 'Failed to create job' });

    res.json({
      success: true,
      jobId,
      message: queue.isQueueReady()
        ? 'Job queued for immediate execution'
        : 'Job created (polling mode — will execute within 2 hours)',
    });
  } catch (err) {
    console.error('[API] /task error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── System status ──
// GET /api/status
router.get('/status', async (req, res) => {
  try {
    const tenant = await db.getDefaultTenant();
    const [crewStatus, queueStatus] = await Promise.all([
      crew.getCrewStatus(),
      queue.isQueueReady() ? queue.getQueueStatus() : null,
    ]);

    const costSummary = tenant
      ? await db.getApiCostSummary(tenant.id, new Date(Date.now() - 86400000).toISOString()).catch(() => null)
      : null;

    res.json({
      status: queue.isFrozenState() ? 'frozen' : 'operational',
      uptime: Math.floor(process.uptime()) + 's',
      queue: queueStatus || { mode: 'polling', note: 'Redis not connected — using 2h Supabase polling' },
      crew: crewStatus,
      costs_24h: costSummary,
    });
  } catch (err) {
    console.error('[API] /status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Emergency freeze ──
// POST /api/freeze
router.post('/freeze', async (req, res) => {
  queue.freeze();
  res.json({ success: true, message: 'System frozen — no new jobs will execute' });
});

// ── Unfreeze ──
// POST /api/unfreeze
router.post('/unfreeze', async (req, res) => {
  queue.unfreeze();
  res.json({ success: true, message: 'System unfrozen — jobs resuming' });
});

// ── List ideas ──
// GET /api/ideas?status=queued&limit=20
router.get('/ideas', async (req, res) => {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant configured' });

    const ideas = await db.getIdeas(tenant.id, req.query.status || null, parseInt(req.query.limit) || 20);
    res.json({ ideas, count: ideas.length });
  } catch (err) {
    console.error('[API] /ideas error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Add an idea ──
// POST /api/ideas { title: "...", description: "...", score_impact: 0.8, ... }
router.post('/ideas', async (req, res) => {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant configured' });

    const { title, description, source, score_impact, score_feasibility, score_alignment, score_urgency } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    const idea = await db.createIdea(tenant.id, {
      title,
      description,
      source: source || 'user',
      score_impact: score_impact || null,
      score_feasibility: score_feasibility || null,
      score_alignment: score_alignment || null,
      score_urgency: score_urgency || null,
    });

    if (!idea) return res.status(500).json({ error: 'Failed to create idea' });

    // If idea scores high enough, auto-queue it
    if (idea.priority_score && idea.priority_score > 0.6) {
      const jobId = await crew.createJob(
        'hawk',
        idea.title,
        idea.description || idea.title,
        { tenant_id: tenant.id, source: 'idea_bank', idea_id: idea.idea_id },
        Math.round(idea.priority_score * 10)
      );
      return res.json({ success: true, idea, auto_queued: true, jobId });
    }

    res.json({ success: true, idea, auto_queued: false });
  } catch (err) {
    console.error('[API] /ideas POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Outcomes / execution history ──
// GET /api/outcomes?limit=50
router.get('/outcomes', async (req, res) => {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant configured' });

    const outcomes = await db.getOutcomes(tenant.id, parseInt(req.query.limit) || 50);
    const stats = await db.getOutcomeStats(tenant.id, new Date(Date.now() - 7 * 86400000).toISOString());
    res.json({ outcomes, stats });
  } catch (err) {
    console.error('[API] /outcomes error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
