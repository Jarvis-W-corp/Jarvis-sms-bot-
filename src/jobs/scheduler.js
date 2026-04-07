const brain = require('../core/brain');
const db = require('../db/queries');
const { sendBossMessage } = require('../channels/discord');

// ══════════════════════════════════════════════
// LEAN SCHEDULER — Only run what makes money
// No revenue = no wasteful API calls
// ══════════════════════════════════════════════

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

// ── Morning Briefing: 9 AM ET, once per day ──
// This is the Olivia-style debrief. One shot, real numbers.
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
// No API calls, just prevents Render from sleeping
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

// ── Crew queue: every 4 hours ──
// Only processes jobs that are already queued (doesn't generate new ones)
function scheduleCrewProcessing() {
  const crew = require('../core/crew');
  setTimeout(() => {
    crew.processQueue().catch(err => console.error('[CREW] Queue error:', err.message));
    setInterval(() => {
      crew.processQueue().catch(err => console.error('[CREW] Queue error:', err.message));
    }, 4 * 60 * 60 * 1000);
  }, 10 * 60 * 1000); // first in 10 min
  console.log('[SCHEDULER] Crew queue: every 4h');
}

// ══════════════════════════════════════════════
// KILLED (was burning API credits for nothing):
// - Ideas engine (daily) — not generating revenue
// - Agent cycle (every 2h) — 20 iterations of Claude per cycle
// - Hustle quick check (every 4h) — no revenue to check
// - Hustle opportunity scan (every 6h) — scanning for nothing
// - Hustle self-improve (daily) — improving what?
// - Pipeline monitor (every 2h) — Enerflo returns 0 data anyway
// - Morning game plan (8am) — duplicate of briefing
// - No-log reminder (4pm) — unnecessary
// - EOD recap (6pm) — no data to recap
// - Goal achievements (6pm) — no goals set
// - Stale lead alert (10am) — no leads in system
// - Auto-delegate (every 2h) — delegating nothing
// - Weekly report (Fridays) — empty report
//
// RE-ENABLE these when there's actual revenue/leads flowing.
// For now: briefing + keep-alive + crew queue = 1 API call/day
// ══════════════════════════════════════════════

function startAllJobs() {
  scheduleDailyBriefing();
  startAppMonitoring();
  scheduleCrewProcessing();
  console.log('[SCHEDULER] Lean mode — 1 briefing/day + keep-alive + crew queue');
}

module.exports = { startAllJobs, sendDailyBriefing };
