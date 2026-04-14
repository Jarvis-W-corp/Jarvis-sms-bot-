const express = require('express');
const path = require('path');
const { supabase } = require('../db/supabase');
const { createSession, requireAuth } = require('../middleware/hcauth');

const router = express.Router();
console.log('[SALES] Routes loaded v3 (unified auth + premium)');

router.get('/sales', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// === AUTH ===
router.post('/sales/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, error: 'Username and password required' });
  const { data } = await supabase.from('hc_users').select('*').eq('username', username).single();
  if (!data) return res.json({ success: false, error: 'User not found' });
  const bcrypt = require('bcryptjs');
  const match = data.password.startsWith('$2') ? bcrypt.compareSync(password, data.password) : (password === data.password);
  if (!match) return res.json({ success: false, error: 'Wrong password' });
  const token = await createSession(data.id);
  res.cookie('hc_token', token, { httpOnly: false, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.json({ success: true, user: mapUser(data), token });
});

router.post('/sales/api/logout', async (req, res) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : (req.cookies && req.cookies.hc_token);
  if (token) await supabase.from('hc_sessions').delete().eq('token', token);
  res.clearCookie('hc_token');
  res.json({ success: true });
});

router.get('/sales/api/me', requireAuth(), (req, res) => {
  res.json({ success: true, user: mapUser(req.hcUser) });
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
    id: u.id, username: u.username, password: require('bcryptjs').hashSync(u.password || '', 10),
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
  if (u.password !== undefined) update.password = require('bcryptjs').hashSync(u.password, 10);
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

router.delete('/sales/api/entries/:id', async (req, res) => {
  const { error } = await supabase.from('hc_entries').delete().eq('id', req.params.id);
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
    created_by: l.createdBy || '', created_at: l.createdAt, last_contact: l.lastContact || '', notes: l.notes || '',
    commission: 0, revenue: 0, outcome: ''
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
  if (l.commission !== undefined) update.commission = parseFloat(l.commission) || 0;
  if (l.revenue !== undefined) update.revenue = parseFloat(l.revenue) || 0;
  if (l.outcome !== undefined) update.outcome = l.outcome;
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

// === NOTIFICATIONS ===

router.get('/sales/api/notifications/:userId', async (req, res) => {
  const { data, error } = await supabase.from('hc_notifications').select('*')
    .eq('user_id', req.params.userId).order('created_at', { ascending: false }).limit(50);
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true, data: data.map(mapNotification) });
});

router.post('/sales/api/notifications', async (req, res) => {
  const n = req.body;
  const { error } = await supabase.from('hc_notifications').insert({
    id: n.id, user_id: n.userId, message: n.message, lead_id: n.leadId || '', read: false
  });
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true });
});

router.put('/sales/api/notifications/read/:userId', async (req, res) => {
  const { error } = await supabase.from('hc_notifications').update({ read: true }).eq('user_id', req.params.userId).eq('read', false);
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true });
});

// === CREW (sub-agent jobs) ===

router.post('/sales/api/crew/job', async (req, res) => {
  try {
    const crew = require('../core/crew');
    const { worker, title, description, input, priority } = req.body;
    const jobId = await crew.createJob(worker, title, description, input || {}, priority || 5);
    res.json({ success: true, jobId });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

router.post('/sales/api/crew/run', async (req, res) => {
  try {
    const crew = require('../core/crew');
    const results = await crew.processQueue();
    res.json({ success: true, results });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

router.get('/sales/api/crew', async (req, res) => {
  try {
    const crew = require('../core/crew');
    const status = await crew.getCrewStatus();
    res.json(status);
  } catch (error) {
    res.json({ workers: [], jobs: {}, recentJobs: [], error: error.message });
  }
});

// === HELPERS ===

function int(v) { return parseInt(v) || 0; }

function mapUser(r) {
  return {
    id: r.id, username: r.username, name: r.name, role: r.role,
    teamId: r.team_id, status: r.status,
    email: r.email || '', phone: r.phone || '',
    isPremium: !!r.is_premium, avatarUrl: r.avatar_url || ''
  };
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
    createdBy: r.created_by, createdAt: r.created_at, lastContact: r.last_contact, notes: r.notes,
    commission: r.commission || 0, revenue: r.revenue || 0, outcome: r.outcome || ''
  };
}
function mapNotification(r) {
  return { id: r.id, userId: r.user_id, message: r.message, leadId: r.lead_id, read: r.read, createdAt: r.created_at };
}

// === PREMIUM FLAG TOGGLE (admin only) ===

// === REP-SCOPED ENDPOINTS (rep PWA only — office CRM lives under /roofing/api) ===

// Submit a lead from the field — writes to shared hc_contacts, tagged to this rep.
// Shows up instantly in the office CRM at /roofing.
router.post('/sales/api/leads', requireAuth(), async (req, res) => {
  const c = req.body;
  const id = 'ct_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const { error } = await supabase.from('hc_contacts').insert({
    id,
    display_name: c.displayName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unnamed Lead',
    first_name: c.firstName || '', last_name: c.lastName || '',
    email: c.email || '', mobile_phone: c.phone || c.mobilePhone || '',
    address_line1: c.address || '', city: c.city || '', state_text: c.state || '', zip: c.zip || '',
    description: c.notes || '',
    record_type: c.recordType || 'Customer',
    status: 'Lead', stage: 'Lead',
    source: c.source || 'Door Knock',
    sales_rep_id: req.hcUser.id,
    created_by: req.hcUser.id
  });
  if (error) return res.json({ success: false, error: error.message });
  // Log activity so it appears in the CRM feed
  await supabase.from('hc_activities').insert({
    id: 'ac_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type: 'Note', note: `Lead submitted from rep PWA by ${req.hcUser.name}`,
    contact_id: id,
    created_by: req.hcUser.id, created_by_name: req.hcUser.name
  });
  res.json({ success: true, id });
});

// Rep's own appointments (for their calendar in the PWA)
router.get('/sales/api/my-appointments', requireAuth(), async (req, res) => {
  let q = supabase.from('hc_appointments').select('*')
    .contains('assigned_to', [req.hcUser.id]).order('date_start');
  if (req.query.from) q = q.gte('date_start', req.query.from);
  if (req.query.to) q = q.lte('date_start', req.query.to);
  const { data, error } = await q;
  if (error) return res.json({ success: false, error: error.message });
  res.json({
    success: true,
    data: (data || []).map(r => ({
      id: r.id, type: r.type, title: r.title, description: r.description,
      dateStart: r.date_start, dateEnd: r.date_end, durationMin: r.duration_min,
      contactId: r.contact_id, jobId: r.job_id,
      locationAddress: r.location_address,
      isCompleted: r.is_completed
    }))
  });
});

// Rep submits an appointment set — creates an hc_appointments row assigned to them.
router.post('/sales/api/my-appointments', requireAuth(), async (req, res) => {
  const a = req.body;
  const id = 'ap_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const { error } = await supabase.from('hc_appointments').insert({
    id,
    type: a.type || 'Appointment',
    title: a.title || (a.customerName ? `Appt — ${a.customerName}` : 'Appointment'),
    description: a.description || a.notes || '',
    date_start: a.dateStart,
    date_end: a.dateEnd || null,
    duration_min: a.durationMin || 60,
    priority: a.priority || 'Medium',
    assigned_to: [req.hcUser.id],
    contact_id: a.contactId || null,
    job_id: a.jobId || null,
    location_address: a.locationAddress || a.address || '',
    created_by: req.hcUser.id
  });
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true, id });
});

// Rep's commissions — sum of commission_amount on jobs where they are the sales rep.
router.get('/sales/api/my-commissions', requireAuth(), async (req, res) => {
  const { data, error } = await supabase.from('hc_jobs')
    .select('id, name, stage, status, commission_amount, commission_rate, commission_paid, commission_paid_date, approved_estimate_total, contact_id, updated_at')
    .eq('sales_rep_id', req.hcUser.id).order('updated_at', { ascending: false });
  if (error) return res.json({ success: false, error: error.message });
  const rows = data || [];
  const totals = rows.reduce((acc, r) => {
    const c = parseFloat(r.commission_amount) || 0;
    acc.all += c;
    if (r.commission_paid) acc.paid += c; else acc.pending += c;
    return acc;
  }, { all: 0, paid: 0, pending: 0 });
  res.json({
    success: true,
    totals,
    data: rows.map(r => ({
      id: r.id, name: r.name, stage: r.stage, status: r.status,
      commissionAmount: r.commission_amount, commissionRate: r.commission_rate,
      commissionPaid: r.commission_paid, commissionPaidDate: r.commission_paid_date,
      approvedEstimateTotal: r.approved_estimate_total,
      contactId: r.contact_id, updatedAt: r.updated_at
    }))
  });
});

// PWA manifest — lets reps install the tracker to their home screen.
router.get('/sales/manifest.webmanifest', (req, res) => {
  res.type('application/manifest+json').json({
    name: 'HC Daily Tracker',
    short_name: 'HC Tracker',
    start_url: '/sales',
    display: 'standalone',
    background_color: '#0d0d0d',
    theme_color: '#7B5EA7',
    orientation: 'portrait',
    icons: [
      { src: '/sales/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/sales/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
    ]
  });
});

// Service worker stub — enables PWA installability. Keep minimal; no offline cache.
router.get('/sales/sw.js', (req, res) => {
  res.type('application/javascript').send(
    "self.addEventListener('install',e=>self.skipWaiting());" +
    "self.addEventListener('activate',e=>self.clients.claim());" +
    "self.addEventListener('fetch',()=>{});"
  );
});

// Placeholder icons (1x1 PNG) — replace with real icons when Mark ships art.
const ICON_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
router.get('/sales/icon-192.png', (_req, res) => res.type('image/png').send(ICON_PNG));
router.get('/sales/icon-512.png', (_req, res) => res.type('image/png').send(ICON_PNG));

module.exports = router;
