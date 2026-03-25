const { supabase } = require('../db/supabase');
const { sendBossMessage, logToDiscord } = require('../channels/discord');
const crew = require('../core/crew');

// ── Helpers ──

function getToday() { return new Date().toISOString().split('T')[0]; }

function getWeekStart() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
}

async function getHCUsers() {
  const { data } = await supabase.from('hc_users').select('*').eq('status', 'active');
  return data || [];
}

async function getHCEntries(since) {
  let q = supabase.from('hc_entries').select('*').order('date', { ascending: false });
  if (since) q = q.gte('date', since);
  const { data } = await q;
  return data || [];
}

async function getHCGoals() {
  const { data } = await supabase.from('hc_goals').select('*');
  return data || [];
}

async function getRoofingLeads() {
  const { data } = await supabase.from('hc_roofing').select('*');
  return data || [];
}

// ══════════════════════════════════════════════
// MORNING GAME PLAN — 8 AM ET
// ══════════════════════════════════════════════

async function morningGamePlan() {
  try {
    const [users, entries, goals, leads] = await Promise.all([
      getHCUsers(), getHCEntries(getWeekStart()), getHCGoals(), getRoofingLeads()
    ]);

    const reps = users.filter(u => u.role === 'Sales Rep' || u.role === 'Team Manager');
    const today = getToday();
    const weekStart = getWeekStart();

    // Weekly stats per rep
    const repStats = {};
    reps.forEach(r => {
      const name = (r.name || '').trim().split(' ')[0];
      repStats[name] = { doors: 0, calls: 0, appts: 0, rev: 0, daysLogged: 0, userId: r.id };
    });

    entries.forEach(e => {
      if (repStats[e.name]) {
        repStats[e.name].doors += e.doors_knocked || 0;
        repStats[e.name].calls += e.calls_made || 0;
        repStats[e.name].appts += (e.door_appts || 0) + (e.call_appts || 0);
        repStats[e.name].rev += e.revenue || 0;
        repStats[e.name].daysLogged++;
      }
    });

    // Stale leads
    const staleLeads = leads.filter(l => {
      if (l.status === 'approved' || l.status === 'closed') return false;
      const last = l.last_contact || l.created_at;
      if (!last) return true;
      const days = Math.floor((new Date(today) - new Date(last)) / 86400000);
      return days >= 7;
    });

    // Goal tracking
    const behindGoal = [];
    const crushingIt = [];
    Object.entries(repStats).forEach(([name, stats]) => {
      const goal = goals.find(g => g.user_id === stats.userId);
      if (goal) {
        const doorPct = goal.weekly_doors > 0 ? (stats.doors / goal.weekly_doors) * 100 : 0;
        const apptPct = goal.weekly_appts > 0 ? (stats.appts / goal.weekly_appts) * 100 : 0;
        if (doorPct < 40 || apptPct < 40) behindGoal.push(name + ' (' + Math.round(doorPct) + '% doors, ' + Math.round(apptPct) + '% appts)');
        if (doorPct >= 90 || apptPct >= 90) crushingIt.push(name + ' (' + Math.round(doorPct) + '% doors, ' + Math.round(apptPct) + '% appts)');
      }
    });

    // Build message
    let msg = '**Morning Game Plan**\n\n';
    msg += '**Team Weekly Stats:**\n';
    const sortedReps = Object.entries(repStats).sort((a, b) => b[1].appts - a[1].appts);
    sortedReps.forEach(([name, s]) => {
      if (s.daysLogged > 0) {
        msg += '> **' + name + '** — ' + s.doors + ' doors, ' + s.calls + ' calls, ' + s.appts + ' appts, $' + s.rev.toLocaleString() + ' rev\n';
      }
    });

    const notLogged = sortedReps.filter(([_, s]) => s.daysLogged === 0).map(([n]) => n);
    if (notLogged.length > 0) msg += '\n**No logs this week:** ' + notLogged.join(', ') + '\n';
    if (behindGoal.length > 0) msg += '\n**Behind on goals:** ' + behindGoal.join(', ') + '\n';
    if (crushingIt.length > 0) msg += '\n**Crushing it:** ' + crushingIt.join(', ') + '\n';
    if (staleLeads.length > 0) msg += '\n**' + staleLeads.length + ' roofing leads going stale** (7+ days no contact)\n';

    // Pipeline stats
    const pipeStats = {};
    leads.forEach(l => { pipeStats[l.status] = (pipeStats[l.status] || 0) + 1; });
    if (Object.keys(pipeStats).length > 0) {
      msg += '\n**Roof Pipeline:** ' + Object.entries(pipeStats).map(([s, c]) => s + ': ' + c).join(' | ') + '\n';
    }

    msg += '\nLet\'s get it today.';

    await sendBossMessage(msg);
    await logToDiscord('daily-reports', msg);
    console.log('[PROACTIVE] Morning game plan sent');
  } catch (error) {
    console.error('[PROACTIVE] Morning game plan error:', error.message);
  }
}

// ══════════════════════════════════════════════
// END OF DAY RECAP — 6 PM ET
// ══════════════════════════════════════════════

async function endOfDayRecap() {
  try {
    const [users, entries, leads] = await Promise.all([
      getHCUsers(), getHCEntries(getToday()), getRoofingLeads()
    ]);

    const today = getToday();
    const todayEntries = entries.filter(e => e.date === today);

    let totalDoors = 0, totalCalls = 0, totalAppts = 0, totalRev = 0;
    const repSummary = [];

    todayEntries.forEach(e => {
      const doors = e.doors_knocked || 0;
      const calls = e.calls_made || 0;
      const appts = (e.door_appts || 0) + (e.call_appts || 0);
      const rev = e.revenue || 0;
      totalDoors += doors; totalCalls += calls; totalAppts += appts; totalRev += rev;
      repSummary.push({ name: e.name, doors, calls, appts, rev });
    });

    repSummary.sort((a, b) => b.appts - a.appts);

    const reps = users.filter(u => u.role === 'Sales Rep' || u.role === 'Team Manager');
    const loggedNames = todayEntries.map(e => e.name);
    const didntLog = reps.filter(r => {
      const firstName = (r.name || '').trim().split(' ')[0];
      return !loggedNames.includes(firstName);
    }).map(r => (r.name || '').trim().split(' ')[0]);

    let msg = '**End of Day Recap**\n\n';
    msg += '**Today\'s Totals:** ' + totalDoors + ' doors | ' + totalCalls + ' calls | ' + totalAppts + ' appts | $' + totalRev.toLocaleString() + ' rev\n\n';

    if (repSummary.length > 0) {
      msg += '**By Rep:**\n';
      repSummary.forEach(r => {
        msg += '> **' + r.name + '** — ' + r.doors + ' doors, ' + r.calls + ' calls, ' + r.appts + ' appts\n';
      });
    }

    if (didntLog.length > 0) msg += '\n**Didn\'t log today:** ' + didntLog.join(', ') + '\n';

    // Conversion rates
    if (totalDoors > 0) {
      const doorConvos = todayEntries.reduce((s, e) => s + (e.door_convos || 0), 0);
      msg += '\n**Conversions:** ' + (totalDoors > 0 ? Math.round((doorConvos / totalDoors) * 100) + '% door convo rate' : '') +
        (totalCalls > 0 ? ' | ' + Math.round((totalAppts / (totalDoors + totalCalls)) * 100) + '% appt rate' : '') + '\n';
    }

    // New leads today
    const newLeadsToday = leads.filter(l => l.created_at === today).length;
    if (newLeadsToday > 0) msg += '\n**' + newLeadsToday + ' new roofing leads** added today\n';

    await sendBossMessage(msg);
    await logToDiscord('daily-reports', msg);
    console.log('[PROACTIVE] EOD recap sent');
  } catch (error) {
    console.error('[PROACTIVE] EOD recap error:', error.message);
  }
}

// ══════════════════════════════════════════════
// NO-LOG REMINDER — 4 PM ET
// ══════════════════════════════════════════════

async function noLogReminder() {
  try {
    const [users, entries] = await Promise.all([
      getHCUsers(), getHCEntries(getToday())
    ]);

    const today = getToday();
    const todayEntries = entries.filter(e => e.date === today);
    const loggedNames = todayEntries.map(e => e.name);

    const reps = users.filter(u => u.role === 'Sales Rep' || u.role === 'Team Manager');
    const didntLog = reps.filter(r => {
      const firstName = (r.name || '').trim().split(' ')[0];
      return !loggedNames.includes(firstName);
    });

    if (didntLog.length > 0) {
      const names = didntLog.map(r => (r.name || '').trim().split(' ')[0]);
      await sendBossMessage('**Heads up:** ' + names.length + ' reps haven\'t logged KPIs today: ' + names.join(', ') + '\n\nSales Tracker: https://jarvis-sms-bot.onrender.com/sales');
      console.log('[PROACTIVE] No-log reminder sent for ' + names.length + ' reps');
    }
  } catch (error) {
    console.error('[PROACTIVE] No-log reminder error:', error.message);
  }
}

// ══════════════════════════════════════════════
// STALE LEAD ALERT — Daily
// ══════════════════════════════════════════════

async function staleLeadAlert() {
  try {
    const leads = await getRoofingLeads();
    const today = getToday();

    const stale = leads.filter(l => {
      if (l.status === 'approved' || l.status === 'closed') return false;
      const last = l.last_contact || l.created_at;
      if (!last) return true;
      return Math.floor((new Date(today) - new Date(last)) / 86400000) >= 10;
    });

    if (stale.length > 0) {
      let msg = '**Stale Lead Alert:** ' + stale.length + ' roofing leads with 10+ days no contact\n\n';
      stale.slice(0, 5).forEach(l => {
        const days = Math.floor((new Date(today) - new Date(l.last_contact || l.created_at)) / 86400000);
        msg += '> **' + l.name + '** — ' + l.phone + ' | ' + days + ' days | Assigned: ' + (l.assigned_name || 'unassigned') + '\n';
      });
      if (stale.length > 5) msg += '> ...and ' + (stale.length - 5) + ' more\n';

      await sendBossMessage(msg);

      // Also notify each rep about their stale leads
      const users = await getHCUsers();
      const byRep = {};
      stale.forEach(l => {
        const repId = l.assigned_to || l.created_by;
        if (repId) {
          if (!byRep[repId]) byRep[repId] = [];
          byRep[repId].push(l.name);
        }
      });

      for (const [repId, leadNames] of Object.entries(byRep)) {
        await supabase.from('hc_notifications').insert({
          id: 'stale_' + Date.now() + '_' + repId,
          user_id: repId,
          message: leadNames.length + ' of your roofing leads need follow-up (10+ days): ' + leadNames.join(', '),
          read: false
        });
      }

      console.log('[PROACTIVE] Stale lead alerts sent');
    }
  } catch (error) {
    console.error('[PROACTIVE] Stale lead alert error:', error.message);
  }
}

// ══════════════════════════════════════════════
// GOAL ACHIEVEMENT CHECK — runs after EOD
// ══════════════════════════════════════════════

async function checkGoalAchievements() {
  try {
    const [users, entries, goals] = await Promise.all([
      getHCUsers(), getHCEntries(getWeekStart()), getHCGoals()
    ]);

    const achievements = [];
    users.forEach(u => {
      const firstName = (u.name || '').trim().split(' ')[0];
      const goal = goals.find(g => g.user_id === u.id);
      if (!goal) return;

      const myEntries = entries.filter(e => e.name === firstName);
      let doors = 0, calls = 0, appts = 0, rev = 0;
      myEntries.forEach(e => {
        doors += e.doors_knocked || 0;
        calls += e.calls_made || 0;
        appts += (e.door_appts || 0) + (e.call_appts || 0);
        rev += e.revenue || 0;
      });

      if (goal.weekly_doors > 0 && doors >= goal.weekly_doors) achievements.push(firstName + ' hit weekly door goal (' + doors + '/' + goal.weekly_doors + ')');
      if (goal.weekly_appts > 0 && appts >= goal.weekly_appts) achievements.push(firstName + ' hit weekly appt goal (' + appts + '/' + goal.weekly_appts + ')');
      if (goal.weekly_revenue > 0 && rev >= goal.weekly_revenue) achievements.push(firstName + ' hit weekly revenue goal ($' + rev.toLocaleString() + '/$' + goal.weekly_revenue.toLocaleString() + ')');
    });

    if (achievements.length > 0) {
      const msg = '**Goal Achievements This Week**\n\n' + achievements.map(a => '> ' + a).join('\n');
      await logToDiscord('daily-reports', msg);
      console.log('[PROACTIVE] ' + achievements.length + ' goal achievements announced');
    }
  } catch (error) {
    console.error('[PROACTIVE] Goal check error:', error.message);
  }
}

// ══════════════════════════════════════════════
// WEEKLY REPORT — Friday 5 PM ET
// ══════════════════════════════════════════════

async function weeklyReport() {
  try {
    const [users, entries, leads, goals] = await Promise.all([
      getHCUsers(), getHCEntries(getWeekStart()), getHCGoals(), getRoofingLeads()
    ]);

    let totalDoors = 0, totalCalls = 0, totalAppts = 0, totalRev = 0;
    const repStats = {};

    entries.forEach(e => {
      const doors = e.doors_knocked || 0;
      const calls = e.calls_made || 0;
      const appts = (e.door_appts || 0) + (e.call_appts || 0);
      const rev = e.revenue || 0;
      totalDoors += doors; totalCalls += calls; totalAppts += appts; totalRev += rev;

      if (!repStats[e.name]) repStats[e.name] = { doors: 0, calls: 0, appts: 0, rev: 0 };
      repStats[e.name].doors += doors;
      repStats[e.name].calls += calls;
      repStats[e.name].appts += appts;
      repStats[e.name].rev += rev;
    });

    let msg = '**Weekly Report**\n\n';
    msg += '**Team Totals:** ' + totalDoors + ' doors | ' + totalCalls + ' calls | ' + totalAppts + ' appts | $' + totalRev.toLocaleString() + ' revenue\n\n';

    msg += '**Leaderboard (by appts):**\n';
    Object.entries(repStats).sort((a, b) => b[1].appts - a[1].appts).forEach(([name, s], i) => {
      const medal = i === 0 ? '#1' : i === 1 ? '#2' : i === 2 ? '#3' : '#' + (i + 1);
      msg += '> **' + medal + ' ' + name + '** — ' + s.doors + ' doors, ' + s.calls + ' calls, ' + s.appts + ' appts, $' + s.rev.toLocaleString() + '\n';
    });

    // Roof pipeline
    const pipeStats = {};
    leads.forEach(l => { pipeStats[l.status] = (pipeStats[l.status] || 0) + 1; });
    const totalRoofRev = leads.reduce((s, l) => s + (parseFloat(l.revenue) || 0), 0);
    const totalComm = leads.reduce((s, l) => s + (parseFloat(l.commission) || 0), 0);
    msg += '\n**Roof Pipeline:** ' + Object.entries(pipeStats).map(([s, c]) => s + ': ' + c).join(' | ');
    if (totalRoofRev > 0) msg += '\nRoof Revenue: $' + totalRoofRev.toLocaleString() + ' | Commissions: $' + totalComm.toLocaleString();

    // Crew stats
    const crewStatus = await crew.getCrewStatus();
    msg += '\n\n**AI Crew:** ' + crewStatus.jobs.completed + ' jobs completed this period';
    crewStatus.workers.forEach(w => {
      if (w.completed > 0) msg += '\n> ' + w.name + ': ' + w.completed + ' tasks (' + w.successRate + '% success)';
    });

    await sendBossMessage(msg);
    await logToDiscord('daily-reports', msg);

    // Also delegate a weekly analysis to Hawk
    await crew.createJob('research', 'Weekly Performance Analysis',
      'Analyze this week\'s sales data and find patterns. Total: ' + totalDoors + ' doors, ' + totalCalls + ' calls, ' + totalAppts + ' appts, $' + totalRev + ' revenue. ' +
      'Top performer: ' + (Object.entries(repStats).sort((a, b) => b[1].appts - a[1].appts)[0]?.[0] || 'none') + '. ' +
      'Research: what conversion rates are typical in door-to-door solar sales? How does this team compare? What should they focus on next week?',
      {}, 7);

    console.log('[PROACTIVE] Weekly report sent + Hawk tasked with analysis');
  } catch (error) {
    console.error('[PROACTIVE] Weekly report error:', error.message);
  }
}

// ══════════════════════════════════════════════
// AUTO-DELEGATE — Jarvis proactively sends work to crew
// ══════════════════════════════════════════════

async function autoDelegate() {
  try {
    const crewStatus = await crew.getCrewStatus();

    // Don't pile up jobs — only delegate if queue is light
    if (crewStatus.jobs.pending >= 3) {
      console.log('[PROACTIVE] Queue has ' + crewStatus.jobs.pending + ' pending, skipping auto-delegate');
      return;
    }

    // Rotate through proactive tasks
    const dayOfWeek = new Date().getDay();
    const hour = parseInt(new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }));

    // Monday: Research trending opportunities
    if (dayOfWeek === 1 && hour === 10) {
      await crew.createJob('research', 'Weekly Opportunity Scan',
        'Search for trending business opportunities this week. Look at: 1) Trending products on TikTok Shop and Amazon. 2) New AI tools people are paying for. 3) Any viral business ideas on social media. Return top 3 opportunities with potential revenue and how to execute.',
        {}, 6);
    }

    // Wednesday: Ghost creates content
    if (dayOfWeek === 3 && hour === 10) {
      await crew.createJob('marketing', 'Weekly Content Ideas',
        'Create 5 social media post ideas for a solar energy company in Connecticut. Include: hooks, captions, and best platforms. Focus on homeowner pain points (high electric bills, power outages, environmental concerns). Make them scroll-stopping.',
        {}, 5);
    }

    // Friday: Pulse runs a health check
    if (dayOfWeek === 5 && hour === 14) {
      await crew.createJob('ops', 'Weekly System Health Report',
        'Check the overall state of all business operations. Report on: active users on the sales tracker, roofing pipeline status, any leads going cold, crew performance this week. Flag anything that needs attention.',
        {}, 6);
    }

    console.log('[PROACTIVE] Auto-delegate check complete');
  } catch (error) {
    console.error('[PROACTIVE] Auto-delegate error:', error.message);
  }
}

module.exports = {
  morningGamePlan,
  endOfDayRecap,
  noLogReminder,
  staleLeadAlert,
  checkGoalAchievements,
  weeklyReport,
  autoDelegate,
};
