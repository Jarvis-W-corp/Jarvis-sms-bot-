const Anthropic = require('@anthropic-ai/sdk').default;
const { supabase } = require('../db/supabase');
const { logToDiscord } = require('../channels/discord');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Jarvis AI Dialer ──
// Uses Bland.ai for AI phone calls, falls back to Twilio voice.
// Generates scripts, dials leads, handles outcomes.

const BLAND_BASE = 'https://api.bland.ai/v1';

// ── Dial a lead ──
async function dialLead(tenantId, lead, script) {
  if (!lead.phone) {
    console.error('[DIALER] No phone number for lead:', lead.id);
    return { error: 'No phone number' };
  }

  const blandKey = process.env.BLAND_API_KEY;
  const renderUrl = process.env.RENDER_EXTERNAL_URL || 'https://jarvis-sms-bot.onrender.com';

  // Log the call attempt
  try {
    await supabase.from('activities').insert({
      tenant_id: tenantId,
      lead_id: lead.id,
      type: 'call_made',
      data: { method: blandKey ? 'bland' : 'twilio', phone: lead.phone },
    });
  } catch (err) {
    console.error('[DIALER] Activity log error:', err.message);
  }

  // ── Bland.ai path ──
  if (blandKey) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const res = await fetch(BLAND_BASE + '/calls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': blandKey,
        },
        body: JSON.stringify({
          phone_number: lead.phone,
          task: script || 'You are a friendly sales assistant calling to schedule an appointment.',
          voice: 'mason',
          max_duration: 5,
          webhook_url: renderUrl + '/dialer/webhook',
          metadata: {
            tenant_id: tenantId,
            lead_id: lead.id,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text();
        throw new Error('Bland API ' + res.status + ': ' + errText);
      }

      const data = await res.json();
      console.log('[DIALER] Bland call started — ID: ' + (data.call_id || data.id));
      return { call_id: data.call_id || data.id, method: 'bland', status: 'initiated' };
    } catch (err) {
      console.error('[DIALER] Bland.ai error:', err.message);
      // Fall through to Twilio
      if (err.name === 'AbortError') {
        console.error('[DIALER] Bland.ai request timed out, falling back to Twilio');
      }
    }
  }

  // ── Twilio fallback ──
  try {
    const { makeCall } = require('./voice');
    const message = script || 'Hi, this is Jarvis calling on behalf of our team. We wanted to connect with you about an opportunity. Please call us back or reply to our text.';
    const result = await makeCall(lead.phone, message);
    console.log('[DIALER] Twilio call to ' + lead.phone + ' — SID: ' + result.callSid);
    return { call_id: result.callSid, method: 'twilio', status: result.status };
  } catch (err) {
    console.error('[DIALER] Twilio fallback error:', err.message);
    return { error: 'All dial methods failed: ' + err.message };
  }
}

// ── Generate a call script with Claude ──
async function generateCallScript(lead, businessType, goal) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: `You are a sales call script writer. Write a natural, conversational phone script.
Keep it under 200 words. Be friendly, not pushy. Include:
1. Warm intro with their name
2. Quick reason for calling
3. One key value proposition
4. Soft close (book appointment or next step)
Return ONLY the script text, no headers or labels.`,
      messages: [{
        role: 'user',
        content: `Write a call script for:
Lead: ${lead.name || 'the prospect'}${lead.company ? ' at ' + lead.company : ''}
Business type: ${businessType || 'local business'}
Goal: ${goal || 'book an appointment'}
Location: ${lead.location || 'their area'}
Notes: ${lead.notes || lead.score_reason || 'none'}`,
      }],
    });

    return response.content[0].text.trim();
  } catch (err) {
    console.error('[DIALER] Script generation error:', err.message);
    // Fallback generic script
    const name = lead.name || 'there';
    return `Hi ${name}, this is calling from our team. We help ${businessType || 'businesses'} in ${lead.location || 'your area'} save time and grow revenue. I'd love to set up a quick 15-minute call to show you how. Would that work for you this week?`;
  }
}

// ── Handle call result webhook ──
async function handleCallResult(callData) {
  // callData comes from Bland.ai webhook or parsed Twilio status
  const tenantId = callData.metadata?.tenant_id || callData.tenant_id;
  const leadId = callData.metadata?.lead_id || callData.lead_id;

  if (!tenantId || !leadId) {
    console.error('[DIALER] Webhook missing tenant_id or lead_id:', JSON.stringify(callData));
    return { error: 'Missing identifiers' };
  }

  // Determine outcome
  let outcome = 'no_answer';
  const transcript = callData.transcript || callData.concatenated_transcript || '';
  const status = (callData.status || callData.call_status || '').toLowerCase();
  const answered = callData.answered || status === 'completed' || transcript.length > 50;

  if (!answered) {
    outcome = 'no_answer';
  } else if (callData.appointment_booked || /book|schedule|appointment|set up a time/i.test(transcript)) {
    outcome = 'appointment_booked';
  } else if (/not interested|no thanks|don't call|remove me/i.test(transcript)) {
    outcome = 'not_interested';
  } else if (/call back|call me later|busy right now|another time/i.test(transcript)) {
    outcome = 'callback_requested';
  } else {
    outcome = answered ? 'callback_requested' : 'no_answer';
  }

  console.log('[DIALER] Call result for lead ' + leadId + ': ' + outcome);

  try {
    // Log activity
    await supabase.from('activities').insert({
      tenant_id: tenantId,
      lead_id: leadId,
      type: 'call_made',
      data: {
        outcome,
        duration: callData.call_length || callData.duration || null,
        transcript: transcript.substring(0, 2000),
        call_id: callData.call_id || callData.CallSid || null,
      },
    });

    // Update lead status based on outcome
    const statusMap = {
      appointment_booked: 'appointment',
      not_interested: 'dead',
      callback_requested: 'contacted',
      no_answer: 'new', // keep as-is
    };

    if (outcome !== 'no_answer') {
      await supabase.from('leads')
        .update({ status: statusMap[outcome] })
        .eq('id', leadId)
        .eq('tenant_id', tenantId);
    }

    // Trigger follow-ups based on outcome
    if (outcome === 'no_answer') {
      // Send follow-up SMS
      try {
        const { data: lead } = await supabase.from('leads')
          .select('phone, name').eq('id', leadId).single();
        if (lead?.phone) {
          const twilio = require('twilio');
          const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
          await client.messages.create({
            body: `Hey${lead.name ? ' ' + lead.name : ''}, we just tried to reach you. Reply here or let us know a good time to chat!`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: lead.phone,
          });
          await supabase.from('activities').insert({
            tenant_id: tenantId,
            lead_id: leadId,
            type: 'sms_sent',
            data: { reason: 'no_answer_followup' },
          });
        }
      } catch (smsErr) {
        console.error('[DIALER] Follow-up SMS error:', smsErr.message);
      }
    }

    if (outcome === 'appointment_booked') {
      // Ping Discord
      try {
        logToDiscord('customer-logs', '📞 **APPOINTMENT BOOKED via AI Dialer!**\nLead: ' + leadId + '\nTranscript: ' + transcript.substring(0, 300));
      } catch (discErr) {
        console.error('[DIALER] Discord ping error:', discErr.message);
      }

      // Re-score lead
      try {
        const scorer = require('./scorer');
        await scorer.reScoreLead(tenantId, leadId, 'appointment_booked');
      } catch (scoreErr) {
        console.error('[DIALER] Re-score error:', scoreErr.message);
      }
    }

    return { outcome, lead_id: leadId };
  } catch (err) {
    console.error('[DIALER] Webhook handler error:', err.message);
    return { error: err.message };
  }
}

// ── Get call history for a lead ──
async function getCallHistory(tenantId, leadId) {
  try {
    const { data, error } = await supabase.from('activities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('lead_id', leadId)
      .eq('type', 'call_made')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[DIALER] Call history error:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('[DIALER] Call history error:', err.message);
    return [];
  }
}

// ── Express routes for dialer webhooks ──
function initDialerRoutes(app) {
  // Bland.ai webhook
  app.post('/dialer/webhook', async (req, res) => {
    console.log('[DIALER] Webhook received:', JSON.stringify(req.body).substring(0, 500));
    try {
      const result = await handleCallResult(req.body);
      res.json(result);
    } catch (err) {
      console.error('[DIALER] Webhook error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  console.log('[DIALER] Webhook ready at /dialer/webhook');
}

module.exports = {
  dialLead,
  generateCallScript,
  handleCallResult,
  getCallHistory,
  initDialerRoutes,
};
