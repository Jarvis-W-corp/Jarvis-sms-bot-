const Anthropic = require('@anthropic-ai/sdk').default;
const { supabase } = require('../db/supabase');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Jarvis Lead Scorer ──
// AI-powered lead scoring + routing engine.
// Scores 1-10 via Claude, routes leads to the right action.

const DEFAULT_CRITERIA = [
  'Has a valid phone number (+2)',
  'Has a valid email address (+1)',
  'Location matches target service area (+2)',
  'Business type / niche is a strong fit (+1)',
  'Homeowner or decision-maker (+2)',
  'Has shown prior engagement (replied, clicked) (+1)',
  'Company size or revenue signals (+1)',
];

// ── Score a lead with Claude ──
async function scoreLead(tenantId, lead, criteria) {
  const scoringCriteria = criteria || DEFAULT_CRITERIA;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: `You are a lead scoring engine. Score leads 1-10 based on conversion likelihood.
Return ONLY valid JSON: {"score": number, "reason": "brief explanation", "priority": "hot"|"warm"|"cold"}
hot = 8-10, warm = 5-7, cold = 1-4. Be concise.`,
      messages: [{
        role: 'user',
        content: `Score this lead:\n${JSON.stringify(lead, null, 2)}\n\nCriteria:\n${scoringCriteria.map((c, i) => (i + 1) + '. ' + c).join('\n')}`,
      }],
    });

    let text = response.content[0].text.trim();
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const result = JSON.parse(text);

    // Clamp score
    result.score = Math.max(1, Math.min(10, Math.round(result.score)));
    if (!result.priority) {
      result.priority = result.score >= 8 ? 'hot' : result.score >= 5 ? 'warm' : 'cold';
    }

    // Update lead in DB
    try {
      await supabase.from('leads')
        .update({ score: result.score, score_reason: result.reason })
        .eq('id', lead.id)
        .eq('tenant_id', tenantId);

      // Log scoring activity
      await supabase.from('activities').insert({
        tenant_id: tenantId,
        lead_id: lead.id,
        type: 'scored',
        data: { score: result.score, reason: result.reason, priority: result.priority },
      });
    } catch (dbErr) {
      console.error('[SCORER] DB update error:', dbErr.message);
    }

    return result;
  } catch (err) {
    console.error('[SCORER] Score error:', err.message);
    // Fallback: simple heuristic scoring
    let score = 3;
    if (lead.phone) score += 2;
    if (lead.email) score += 1;
    if (lead.company) score += 1;
    if (lead.location) score += 1;
    score = Math.min(10, score);
    const priority = score >= 8 ? 'hot' : score >= 5 ? 'warm' : 'cold';
    return { score, reason: 'Heuristic fallback — AI scoring unavailable', priority };
  }
}

// ── Re-score based on engagement events ──
async function reScoreLead(tenantId, leadId, event) {
  const BUMPS = {
    email_opened: 1,
    sms_replied: 2,
    call_answered: 1,
    appointment_booked: null, // special: set to 10
  };

  try {
    // Get current lead
    const { data: lead, error } = await supabase
      .from('leads').select('*').eq('id', leadId).eq('tenant_id', tenantId).single();
    if (error || !lead) {
      console.error('[SCORER] Re-score: lead not found', leadId);
      return null;
    }

    let newScore;
    let reason;

    if (event === 'appointment_booked') {
      newScore = 10;
      reason = 'Appointment booked — max score';
    } else {
      const bump = BUMPS[event] || 0;
      newScore = Math.min(10, (lead.score || 3) + bump);
      reason = `${event} +${bump} (was ${lead.score || 3})`;
    }

    await supabase.from('leads')
      .update({ score: newScore, score_reason: reason })
      .eq('id', leadId);

    await supabase.from('activities').insert({
      tenant_id: tenantId,
      lead_id: leadId,
      type: 'scored',
      data: { score: newScore, reason, event, previous_score: lead.score },
    });

    console.log('[SCORER] Re-scored lead ' + leadId + ': ' + (lead.score || '?') + ' → ' + newScore + ' (' + event + ')');
    return { score: newScore, reason, previous: lead.score };
  } catch (err) {
    console.error('[SCORER] Re-score error:', err.message);
    return null;
  }
}

// ── Route lead based on score ──
async function routeLead(tenantId, lead) {
  const score = lead.score || 3;

  let action, details;

  if (score >= 8) {
    // HOT — trigger dialer + personal email
    action = 'hot_outreach';
    details = {
      dialer: true,
      personal_email: true,
      sms: true,
      description: 'High-priority lead — trigger AI dialer + personal email immediately',
    };
  } else if (score >= 5) {
    // WARM — email sequence
    action = 'email_sequence';
    details = {
      dialer: false,
      personal_email: false,
      sms: true,
      description: 'Warm lead — start automated email nurture sequence',
    };
  } else {
    // COLD — monthly drip
    action = 'monthly_drip';
    details = {
      dialer: false,
      personal_email: false,
      sms: false,
      description: 'Cold lead — add to monthly drip campaign only',
    };
  }

  // Log routing decision
  try {
    await supabase.from('activities').insert({
      tenant_id: tenantId,
      lead_id: lead.id,
      type: 'note',
      data: { action, details, score },
    });
  } catch (err) {
    console.error('[SCORER] Route log error:', err.message);
  }

  console.log('[SCORER] Routed lead ' + (lead.name || lead.id) + ' → ' + action + ' (score: ' + score + ')');
  return { action, details };
}

module.exports = {
  scoreLead,
  reScoreLead,
  routeLead,
  DEFAULT_CRITERIA,
};
