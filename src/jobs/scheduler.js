const brain = require('../core/brain');
const db = require('../db/queries');
const { sendBossMessage, logToDiscord } = require('../channels/discord');
const { runAgentCycle } = require('../core/agent');
const drip = require('../core/drip');
const crew = require('../core/crew');
const proactive = require('./proactive');
const hustle = require('../core/hustle');

async function sendDailyBriefing() {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return;
    const briefing = await brain.generateBriefing(tenant.id);
    await sendBossMessage('**Morning Briefing**\n\n' + briefing);
    logToDiscord('daily-reports', '**Morning Briefing**\n\n' + briefing);
    console.log('[SCHEDULER] Briefing sent');
  } catch (error) { console.error('[SCHEDULER] Briefing error:', error.message); }
}

// Get next occurrence of a specific hour in ET
function getNextETHour(hour) {
  const now = new Date();
  const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const offset = now.getTime() - eastern.getTime();
  const target = new Date(eastern);
  target.setHours(hour, 0, 0, 0);
  if (eastern >= target) target.setDate(target.getDate() + 1);
  return new Date(target.getTime() + offset);
}

function scheduleDailyBriefing() {
  const next9am = getNextETHour(9);
  const delay = next9am.getTime() - Date.now();
  setTimeout(() => {
    sendDailyBriefing();
    setInterval(sendDailyBriefing, 24 * 60 * 60 * 1000);
  }, delay);
  console.log('[SCHEDULER] Briefing scheduled. Next: ' + next9am.toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET');
}

async function generateAndSendIdea() {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return;
    const idea = await brain.generateIdea(tenant.id);
    await sendBossMessage('**Idea from Jarvis:**\n\n' + idea);
    console.log('[SCHEDULER] Idea sent');
  } catch (error) { console.error('[SCHEDULER] Idea error:', error.message); }
}

function scheduleIdeas() {
  // Ideas once per day (throttled from 8h — ideas were flooding Discord)
  setInterval(generateAndSendIdea, 24 * 60 * 60 * 1000);
  setTimeout(generateAndSendIdea, 2 * 60 * 60 * 1000); // first in 2 hours
  console.log('[SCHEDULER] Ideas engine started (daily)');
}

function startAppMonitoring() {
  const checkApps = async () => {
    const apps = [{ name: 'Jarvis Bot', url: process.env.RENDER_EXTERNAL_URL || 'https://jarvis-sms-bot.onrender.com' }];
    for (const app of apps) {
      try {
        const res = await fetch(app.url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) await sendBossMessage('**Alert:** ' + app.name + ' returned status ' + res.status);
      } catch (error) { await sendBossMessage('**Alert:** ' + app.name + ' is DOWN: ' + error.message); }
    }
  };
  setInterval(checkApps, 5 * 60 * 1000);
  console.log('[MONITOR] App monitoring started');
}

function scheduleAgentCycle() {
  // Full agent cycle — every 2 hours
  setTimeout(() => {
    runAgentCycle().catch(err => console.error('[AGENT] Cycle error:', err.message));
    setInterval(() => {
      runAgentCycle().catch(err => console.error('[AGENT] Cycle error:', err.message));
    }, 2 * 60 * 60 * 1000); // every 2 hours
  }, 10 * 60 * 1000); // first in 10 min
  console.log('[SCHEDULER] Agent cycle scheduled (every 2h, first in 10m)');
}

function scheduleHustleEngine() {
  // Quick revenue check — every 4 hours (throttled from 15min to reduce spam)
  setTimeout(() => {
    hustle.quickCheck().catch(err => console.error('[HUSTLE] Quick check error:', err.message));
    setInterval(() => {
      hustle.quickCheck().catch(err => console.error('[HUSTLE] Quick check error:', err.message));
    }, 4 * 60 * 60 * 1000);
  }, 30 * 60 * 1000); // first in 30 min
  console.log('[HUSTLE] Quick revenue checks: every 4 hours');

  // Opportunity scanner — every 6 hours (throttled from 2h)
  setTimeout(() => {
    hustle.opportunityScan().catch(err => console.error('[HUSTLE] Scan error:', err.message));
    setInterval(() => {
      hustle.opportunityScan().catch(err => console.error('[HUSTLE] Scan error:', err.message));
    }, 6 * 60 * 60 * 1000);
  }, 45 * 60 * 1000); // first in 45 min
  console.log('[HUSTLE] Opportunity scanner: every 6 hours');

  // Self-improvement — daily at 11 PM ET
  const next11pm = getNextETHour(23);
  setTimeout(() => {
    hustle.selfImprove().catch(err => console.error('[HUSTLE] Self-improve error:', err.message));
    setInterval(() => {
      hustle.selfImprove().catch(err => console.error('[HUSTLE] Self-improve error:', err.message));
    }, 24 * 60 * 60 * 1000);
  }, next11pm.getTime() - Date.now());
  console.log('[HUSTLE] Self-improvement: daily 11 PM ET');
}

function schedulePipelineMonitor() {
  setTimeout(async () => {
    try { await drip.ensureTable(); } catch (e) { console.error('[DRIP] Table setup error:', e.message); }
    drip.monitorPipeline().catch(err => console.error('[DRIP] Monitor error:', err.message));
    setInterval(() => {
      drip.monitorPipeline().catch(err => console.error('[DRIP] Monitor error:', err.message));
    }, 2 * 60 * 60 * 1000);
  }, 5 * 60 * 1000);
  console.log('[SCHEDULER] Pipeline monitor scheduled (every 2h, first in 5m)');
}

function scheduleCrewProcessing() {
  setTimeout(() => {
    crew.processQueue().catch(err => console.error('[CREW] Queue error:', err.message));
    setInterval(() => {
      crew.processQueue().catch(err => console.error('[CREW] Queue error:', err.message));
    }, 2 * 60 * 60 * 1000); // every 2 hours (throttled from 30m)
  }, 5 * 60 * 1000);
  console.log('[SCHEDULER] Crew processing scheduled (every 2h, first in 5m)');
}

// ══════════════════════════════════════════════
// PROACTIVE SCHEDULE
// ══════════════════════════════════════════════

function scheduleProactive() {
  // Morning Game Plan — 8 AM ET
  const next8am = getNextETHour(8);
  setTimeout(() => {
    proactive.morningGamePlan();
    setInterval(proactive.morningGamePlan, 24 * 60 * 60 * 1000);
  }, next8am.getTime() - Date.now());
  console.log('[PROACTIVE] Morning game plan: ' + next8am.toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET');

  // No-Log Reminder — 4 PM ET
  const next4pm = getNextETHour(16);
  setTimeout(() => {
    proactive.noLogReminder();
    setInterval(proactive.noLogReminder, 24 * 60 * 60 * 1000);
  }, next4pm.getTime() - Date.now());
  console.log('[PROACTIVE] No-log reminder: ' + next4pm.toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET');

  // End of Day Recap — 6 PM ET
  const next6pm = getNextETHour(18);
  setTimeout(() => {
    proactive.endOfDayRecap();
    proactive.checkGoalAchievements();
    setInterval(() => {
      proactive.endOfDayRecap();
      proactive.checkGoalAchievements();
    }, 24 * 60 * 60 * 1000);
  }, next6pm.getTime() - Date.now());
  console.log('[PROACTIVE] EOD recap: ' + next6pm.toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET');

  // Stale Lead Alert — 10 AM ET daily
  const next10am = getNextETHour(10);
  setTimeout(() => {
    proactive.staleLeadAlert();
    setInterval(proactive.staleLeadAlert, 24 * 60 * 60 * 1000);
  }, next10am.getTime() - Date.now());
  console.log('[PROACTIVE] Stale lead alerts: ' + next10am.toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET');

  // Weekly Report — check every hour, fire on Friday 5 PM ET
  setInterval(async () => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    if (now.getDay() === 5 && now.getHours() === 17 && now.getMinutes() < 5) {
      await proactive.weeklyReport();
    }
  }, 5 * 60 * 1000);
  console.log('[PROACTIVE] Weekly report: Fridays 5 PM ET');

  // Auto-delegate to crew — every 2 hours
  setInterval(() => {
    proactive.autoDelegate().catch(err => console.error('[PROACTIVE] Auto-delegate error:', err.message));
  }, 2 * 60 * 60 * 1000);
  console.log('[PROACTIVE] Auto-delegate: every 2 hours');
}

function startAllJobs() {
  scheduleDailyBriefing();
  scheduleIdeas();
  startAppMonitoring();
  scheduleAgentCycle();
  schedulePipelineMonitor();
  scheduleCrewProcessing();
  scheduleProactive();
  scheduleHustleEngine();
  console.log('[SCHEDULER] All jobs started — Jarvis is ALWAYS thinking');
}

module.exports = { startAllJobs, sendDailyBriefing, generateAndSendIdea };
