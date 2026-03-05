const db = require('../db/queries');
const memory = require('./memory');

let authToken = null;
let tokenExpiry = null;

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

async function apiCall(endpoint, method, body) {
  const token = await getToken();
  if (!token) return null;
  try {
    const options = {
      method: method || 'GET',
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json', 'Content-Type': 'application/json' },
    };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch('https://enerflo.io/api' + endpoint, options);
    if (res.status === 401) {
      authToken = null;
      const newToken = await getToken();
      if (!newToken) return null;
      options.headers['Authorization'] = 'Bearer ' + newToken;
      const retry = await fetch('https://enerflo.io/api' + endpoint, options);
      return await retry.json();
    }
    return await res.json();
  } catch (error) {
    console.error('[ENERFLO] API error:', error.message);
    return null;
  }
}

async function getLeads() {
  const data = await apiCall('/customers');
  if (!data) return [];
  return Array.isArray(data) ? data : (data.data || data.customers || []);
}

async function getDeals() {
  const data = await apiCall('/deals');
  if (!data) return [];
  return Array.isArray(data) ? data : (data.data || data.deals || []);
}

async function getInstalls() {
  const data = await apiCall('/installs');
  if (!data) return [];
  return Array.isArray(data) ? data : (data.data || data.installs || []);
}

async function getPipelineSummary() {
  try {
    const [leads, deals, installs] = await Promise.all([getLeads(), getDeals(), getInstalls()]);
    return {
      totalLeads: leads.length,
      totalDeals: deals.length,
      totalInstalls: installs.length,
      recentLeads: leads.slice(0, 5).map(l => ({ id: l.id, name: l.name || ((l.first_name || '') + ' ' + (l.last_name || '')).trim() || 'Unknown', status: l.lead_status || l.status || 'None' })),
      recentDeals: deals.slice(0, 5).map(d => ({ id: d.id, name: d.name || d.customer_name || 'Unknown', status: d.status || d.deal_status || 'None', value: d.amount || d.contract_amount || null })),
      recentInstalls: installs.slice(0, 5).map(i => ({ id: i.id, name: i.name || i.customer_name || 'Unknown', status: i.status || i.install_status || 'None' })),
    };
  } catch (error) {
    console.error('[ENERFLO] Pipeline error:', error.message);
    return null;
  }
}

async function syncToMemory(tenantId) {
  const summary = await getPipelineSummary();
  if (!summary) return null;
  const text = 'Solar Pipeline: ' + summary.totalLeads + ' leads, ' + summary.totalDeals + ' deals, ' + summary.totalInstalls + ' installs. Recent leads: ' + summary.recentLeads.map(l => l.name + ' (' + l.status + ')').join(', ');
  await memory.storeMemory(tenantId, 'fact', text, 8, 'enerflo');
  console.log('[ENERFLO] Synced to memory');
  return summary;
}

function formatForDiscord(summary) {
  if (!summary) return 'Could not fetch Enerflo data. Check credentials.';
  let msg = '☀️ **Solar Pipeline**\n\n';
  msg += '**Totals:** ' + summary.totalLeads + ' leads | ' + summary.totalDeals + ' deals | ' + summary.totalInstalls + ' installs\n\n';
  if (summary.recentLeads.length > 0) {
    msg += '**Recent Leads:**\n' + summary.recentLeads.map(l => '• ' + l.name + ' — ' + l.status).join('\n') + '\n\n';
  }
  if (summary.recentDeals.length > 0) {
    msg += '**Recent Deals:**\n' + summary.recentDeals.map(d => '• ' + d.name + ' — ' + d.status + (d.value ? ' ($' + d.value + ')' : '')).join('\n');
  }
  return msg;
}

module.exports = { login, getLeads, getDeals, getInstalls, getPipelineSummary, syncToMemory, formatForDiscord };
