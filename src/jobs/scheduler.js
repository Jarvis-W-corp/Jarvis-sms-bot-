const brain = require('../core/brain');
const db = require('../db/queries');
const { sendBossMessage, logToDiscord } = require('../channels/discord');

async function sendDailyBriefing() {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return;
    const briefing = await brain.generateBriefing(tenant.id);
    await sendBossMessage('☀️ **Morning Briefing**\n\n' + briefing);
    logToDiscord('daily-reports', '☀️ **Morning Briefing**\n\n' + briefing);
    console.log('[SCHEDULER] Briefing sent');
  } catch (error) { console.error('[SCHEDULER] Briefing error:', error.message); }
}

function getNext9amET() {
  const now = new Date();
  const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const offset = now.getTime() - eastern.getTime();
  const next9am = new Date(eastern);
  next9am.setHours(9, 0, 0, 0);
  if (eastern >= next9am) next9am.setDate(next9am.getDate() + 1);
  return new Date(next9am.getTime() + offset);
}

function scheduleDailyBriefing() {
  const next9am = getNext9amET();
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
    await sendBossMessage('💡 **Idea from Jarvis:**\n\n' + idea);
    console.log('[SCHEDULER] Idea sent');
  } catch (error) { console.error('[SCHEDULER] Idea error:', error.message); }
}

function scheduleIdeas() {
  setInterval(generateAndSendIdea, 8 * 60 * 60 * 1000);
  setTimeout(generateAndSendIdea, 60 * 60 * 1000);
  console.log('[SCHEDULER] Ideas engine started');
}

function startAppMonitoring() {
  const checkApps = async () => {
    const apps = [{ name: 'Jarvis Bot', url: process.env.RENDER_EXTERNAL_URL || 'https://jarvis-sms-bot.onrender.com' }];
    for (const app of apps) {
      try {
        const res = await fetch(app.url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) await sendBossMessage('🚨 **Alert:** ' + app.name + ' returned status ' + res.status);
      } catch (error) { await sendBossMessage('🚨 **Alert:** ' + app.name + ' is DOWN: ' + error.message); }
    }
  };
  setInterval(checkApps, 5 * 60 * 1000);
  console.log('[MONITOR] App monitoring started');
}

function startAllJobs() {
  scheduleDailyBriefing();
  scheduleIdeas();
  startAppMonitoring();
  console.log('[SCHEDULER] All jobs started');
}

module.exports = { startAllJobs, sendDailyBriefing, generateAndSendIdea };
