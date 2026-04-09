const brain = require('../core/brain');
const db = require('../db/queries');
const { sendBossMessage } = require('../channels/discord');

// ══════════════════════════════════════════════
// SCHEDULER — Lean + Reliable
// Every job has a purpose. Every job finishes.
// ══════════════════════════════════════════════

function getNextETHour(hour) {
  const now = new Date();
  const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const offset = now.getTime() - eastern.getTime();
  const target = new Date(eastern);
  target.setHours(hour, 0, 0, 0);
  if (eastern >= target) target.setDate(target.getDate() + 1);
  return new Date(target.getTime() + offset);
}

// ── Morning Briefing: 9 AM ET ──
async function sendDailyBriefing() {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return;
    const briefing = await brain.generateBriefing(tenant.id);
    await sendBossMessage('☀️ **Morning Briefing**\n\n' + briefing);
    console.log('[SCHEDULER] Briefing sent');
  } catch (error) { console.error('[SCHEDULER] Briefing error:', error.message); }
}

function scheduleDailyBriefing() {
  const next9am = getNextETHour(9);
  const delay = next9am.getTime() - Date.now();
  setTimeout(() => {
    sendDailyBriefing();
    setInterval(sendDailyBriefing, 24 * 60 * 60 * 1000);
  }, delay);
  console.log('[SCHEDULER] Briefing: 9 AM ET daily');
}

// ── Keep-alive ping: every 5 min ──
function startAppMonitoring() {
  const ping = async () => {
    try {
      const url = process.env.RENDER_EXTERNAL_URL || 'https://jarvis-sms-bot.onrender.com';
      await fetch(url, { signal: AbortSignal.timeout(10000) });
    } catch (e) { console.error('[MONITOR] Ping failed:', e.message); }
  };
  setInterval(ping, 5 * 60 * 1000);
  console.log('[MONITOR] Keep-alive ping: every 5m');
}

// ── Crew Queue + Follow-up: every 2 hours ──
// 1. Process pending jobs
// 2. Follow up on completed jobs (notify boss, log results)
// 3. Clean up stale running jobs
async function processCrewAndFollowUp() {
  const crew = require('../core/crew');

  try {
    // 1. Check for stale "running" jobs (stuck > 10 min)
    const { data: staleJobs } = await require('../db/supabase').supabase
      .from('agent_jobs').select('id, title, started_at')
      .eq('status', 'running')
      .lt('started_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());

    if (staleJobs && staleJobs.length > 0) {
      console.log('[SCHEDULER] Found ' + staleJobs.length + ' stale jobs, marking failed');
      for (const job of staleJobs) {
        await crew.updateJob(job.id, {
          status: 'failed',
          error: 'Stale job — exceeded 10 min with no completion',
          completed_at: new Date().toISOString(),
        });
      }
    }

    // 2. Process pending jobs
    const results = await crew.processQueue();
    if (results.length > 0) {
      console.log('[SCHEDULER] Crew processed ' + results.length + ' jobs');
    }

    // 3. Follow up on completed jobs
    const followups = await crew.followUpCompletedJobs();
    if (followups.length > 0) {
      console.log('[SCHEDULER] Followed up on ' + followups.length + ' completed jobs');
    }

    // 4. Check for stale workflows (running but no progress for 30 min)
    try {
      const { data: staleWorkflows } = await require('../db/supabase').supabase
        .from('workflows').select('id, name, current_step, total_steps')
        .eq('status', 'running')
        .lt('updated_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());

      if (staleWorkflows && staleWorkflows.length > 0) {
        console.log('[SCHEDULER] Found ' + staleWorkflows.length + ' stale workflows');
        // Don't auto-fail — just log. The jobs themselves handle failures.
      }
    } catch (e) {
      // Workflow table may not exist yet — that's fine
    }
  } catch (err) {
    console.error('[SCHEDULER] Crew processing error:', err.message);
  }
}

function scheduleCrewProcessing() {
  setTimeout(() => {
    processCrewAndFollowUp();
    setInterval(processCrewAndFollowUp, 2 * 60 * 60 * 1000); // every 2 hours
  }, 10 * 60 * 1000); // first run in 10 min
  console.log('[SCHEDULER] Crew queue + follow-up: every 2h');
}

// ── Shop Optimizer: daily at 10 AM ET ──
function scheduleShopOptimizer() {
  try {
    const { dailyShopCheck } = require('../core/shop-optimizer');
    const next10am = getNextETHour(10);
    const delay = next10am.getTime() - Date.now();
    setTimeout(() => {
      dailyShopCheck();
      setInterval(dailyShopCheck, 24 * 60 * 60 * 1000);
    }, delay);
    console.log('[SCHEDULER] Shop optimizer: 10 AM ET daily');
  } catch (e) {
    console.log('[SCHEDULER] Shop optimizer not available:', e.message);
  }
}

// ══════════════════════════════════════════════
// START ALL
// ══════════════════════════════════════════════

function startAllJobs() {
  scheduleDailyBriefing();
  startAppMonitoring();
  scheduleCrewProcessing();
  scheduleShopOptimizer();
  console.log('[SCHEDULER] Running: briefing (9am) + crew (2h) + shop (10am) + keep-alive (5m)');
}

module.exports = { startAllJobs, sendDailyBriefing, processCrewAndFollowUp };
