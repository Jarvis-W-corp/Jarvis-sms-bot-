const db = require('../db/queries');
const memory = require('./memory');

let authToken = null;
let tokenExpiry = null;
let cachedInstalls = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min cache

async function login() {
  try {
    const res = await fetch('https://enerflo.io/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        email: process.env.ENERFLO_EMAIL,
        password: process.env.ENERFLO_PASSWORD,
      }),
    });
    const data = await res.json();
    if (data.access_token) {
      authToken = data.access_token;
      tokenExpiry = Date.now() + (2 * 60 * 60 * 1000);
      console.log('[ENERFLO] Logged in successfully');
      return true;
    }
    console.error('[ENERFLO] Login failed:', JSON.stringify(data));
    return false;
  } catch (error) {
    console.error('[ENERFLO] Login error:', error.message);
    return false;
  }
}

async function getToken() {
  if (!authToken || !tokenExpiry || Date.now() > tokenExpiry) await login();
  return authToken;
}

async function apiCall(endpoint) {
  const token = await getToken();
  if (!token) return null;
  try {
    const res = await fetch('https://enerflo.io/api' + endpoint, {
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' },
    });
    if (res.status === 401) {
      authToken = null;
      const newToken = await getToken();
      if (!newToken) return null;
      const retry = await fetch('https://enerflo.io/api' + endpoint, {
        headers: { 'Authorization': 'Bearer ' + newToken, 'Accept': 'application/json' },
      });
      return await retry.json();
    }
    return await res.json();
  } catch (error) {
    console.error('[ENERFLO] API error:', error.message);
    return null;
  }
}

async function getAllInstalls() {
  if (cachedInstalls && (Date.now() - cacheTime) < CACHE_TTL) return cachedInstalls;

  // Paginate to avoid 500 errors on large responses
  let all = [];
  let page = 1;
  let total = null;
  while (true) {
    const data = await apiCall('/v3/installs?per_page=50&page=' + page);
    if (!data || !data.results) break;
    if (total === null) total = data.total;
    all = all.concat(data.results);
    if (all.length >= total || data.results.length < 50) break;
    page++;
    // Small delay between pages to avoid rate limits
    await new Promise(r => setTimeout(r, 500));
  }

  if (all.length > 0) {
    cachedInstalls = all;
    cacheTime = Date.now();
    console.log('[ENERFLO] Fetched ' + all.length + '/' + (total || '?') + ' installs');
  }
  return all;
}

function parseInstall(r) {
  const cust = r.customer || {};
  const cost = r.cost || {};
  const loan = r.loan || {};
  const tpo = r.tpo || {};
  const cm = r.current_milestone || {};
  const equip = r.equipment || {};
  return {
    id: r.id,
    status: r.status_name || 'Unknown',
    created: r.created_at,
    customerName: cust.name || 'Unknown',
    customerPhone: cust.phone || '',
    customerEmail: cust.email || '',
    address: cust.address || '',
    city: cust.city || '',
    state: cust.state || '',
    zip: cust.zip || '',
    leadSource: cust.lead_source || '',
    milestone: cm.title || (r.last_completed_milestone ? r.last_completed_milestone.title : 'Unknown'),
    currentMilestone: cm.title || null,
    lastCompletedMilestone: r.last_completed_milestone ? r.last_completed_milestone.title : null,
    milestoneAssigned: cm.assigned_user ? cm.assigned_user.name : '',
    progress: r.progress || 0,
    projectAge: r.project_age || 0,
    systemSize: r.system_size || 0,
    panelCount: r.panel_count || 0,
    estimatedProduction: r.estimated_production || 0,
    systemCost: cost.system_cost_gross || 0,
    ppw: cost.ppw_gross || 0,
    adders: cost.adders_total || 0,
    rebatesTotal: cost.rebates_total || 0,
    lender: loan.lender || 'N/A',
    loanTerm: loan.term_years || 0,
    monthlyPayment: loan.monthly_payment_initial || 0,
    tpoType: tpo.type || '',
    tpoRate: tpo.rate || 0,
    panel: equip.panel ? equip.panel.name : '',
    inverter: equip.inverter ? equip.inverter.name : '',
    utilityPre: (r.utility || {}).bill_pre || 0,
    utilityPost: (r.utility || {}).bill_post || 0,
    hasAgreement: !!r.agreement_url,
    agreementUrl: r.agreement_url || '',
    dealType: r.deal_type || '',
    surveyId: r.survey_id,
  };
}

async function getPipelineSummary() {
  try {
    const raw = await getAllInstalls();
    const installs = raw.map(parseInstall);

    const statuses = {};
    const milestones = {};
    const lenders = {};
    const cities = {};
    let totalCost = 0;
    let totalSize = 0;
    let agreements = 0;

    for (const i of installs) {
      statuses[i.status] = (statuses[i.status] || 0) + 1;
      milestones[i.milestone] = (milestones[i.milestone] || 0) + 1;
      lenders[i.lender] = (lenders[i.lender] || 0) + 1;
      const loc = i.city + ', ' + i.state;
      cities[loc] = (cities[loc] || 0) + 1;
      totalCost += parseFloat(i.systemCost) || 0;
      totalSize += parseFloat(i.systemSize) || 0;
      if (i.hasAgreement) agreements++;
    }

    const active = installs.filter(i => i.status === 'Active');
    const completed = installs.filter(i => i.status === 'Completed');
    const cancelled = installs.filter(i => i.status === 'Cancelled');

    const topCities = Object.entries(cities).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const topLenders = Object.entries(lenders).sort((a, b) => b[1] - a[1]);

    return {
      total: installs.length,
      totalCost,
      avgDealSize: installs.length ? totalCost / installs.length : 0,
      totalKW: totalSize,
      agreements,
      statuses,
      milestones,
      lenders: topLenders,
      topCities,
      active: active.length,
      completed: completed.length,
      cancelled: cancelled.length,
      activeDeals: active
        .sort((a, b) => (b.progress || 0) - (a.progress || 0))
        .map(i => ({
          name: i.customerName,
          city: i.city + ', ' + i.state,
          milestone: i.milestone,
          size: i.systemSize,
          cost: i.systemCost,
          progress: i.progress,
          age: i.projectAge,
          lender: i.lender,
        })),
      recentDeals: installs
        .sort((a, b) => new Date(b.created) - new Date(a.created))
        .slice(0, 10)
        .map(i => ({
          name: i.customerName,
          city: i.city + ', ' + i.state,
          status: i.status,
          milestone: i.milestone,
          size: i.systemSize,
          cost: i.systemCost,
          progress: i.progress,
          created: i.created,
        })),
      completedDeals: completed.map(i => ({
        name: i.customerName,
        city: i.city + ', ' + i.state,
        size: i.systemSize,
        cost: i.systemCost,
      })),
    };
  } catch (error) {
    console.error('[ENERFLO] Pipeline error:', error.message);
    return null;
  }
}

async function syncToMemory(tenantId) {
  const summary = await getPipelineSummary();
  if (!summary) return null;
  const text = 'Solar Pipeline: ' + summary.total + ' total deals ($' + Math.round(summary.totalCost).toLocaleString() + '). ' +
    summary.active + ' active, ' + summary.completed + ' completed, ' + summary.cancelled + ' cancelled. ' +
    Math.round(summary.totalKW) + ' kW sold.';
  await memory.storeMemory(tenantId, 'fact', text, 8, 'enerflo');
  console.log('[ENERFLO] Synced to memory');
  return summary;
}

function formatForDiscord(summary) {
  if (!summary) return 'Could not fetch Enerflo data. Check credentials.';
  let msg = '**Solar Pipeline**\n\n';
  msg += '**Totals:** ' + summary.total + ' deals | $' + Math.round(summary.totalCost).toLocaleString() + ' value | ' + Math.round(summary.totalKW) + ' kW\n';
  msg += '**Status:** ' + summary.active + ' active | ' + summary.completed + ' completed | ' + summary.cancelled + ' cancelled\n';
  msg += '**Agreements:** ' + summary.agreements + '/' + summary.total + ' signed\n\n';

  if (summary.activeDeals.length > 0) {
    msg += '**Active Deals (by progress):**\n';
    msg += summary.activeDeals.slice(0, 10).map(d =>
      '> **' + d.name + '** — ' + d.city + ' | ' + d.milestone + ' | ' + d.size + 'kW | $' + Math.round(d.cost).toLocaleString() + ' | ' + d.progress + '%'
    ).join('\n');
    msg += '\n\n';
  }

  if (summary.lenders.length > 0) {
    msg += '**Lenders:** ' + summary.lenders.slice(0, 5).map(l => l[0] + ' (' + l[1] + ')').join(', ');
  }
  return msg;
}

module.exports = { login, getAllInstalls, parseInstall, getPipelineSummary, syncToMemory, formatForDiscord };
