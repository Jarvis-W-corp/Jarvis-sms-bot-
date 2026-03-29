const { supabase } = require('../db/supabase');
const memory = require('./memory');

// ── Jarvis Venture Tracker ──
// Tracks all business ventures, revenue, decisions, and outcomes
// Jarvis uses this to act like a real CEO — know what's making money, what's not, and where to focus

// Ensure the ventures table exists
async function ensureTable() {
  const { error } = await supabase.rpc('exec_sql', { sql: '' }).catch(() => ({}));
  // Table creation via SQL — run once
  const sql = `
    CREATE TABLE IF NOT EXISTS jarvis_ventures (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      status TEXT DEFAULT 'active' CHECK (status IN ('idea', 'validating', 'building', 'launched', 'active', 'paused', 'killed')),
      category TEXT DEFAULT 'other',
      monthly_revenue DECIMAL DEFAULT 0,
      monthly_cost DECIMAL DEFAULT 0,
      total_revenue DECIMAL DEFAULT 0,
      total_cost DECIMAL DEFAULT 0,
      users_count INTEGER DEFAULT 0,
      kpis JSONB DEFAULT '{}',
      next_actions JSONB DEFAULT '[]',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS jarvis_decisions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      venture_id UUID REFERENCES jarvis_ventures(id),
      decision TEXT NOT NULL,
      reasoning TEXT,
      expected_outcome TEXT,
      actual_outcome TEXT,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'succeeded', 'failed', 'cancelled')),
      revenue_impact DECIMAL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS jarvis_revenue_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      venture_id UUID REFERENCES jarvis_ventures(id),
      amount DECIMAL NOT NULL,
      type TEXT DEFAULT 'revenue' CHECK (type IN ('revenue', 'cost', 'refund')),
      source TEXT,
      notes TEXT,
      logged_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  console.log('[VENTURES] Run this SQL in Supabase if tables dont exist:\n' + sql);
}

// ── Venture CRUD ──

async function getVentures(status) {
  let query = supabase.from('jarvis_ventures').select('*').order('monthly_revenue', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) { console.error('[VENTURES] Get error:', error.message); return []; }
  return data || [];
}

async function getVenture(nameOrId) {
  const { data } = await supabase.from('jarvis_ventures').select('*')
    .or(`id.eq.${nameOrId},name.ilike.%${nameOrId}%`)
    .limit(1).single();
  return data;
}

async function createVenture(name, category, notes) {
  const { data, error } = await supabase.from('jarvis_ventures').insert({
    name, category: category || 'other', notes: notes || null, status: 'idea',
  }).select().single();
  if (error) throw new Error('Create venture failed: ' + error.message);
  return data;
}

async function updateVenture(id, updates) {
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('jarvis_ventures').update(updates).eq('id', id).select().single();
  if (error) throw new Error('Update venture failed: ' + error.message);
  return data;
}

// ── Decision Tracking ──

async function logDecision(ventureId, decision, reasoning, expectedOutcome) {
  const { data, error } = await supabase.from('jarvis_decisions').insert({
    venture_id: ventureId || null,
    decision,
    reasoning: reasoning || null,
    expected_outcome: expectedOutcome || null,
  }).select().single();
  if (error) throw new Error('Log decision failed: ' + error.message);
  return data;
}

async function reviewDecision(decisionId, actualOutcome, succeeded, revenueImpact) {
  const { data, error } = await supabase.from('jarvis_decisions').update({
    actual_outcome: actualOutcome,
    status: succeeded ? 'succeeded' : 'failed',
    revenue_impact: revenueImpact || null,
    reviewed_at: new Date().toISOString(),
  }).eq('id', decisionId).select().single();
  if (error) throw new Error('Review decision failed: ' + error.message);
  return data;
}

async function getPendingDecisions() {
  const { data } = await supabase.from('jarvis_decisions').select('*, jarvis_ventures(name)')
    .eq('status', 'pending').order('created_at', { ascending: true }).limit(20);
  return data || [];
}

async function getDecisionHistory(limit = 20) {
  const { data } = await supabase.from('jarvis_decisions').select('*, jarvis_ventures(name)')
    .neq('status', 'pending').order('reviewed_at', { ascending: false }).limit(limit);
  return data || [];
}

// ── Revenue Tracking ──

async function logRevenue(ventureId, amount, type, source, notes) {
  const { error } = await supabase.from('jarvis_revenue_log').insert({
    venture_id: ventureId, amount, type: type || 'revenue', source, notes,
  });
  if (error) throw new Error('Log revenue failed: ' + error.message);

  // Update venture totals
  const { data: logs } = await supabase.from('jarvis_revenue_log').select('amount, type').eq('venture_id', ventureId);
  if (logs) {
    const totalRevenue = logs.filter(l => l.type === 'revenue').reduce((s, l) => s + Number(l.amount), 0);
    const totalCost = logs.filter(l => l.type === 'cost').reduce((s, l) => s + Number(l.amount), 0);
    await supabase.from('jarvis_ventures').update({ total_revenue: totalRevenue, total_cost: totalCost, updated_at: new Date().toISOString() }).eq('id', ventureId);
  }
  return 'Logged $' + amount + ' ' + (type || 'revenue');
}

// ── CEO Dashboard ──

async function getCEOReport() {
  const ventures = await getVentures();
  const pendingDecisions = await getPendingDecisions();
  const recentDecisions = await getDecisionHistory(10);

  let report = '═══ JARVIS CEO REPORT ═══\n\n';

  // Portfolio overview
  const totalRev = ventures.reduce((s, v) => s + Number(v.total_revenue || 0), 0);
  const totalCost = ventures.reduce((s, v) => s + Number(v.total_cost || 0), 0);
  const monthlyRev = ventures.reduce((s, v) => s + Number(v.monthly_revenue || 0), 0);
  report += '💰 PORTFOLIO: $' + totalRev.toFixed(2) + ' revenue | $' + totalCost.toFixed(2) + ' cost | $' + (totalRev - totalCost).toFixed(2) + ' profit\n';
  report += '📊 MONTHLY RUN RATE: $' + monthlyRev.toFixed(2) + '/mo\n\n';

  // Active ventures
  report += '🏢 VENTURES:\n';
  ventures.forEach(v => {
    const emoji = v.status === 'launched' || v.status === 'active' ? '🟢' : v.status === 'building' ? '🔨' : v.status === 'validating' ? '🔍' : v.status === 'idea' ? '💡' : '⏸️';
    report += emoji + ' ' + v.name + ' [' + v.status + '] — $' + (v.monthly_revenue || 0) + '/mo, ' + (v.users_count || 0) + ' users\n';
    if (v.next_actions && v.next_actions.length) {
      v.next_actions.slice(0, 2).forEach(a => { report += '   → ' + a + '\n'; });
    }
  });

  // Pending decisions
  if (pendingDecisions.length) {
    report += '\n⏳ PENDING DECISIONS (' + pendingDecisions.length + '):\n';
    pendingDecisions.slice(0, 5).forEach(d => {
      report += '- ' + d.decision + (d.jarvis_ventures?.name ? ' [' + d.jarvis_ventures.name + ']' : '') + '\n';
    });
  }

  // Recent decision outcomes
  const succeeded = recentDecisions.filter(d => d.status === 'succeeded').length;
  const failed = recentDecisions.filter(d => d.status === 'failed').length;
  if (recentDecisions.length) {
    report += '\n📈 DECISION TRACK RECORD: ' + succeeded + ' succeeded, ' + failed + ' failed (' + Math.round(succeeded / (succeeded + failed || 1) * 100) + '% win rate)\n';
  }

  return report;
}

module.exports = {
  ensureTable,
  getVentures,
  getVenture,
  createVenture,
  updateVenture,
  logDecision,
  reviewDecision,
  getPendingDecisions,
  getDecisionHistory,
  logRevenue,
  getCEOReport,
};
