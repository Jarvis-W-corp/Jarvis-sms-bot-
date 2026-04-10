// scheduler.js — 16 Cron Jobs. Jarvis Never Sleeps.
// Every job is safe to fail independently. All times are ET.

const cron = require('node-cron');
const db = require('../db/queries');
const { sendBossMessage, logToDiscord } = require('../channels/discord');

// ═══ JOB IMPLEMENTATIONS ═══

// 5:45 AM — Pre-brief data pull (silent)
async function preBriefData() {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return;
    const proactive = require('../core/proactive');
    const data = await proactive.buildBriefingData(tenant.id);
    console.log('[CRON] Pre-brief data pulled: ' + (data.newLeads?.length || 0) + ' new leads, ' + (data.appointments?.length || 0) + ' appointments');
  } catch (e) { console.error('[CRON] Pre-brief error:', e.message); }
}

// 6:00 AM — Ad budget optimization (auto)
async function adBudgetOptimize() {
  try {
    const metaAds = require('../core/meta-ads');
    // Only run if META_ACCESS_TOKEN is set
    if (!process.env.META_ACCESS_TOKEN) { console.log('[CRON] Ad optimizer skipped — no META_ACCESS_TOKEN'); return; }
    // Load active business configs and optimize each
    const config = require('../core/business-config');
    const configs = config.listConfigs();
    for (const c of configs) {
      if (c.meta?.adAccountId) {
        const result = await metaAds.optimizeBudget(c.meta.adAccountId, c.targetCPL || 25);
        if (result.actions?.length > 0) {
          await logToDiscord('daily-reports', '📊 **Ad Optimizer** (' + c.name + ')\n' + result.actions.join('\n'));
        }
      }
    }
  } catch (e) { console.error('[CRON] Ad optimizer error:', e.message); }
}

// 7:00 AM — Morning briefing
async function morningBriefing() {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return;
    const brain = require('../core/brain');
    const proactive = require('../core/proactive');
    const data = await proactive.buildBriefingData(tenant.id);

    // Build context string for Claude
    const parts = [];
    if (data.appointments.length) parts.push('TODAY\'S APPOINTMENTS:\n' + data.appointments.map(a => '- ' + (a.leads?.name || 'Unknown') + ' at ' + new Date(a.scheduled_at).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })).join('\n'));
    if (data.hotLeads.length) parts.push('HOT LEADS (8+ score):\n' + data.hotLeads.map(l => '- ' + l.name + ' (score: ' + l.score + ') ' + (l.phone || '')).join('\n'));
    if (Object.keys(data.yesterdayActivity).length) parts.push('YESTERDAY ACTIVITY:\n' + Object.entries(data.yesterdayActivity).map(([k, v]) => '- ' + k + ': ' + v).join('\n'));
    if (data.newLeads.length) parts.push('NEW LEADS (24h): ' + data.newLeads.length);
    if (data.costs) parts.push('API COSTS (24h): $' + (data.costs.total_cost || 0).toFixed(2));
    if (data.findings.length) parts.push('SELF-ANALYSIS:\n' + data.findings.map(f => '- ' + f.type + ': ' + (f.message || f.count || JSON.stringify(f))).join('\n'));

    const briefing = await brain.generateBriefing(tenant.id);
    await sendBossMessage('☀️ **Morning Briefing**\n\n' + briefing);
    console.log('[CRON] Morning briefing sent');
  } catch (e) { console.error('[CRON] Briefing error:', e.message); }
}

// 7:30 AM + 6:00 PM — Email waves
async function emailWave() {
  try {
    const sequencer = require('../core/sequencer');
    const results = await sequencer.processSequenceQueue();
    if (results.sent > 0) console.log('[CRON] Email wave: sent ' + results.sent + ' emails');
  } catch (e) { console.error('[CRON] Email wave error:', e.message); }
}

// 8:00 AM — Dialer wave 1: high score leads (8+)
async function dialerWaveHigh() {
  try {
    if (!process.env.BLAND_API_KEY) { console.log('[CRON] Dialer skipped — no BLAND_API_KEY'); return; }
    const tenant = await db.getDefaultTenant();
    if (!tenant) return;
    const dialer = require('../core/dialer');
    const leads = await db.getLeadsByScore(tenant.id, 8, 'new', 10);
    let dialed = 0;
    for (const lead of leads) {
      try {
        const script = await dialer.generateCallScript(lead, lead.niche || 'solar', 'book a free consultation');
        await dialer.dialLead(tenant.id, lead, script);
        dialed++;
      } catch (e) { console.error('[CRON] Dial error for ' + lead.name + ':', e.message); }
    }
    if (dialed > 0) {
      await logToDiscord('daily-reports', '📞 **Dialer Wave 1**: Called ' + dialed + ' high-score leads');
    }
  } catch (e) { console.error('[CRON] Dialer wave 1 error:', e.message); }
}

// 9:00 AM — New lead scrape
async function leadScrape() {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return;
    const leads = require('../core/leads');
    // Scrape for each active niche
    const niches = ['solar installers CT', 'med spa CT'];
    for (const niche of niches) {
      try {
        await leads.scrapeLeads(niche, 'Connecticut', 15);
      } catch (e) { console.error('[CRON] Scrape error for ' + niche + ':', e.message); }
    }
    console.log('[CRON] Lead scrape complete');
  } catch (e) { console.error('[CRON] Lead scrape error:', e.message); }
}

// 12:00 PM — Midday check-in
async function middayCheckin() {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return;
    const proactive = require('../core/proactive');
    const message = await proactive.middayCheckIn(tenant.id);
    await sendBossMessage('🕛 **Midday Check-In**\n\n' + message);
  } catch (e) { console.error('[CRON] Midday check-in error:', e.message); }
}

// 12:30 PM — Appointment reminders
async function appointmentReminders() {
  try {
    const calendar = require('../core/calendar');
    const tenant = await db.getDefaultTenant();
    if (!tenant) return;
    await calendar.sendReminders(tenant.id);
  } catch (e) { console.error('[CRON] Appointment reminders error:', e.message); }
}

// 2:00 PM — Dialer wave 2: mid-score leads (5-7)
async function dialerWaveMid() {
  try {
    if (!process.env.BLAND_API_KEY) return;
    const tenant = await db.getDefaultTenant();
    if (!tenant) return;
    const dialer = require('../core/dialer');
    const leads = await db.getLeadsByScore(tenant.id, 5, 'contacted', 10);
    const midLeads = leads.filter(l => l.score <= 7);
    let dialed = 0;
    for (const lead of midLeads) {
      try {
        const script = await dialer.generateCallScript(lead, lead.niche || 'solar', 'follow up and book consultation');
        await dialer.dialLead(tenant.id, lead, script);
        dialed++;
      } catch (e) {}
    }
    if (dialed > 0) await logToDiscord('daily-reports', '📞 **Dialer Wave 2**: Called ' + dialed + ' mid-score leads');
  } catch (e) { console.error('[CRON] Dialer wave 2 error:', e.message); }
}

// 4:00 PM — Re-engagement sweep
async function reEngagement() {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return;
    const proactive = require('../core/proactive');
    const result = await proactive.reEngagementSweep(tenant.id);
    const total = result.day5 + result.day15 + result.day30;
    if (total > 0) console.log('[CRON] Re-engagement: ' + total + ' leads queued');
  } catch (e) { console.error('[CRON] Re-engagement error:', e.message); }
}

// 8:00 PM — Business idea drop
async function businessIdea() {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return;
    const proactive = require('../core/proactive');
    const idea = await proactive.generateBusinessIdea(tenant.id);
    await sendBossMessage('💡 **Evening Idea Drop**\n\n' + idea);
  } catch (e) { console.error('[CRON] Business idea error:', e.message); }
}

// 11:00 PM — CRM cleanup + reconciliation
async function crmCleanupJob() {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return;
    const proactive = require('../core/proactive');
    const actions = await proactive.crmCleanup(tenant.id);
    if (actions.length > 0) console.log('[CRON] CRM cleanup: ' + actions.join(', '));
  } catch (e) { console.error('[CRON] CRM cleanup error:', e.message); }
}

// Monday 1 AM — Weekly LAL upload
async function weeklyLAL() {
  try {
    if (!process.env.META_ACCESS_TOKEN) return;
    console.log('[CRON] Weekly LAL upload — would upload CRM winners to Meta');
    // TODO: implement when Meta API is configured
  } catch (e) { console.error('[CRON] LAL error:', e.message); }
}

// Monday 3 AM — Weekly report
async function weeklyReport() {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return;
    const proactive = require('../core/proactive');
    const data = await proactive.buildBriefingData(tenant.id);
    const costWeek = await db.getApiCostSummary(tenant.id, new Date(Date.now() - 7 * 86400000).toISOString()).catch(() => null);
    await sendBossMessage('📊 **Weekly Report**\n\n' +
      'Leads this week: ' + (data.newLeads?.length || 0) + '\n' +
      'Appointments: ' + (data.appointments?.length || 0) + '\n' +
      'API costs: $' + (costWeek?.total_cost || 0).toFixed(2) + '\n' +
      'Findings: ' + data.findings.map(f => f.type).join(', '));
  } catch (e) { console.error('[CRON] Weekly report error:', e.message); }
}

// Daily 10 AM ET — Etsy money pipeline (creates 3 new products/day, auto-publish)
async function dailyEtsyPipeline() {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return;
    const ecom = require('../core/ecommerce');
    console.log('[CRON] Running daily Etsy money pipeline');
    const report = await ecom.runDailyMoneyPipeline(tenant.id);
    const created = (report.products || []).filter(p => !p.error).length;
    if (created > 0) {
      await sendBossMessage('🛒 **Daily Etsy Pipeline**\n\n' +
        '✓ Created ' + created + ' new products on Etsy\n' +
        (report.products || []).filter(p => !p.error).map(p => '• ' + p.title).join('\n'));
    }
  } catch (e) { console.error('[CRON] Etsy pipeline error:', e.message); }
}

// Daily 9 AM ET — Check/publish any unpublished Printify products
async function etsyOptimize() {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return;
    const ecom = require('../core/ecommerce');
    const report = await ecom.optimizeExistingListings(tenant.id);
    if (report.optimized && report.optimized.length > 0) {
      console.log('[CRON] Optimized ' + report.optimized.length + ' listings');
    }
  } catch (e) { console.error('[CRON] Etsy optimize error:', e.message); }
}

// Monthly 1st 4 AM — Purge old dead leads
async function monthlyPurge() {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return;
    const cutoff = new Date(Date.now() - 180 * 86400000).toISOString();
    const { data } = await require('../db/supabase').supabase
      .from('leads').select('id').eq('tenant_id', tenant.id).eq('status', 'dead').lt('updated_at', cutoff);
    console.log('[CRON] Monthly purge: ' + (data?.length || 0) + ' leads eligible for archive');
  } catch (e) { console.error('[CRON] Monthly purge error:', e.message); }
}

// ═══ CREW PROCESSING ═══

async function processCrewAndFollowUp() {
  const crew = require('../core/crew');
  try {
    // Clean stale running jobs
    const { data: staleJobs } = await require('../db/supabase').supabase
      .from('agent_jobs').select('id, title, started_at')
      .eq('status', 'running')
      .lt('started_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());
    if (staleJobs && staleJobs.length > 0) {
      for (const job of staleJobs) {
        await crew.updateJob(job.id, { status: 'failed', error: 'Stale — exceeded 10 min', completed_at: new Date().toISOString() });
      }
    }
    const results = await crew.processQueue();
    if (results.length > 0) console.log('[SCHEDULER] Crew processed ' + results.length + ' jobs');
    const followups = await crew.followUpCompletedJobs();
    if (followups.length > 0) console.log('[SCHEDULER] Followed up ' + followups.length + ' jobs');

    // Check stale workflows
    try {
      const { data: staleWf } = await require('../db/supabase').supabase
        .from('workflows').select('id, name').eq('status', 'running')
        .lt('updated_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());
      if (staleWf && staleWf.length > 0) console.log('[SCHEDULER] ' + staleWf.length + ' stale workflows');
    } catch (e) {}
  } catch (e) { console.error('[SCHEDULER] Crew error:', e.message); }
}

// ═══ KEEP ALIVE ═══

function startKeepAlive() {
  setInterval(async () => {
    try {
      const url = process.env.RENDER_EXTERNAL_URL || 'https://jarvis-sms-bot.onrender.com';
      await fetch(url, { signal: AbortSignal.timeout(10000) });
    } catch (e) {}
  }, 5 * 60 * 1000);
}

// ═══ SEQUENCE PROCESSOR (every 30 min) ═══

async function processSequences() {
  try {
    const sequencer = require('../core/sequencer');
    const result = await sequencer.processSequenceQueue();
    if (result && result.sent > 0) console.log('[CRON] Sequences: sent ' + result.sent);
  } catch (e) { /* sequencer may not exist yet */ }
}

// ═══ START ALL JOBS ═══

function startAllJobs() {
  console.log('[SCHEDULER] Starting 16 cron jobs + crew + keep-alive...');

  // All times are ET — node-cron uses server timezone
  // Render runs in UTC, so adjust: ET = UTC-4 (EDT) or UTC-5 (EST)
  // Using America/New_York timezone option

  const opts = { timezone: 'America/New_York' };

  // The 16 crons
  cron.schedule('45 5 * * *', preBriefData, opts);
  cron.schedule('0 6 * * *', adBudgetOptimize, opts);
  cron.schedule('0 7 * * *', morningBriefing, opts);
  cron.schedule('30 7 * * *', emailWave, opts);
  cron.schedule('0 8 * * *', dialerWaveHigh, opts);
  cron.schedule('0 9 * * *', leadScrape, opts);
  cron.schedule('0 12 * * *', middayCheckin, opts);
  cron.schedule('30 12 * * *', appointmentReminders, opts);
  cron.schedule('0 14 * * *', dialerWaveMid, opts);
  cron.schedule('0 16 * * *', reEngagement, opts);
  cron.schedule('0 18 * * *', emailWave, opts); // second wave uses same function
  cron.schedule('0 20 * * *', businessIdea, opts);
  cron.schedule('0 23 * * *', crmCleanupJob, opts);
  cron.schedule('0 1 * * 1', weeklyLAL, opts);
  cron.schedule('0 3 * * 1', weeklyReport, opts);
  cron.schedule('0 4 1 * *', monthlyPurge, opts);

  // ═══ ETSY MONEY MAKERS ═══
  cron.schedule('0 9 * * *', etsyOptimize, opts);        // 9 AM — publish any unpublished
  cron.schedule('0 10 * * *', dailyEtsyPipeline, opts);  // 10 AM — create 3 new products

  // Email sequence processor — every 30 min
  cron.schedule('*/30 * * * *', processSequences);

  // Crew queue + follow-up — every 2 hours
  cron.schedule('0 */2 * * *', processCrewAndFollowUp);

  // Keep-alive
  startKeepAlive();

  console.log('[SCHEDULER] All 16 crons + sequences (30m) + crew (2h) + keep-alive (5m) — LIVE');
}

module.exports = { startAllJobs, morningBriefing, processCrewAndFollowUp, middayCheckin };
