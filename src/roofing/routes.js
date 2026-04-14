const express = require('express');
const path = require('path');
const db = require('../db/queries');
const { aiLimiter } = require('../middleware/ratelimit');
const { supabase } = require('../db/supabase');
const { requireAuth, requirePremium } = require('../middleware/hcauth');

const router = express.Router();
console.log('[ROOFING CRM] Routes loaded v2 (JN-style endpoints)');

// Serve roofing CRM HTML — unified auth, requires premium
const { resolveUser } = require('../middleware/hcauth');
router.get('/roofing', async (req, res) => {
  const user = await resolveUser(req);
  if (!user) {
    return res.redirect('/sales?next=/roofing');
  }
  if (!user.is_premium && user.role !== 'Admin') {
    return res.status(402).send(`<html><body style="background:#1a3a6b;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center;max-width:420px"><h1 style="color:#c8971a;margin-bottom:12px">Premium Required</h1><p style="opacity:.8;line-height:1.5">Hi ${user.name}, the full CRM is a premium feature. Ask your admin to upgrade your account, or head back to the tracker.</p><p style="margin-top:24px"><a href="/sales" style="color:#c8971a">← Back to Tracker</a></p></div></body></html>`);
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Health
router.get('/roofing/api/health', (req, res) => {
  res.json({ status: 'ok', crm: 'Premium Roofing', jarvis: 'connected' });
});

// AI Chat — Jarvis with roofing context
router.post('/roofing/api/chat', aiLimiter, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'No text' });
    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant' });
    const brain = require('../core/brain');
    const reply = await brain.chat(tenant.id, 'roofing_crm', 'roofing', text, 'Boss');
    res.json({ reply });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// AI SMS — generate and return SMS text for a contact
router.post('/roofing/api/sms', aiLimiter, async (req, res) => {
  try {
    const { contact, context } = req.body;
    const Anthropic = require('@anthropic-ai/sdk').default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: 'You are a roofing sales assistant. Write a short, friendly SMS follow-up message (under 160 chars). Be direct, professional, mention their roof project. No emojis.',
      messages: [{ role: 'user', content: 'Write an SMS to ' + (contact || 'the customer') + '. Context: ' + (context || 'follow up on their roofing estimate') }],
    });
    const message = response.content[0].text;
    res.json({ message, contact });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// AI Call Script
router.post('/roofing/api/call-script', aiLimiter, async (req, res) => {
  try {
    const { contact, jobType } = req.body;
    const Anthropic = require('@anthropic-ai/sdk').default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: 'You are a roofing sales coach. Write a natural phone call script for following up with a homeowner. Include: greeting, reason for call, questions to ask, how to handle objections, close with booking an inspection. Keep it conversational, not robotic.',
      messages: [{ role: 'user', content: 'Call script for ' + (contact || 'homeowner') + '. Job type: ' + (jobType || 'roof inspection/estimate follow-up') }],
    });
    res.json({ script: response.content[0].text, contact });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// AI Estimate Generator
router.post('/roofing/api/estimate', aiLimiter, async (req, res) => {
  try {
    const { contact, jobType, address, details, amount } = req.body;
    const Anthropic = require('@anthropic-ai/sdk').default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: 'You are a professional roofing estimator for Premium Roofing, a high-end roofing company in Connecticut. Generate a detailed, professional estimate document. Include: company header, date, customer info, scope of work, materials list, labor breakdown, timeline, warranty info, terms, total. Format in clean markdown.',
      messages: [{ role: 'user', content: 'Generate estimate for:\nCustomer: ' + (contact || 'Homeowner') + '\nAddress: ' + (address || 'CT') + '\nJob: ' + (jobType || 'Roof replacement') + '\nDetails: ' + (details || 'Standard asphalt shingle reroof') + '\nEstimated amount: ' + (amount || 'TBD') }],
    });
    res.json({ estimate: response.content[0].text, contact });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================================
// CRM data endpoints — all gated by requirePremium (admin bypasses).
// These live under /roofing/api/* so the tracker (/sales) can redeploy without
// touching this surface.
// ============================================================================

// === ADMIN: toggle a user's premium flag ===
router.put('/roofing/api/users/:id/premium', requireAuth(), async (req, res) => {
  if (req.hcUser.role !== 'Admin') return res.status(403).json({ success: false, error: 'Admin only' });
  const { isPremium } = req.body;
  const { error } = await supabase.from('hc_users').update({ is_premium: !!isPremium }).eq('id', req.params.id);
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true });
});

router.get('/roofing/api/users', requirePremium(), async (req, res) => {
  const { data, error } = await supabase.from('hc_users').select('id, username, name, role, email, phone, is_premium, status').order('name');
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true, data: (data || []).map(u => ({
    id: u.id, username: u.username, name: u.name, role: u.role,
    email: u.email || '', phone: u.phone || '', isPremium: !!u.is_premium, status: u.status
  })) });
});

// === CONTACTS ===

router.get('/roofing/api/contacts', requirePremium(), async (req, res) => {
  let q = supabase.from('hc_contacts').select('*').order('updated_at', { ascending: false });
  if (req.query.stage) q = q.eq('stage', req.query.stage);
  if (req.query.salesRepId) q = q.eq('sales_rep_id', req.query.salesRepId);
  if (req.query.search) q = q.ilike('display_name', `%${req.query.search}%`);
  const { data, error } = await q;
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true, data: (data || []).map(mapContact) });
});

router.get('/roofing/api/contacts/:id', requirePremium(), async (req, res) => {
  const { data, error } = await supabase.from('hc_contacts').select('*').eq('id', req.params.id).single();
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true, data: mapContact(data) });
});

router.post('/roofing/api/contacts', requirePremium(), async (req, res) => {
  const c = req.body;
  const id = c.id || 'ct_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const row = {
    id, number: c.number || null,
    display_name: c.displayName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unnamed',
    first_name: c.firstName || '', last_name: c.lastName || '', company: c.company || '',
    email: c.email || '', home_phone: c.homePhone || '', mobile_phone: c.mobilePhone || c.phone || '',
    work_phone: c.workPhone || '', website: c.website || '',
    address_line1: c.addressLine1 || c.address || '', address_line2: c.addressLine2 || '',
    city: c.city || '', state_text: c.state || '', zip: c.zip || '',
    description: c.description || c.notes || '',
    record_type: c.recordType || 'Customer',
    status: c.status || 'Lead', stage: c.stage || 'Lead',
    source: c.source || '',
    sales_rep_id: c.salesRepId || req.hcUser.id,
    tags: Array.isArray(c.tags) ? c.tags : [],
    created_by: req.hcUser.id
  };
  const { error } = await supabase.from('hc_contacts').insert(row);
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true, id });
});

const CONTACT_FIELD_MAP = {
  displayName: 'display_name', firstName: 'first_name', lastName: 'last_name',
  company: 'company', email: 'email', homePhone: 'home_phone', mobilePhone: 'mobile_phone',
  workPhone: 'work_phone', website: 'website',
  addressLine1: 'address_line1', addressLine2: 'address_line2', city: 'city',
  state: 'state_text', zip: 'zip', description: 'description',
  recordType: 'record_type', status: 'status', stage: 'stage', source: 'source',
  salesRepId: 'sales_rep_id', tags: 'tags', isArchived: 'is_archived'
};

router.put('/roofing/api/contacts/:id', requirePremium(), async (req, res) => {
  const c = req.body;
  const up = { updated_at: new Date().toISOString() };
  for (const k in CONTACT_FIELD_MAP) if (c[k] !== undefined) up[CONTACT_FIELD_MAP[k]] = c[k];
  const { error } = await supabase.from('hc_contacts').update(up).eq('id', req.params.id);
  if (error) return res.json({ success: false, error: error.message });
  // log status change
  if (c.stage || c.status) {
    await supabase.from('hc_activities').insert({
      id: 'ac_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type: 'StatusChange', note: `Contact updated by ${req.hcUser.name}`,
      contact_id: req.params.id, to_status: c.stage || c.status || '',
      created_by: req.hcUser.id, created_by_name: req.hcUser.name
    });
  }
  res.json({ success: true });
});

router.delete('/roofing/api/contacts/:id', requirePremium(), async (req, res) => {
  const { error } = await supabase.from('hc_contacts').delete().eq('id', req.params.id);
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true });
});

// === JOBS (with insurance + inspection/claim toggles + commissions) ===

const JOB_FIELD_MAP = {
  name: 'name', contactId: 'contact_id', recordType: 'record_type',
  status: 'status', stage: 'stage', description: 'description',
  addressLine1: 'address_line1', addressLine2: 'address_line2', city: 'city',
  state: 'state_text', zip: 'zip',
  salesRepId: 'sales_rep_id', source: 'source',
  dateStart: 'date_start', dateEnd: 'date_end',
  approvedEstimateTotal: 'approved_estimate_total', cost: 'cost',
  coverPhotoUrl: 'cover_photo_url', tags: 'tags',

  // Inspection / claim toggles (JN-style options)
  inspectionCompleted: 'inspection_completed', inspectionDate: 'inspection_date',
  inspectionNotes: 'inspection_notes',
  claimFiled: 'claim_filed', claimFiledDate: 'claim_filed_date',
  claimApproved: 'claim_approved', claimDenied: 'claim_denied',

  // Insurance
  insuranceCompany: 'insurance_company', policyNumber: 'policy_number',
  claimNumber: 'claim_number', dateOfLoss: 'date_of_loss', typeOfLoss: 'type_of_loss',
  dateReported: 'date_reported', dateInspected: 'date_inspected',
  adjusterName: 'adjuster_name', adjusterPhone: 'adjuster_phone',
  adjusterEmail: 'adjuster_email', adjusterCompany: 'adjuster_company',
  deductible: 'deductible', deductiblePaid: 'deductible_paid',
  acvAmount: 'acv_amount', rcvAmount: 'rcv_amount',
  recoverableDepreciation: 'recoverable_depreciation',
  depreciationDeadline: 'depreciation_deadline',
  nonRecoverableDepreciation: 'non_recoverable_depreciation',
  overheadAndProfit: 'overhead_and_profit',
  supplementAmount: 'supplement_amount', supplementStatus: 'supplement_status',
  supplementNotes: 'supplement_notes',
  mortgageCompany: 'mortgage_company', mortgageLoanNumber: 'mortgage_loan_number',
  scopeApproved: 'scope_approved', scopeNotes: 'scope_notes',
  firstCheckReceived: 'first_check_received', firstCheckAmount: 'first_check_amount',
  firstCheckDate: 'first_check_date',
  finalCheckReceived: 'final_check_received', finalCheckAmount: 'final_check_amount',
  finalCheckDate: 'final_check_date', cocSigned: 'coc_signed',

  // Commissions
  commissionRate: 'commission_rate', commissionAmount: 'commission_amount',
  commissionPaid: 'commission_paid', commissionPaidDate: 'commission_paid_date'
};

router.get('/roofing/api/jobs', requirePremium(), async (req, res) => {
  let q = supabase.from('hc_jobs').select('*').order('updated_at', { ascending: false });
  if (req.query.contactId) q = q.eq('contact_id', req.query.contactId);
  if (req.query.salesRepId) q = q.eq('sales_rep_id', req.query.salesRepId);
  if (req.query.stage) q = q.eq('stage', req.query.stage);
  const { data, error } = await q;
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true, data: (data || []).map(mapJob) });
});

router.get('/roofing/api/jobs/:id', requirePremium(), async (req, res) => {
  const { data, error } = await supabase.from('hc_jobs').select('*').eq('id', req.params.id).single();
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true, data: mapJob(data) });
});

// Policy lookup — used by the profile card popover in the calendar.
router.get('/roofing/api/jobs/lookup/:policy', requirePremium(), async (req, res) => {
  const { data, error } = await supabase.from('hc_jobs').select('*')
    .ilike('policy_number', req.params.policy).limit(1).maybeSingle();
  if (error) return res.json({ success: false, error: error.message });
  if (!data) return res.json({ success: true, data: null });
  const { data: contact } = await supabase.from('hc_contacts').select('*').eq('id', data.contact_id).maybeSingle();
  res.json({ success: true, data: mapJob(data), contact: contact ? mapContact(contact) : null });
});

router.post('/roofing/api/jobs', requirePremium(), async (req, res) => {
  const j = req.body;
  const id = j.id || 'jb_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const row = { id, created_by: req.hcUser.id };
  for (const k in JOB_FIELD_MAP) if (j[k] !== undefined) row[JOB_FIELD_MAP[k]] = j[k];
  if (!row.name) return res.json({ success: false, error: 'name required' });
  const { error } = await supabase.from('hc_jobs').insert(row);
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true, id });
});

router.put('/roofing/api/jobs/:id', requirePremium(), async (req, res) => {
  const j = req.body;
  const up = { updated_at: new Date().toISOString() };
  for (const k in JOB_FIELD_MAP) if (j[k] !== undefined) up[JOB_FIELD_MAP[k]] = j[k];
  const { error } = await supabase.from('hc_jobs').update(up).eq('id', req.params.id);
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true });
});

router.delete('/roofing/api/jobs/:id', requirePremium(), async (req, res) => {
  const { error } = await supabase.from('hc_jobs').delete().eq('id', req.params.id);
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true });
});

// === APPOINTMENTS (calendar) ===

router.get('/roofing/api/appointments', requirePremium(), async (req, res) => {
  let q = supabase.from('hc_appointments').select('*').order('date_start');
  if (req.query.from) q = q.gte('date_start', req.query.from);
  if (req.query.to) q = q.lte('date_start', req.query.to);
  if (req.query.userId) q = q.contains('assigned_to', [req.query.userId]);
  const { data, error } = await q;
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true, data: (data || []).map(mapAppt) });
});

router.post('/roofing/api/appointments', requirePremium(), async (req, res) => {
  const a = req.body;
  const id = a.id || 'ap_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const { error } = await supabase.from('hc_appointments').insert({
    id, type: a.type || 'Appointment',
    title: a.title || 'Untitled',
    description: a.description || '',
    is_all_day: !!a.isAllDay,
    date_start: a.dateStart,
    date_end: a.dateEnd || null,
    duration_min: a.durationMin || 60,
    priority: a.priority || 'Medium',
    assigned_to: Array.isArray(a.assignedTo) ? a.assignedTo : (a.assignedTo ? [a.assignedTo] : [req.hcUser.id]),
    contact_id: a.contactId || null,
    job_id: a.jobId || null,
    location_address: a.locationAddress || '',
    reminder_min: a.reminderMin || null,
    tags: Array.isArray(a.tags) ? a.tags : [],
    created_by: req.hcUser.id
  });
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true, id });
});

const APPT_FIELD_MAP = {
  type: 'type', title: 'title', description: 'description', isAllDay: 'is_all_day',
  dateStart: 'date_start', dateEnd: 'date_end', durationMin: 'duration_min',
  priority: 'priority', assignedTo: 'assigned_to', contactId: 'contact_id',
  jobId: 'job_id', locationAddress: 'location_address',
  isCompleted: 'is_completed', dateCompleted: 'date_completed',
  reminderMin: 'reminder_min', tags: 'tags'
};

router.put('/roofing/api/appointments/:id', requirePremium(), async (req, res) => {
  const a = req.body;
  const up = { updated_at: new Date().toISOString() };
  for (const k in APPT_FIELD_MAP) if (a[k] !== undefined) up[APPT_FIELD_MAP[k]] = a[k];
  const { error } = await supabase.from('hc_appointments').update(up).eq('id', req.params.id);
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true });
});

router.delete('/roofing/api/appointments/:id', requirePremium(), async (req, res) => {
  const { error } = await supabase.from('hc_appointments').delete().eq('id', req.params.id);
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true });
});

// === ACTIVITIES ===

router.get('/roofing/api/activities', requirePremium(), async (req, res) => {
  let q = supabase.from('hc_activities').select('*').order('created_at', { ascending: false }).limit(200);
  if (req.query.contactId) q = q.eq('contact_id', req.query.contactId);
  if (req.query.jobId) q = q.eq('job_id', req.query.jobId);
  const { data, error } = await q;
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true, data: (data || []).map(mapActivity) });
});

router.post('/roofing/api/activities', requirePremium(), async (req, res) => {
  const a = req.body;
  const id = a.id || 'ac_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const { error } = await supabase.from('hc_activities').insert({
    id, type: a.type || 'Note', note: a.note || '',
    contact_id: a.contactId || null, job_id: a.jobId || null,
    from_status: a.fromStatus || '', to_status: a.toStatus || '',
    created_by: req.hcUser.id, created_by_name: req.hcUser.name
  });
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true, id });
});

// === MAPPERS ===

function mapContact(r) {
  return {
    id: r.id, number: r.number, displayName: r.display_name,
    firstName: r.first_name, lastName: r.last_name, company: r.company,
    email: r.email, homePhone: r.home_phone, mobilePhone: r.mobile_phone, workPhone: r.work_phone,
    website: r.website,
    addressLine1: r.address_line1, addressLine2: r.address_line2, city: r.city,
    state: r.state_text, zip: r.zip, country: r.country_name,
    geoLat: r.geo_lat, geoLon: r.geo_lon,
    description: r.description, recordType: r.record_type,
    status: r.status, stage: r.stage, source: r.source,
    salesRepId: r.sales_rep_id, ownerIds: r.owner_ids || [], tags: r.tags || [],
    isArchived: r.is_archived, createdBy: r.created_by,
    createdAt: r.created_at, updatedAt: r.updated_at
  };
}
function mapJob(r) {
  const out = { id: r.id, number: r.number };
  const rev = {}; for (const k in JOB_FIELD_MAP) rev[JOB_FIELD_MAP[k]] = k;
  for (const col in rev) if (r[col] !== undefined) out[rev[col]] = r[col];
  out.createdBy = r.created_by; out.createdAt = r.created_at; out.updatedAt = r.updated_at;
  return out;
}
function mapAppt(r) {
  return {
    id: r.id, type: r.type, title: r.title, description: r.description,
    isAllDay: r.is_all_day, dateStart: r.date_start, dateEnd: r.date_end,
    durationMin: r.duration_min, priority: r.priority,
    assignedTo: r.assigned_to || [], contactId: r.contact_id, jobId: r.job_id,
    locationAddress: r.location_address, isCompleted: r.is_completed,
    dateCompleted: r.date_completed, reminderMin: r.reminder_min,
    tags: r.tags || [], createdBy: r.created_by,
    createdAt: r.created_at, updatedAt: r.updated_at
  };
}
function mapActivity(r) {
  return {
    id: r.id, type: r.type, note: r.note,
    contactId: r.contact_id, jobId: r.job_id,
    fromStatus: r.from_status, toStatus: r.to_status,
    createdBy: r.created_by, createdByName: r.created_by_name,
    createdAt: r.created_at
  };
}

module.exports = router;
