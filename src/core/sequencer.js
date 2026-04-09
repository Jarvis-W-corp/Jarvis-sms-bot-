const Anthropic = require('@anthropic-ai/sdk').default;
const { supabase } = require('../db/supabase');
const gmail = require('./gmail');
const { sendBossMessage, logToDiscord } = require('../channels/discord');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Email Sequencer ──
// Full email sequence engine: create templates, enroll leads, auto-send personalized emails via Claude + Gmail.
// Replaces the basic drip.js with multi-tenant, niche-aware, AI-generated sequences.

// ── Default Sequence Templates ──
const DEFAULT_SEQUENCES = {
  solar: {
    name: 'Solar Outreach — 5 Step',
    steps: [
      { step_num: 1, delay_hours: 0, subject_template: 'Quick question about your energy bills, {name}', body_template: 'Hi {name},\n\nI came across {company} and wanted to reach out. With CT solar incentives at an all-time high and the 30% federal tax credit still available, many homeowners in your area are cutting their electric bills by 40-60%.\n\nWould you be open to a quick 10-minute call to see if solar makes sense for your home?\n\nBest,\n{sender_name}' },
      { step_num: 2, delay_hours: 48, subject_template: 'The numbers on solar for {company}', body_template: 'Hi {name},\n\nJust following up on my last email. I ran some quick numbers — most homes in your area qualify for $0-down solar with immediate savings on day one.\n\nHappy to put together a free custom proposal if you are interested. No pressure either way.\n\nBest,\n{sender_name}' },
      { step_num: 3, delay_hours: 120, subject_template: 'Did you see this, {name}?', body_template: 'Hi {name},\n\nWanted to share something quick — your neighbors are already going solar. The CT Green Bank incentive combined with the federal tax credit means this is genuinely the best time in years.\n\nI would love to show you what the savings look like for your specific home. Worth a 10-minute chat?\n\nBest,\n{sender_name}' },
      { step_num: 4, delay_hours: 240, subject_template: 'Last thought on solar savings', body_template: 'Hi {name},\n\nI know you are busy so I will keep this short. The current solar incentives in CT are set to decrease next year. Locking in now means maximum savings.\n\nIf the timing is not right, totally understand. But if you have 10 minutes this week, I can show you exactly what you would save.\n\nBest,\n{sender_name}' },
      { step_num: 5, delay_hours: 480, subject_template: 'Closing the loop — {name}', body_template: 'Hi {name},\n\nThis will be my last email on this. I did not want you to miss out on the current incentives, but I also respect your time.\n\nIf solar ever comes back on your radar, I am always here. Just reply to this email and we can pick up where we left off.\n\nAll the best,\n{sender_name}' },
    ],
  },
  medspa: {
    name: 'Med Spa Outreach — 5 Step',
    steps: [
      { step_num: 1, delay_hours: 0, subject_template: 'Grow {company} with AI-powered booking', body_template: 'Hi {name},\n\nI noticed {company} and love what you are doing. We help med spas like yours automate appointment booking, follow-ups, and client retention using AI.\n\nOur clients typically see a 30-40% increase in rebookings within the first month.\n\nWould you be open to a quick demo?\n\nBest,\n{sender_name}' },
      { step_num: 2, delay_hours: 48, subject_template: 'Re: AI booking for {company}', body_template: 'Hi {name},\n\nJust circling back. I know running a med spa means juggling a hundred things. That is exactly why our AI assistant handles the repetitive stuff — booking, reminders, follow-ups — so your team can focus on clients.\n\nHappy to show you how it works in 15 minutes. No commitment.\n\nBest,\n{sender_name}' },
      { step_num: 3, delay_hours: 120, subject_template: 'How {company} could save 10+ hours/week', body_template: 'Hi {name},\n\nQuick thought — most med spas we work with were spending 10+ hours per week on manual follow-ups and scheduling before switching to AI automation.\n\nWould love to show you the difference. Free to chat this week?\n\nBest,\n{sender_name}' },
      { step_num: 4, delay_hours: 240, subject_template: 'One more thing for {company}', body_template: 'Hi {name},\n\nI wanted to share a quick case study. A med spa similar to {company} increased their monthly revenue by 25% after automating their client communications.\n\nIf that sounds interesting, I can walk you through exactly how they did it.\n\nBest,\n{sender_name}' },
      { step_num: 5, delay_hours: 480, subject_template: 'Closing the loop — {company}', body_template: 'Hi {name},\n\nThis is my last follow-up. I think there is a real opportunity for {company} with AI automation, but I respect your time.\n\nIf this ever becomes a priority, just reply and we will pick up right where we left off.\n\nAll the best,\n{sender_name}' },
    ],
  },
  ai_workforce: {
    name: 'AI Workforce Outreach — 5 Step',
    steps: [
      { step_num: 1, delay_hours: 0, subject_template: 'Cut costs at {company} with AI automation', body_template: 'Hi {name},\n\nI help businesses like {company} replace repetitive manual work with AI agents — customer support, scheduling, data entry, lead follow-up.\n\nMost clients save 20-40 hours per week and see ROI within the first month.\n\nWorth a quick conversation?\n\nBest,\n{sender_name}' },
      { step_num: 2, delay_hours: 48, subject_template: 'Re: AI automation for {company}', body_template: 'Hi {name},\n\nFollowing up — I know "AI" gets thrown around a lot, so let me be specific. We build custom AI assistants that handle your actual workflows: answering customer questions, booking appointments, qualifying leads, sending follow-ups.\n\nNo generic chatbot. Built for your business.\n\nInterested in a 15-minute demo?\n\nBest,\n{sender_name}' },
      { step_num: 3, delay_hours: 120, subject_template: 'What AI could handle for {company}', body_template: 'Hi {name},\n\nQuick question — how many hours does your team spend each week on tasks that follow a predictable pattern? Phone calls, email replies, scheduling, data entry?\n\nThat is exactly what our AI handles. And it works 24/7 without breaks.\n\nHappy to show you a live demo tailored to {company}.\n\nBest,\n{sender_name}' },
      { step_num: 4, delay_hours: 240, subject_template: 'Real results with AI — case study', body_template: 'Hi {name},\n\nWanted to share a quick win: one of our clients cut their response time from 4 hours to under 30 seconds and increased conversions by 35% — all with an AI assistant we built for them.\n\nI think {company} could see similar results. 15 minutes to find out?\n\nBest,\n{sender_name}' },
      { step_num: 5, delay_hours: 480, subject_template: 'Last note — {name}', body_template: 'Hi {name},\n\nThis is my final follow-up. I genuinely think AI automation could move the needle for {company}, but timing is everything.\n\nWhenever you are ready, just reply to this email. I will be here.\n\nAll the best,\n{sender_name}' },
    ],
  },
};

// ── Create Sequence ──

async function createSequence(tenantId, name, niche, steps) {
  try {
    const { data, error } = await supabase.from('email_sequences').insert({
      tenant_id: tenantId,
      name,
      niche: niche || null,
      steps,
      status: 'active',
    }).select().single();

    if (error) throw error;
    console.log('[SEQ] Created sequence: ' + name + ' (' + steps.length + ' steps)');
    return data;
  } catch (err) {
    console.error('[SEQ] Create error:', err.message);
    return null;
  }
}

// ── Generate Sequence via Claude ──

async function generateSequence(tenantId, niche, businessType, numSteps = 5) {
  try {
    // Check for a matching default first
    const defaultKey = Object.keys(DEFAULT_SEQUENCES).find(k => niche && niche.toLowerCase().includes(k));
    if (defaultKey) {
      const def = DEFAULT_SEQUENCES[defaultKey];
      const seq = await createSequence(tenantId, def.name, niche, def.steps.slice(0, numSteps));
      return seq;
    }

    // Generate custom sequence via Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: `You are an expert email marketing copywriter. Generate a ${numSteps}-step cold outreach email sequence for a ${businessType} business in the ${niche} niche.

Each step should have:
- step_num (1-${numSteps})
- delay_hours (0 for first, then increasing: 48, 120, 240, 480 are good defaults)
- subject_template (use {name} and {company} as placeholders)
- body_template (use {name}, {company}, {sender_name} as placeholders)

Rules:
- First email: introduce value prop, ask for meeting
- Middle emails: social proof, case studies, specific benefits
- Last email: breakup email, respectful close
- Keep subject lines under 60 chars
- Keep bodies under 150 words
- Professional but conversational tone
- No pushy/spammy language

Return ONLY valid JSON array. No markdown wrapping.`,
      messages: [{ role: 'user', content: `Generate a ${numSteps}-step email sequence for ${businessType} in ${niche}.` }],
    });

    let steps = [];
    try {
      let text = response.content[0].text.trim();
      text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      steps = JSON.parse(text);
    } catch (parseErr) {
      console.error('[SEQ] Failed to parse Claude response:', parseErr.message);
      // Fall back to solar template as safe default
      steps = DEFAULT_SEQUENCES.solar.steps.slice(0, numSteps);
    }

    const seq = await createSequence(tenantId, `${niche} — ${businessType} (${numSteps} steps)`, niche, steps);
    return seq;
  } catch (err) {
    console.error('[SEQ] Generate error:', err.message);
    return null;
  }
}

// ── Enroll Lead ──

async function enrollLead(tenantId, leadId, sequenceId) {
  try {
    // Check if already enrolled in this sequence
    const { data: existing } = await supabase.from('sequence_enrollments')
      .select('id, status')
      .eq('lead_id', leadId)
      .eq('sequence_id', sequenceId)
      .in('status', ['active', 'paused'])
      .single();

    if (existing) {
      console.log('[SEQ] Lead already enrolled in sequence: ' + existing.id);
      return existing;
    }

    // Get the sequence to find first step delay
    const { data: sequence } = await supabase.from('email_sequences')
      .select('steps').eq('id', sequenceId).single();

    if (!sequence) {
      console.error('[SEQ] Sequence not found: ' + sequenceId);
      return null;
    }

    const steps = sequence.steps || [];
    const firstStep = steps[0];
    const delayHours = firstStep ? (firstStep.delay_hours || 0) : 0;
    const nextSendAt = new Date(Date.now() + delayHours * 60 * 60 * 1000);

    const { data, error } = await supabase.from('sequence_enrollments').insert({
      tenant_id: tenantId,
      lead_id: leadId,
      sequence_id: sequenceId,
      current_step: 0,
      status: 'active',
      next_send_at: nextSendAt.toISOString(),
    }).select().single();

    if (error) throw error;
    console.log('[SEQ] Enrolled lead ' + leadId + ' in sequence ' + sequenceId);
    return data;
  } catch (err) {
    console.error('[SEQ] Enroll error:', err.message);
    return null;
  }
}

// ── Process Queue (cron: every 30 min) ──

async function processSequenceQueue() {
  try {
    const now = new Date().toISOString();

    // Find all enrollments ready to send
    const { data: due, error } = await supabase.from('sequence_enrollments')
      .select('*, email_sequences(*), leads(*)')
      .eq('status', 'active')
      .lte('next_send_at', now)
      .limit(50);

    if (error) throw error;
    if (!due || !due.length) {
      console.log('[SEQ] No emails due');
      return { sent: 0, errors: 0 };
    }

    console.log('[SEQ] Processing ' + due.length + ' due enrollments');
    let sent = 0;
    let errors = 0;

    for (const enrollment of due) {
      try {
        const sequence = enrollment.email_sequences;
        const lead = enrollment.leads;

        if (!sequence || !lead) {
          console.error('[SEQ] Missing sequence or lead for enrollment ' + enrollment.id);
          errors++;
          continue;
        }

        // Check sequence is still active
        if (sequence.status !== 'active') {
          await supabase.from('sequence_enrollments')
            .update({ status: 'paused' })
            .eq('id', enrollment.id);
          continue;
        }

        const steps = sequence.steps || [];
        const currentStep = enrollment.current_step || 0;

        if (currentStep >= steps.length) {
          // All steps done
          await supabase.from('sequence_enrollments')
            .update({ status: 'completed', next_send_at: null })
            .eq('id', enrollment.id);
          continue;
        }

        const step = steps[currentStep];
        if (!lead.email) {
          console.log('[SEQ] Lead ' + lead.id + ' has no email, skipping');
          errors++;
          continue;
        }

        // Personalize via Claude (cheap: 100 tokens)
        const firstName = (lead.name || 'there').split(' ')[0];
        const company = lead.company || 'your company';
        const senderName = 'Mark'; // TODO: pull from tenant config

        let subject = (step.subject_template || 'Following up')
          .replace(/\{name\}/g, firstName)
          .replace(/\{company\}/g, company)
          .replace(/\{sender_name\}/g, senderName);

        let body = (step.body_template || '')
          .replace(/\{name\}/g, firstName)
          .replace(/\{company\}/g, company)
          .replace(/\{sender_name\}/g, senderName);

        // Use Claude for light personalization if lead has niche/meta data
        if (lead.niche || (lead.meta && Object.keys(lead.meta).length > 0)) {
          try {
            const personalized = await anthropic.messages.create({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 100,
              system: 'Lightly personalize this email body using the lead context. Keep the same structure and length. Return ONLY the updated body text, nothing else.',
              messages: [{
                role: 'user',
                content: `Lead: ${lead.name}, Company: ${company}, Niche: ${lead.niche || 'unknown'}, Location: ${lead.location || 'unknown'}\n\nEmail body:\n${body}`,
              }],
            });
            body = personalized.content[0].text.trim();
          } catch (aiErr) {
            // Personalization failed — use template as-is, no big deal
            console.log('[SEQ] Personalization skipped for ' + lead.email + ': ' + aiErr.message);
          }
        }

        // Send via Gmail
        await gmail.sendEmail(lead.email, subject, body, enrollment.tenant_id);

        // Log activity
        await supabase.from('activities').insert({
          tenant_id: enrollment.tenant_id,
          lead_id: lead.id,
          type: 'email_sent',
          data: {
            sequence_id: sequence.id,
            sequence_name: sequence.name,
            step: currentStep + 1,
            total_steps: steps.length,
            subject,
          },
        });

        // Advance to next step or complete
        const nextStep = currentStep + 1;
        if (nextStep >= steps.length) {
          await supabase.from('sequence_enrollments')
            .update({ current_step: nextStep, status: 'completed', next_send_at: null })
            .eq('id', enrollment.id);
        } else {
          const nextDelay = steps[nextStep].delay_hours || 48;
          const prevDelay = step.delay_hours || 0;
          const deltaHours = nextDelay - prevDelay;
          const nextSendAt = new Date(Date.now() + Math.max(deltaHours, 1) * 60 * 60 * 1000);

          await supabase.from('sequence_enrollments')
            .update({ current_step: nextStep, next_send_at: nextSendAt.toISOString() })
            .eq('id', enrollment.id);
        }

        sent++;
        console.log('[SEQ] Sent step ' + (currentStep + 1) + '/' + steps.length + ' to ' + lead.email);
      } catch (stepErr) {
        console.error('[SEQ] Error processing enrollment ' + enrollment.id + ':', stepErr.message);
        errors++;
      }
    }

    // Alert boss if anything happened
    if (sent > 0) {
      const msg = '**Email Sequencer** — sent ' + sent + ' emails' + (errors > 0 ? ' (' + errors + ' errors)' : '');
      logToDiscord('pipeline-alerts', msg);
    }

    console.log('[SEQ] Queue processed: ' + sent + ' sent, ' + errors + ' errors');
    return { sent, errors };
  } catch (err) {
    console.error('[SEQ] Queue error:', err.message);
    return { sent: 0, errors: 0 };
  }
}

// ── Pause / Resume ──

async function pauseEnrollment(enrollmentId) {
  try {
    const { data, error } = await supabase.from('sequence_enrollments')
      .update({ status: 'paused' })
      .eq('id', enrollmentId)
      .eq('status', 'active')
      .select().single();

    if (error) throw error;
    console.log('[SEQ] Paused enrollment: ' + enrollmentId);
    return data;
  } catch (err) {
    console.error('[SEQ] Pause error:', err.message);
    return null;
  }
}

async function resumeEnrollment(enrollmentId) {
  try {
    const nextSendAt = new Date(Date.now() + 60 * 60 * 1000); // resume in 1 hour

    const { data, error } = await supabase.from('sequence_enrollments')
      .update({ status: 'active', next_send_at: nextSendAt.toISOString() })
      .eq('id', enrollmentId)
      .eq('status', 'paused')
      .select().single();

    if (error) throw error;
    console.log('[SEQ] Resumed enrollment: ' + enrollmentId);
    return data;
  } catch (err) {
    console.error('[SEQ] Resume error:', err.message);
    return null;
  }
}

// ── Status ──

async function getEnrollmentStatus(leadId) {
  try {
    const { data } = await supabase.from('sequence_enrollments')
      .select('*, email_sequences(name, steps)')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!data || !data.length) return null;

    return data.map(e => ({
      enrollment_id: e.id,
      sequence_name: e.email_sequences?.name || 'Unknown',
      current_step: e.current_step,
      total_steps: (e.email_sequences?.steps || []).length,
      status: e.status,
      next_send_at: e.next_send_at,
    }));
  } catch (err) {
    console.error('[SEQ] Status error:', err.message);
    return null;
  }
}

// ── Handle Email Events (open/click/bounce webhooks) ──

async function handleEmailEvent(event) {
  try {
    const { type, email, leadId, tenantId } = event;

    if (!leadId && !email) return;

    // Find the lead
    let lead = null;
    if (leadId) {
      const { data } = await supabase.from('leads').select('*').eq('id', leadId).single();
      lead = data;
    } else if (email && tenantId) {
      const { data } = await supabase.from('leads').select('*').eq('tenant_id', tenantId).eq('email', email).single();
      lead = data;
    }

    if (!lead) {
      console.log('[SEQ] Email event — lead not found for: ' + (email || leadId));
      return;
    }

    const tid = lead.tenant_id;

    switch (type) {
      case 'open':
        // Log activity, bump engagement
        await supabase.from('activities').insert({
          tenant_id: tid, lead_id: lead.id, type: 'note',
          data: { note: 'Opened email', event_type: 'email_open' },
        });
        // Bump score by 1 (max 10)
        if (lead.score && lead.score < 10) {
          await supabase.from('leads').update({ score: Math.min(lead.score + 1, 10) }).eq('id', lead.id);
        }
        break;

      case 'click':
        // Higher engagement signal
        await supabase.from('activities').insert({
          tenant_id: tid, lead_id: lead.id, type: 'note',
          data: { note: 'Clicked link in email', event_type: 'email_click' },
        });
        if (lead.score && lead.score < 10) {
          await supabase.from('leads').update({ score: Math.min(lead.score + 2, 10) }).eq('id', lead.id);
        }
        break;

      case 'bounce':
        // Bad email — log and pause sequences
        await supabase.from('activities').insert({
          tenant_id: tid, lead_id: lead.id, type: 'note',
          data: { note: 'Email bounced', event_type: 'email_bounce' },
        });
        // Pause all active enrollments for this lead
        await supabase.from('sequence_enrollments')
          .update({ status: 'paused' })
          .eq('lead_id', lead.id)
          .eq('status', 'active');
        break;

      case 'reply':
        // Lead replied — pause sequence, alert boss
        await supabase.from('activities').insert({
          tenant_id: tid, lead_id: lead.id, type: 'note',
          data: { note: 'Replied to sequence email', event_type: 'email_reply' },
        });
        // Pause all sequences for this lead
        await supabase.from('sequence_enrollments')
          .update({ status: 'paused' })
          .eq('lead_id', lead.id)
          .eq('status', 'active');
        // Bump score significantly
        if (lead.score) {
          await supabase.from('leads').update({ score: Math.min(lead.score + 3, 10) }).eq('id', lead.id);
        }
        // Alert boss
        await sendBossMessage('**Lead replied to sequence email!**\n' +
          '> **' + (lead.name || 'Unknown') + '** (' + (lead.email || 'no email') + ')\n' +
          '> Company: ' + (lead.company || 'N/A') + '\n' +
          '> Score: ' + (lead.score || '?') + '/10');
        break;

      default:
        console.log('[SEQ] Unknown email event type: ' + type);
    }
  } catch (err) {
    console.error('[SEQ] Email event error:', err.message);
  }
}

// ── Seed Default Sequences ──

async function seedDefaultSequences(tenantId) {
  try {
    for (const [key, def] of Object.entries(DEFAULT_SEQUENCES)) {
      const { data: existing } = await supabase.from('email_sequences')
        .select('id').eq('tenant_id', tenantId).eq('niche', key).limit(1);

      if (existing && existing.length > 0) continue;

      await createSequence(tenantId, def.name, key, def.steps);
      console.log('[SEQ] Seeded default sequence: ' + def.name);
    }
  } catch (err) {
    console.error('[SEQ] Seed error:', err.message);
  }
}

// ── Stats for Dashboard ──

async function getSequenceStats(tenantId) {
  try {
    const { data: sequences } = await supabase.from('email_sequences').select('*').eq('tenant_id', tenantId);
    const { data: enrollments } = await supabase.from('sequence_enrollments').select('*').eq('tenant_id', tenantId);

    const seqs = sequences || [];
    const enrs = enrollments || [];

    return {
      total_sequences: seqs.length,
      active_sequences: seqs.filter(s => s.status === 'active').length,
      total_enrollments: enrs.length,
      active_enrollments: enrs.filter(e => e.status === 'active').length,
      completed_enrollments: enrs.filter(e => e.status === 'completed').length,
      paused_enrollments: enrs.filter(e => e.status === 'paused').length,
      sequences: seqs.map(s => ({
        id: s.id,
        name: s.name,
        niche: s.niche,
        steps: (s.steps || []).length,
        status: s.status,
        enrolled: enrs.filter(e => e.sequence_id === s.id).length,
        active: enrs.filter(e => e.sequence_id === s.id && e.status === 'active').length,
      })),
    };
  } catch (err) {
    console.error('[SEQ] Stats error:', err.message);
    return { total_sequences: 0, active_sequences: 0, total_enrollments: 0, active_enrollments: 0, completed_enrollments: 0, paused_enrollments: 0, sequences: [] };
  }
}

module.exports = {
  createSequence,
  generateSequence,
  enrollLead,
  processSequenceQueue,
  pauseEnrollment,
  resumeEnrollment,
  getEnrollmentStatus,
  handleEmailEvent,
  seedDefaultSequences,
  getSequenceStats,
  DEFAULT_SEQUENCES,
};
