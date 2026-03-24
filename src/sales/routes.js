const express = require('express');
const path = require('path');
const { supabase } = require('../db/supabase');

const router = express.Router();

// Serve the sales tracker app
router.get('/sales', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// === USERS ===

router.get('/sales/api/users', async (req, res) => {
  const { data, error } = await supabase.from('hc_users').select('*').order('created_at');
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true, data: data.map(mapUser) });
});

router.post('/sales/api/users', async (req, res) => {
  const u = req.body;
  const { error } = await supabase.from('hc_users').insert({
    id: u.id, username: u.username, password: u.password,
    name: u.name, role: u.role || 'Sales Rep', team_id: u.teamId || '', status: u.status || 'active'
  });
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true });
});

router.put('/sales/api/users/:id', async (req, res) => {
  const u = req.body;
  const update = {};
  if (u.role !== undefined) update.role = u.role;
  if (u.teamId !== undefined) update.team_id = u.teamId;
  if (u.status !== undefined) update.status = u.status;
  if (u.name !== undefined) update.name = u.name;
  if (u.password !== undefined) update.password = u.password;
  const { error } = await supabase.from('hc_users').update(update).eq('id', req.params.id);
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true });
});

router.delete('/sales/api/users/:id', async (req, res) => {
  const { error } = await supabase.from('hc_users').delete().eq('id', req.params.id);
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true });
});

// === TEAMS ===

router.get('/sales/api/teams', async (req, res) => {
  const { data, error } = await supabase.from('hc_teams').select('*').order('created_at');
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true, data: data.map(mapTeam) });
});

router.post('/sales/api/teams', async (req, res) => {
  const t = req.body;
  const { error } = await supabase.from('hc_teams').insert({ id: t.id, name: t.name, manager_id: t.managerId || '' });
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true });
});

router.put('/sales/api/teams/:id', async (req, res) => {
  const t = req.body;
  const update = {};
  if (t.name !== undefined) update.name = t.name;
  if (t.managerId !== undefined) update.manager_id = t.managerId;
  const { error } = await supabase.from('hc_teams').update(update).eq('id', req.params.id);
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true });
});

router.delete('/sales/api/teams/:id', async (req, res) => {
  const { error } = await supabase.from('hc_teams').delete().eq('id', req.params.id);
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true });
});

// === ENTRIES ===

router.get('/sales/api/entries', async (req, res) => {
  const { data, error } = await supabase.from('hc_entries').select('*').order('date', { ascending: false });
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true, data: data.map(mapEntry) });
});

router.post('/sales/api/entries', async (req, res) => {
  const e = req.body;
  const { error } = await supabase.from('hc_entries').insert({
    id: e.id, user_id: e.userId || null, name: e.name, date: e.date,
    doors_knocked: int(e.doorsKnocked), door_convos: int(e.doorConvos), door_appts: int(e.doorAppts),
    calls_made: int(e.callsMade), call_convos: int(e.callConvos), call_appts: int(e.callAppts),
    recruit_attempts: int(e.recruitAttempts), interviews: int(e.interviews), onboarded: int(e.onboarded),
    revenue: int(e.revenue), notes: e.notes || ''
  });
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true });
});

router.put('/sales/api/entries/:id', async (req, res) => {
  const e = req.body;
  const { error } = await supabase.from('hc_entries').update({
    doors_knocked: int(e.doorsKnocked), door_convos: int(e.doorConvos), door_appts: int(e.doorAppts),
    calls_made: int(e.callsMade), call_convos: int(e.callConvos), call_appts: int(e.callAppts),
    recruit_attempts: int(e.recruitAttempts), interviews: int(e.interviews), onboarded: int(e.onboarded),
    revenue: int(e.revenue), notes: e.notes || ''
  }).eq('id', req.params.id);
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true });
});

// === GOALS ===

router.get('/sales/api/goals', async (req, res) => {
  const { data, error } = await supabase.from('hc_goals').select('*');
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true, data: data.map(mapGoal) });
});

router.post('/sales/api/goals', async (req, res) => {
  const g = req.body;
  const row = {
    id: g.id, user_id: g.userId,
    weekly_doors: int(g.weeklyDoors), weekly_calls: int(g.weeklyCalls),
    weekly_appts: int(g.weeklyAppts), weekly_revenue: int(g.weeklyRevenue),
    monthly_doors: int(g.monthlyDoors), monthly_calls: int(g.monthlyCalls),
    monthly_appts: int(g.monthlyAppts), monthly_revenue: int(g.monthlyRevenue)
  };
  const { error } = await supabase.from('hc_goals').upsert(row, { onConflict: 'user_id' });
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true });
});

// === CHAT ===

router.get('/sales/api/chat', async (req, res) => {
  const { data, error } = await supabase.from('hc_chat').select('*').order('created_at').limit(200);
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true, data: data.map(mapChat) });
});

router.post('/sales/api/chat', async (req, res) => {
  const m = req.body;
  const { error } = await supabase.from('hc_chat').insert({
    id: m.id, user_name: m.user, text: m.text, time: m.time, team_id: m.teamId || ''
  });
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true });
});

// === ROOFING ===

router.get('/sales/api/roofing', async (req, res) => {
  const { data, error } = await supabase.from('hc_roofing').select('*').order('updated_at', { ascending: false });
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true, data: data.map(mapRoof) });
});

router.post('/sales/api/roofing', async (req, res) => {
  const l = req.body;
  const { error } = await supabase.from('hc_roofing').insert({
    id: l.id, name: l.name, address: l.address || '', email: l.email || '', phone: l.phone,
    type: l.type || 'retail', status: l.status || 'new',
    assigned_to: l.assignedTo || '', assigned_name: l.assignedName || '',
    created_by: l.createdBy || '', created_at: l.createdAt, last_contact: l.lastContact || '', notes: l.notes || ''
  });
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true });
});

router.put('/sales/api/roofing/:id', async (req, res) => {
  const l = req.body;
  const update = {};
  if (l.status !== undefined) update.status = l.status;
  if (l.lastContact !== undefined) update.last_contact = l.lastContact;
  if (l.assignedTo !== undefined) update.assigned_to = l.assignedTo;
  if (l.assignedName !== undefined) update.assigned_name = l.assignedName;
  if (l.notes !== undefined) update.notes = l.notes;
  update.updated_at = new Date().toISOString();
  const { error } = await supabase.from('hc_roofing').update(update).eq('id', req.params.id);
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true });
});

router.delete('/sales/api/roofing/:id', async (req, res) => {
  const { error } = await supabase.from('hc_roofing').delete().eq('id', req.params.id);
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true });
});

// === HELPERS ===

function int(v) { return parseInt(v) || 0; }

function mapUser(r) {
  return { id: r.id, username: r.username, password: r.password, name: r.name, role: r.role, teamId: r.team_id, status: r.status };
}
function mapTeam(r) {
  return { id: r.id, name: r.name, managerId: r.manager_id };
}
function mapEntry(r) {
  return {
    id: r.id, userId: r.user_id, name: r.name, date: r.date,
    doorsKnocked: r.doors_knocked, doorConvos: r.door_convos, doorAppts: r.door_appts,
    callsMade: r.calls_made, callConvos: r.call_convos, callAppts: r.call_appts,
    recruitAttempts: r.recruit_attempts, interviews: r.interviews, onboarded: r.onboarded,
    revenue: r.revenue, notes: r.notes
  };
}
function mapGoal(r) {
  return {
    id: r.id, userId: r.user_id,
    weeklyDoors: r.weekly_doors, weeklyCalls: r.weekly_calls, weeklyAppts: r.weekly_appts, weeklyRevenue: r.weekly_revenue,
    monthlyDoors: r.monthly_doors, monthlyCalls: r.monthly_calls, monthlyAppts: r.monthly_appts, monthlyRevenue: r.monthly_revenue
  };
}
function mapChat(r) {
  return { id: r.id, user: r.user_name, text: r.text, time: r.time, teamId: r.team_id };
}
function mapRoof(r) {
  return {
    id: r.id, name: r.name, address: r.address, email: r.email, phone: r.phone,
    type: r.type, status: r.status, assignedTo: r.assigned_to, assignedName: r.assigned_name,
    createdBy: r.created_by, createdAt: r.created_at, lastContact: r.last_contact, notes: r.notes
  };
}

module.exports = router;
