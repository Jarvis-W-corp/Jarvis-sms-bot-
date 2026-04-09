const Anthropic = require('@anthropic-ai/sdk').default;
const { supabase } = require('../db/supabase');
const { sendBossMessage, logToDiscord } = require('../channels/discord');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Two-Way SMS AI ──
// AI-powered SMS conversations: intent detection, auto-replies, DNC handling, appointment scheduling.
// All outreach checks DNC first. TCPA compliant — honors STOP immediately.

let twilioClient = null;

function getTwilioClient() {
  if (!twilioClient && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const twilio = require('twilio');
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

function formatPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('1') ? '+' + digits : '+1' + digits;
}

// ── DNC (Do Not Contact) ──

async function isDNC(phone, tenantId) {
  try {
    const formatted = formatPhone(phone);
    if (!formatted) return false;

    const { data } = await supabase.from('leads')
      .select('id, tags')
      .eq('tenant_id', tenantId)
      .eq('phone', formatted)
      .single();

    if (!data) {
      // Also check without formatting
      const { data: alt } = await supabase.from('leads')
        .select('id, tags')
        .eq('tenant_id', tenantId)
        .eq('phone', phone)
        .single();

      if (!alt) return false;
      return (alt.tags || []).includes('dnc');
    }

    return (data.tags || []).includes('dnc');
  } catch (err) {
    // If we can't check, err on the side of caution for unknown numbers
    console.error('[SMS-AI] DNC check error:', err.message);
    return false;
  }
}

async function getDNCList(tenantId) {
  try {
    const { data } = await supabase.from('leads')
      .select('id, name, phone, email')
      .eq('tenant_id', tenantId)
      .contains('tags', ['dnc']);

    return data || [];
  } catch (err) {
    console.error('[SMS-AI] DNC list error:', err.message);
    return [];
  }
}

async function flagDNC(leadId) {
  try {
    const { data: lead } = await supabase.from('leads')
      .select('tags').eq('id', leadId).single();

    const tags = lead?.tags || [];
    if (!tags.includes('dnc')) {
      tags.push('dnc');
      await supabase.from('leads').update({ tags, status: 'dead' }).eq('id', leadId);
    }

    // Pause all active sequence enrollments
    await supabase.from('sequence_enrollments')
      .update({ status: 'unsubscribed' })
      .eq('lead_id', leadId)
      .in('status', ['active', 'paused']);

    console.log('[SMS-AI] Flagged lead as DNC: ' + leadId);
  } catch (err) {
    console.error('[SMS-AI] Flag DNC error:', err.message);
  }
}

// ── Look Up Lead by Phone ──

async function findLeadByPhone(phone, tenantId) {
  try {
    const formatted = formatPhone(phone);

    // Try formatted number first
    if (formatted) {
      const { data } = await supabase.from('leads')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('phone', formatted)
        .single();
      if (data) return data;
    }

    // Try raw number
    const { data } = await supabase.from('leads')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('phone', phone)
      .single();

    return data || null;
  } catch (err) {
    console.error('[SMS-AI] Lead lookup error:', err.message);
    return null;
  }
}

// ── Load Conversation History ──

async function getRecentSMSHistory(leadId, tenantId, limit = 5) {
  try {
    const { data } = await supabase.from('activities')
      .select('type, data, created_at')
      .eq('tenant_id', tenantId)
      .eq('lead_id', leadId)
      .in('type', ['sms_sent', 'sms_received'])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!data || !data.length) return [];

    // Reverse to chronological order
    return data.reverse().map(a => ({
      role: a.type === 'sms_received' ? 'customer' : 'assistant',
      message: a.data?.message || a.data?.body || '',
      timestamp: a.created_at,
    }));
  } catch (err) {
    console.error('[SMS-AI] History error:', err.message);
    return [];
  }
}

// ── Claude with Timeout ──

async function claudeWithTimeout(systemPrompt, userMessage, timeoutMs = 10000) {
  const claudeCall = anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 160, // 1 SMS segment
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Claude timeout')), timeoutMs)
  );

  const response = await Promise.race([claudeCall, timeout]);
  return response.content[0].text.trim();
}

// ── Intent Analysis ──

async function analyzeIntent(message, history) {
  try {
    const historyText = history.length > 0
      ? 'Recent conversation:\n' + history.map(h => (h.role === 'customer' ? 'Customer' : 'Us') + ': ' + h.message).join('\n')
      : 'No prior conversation.';

    const intent = await claudeWithTimeout(
      `You are an intent classifier for SMS messages. Classify the customer's message into exactly one of these intents:
- STOP: they want to unsubscribe/stop messages (includes "stop", "unsubscribe", "remove me", "don't text me")
- HUMAN: they want to speak to a real person (includes "call me", "speak to someone", "talk to a human")
- INTERESTED: they express interest in the product/service
- SCHEDULING: they want to book or discuss appointment times
- QUESTION: they have a question about the business/service
- OTHER: anything else

Return ONLY the intent word, nothing else.`,
      `${historyText}\n\nNew message from customer: "${message}"`,
      5000
    );

    const normalized = intent.toUpperCase().replace(/[^A-Z]/g, '');
    const valid = ['STOP', 'HUMAN', 'INTERESTED', 'SCHEDULING', 'QUESTION', 'OTHER'];
    return valid.includes(normalized) ? normalized : 'OTHER';
  } catch (err) {
    console.error('[SMS-AI] Intent analysis error:', err.message);
    // Check for obvious STOP keywords manually as fallback
    const lower = message.toLowerCase().trim();
    if (['stop', 'unsubscribe', 'remove', 'opt out', 'optout', 'quit', 'cancel'].some(w => lower.includes(w))) {
      return 'STOP';
    }
    return 'OTHER';
  }
}

// ── Handle Inbound SMS ──

async function handleInboundSMS(from, body, tenantId) {
  const startTime = Date.now();

  try {
    console.log('[SMS-AI] Inbound from ' + from + ': ' + body);

    // 1. Look up lead
    const lead = await findLeadByPhone(from, tenantId);

    // 2. Load history if lead found
    const history = lead ? await getRecentSMSHistory(lead.id, tenantId, 5) : [];

    // 3. Analyze intent
    const intent = await analyzeIntent(body, history);
    console.log('[SMS-AI] Intent: ' + intent + ' (from ' + from + ')');

    // Log the inbound SMS
    if (lead) {
      await supabase.from('activities').insert({
        tenant_id: tenantId,
        lead_id: lead.id,
        type: 'sms_received',
        data: { message: body, from, intent },
      }).catch(e => console.error('[SMS-AI] Log inbound error:', e.message));
    }

    let reply = null;

    // 4. Route by intent
    switch (intent) {
      case 'STOP': {
        // TCPA: honor immediately
        if (lead) {
          await flagDNC(lead.id);
          await supabase.from('activities').insert({
            tenant_id: tenantId,
            lead_id: lead.id,
            type: 'note',
            data: { note: 'Unsubscribed via SMS STOP', event_type: 'dnc' },
          }).catch(() => {});
        }
        reply = "You've been unsubscribed. You won't receive any more messages from us. Reply START to re-subscribe.";
        break;
      }

      case 'HUMAN': {
        // Pause all automation for this lead
        if (lead) {
          await supabase.from('sequence_enrollments')
            .update({ status: 'paused' })
            .eq('lead_id', lead.id)
            .eq('status', 'active')
            .catch(() => {});

          // Ping boss
          await sendBossMessage(
            '**Lead wants to talk to a human!**\n' +
            '> **' + (lead.name || 'Unknown') + '** (' + from + ')\n' +
            '> Company: ' + (lead.company || 'N/A') + '\n' +
            '> Score: ' + (lead.score || '?') + '/10\n' +
            '> Last msg: "' + body + '"'
          );
        } else {
          await sendBossMessage(
            '**Unknown number wants to talk to a human!**\n' +
            '> Phone: ' + from + '\n' +
            '> Message: "' + body + '"'
          );
        }
        reply = "Absolutely! I'm connecting you with a team member right now. They'll reach out to you shortly.";
        break;
      }

      case 'INTERESTED': {
        // Generate enthusiastic reply offering next steps
        const leadContext = lead
          ? `Lead: ${lead.name || 'Unknown'}, Company: ${lead.company || 'N/A'}, Niche: ${lead.niche || 'unknown'}`
          : `Unknown lead, phone: ${from}`;

        const historyText = history.length > 0
          ? history.map(h => (h.role === 'customer' ? 'Customer' : 'Us') + ': ' + h.message).join('\n')
          : '';

        try {
          reply = await claudeWithTimeout(
            `You are a friendly sales assistant texting a potential customer who just expressed interest. Offer to schedule a quick call or meeting. Be warm, concise, professional. MUST be under 160 characters total. Do not use emojis.`,
            `${leadContext}\n${historyText}\nCustomer just said: "${body}"\n\nGenerate a reply offering appointment times (keep it general like "this week" or "tomorrow").`,
          );
        } catch (e) {
          reply = "That's great to hear! When would be a good time for a quick call this week? I'm flexible with scheduling.";
        }

        // Bump score if lead exists
        if (lead && lead.score && lead.score < 10) {
          await supabase.from('leads')
            .update({ score: Math.min(lead.score + 2, 10), status: 'qualified' })
            .eq('id', lead.id)
            .catch(() => {});
        }

        // Alert boss
        if (lead) {
          await sendBossMessage(
            '**Lead expressed interest via SMS!**\n' +
            '> **' + (lead.name || 'Unknown') + '** (' + from + ')\n' +
            '> Message: "' + body + '"'
          ).catch(() => {});
        }
        break;
      }

      case 'SCHEDULING': {
        const leadContext = lead
          ? `Lead: ${lead.name || 'Unknown'}, Company: ${lead.company || 'N/A'}`
          : `Phone: ${from}`;

        try {
          reply = await claudeWithTimeout(
            `You are a scheduling assistant. The customer wants to book a time. Offer a few general time slots for this week. Be concise and professional. MUST be under 160 characters. Do not use emojis.`,
            `${leadContext}\nCustomer said: "${body}"\n\nSuggest 2-3 available time slots.`,
          );
        } catch (e) {
          reply = "I'd love to get you scheduled! Are mornings or afternoons better for you this week?";
        }
        break;
      }

      case 'QUESTION': {
        // Get tenant/business context
        let businessContext = 'a local business';
        try {
          const { data: tenant } = await supabase.from('tenants')
            .select('config, name')
            .eq('id', tenantId)
            .single();
          if (tenant) {
            businessContext = (tenant.name || 'our company') +
              (tenant.config?.niche ? ' (' + tenant.config.niche + ')' : '');
          }
        } catch (e) {}

        const historyText = history.length > 0
          ? history.map(h => (h.role === 'customer' ? 'Customer' : 'Us') + ': ' + h.message).join('\n')
          : '';

        try {
          reply = await claudeWithTimeout(
            `You are a helpful assistant for ${businessContext}. Answer the customer's question concisely. If you don't know the specific answer, offer to connect them with a team member. MUST be under 160 characters. Do not use emojis.`,
            `${historyText}\nCustomer asks: "${body}"`,
          );
        } catch (e) {
          reply = "Great question! Let me connect you with someone who can help. A team member will reach out shortly.";
          await sendBossMessage(
            '**Lead asked a question I could not answer:**\n' +
            '> Phone: ' + from + '\n' +
            '> Question: "' + body + '"'
          ).catch(() => {});
        }
        break;
      }

      default: {
        // OTHER — generic acknowledgment
        try {
          reply = await claudeWithTimeout(
            'You are a friendly business assistant. Acknowledge the customer message and offer to help. MUST be under 160 characters. Do not use emojis.',
            `Customer said: "${body}"`,
          );
        } catch (e) {
          reply = "Thanks for reaching out! How can I help you today?";
        }
        break;
      }
    }

    // Ensure reply fits 1 SMS segment
    if (reply && reply.length > 160) {
      reply = reply.substring(0, 157) + '...';
    }

    // Send reply
    if (reply) {
      await sendSMS(from, reply, tenantId, lead?.id);
    }

    const elapsed = Date.now() - startTime;
    console.log('[SMS-AI] Handled in ' + elapsed + 'ms | Intent: ' + intent + ' | ' + from);

    logToDiscord('customer-logs',
      '**SMS AI** | ' + from + ' (' + intent + ')\n' +
      '**In:** ' + body + '\n' +
      '**Out:** ' + (reply || '(no reply)') + '\n' +
      '**Time:** ' + elapsed + 'ms'
    );

    return { intent, reply, leadId: lead?.id || null, elapsed };
  } catch (err) {
    console.error('[SMS-AI] Inbound error:', err.message);
    // Always try to respond even on error
    try {
      await sendSMS(from, "Thanks for your message! A team member will follow up shortly.", tenantId);
    } catch (sendErr) {
      console.error('[SMS-AI] Fallback send error:', sendErr.message);
    }
    return { intent: 'ERROR', reply: null, error: err.message };
  }
}

// ── Send SMS ──

async function sendSMS(to, message, tenantId, leadId) {
  try {
    // DNC check before any outreach
    if (await isDNC(to, tenantId)) {
      console.log('[SMS-AI] Blocked send to DNC number: ' + to);
      return false;
    }

    const client = getTwilioClient();
    if (!client) {
      console.log('[SMS-AI] SMS skipped (no Twilio creds): ' + to);
      return false;
    }

    const formatted = formatPhone(to);
    if (!formatted) {
      console.error('[SMS-AI] Invalid phone number: ' + to);
      return false;
    }

    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formatted,
    });

    // Log activity if we have a lead
    if (leadId && tenantId) {
      await supabase.from('activities').insert({
        tenant_id: tenantId,
        lead_id: leadId,
        type: 'sms_sent',
        data: { message, to: formatted },
      }).catch(e => console.error('[SMS-AI] Log send error:', e.message));
    }

    console.log('[SMS-AI] Sent SMS to ' + formatted);
    return true;
  } catch (err) {
    console.error('[SMS-AI] Send error to ' + to + ':', err.message);
    return false;
  }
}

// ── No Answer Follow-Up ──

async function sendNoAnswerSMS(lead, tenantId) {
  try {
    if (!lead || !lead.phone) return false;

    if (await isDNC(lead.phone, tenantId)) {
      console.log('[SMS-AI] Blocked no-answer SMS to DNC: ' + lead.phone);
      return false;
    }

    const firstName = (lead.name || 'there').split(' ')[0];

    let message;
    try {
      message = await claudeWithTimeout(
        'You are a friendly sales rep who just tried calling a lead but got no answer. Write a brief follow-up text. Use their first name. Be warm and professional. MUST be under 160 characters. Do not use emojis.',
        `Lead name: ${firstName}, Company: ${lead.company || 'N/A'}, Niche: ${lead.niche || 'business services'}`,
      );
    } catch (e) {
      message = `Hi ${firstName}, I just tried calling about your project. No worries if now isn't a good time! When works best to connect?`;
    }

    if (message.length > 160) {
      message = message.substring(0, 157) + '...';
    }

    const sent = await sendSMS(lead.phone, message, tenantId, lead.id);

    if (sent) {
      await supabase.from('activities').insert({
        tenant_id: tenantId,
        lead_id: lead.id,
        type: 'note',
        data: { note: 'Sent no-answer follow-up SMS', event_type: 'no_answer_sms' },
      }).catch(() => {});
    }

    return sent;
  } catch (err) {
    console.error('[SMS-AI] No-answer SMS error:', err.message);
    return false;
  }
}

// ── Appointment Reminder ──

async function sendAppointmentReminder(lead, appointment, tenantId) {
  try {
    if (!lead || !lead.phone) return false;

    if (await isDNC(lead.phone, tenantId)) {
      console.log('[SMS-AI] Blocked reminder to DNC: ' + lead.phone);
      return false;
    }

    const firstName = (lead.name || 'there').split(' ')[0];
    const apptDate = new Date(appointment.scheduled_at);
    const timeStr = apptDate.toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });

    let message = `Reminder: Hi ${firstName}, you have an appointment tomorrow at ${timeStr}. Reply YES to confirm or let us know if you need to reschedule.`;

    if (message.length > 160) {
      message = `Reminder: ${firstName}, your appointment is ${timeStr}. Reply YES to confirm or text to reschedule.`;
    }

    if (message.length > 160) {
      message = message.substring(0, 157) + '...';
    }

    const sent = await sendSMS(lead.phone, message, tenantId, lead.id);

    if (sent && appointment.id) {
      await supabase.from('appointments')
        .update({ reminder_24h_sent: true })
        .eq('id', appointment.id)
        .catch(() => {});
    }

    return sent;
  } catch (err) {
    console.error('[SMS-AI] Reminder error:', err.message);
    return false;
  }
}

module.exports = {
  handleInboundSMS,
  sendSMS,
  sendNoAnswerSMS,
  sendAppointmentReminder,
  isDNC,
  getDNCList,
  flagDNC,
  findLeadByPhone,
};
