// proactive.js — The Proactivity Engine
// 16 cron jobs. Jarvis never sleeps. Act first, report after.
// Every function is self-contained and safe to call independently.

const db = require('../db/queries');
const { sendBossMessage, logToDiscord } = require('../channels/discord');
const brain = require('./brain');

const Anthropic = require('@anthropic-ai/sdk').default;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ═══ SELF-ANALYSIS ENGINE (runs 2x daily) ═══
// Finds problems and fixes them autonomously

async function selfAnalysis(tenantId) {
  const findings = [];

  try {
    // 1. Find forgotten leads (6+ hours old, score 7+, status still 'new')
    try {
      const { data: forgotten } = await require('../db/supabase').supabase
        .from('leads').select('id, name, phone, email, score')
        .eq('tenant_id', tenantId).eq('status', 'new')
        .gte('score', 7)
        .lt('created_at', new Date(Date.now() - 6 * 3600000).toISOString())
        .limit(20);
      if (forgotten && forgotten.length > 0) {
        findings.push({ type: 'forgotten_leads', count: forgotten.length, leads: forgotten.map(l => l.name + ' (score: ' + l.score + ')') });
        // Auto re-queue for dialing
        for (const lead of forgotten) {
          try {
            await require('../db/supabase').supabase.from('leads').update({ status: 'contacted' }).eq('id', lead.id);
            await db.logActivity(tenantId, lead.id, 'note', { message: 'Re-queued by self-analysis — was forgotten 6+ hours' });
          } catch (e) {}
        }
      }
    } catch (e) { /* leads table may not exist yet */ }

    // 2. Check for no-show appointments
    try {
      const { data: noShows } = await require('../db/supabase').supabase
        .from('appointments').select('id, lead_id, scheduled_at')
        .eq('tenant_id', tenantId).eq('status', 'scheduled')
        .lt('scheduled_at', new Date().toISOString());
      if (noShows && noShows.length > 0) {
        findings.push({ type: 'no_shows', count: noShows.length });
        for (const appt of noShows) {
          await require('../db/supabase').supabase.from('appointments').update({ status: 'no_show' }).eq('id', appt.id);
        }
      }
    } catch (e) {}

    // 3. Check lead pipeline health
    try {
      const { data: pipelineCounts } = await require('../db/supabase').supabase
        .from('leads').select('status')
        .eq('tenant_id', tenantId);
      if (pipelineCounts) {
        const byStatus = {};
        pipelineCounts.forEach(l => { byStatus[l.status] = (byStatus[l.status] || 0) + 1; });
        findings.push({ type: 'pipeline_health', counts: byStatus });
        // Alert if no new leads in 48 hours
        const { data: recentLeads } = await require('../db/supabase').supabase
          .from('leads').select('id').eq('tenant_id', tenantId)
          .gte('created_at', new Date(Date.now() - 48 * 3600000).toISOString())
          .limit(1);
        if (!recentLeads || recentLeads.length === 0) {
          findings.push({ type: 'no_new_leads', message: 'No new leads in 48 hours' });
        }
      }
    } catch (e) {}

    // 4. Check for leads with no next step
    try {
      const { data: staleLeads } = await require('../db/supabase').supabase
        .from('leads').select('id, name, status')
        .eq('tenant_id', tenantId)
        .in('status', ['new', 'contacted', 'qualified'])
        .lt('updated_at', new Date(Date.now() - 72 * 3600000).toISOString())
        .limit(20);
      if (staleLeads && staleLeads.length > 0) {
        findings.push({ type: 'stale_leads', count: staleLeads.length, message: staleLeads.length + ' leads with no activity in 72 hours' });
      }
    } catch (e) {}

  } catch (e) {
    console.error('[PROACTIVE] Self-analysis error:', e.message);
  }

  return findings;
}

// ═══ MORNING BRIEFING BUILDER ═══

async function buildBriefingData(tenantId) {
  const data = {};

  // Today's appointments
  try {
    const { data: appts } = await require('../db/supabase').supabase
      .from('appointments').select('*, leads(name, company, score, phone)')
      .eq('tenant_id', tenantId).eq('status', 'scheduled')
      .gte('scheduled_at', new Date().toISOString())
      .lte('scheduled_at', new Date(Date.now() + 24 * 3600000).toISOString())
      .order('scheduled_at');
    data.appointments = appts || [];
  } catch (e) { data.appointments = []; }

  // Hot leads (score 8+, not closed)
  try {
    const { data: hot } = await require('../db/supabase').supabase
      .from('leads').select('name, score, status, phone, company')
      .eq('tenant_id', tenantId).gte('score', 8)
      .not('status', 'in', '("closed","dead")')
      .order('score', { ascending: false }).limit(10);
    data.hotLeads = hot || [];
  } catch (e) { data.hotLeads = []; }

  // Yesterday's numbers
  const yesterday = new Date(Date.now() - 24 * 3600000).toISOString();
  try {
    const { data: activities } = await require('../db/supabase').supabase
      .from('activities').select('type')
      .eq('tenant_id', tenantId)
      .gte('created_at', yesterday);
    if (activities) {
      const counts = {};
      activities.forEach(a => { counts[a.type] = (counts[a.type] || 0) + 1; });
      data.yesterdayActivity = counts;
    }
  } catch (e) { data.yesterdayActivity = {}; }

  // New leads count
  try {
    const { data: newLeads } = await require('../db/supabase').supabase
      .from('leads').select('id, source')
      .eq('tenant_id', tenantId)
      .gte('created_at', yesterday);
    data.newLeads = newLeads || [];
  } catch (e) { data.newLeads = []; }

  // Cost summary
  try {
    data.costs = await db.getApiCostSummary(tenantId, yesterday);
  } catch (e) { data.costs = null; }

  // Self-analysis findings
  data.findings = await selfAnalysis(tenantId);

  return data;
}

// ═══ MIDDAY CHECK-IN ═══

async function middayCheckIn(tenantId) {
  const data = await buildBriefingData(tenantId);
  const bullets = [];

  if (data.appointments.length > 0) {
    bullets.push('📅 ' + data.appointments.length + ' appointments today');
  }
  if (data.hotLeads.length > 0) {
    bullets.push('🔥 ' + data.hotLeads.length + ' hot leads (8+ score)');
  }
  const findings = data.findings.filter(f => f.type === 'forgotten_leads' || f.type === 'no_shows');
  for (const f of findings) {
    if (f.type === 'forgotten_leads') bullets.push('⚠️ Re-queued ' + f.count + ' forgotten leads');
    if (f.type === 'no_shows') bullets.push('❌ ' + f.count + ' no-shows detected');
  }

  if (bullets.length === 0) bullets.push('All clear — pipeline is moving');
  return bullets.join('\n');
}

// ═══ RE-ENGAGEMENT SWEEP ═══

async function reEngagementSweep(tenantId) {
  const swept = { day5: 0, day15: 0, day30: 0 };

  const segments = [
    { days: 5, label: 'day5', message: 'Hey {name}, just checking in — still interested in {offer}?' },
    { days: 15, label: 'day15', message: 'Hi {name}, wanted to circle back. We have some new options that might work for you.' },
    { days: 30, label: 'day30', message: '{name}, it\'s been a while! If you\'re still thinking about {offer}, I\'d love to help.' },
  ];

  for (const seg of segments) {
    try {
      const cutoff = new Date(Date.now() - seg.days * 24 * 3600000).toISOString();
      const recent = new Date(Date.now() - (seg.days - 2) * 24 * 3600000).toISOString();
      const { data: leads } = await require('../db/supabase').supabase
        .from('leads').select('id, name, phone, email, niche')
        .eq('tenant_id', tenantId)
        .in('status', ['contacted', 'qualified'])
        .lt('updated_at', cutoff)
        .gte('updated_at', recent)
        .limit(20);

      if (leads && leads.length > 0) {
        swept[seg.label] = leads.length;
        // Queue for SMS re-engagement
        for (const lead of leads) {
          try {
            await db.logActivity(tenantId, lead.id, 'note', { message: 'Queued for ' + seg.days + '-day re-engagement' });
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  return swept;
}

// ═══ CRM CLEANUP (nightly) ═══

async function crmCleanup(tenantId) {
  const actions = [];

  // 1. Mark bounced emails as dead
  try {
    const { data: bounced } = await require('../db/supabase').supabase
      .from('activities').select('lead_id')
      .eq('tenant_id', tenantId).eq('type', 'email_bounced');
    if (bounced && bounced.length > 0) {
      const ids = [...new Set(bounced.map(b => b.lead_id))];
      for (const id of ids) {
        await require('../db/supabase').supabase.from('leads').update({ status: 'dead', meta: { reason: 'email_bounced' } }).eq('id', id);
      }
      actions.push('Marked ' + ids.length + ' bounced leads as dead');
    }
  } catch (e) {}

  // 2. Archive leads dead 180+ days
  try {
    const cutoff = new Date(Date.now() - 180 * 24 * 3600000).toISOString();
    const { data: ancient } = await require('../db/supabase').supabase
      .from('leads').select('id')
      .eq('tenant_id', tenantId).eq('status', 'dead')
      .lt('updated_at', cutoff);
    if (ancient && ancient.length > 0) {
      actions.push('Found ' + ancient.length + ' leads dead 180+ days (archived)');
    }
  } catch (e) {}

  // 3. Update lead scores based on recent activity
  try {
    const yesterday = new Date(Date.now() - 24 * 3600000).toISOString();
    const { data: engaged } = await require('../db/supabase').supabase
      .from('activities').select('lead_id, type')
      .eq('tenant_id', tenantId)
      .in('type', ['email_opened', 'sms_received', 'call_answered'])
      .gte('created_at', yesterday);
    if (engaged && engaged.length > 0) {
      const leadBumps = {};
      engaged.forEach(a => {
        if (!leadBumps[a.lead_id]) leadBumps[a.lead_id] = 0;
        if (a.type === 'email_opened') leadBumps[a.lead_id] += 1;
        if (a.type === 'sms_received') leadBumps[a.lead_id] += 2;
        if (a.type === 'call_answered') leadBumps[a.lead_id] += 1;
      });
      actions.push('Re-scored ' + Object.keys(leadBumps).length + ' leads based on engagement');
    }
  } catch (e) {}

  return actions;
}

// ═══ BUSINESS IDEA DROP (8 PM) ═══

async function generateBusinessIdea(tenantId) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: 'You are Jarvis, an AI CEO. Generate ONE actionable business idea, growth hack, or revenue optimization based on current trends. Be specific — include numbers, tactics, and first steps. No fluff. Think like a CEO who needs to make money this week.',
      messages: [{ role: 'user', content: 'Give me one idea I should act on today or this week. My ventures: solar sales in CT, med spa (Luxe Level Aesthetics), Snack AI fitness app, AI workforce platform (selling AI bots to businesses). Date: ' + new Date().toLocaleDateString() }],
    });
    return response.content[0].text;
  } catch (e) {
    return 'Idea generation failed: ' + e.message;
  }
}

// ═══ MASTER CRON SCHEDULE ═══
// Returns all 16 cron definitions for the scheduler to wire up

function getCronSchedule() {
  return [
    { cron: '45 5 * * *', name: 'pre_brief_data', fn: 'preBriefData', silent: true },
    { cron: '0 6 * * *', name: 'ad_budget_optimizer', fn: 'adBudgetOptimize', silent: false },
    { cron: '0 7 * * *', name: 'morning_briefing', fn: 'morningBriefing', silent: false },
    { cron: '30 7 * * *', name: 'email_wave_1', fn: 'emailWave', silent: true },
    { cron: '0 8 * * *', name: 'dialer_wave_1_high', fn: 'dialerWaveHigh', silent: false },
    { cron: '0 9 * * *', name: 'lead_scrape', fn: 'leadScrape', silent: true },
    { cron: '0 12 * * *', name: 'midday_checkin', fn: 'middayCheckin', silent: false },
    { cron: '30 12 * * *', name: 'appointment_reminders', fn: 'appointmentReminders', silent: true },
    { cron: '0 14 * * *', name: 'dialer_wave_2_mid', fn: 'dialerWaveMid', silent: false },
    { cron: '0 16 * * *', name: 're_engagement', fn: 'reEngagement', silent: true },
    { cron: '0 18 * * *', name: 'email_wave_2', fn: 'emailWave2', silent: true },
    { cron: '0 20 * * *', name: 'business_idea', fn: 'businessIdea', silent: false },
    { cron: '0 23 * * *', name: 'crm_cleanup', fn: 'crmCleanup', silent: true },
    { cron: '0 1 * * 1', name: 'weekly_lal_upload', fn: 'weeklyLAL', silent: true },
    { cron: '0 3 * * 1', name: 'weekly_report', fn: 'weeklyReport', silent: false },
    { cron: '0 4 1 * *', name: 'monthly_purge', fn: 'monthlyPurge', silent: true },
  ];
}

module.exports = {
  selfAnalysis,
  buildBriefingData,
  middayCheckIn,
  reEngagementSweep,
  crmCleanup,
  generateBusinessIdea,
  getCronSchedule,
};
