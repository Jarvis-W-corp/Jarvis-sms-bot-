const Anthropic = require('@anthropic-ai/sdk').default;
const { supabase } = require('../db/supabase');
const { searchWeb } = require('./search');
const memory = require('./memory');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Jarvis Lead Engine ──
// Scrapes businesses, builds pipelines, runs outreach sequences.
// This is how Jarvis makes money — find leads, reach out, close deals.

// ── Ensure tables exist ──
async function ensureTables() {
  // Will be created via SQL — log what's needed
  console.log('[LEADS] Tables: jarvis_leads, jarvis_outreach_sequences, jarvis_outreach_messages');
}

// ── Scrape Leads from Web ──
async function scrapeLeads(niche, location, count = 20) {
  const queries = [
    `${niche} in ${location} contact email phone`,
    `${niche} ${location} business directory`,
    `best ${niche} near ${location} reviews`,
  ];

  const allResults = [];
  for (const q of queries) {
    const results = await searchWeb(q, 10);
    allResults.push(...results);
  }

  if (!allResults.length) return { leads: [], message: 'No results found for ' + niche + ' in ' + location };

  // Use Claude to extract business info from search results
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: `You are a lead generation specialist. Extract business information from search results.
For each business found, extract:
- name: Business name
- type: Type of business
- phone: Phone number (if found)
- email: Email (if found)
- website: Website URL (if found)
- address: Address (if found)
- notes: Any useful info (reviews, services, size)

Return ONLY valid JSON array. Max ${count} leads. No markdown wrapping.
[{"name":"...","type":"...","phone":"...","email":"...","website":"...","address":"...","notes":"..."}]`,
    messages: [{
      role: 'user',
      content: `Extract business leads for "${niche}" in "${location}" from these search results:\n\n` +
        allResults.map(r => r.title + '\n' + r.url + '\n' + r.snippet).join('\n\n'),
    }],
  });

  let leads = [];
  try {
    let text = response.content[0].text.trim();
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    leads = JSON.parse(text);
  } catch (e) {
    console.error('[LEADS] Parse error:', e.message);
    return { leads: [], message: 'Failed to parse leads from search results' };
  }

  // Store leads in DB
  let stored = 0;
  for (const lead of leads) {
    try {
      const { error } = await supabase.from('jarvis_leads').upsert({
        name: lead.name,
        type: lead.type || niche,
        phone: lead.phone || null,
        email: lead.email || null,
        website: lead.website || null,
        address: lead.address || null,
        location: location,
        niche: niche,
        notes: lead.notes || null,
        status: 'new',
        source: 'web_scrape',
      }, { onConflict: 'name,location' });
      if (!error) stored++;
    } catch (e) { /* skip dupes */ }
  }

  return {
    leads,
    stored,
    message: `Found ${leads.length} leads, stored ${stored} new ones for "${niche}" in "${location}"`,
  };
}

// ── Get Leads from Pipeline ──
async function getLeads(status, niche, limit = 50) {
  let query = supabase.from('jarvis_leads').select('*').order('created_at', { ascending: false }).limit(limit);
  if (status) query = query.eq('status', status);
  if (niche) query = query.eq('niche', niche);
  const { data, error } = await query;
  if (error) { console.error('[LEADS] Get error:', error.message); return []; }
  return data || [];
}

// ── Update Lead Status ──
async function updateLead(leadId, updates) {
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('jarvis_leads').update(updates).eq('id', leadId).select().single();
  if (error) throw new Error('Update lead failed: ' + error.message);
  return data;
}

// ── Outreach Sequences ──

async function createSequence(name, steps) {
  // steps = [{ day: 1, channel: 'sms', template: '...' }, { day: 3, channel: 'email', subject: '...', template: '...' }, ...]
  const { data, error } = await supabase.from('jarvis_outreach_sequences').insert({
    name,
    steps: steps,
    status: 'active',
  }).select().single();
  if (error) throw new Error('Create sequence failed: ' + error.message);
  return data;
}

async function enrollLead(leadId, sequenceId) {
  const { error } = await supabase.from('jarvis_leads').update({
    sequence_id: sequenceId,
    sequence_step: 0,
    sequence_started_at: new Date().toISOString(),
    status: 'outreach',
    updated_at: new Date().toISOString(),
  }).eq('id', leadId);
  if (error) throw new Error('Enroll failed: ' + error.message);
  return 'Lead enrolled in sequence';
}

// ── Process Outreach Queue ──
// Run this on a schedule — sends next message in sequence for each enrolled lead
async function processOutreach() {
  const { data: leads } = await supabase.from('jarvis_leads')
    .select('*, jarvis_outreach_sequences(*)')
    .eq('status', 'outreach')
    .not('sequence_id', 'is', null);

  if (!leads?.length) return { processed: 0, sent: 0 };

  let sent = 0;
  for (const lead of leads) {
    const seq = lead.jarvis_outreach_sequences;
    if (!seq?.steps) continue;

    const currentStep = lead.sequence_step || 0;
    if (currentStep >= seq.steps.length) {
      // Sequence complete
      await updateLead(lead.id, { status: 'sequence_complete' });
      continue;
    }

    const step = seq.steps[currentStep];
    const daysSinceStart = Math.floor((Date.now() - new Date(lead.sequence_started_at).getTime()) / (24 * 60 * 60 * 1000));

    if (daysSinceStart < step.day) continue; // Not time yet

    // Personalize template
    const message = step.template
      .replace(/\{name\}/g, lead.name || 'there')
      .replace(/\{type\}/g, lead.type || 'business')
      .replace(/\{location\}/g, lead.location || '');

    try {
      if (step.channel === 'sms' && lead.phone) {
        const twilio = require('twilio');
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await client.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: lead.phone,
        });
        sent++;
      } else if (step.channel === 'email' && lead.email) {
        const gmail = require('./gmail');
        await gmail.sendEmail(lead.email, step.subject || 'Quick question', message);
        sent++;
      }

      // Log the message
      await supabase.from('jarvis_outreach_messages').insert({
        lead_id: lead.id,
        sequence_id: seq.id,
        step: currentStep,
        channel: step.channel,
        message: message,
        status: 'sent',
      });

      // Move to next step
      await updateLead(lead.id, { sequence_step: currentStep + 1 });

    } catch (err) {
      console.error('[LEADS] Outreach error for ' + lead.name + ':', err.message);
      await supabase.from('jarvis_outreach_messages').insert({
        lead_id: lead.id, sequence_id: seq.id, step: currentStep,
        channel: step.channel, message: message, status: 'failed', error: err.message,
      });
    }
  }

  return { processed: leads.length, sent };
}

// ── Generate Outreach Sequence with AI ──
async function generateSequence(niche, service, tone) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: `You are an outreach copywriting expert. Create a multi-touch outreach sequence for selling AI services to ${niche} businesses.

Return ONLY valid JSON array of steps. No markdown. Each step:
{"day": number, "channel": "sms"|"email", "subject": "email subject (email only)", "template": "message with {name} and {type} placeholders"}

Rules:
- 5-7 touches over 21 days
- Alternate SMS and email
- First touch = friendly intro, not salesy
- Each message under 300 chars for SMS, 500 for email
- Tone: ${tone || 'professional but friendly'}
- Value-first approach — lead with what you can do for THEM`,
    messages: [{
      role: 'user',
      content: `Create outreach sequence for selling "${service || 'AI automation'}" to "${niche}" businesses.`,
    }],
  });

  let steps = [];
  try {
    let text = response.content[0].text.trim();
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    steps = JSON.parse(text);
  } catch (e) {
    return { error: 'Failed to parse sequence: ' + e.message };
  }

  return { steps, count: steps.length };
}

// ── Pipeline Stats ──
async function getPipelineStats() {
  const { data: leads } = await supabase.from('jarvis_leads').select('status, niche');
  if (!leads) return 'No leads in pipeline.';

  const total = leads.length;
  const byStatus = {};
  const byNiche = {};
  leads.forEach(l => {
    byStatus[l.status] = (byStatus[l.status] || 0) + 1;
    byNiche[l.niche] = (byNiche[l.niche] || 0) + 1;
  });

  let report = `LEAD PIPELINE: ${total} total\n\n`;
  report += 'By Status:\n' + Object.entries(byStatus).map(([k, v]) => `  ${k}: ${v}`).join('\n');
  report += '\n\nBy Niche:\n' + Object.entries(byNiche).map(([k, v]) => `  ${k}: ${v}`).join('\n');

  return report;
}

module.exports = {
  scrapeLeads,
  getLeads,
  updateLead,
  createSequence,
  enrollLead,
  processOutreach,
  generateSequence,
  getPipelineStats,
  ensureTables,
};
