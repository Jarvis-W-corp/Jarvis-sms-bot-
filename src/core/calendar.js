// calendar.js — Google Calendar integration for appointment management
// Uses same OAuth flow as gmail.js (getAuthForTenant)

const { google } = require('googleapis');
const { supabase } = require('../db/supabase');
const { getAuthForTenant } = require('./gmail');
const { logToDiscord } = require('../channels/discord');

const TIMEZONE = 'America/New_York';

// ── Get Calendar client for tenant ──
async function getCalendarClient(tenantId) {
  const auth = await getAuthForTenant(tenantId);
  return google.calendar({ version: 'v3', auth });
}

// ── Create Appointment ──
// Creates Google Calendar event + stores in DB appointments table
async function createAppointment(tenantId, lead, scheduledAt, durationMin = 30, notes = '') {
  const calendar = await getCalendarClient(tenantId);

  const startTime = new Date(scheduledAt);
  const endTime = new Date(startTime.getTime() + durationMin * 60 * 1000);

  const event = {
    summary: `Appointment: ${lead.name || 'Lead'} - ${lead.company || 'N/A'}`,
    description: [
      `Lead: ${lead.name || 'Unknown'}`,
      `Phone: ${lead.phone || 'N/A'}`,
      `Score: ${lead.score || 'N/A'}`,
      `Source: ${lead.source || 'N/A'}`,
      `Notes: ${notes}`,
    ].join('\n'),
    start: { dateTime: startTime.toISOString(), timeZone: TIMEZONE },
    end: { dateTime: endTime.toISOString(), timeZone: TIMEZONE },
    attendees: lead.email ? [{ email: lead.email }] : [],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 1440 },
        { method: 'popup', minutes: 60 },
      ],
    },
  };

  let calendarEvent;
  try {
    const res = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      sendUpdates: lead.email ? 'all' : 'none',
    });
    calendarEvent = res.data;
    console.log('[CALENDAR] Created event: ' + calendarEvent.id);
  } catch (err) {
    console.error('[CALENDAR] Google Calendar insert error:', err.message);
    // Still store in DB even if Google Calendar fails
    calendarEvent = { id: null };
  }

  // Store in DB
  try {
    const { data: appointment } = await supabase.from('appointments').insert({
      tenant_id: tenantId,
      lead_id: lead.id,
      scheduled_at: startTime.toISOString(),
      duration_min: durationMin,
      status: 'scheduled',
      calendar_event_id: calendarEvent.id || null,
      notes,
    }).select().single();

    return { appointment, calendarEvent };
  } catch (err) {
    console.error('[CALENDAR] DB insert error:', err.message);
    throw err;
  }
}

// ── Get Upcoming Appointments ──
async function getUpcomingAppointments(tenantId, hoursAhead = 24) {
  try {
    const now = new Date().toISOString();
    const cutoff = new Date(Date.now() + hoursAhead * 60 * 60 * 1000).toISOString();

    const { data } = await supabase
      .from('appointments')
      .select('*, leads(name, email, phone, company, score)')
      .eq('tenant_id', tenantId)
      .eq('status', 'scheduled')
      .gte('scheduled_at', now)
      .lte('scheduled_at', cutoff)
      .order('scheduled_at', { ascending: true });

    return data || [];
  } catch (err) {
    console.error('[CALENDAR] getUpcoming error:', err.message);
    return [];
  }
}

// ── Cancel Appointment ──
async function cancelAppointment(appointmentId, tenantId) {
  try {
    // Get appointment first
    const { data: appointment } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .eq('tenant_id', tenantId)
      .single();

    if (!appointment) throw new Error('Appointment not found');

    // Delete from Google Calendar
    if (appointment.calendar_event_id) {
      try {
        const calendar = await getCalendarClient(tenantId);
        await calendar.events.delete({
          calendarId: 'primary',
          eventId: appointment.calendar_event_id,
          sendUpdates: 'all',
        });
        console.log('[CALENDAR] Deleted Google event: ' + appointment.calendar_event_id);
      } catch (err) {
        console.error('[CALENDAR] Google delete error:', err.message);
      }
    }

    // Update DB
    const { data: updated } = await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appointmentId)
      .select()
      .single();

    return updated;
  } catch (err) {
    console.error('[CALENDAR] cancel error:', err.message);
    throw err;
  }
}

// ── Reschedule Appointment ──
async function rescheduleAppointment(appointmentId, newTime, tenantId) {
  try {
    const { data: appointment } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .eq('tenant_id', tenantId)
      .single();

    if (!appointment) throw new Error('Appointment not found');

    const newStart = new Date(newTime);
    const newEnd = new Date(newStart.getTime() + appointment.duration_min * 60 * 1000);

    // Update Google Calendar
    if (appointment.calendar_event_id) {
      try {
        const calendar = await getCalendarClient(tenantId);
        await calendar.events.patch({
          calendarId: 'primary',
          eventId: appointment.calendar_event_id,
          sendUpdates: 'all',
          resource: {
            start: { dateTime: newStart.toISOString(), timeZone: TIMEZONE },
            end: { dateTime: newEnd.toISOString(), timeZone: TIMEZONE },
          },
        });
        console.log('[CALENDAR] Rescheduled Google event: ' + appointment.calendar_event_id);
      } catch (err) {
        console.error('[CALENDAR] Google reschedule error:', err.message);
      }
    }

    // Update DB
    const { data: updated } = await supabase
      .from('appointments')
      .update({
        scheduled_at: newStart.toISOString(),
        status: 'rescheduled',
        reminder_24h_sent: false,
        reminder_1h_sent: false,
      })
      .eq('id', appointmentId)
      .select()
      .single();

    return updated;
  } catch (err) {
    console.error('[CALENDAR] reschedule error:', err.message);
    throw err;
  }
}

// ── Check No-Shows ──
// Find appointments where scheduled_at is past, status still 'scheduled', mark as no_show
async function checkNoShows(tenantId) {
  try {
    const now = new Date().toISOString();

    const { data: overdue } = await supabase
      .from('appointments')
      .select('*, leads(name, phone, email)')
      .eq('tenant_id', tenantId)
      .eq('status', 'scheduled')
      .lt('scheduled_at', now);

    if (!overdue || overdue.length === 0) return [];

    const ids = overdue.map(a => a.id);
    await supabase
      .from('appointments')
      .update({ status: 'no_show' })
      .in('id', ids);

    // Log activities for each no-show
    const activities = overdue.map(a => ({
      tenant_id: tenantId,
      lead_id: a.lead_id,
      type: 'note',
      data: { message: 'No-show for appointment at ' + a.scheduled_at },
    }));

    if (activities.length > 0) {
      await supabase.from('activities').insert(activities);
    }

    console.log('[CALENDAR] Marked ' + overdue.length + ' no-shows');
    return overdue;
  } catch (err) {
    console.error('[CALENDAR] checkNoShows error:', err.message);
    return [];
  }
}

// ── Send Reminders ──
// Find appointments in next 24h/1h, send SMS reminders, mark sent
async function sendReminders(tenantId) {
  const results = { sent24h: 0, sent1h: 0, errors: [] };

  try {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in1h = new Date(now.getTime() + 60 * 60 * 1000);

    // 24-hour reminders
    const { data: due24h } = await supabase
      .from('appointments')
      .select('*, leads(name, phone, email, company)')
      .eq('tenant_id', tenantId)
      .eq('status', 'scheduled')
      .eq('reminder_24h_sent', false)
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', in24h.toISOString());

    for (const appt of (due24h || [])) {
      if (!appt.leads?.phone) continue;
      try {
        const time = new Date(appt.scheduled_at).toLocaleString('en-US', {
          timeZone: TIMEZONE, weekday: 'short', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit',
        });
        const msg = `Hey ${appt.leads.name || 'there'}! Just a reminder — you have an appointment tomorrow at ${time}. Reply CANCEL to cancel or RESCHEDULE to change the time.`;
        await sendSMS(appt.leads.phone, msg);
        await supabase.from('appointments').update({ reminder_24h_sent: true }).eq('id', appt.id);
        results.sent24h++;
      } catch (err) {
        results.errors.push({ appointmentId: appt.id, error: err.message });
      }
    }

    // 1-hour reminders
    const { data: due1h } = await supabase
      .from('appointments')
      .select('*, leads(name, phone, email, company)')
      .eq('tenant_id', tenantId)
      .eq('status', 'scheduled')
      .eq('reminder_1h_sent', false)
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', in1h.toISOString());

    for (const appt of (due1h || [])) {
      if (!appt.leads?.phone) continue;
      try {
        const time = new Date(appt.scheduled_at).toLocaleString('en-US', {
          timeZone: TIMEZONE, hour: 'numeric', minute: '2-digit',
        });
        const msg = `Hi ${appt.leads.name || 'there'}! Your appointment is coming up at ${time} — about an hour from now. See you soon!`;
        await sendSMS(appt.leads.phone, msg);
        await supabase.from('appointments').update({ reminder_1h_sent: true }).eq('id', appt.id);
        results.sent1h++;
      } catch (err) {
        results.errors.push({ appointmentId: appt.id, error: err.message });
      }
    }

    console.log('[CALENDAR] Reminders sent — 24h: ' + results.sent24h + ', 1h: ' + results.sent1h);
    return results;
  } catch (err) {
    console.error('[CALENDAR] sendReminders error:', err.message);
    return results;
  }
}

// ── Book From Call ──
// Full booking flow: create appointment + send confirmation SMS + email + log activity + ping Discord
// Target: under 3 seconds
async function bookFromCall(tenantId, lead, dateTime) {
  const startTime = Date.now();

  // Step 1: Create the appointment (includes Google Calendar)
  const { appointment, calendarEvent } = await createAppointment(tenantId, lead, dateTime, 30, 'Booked from phone call');

  const timeStr = new Date(dateTime).toLocaleString('en-US', {
    timeZone: TIMEZONE, weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

  // Steps 2-5 in parallel for speed
  const tasks = [];

  // Send confirmation SMS
  if (lead.phone) {
    tasks.push(
      sendSMS(lead.phone, `You're all set, ${lead.name || 'friend'}! Your appointment is booked for ${timeStr}. We'll send you a reminder before. Reply HELP for questions.`)
        .catch(err => console.error('[CALENDAR] Confirm SMS error:', err.message))
    );
  }

  // Send confirmation email
  if (lead.email) {
    const gmail = require('./gmail');
    tasks.push(
      gmail.sendEmail(lead.email, `Appointment Confirmed — ${timeStr}`,
        `Hi ${lead.name || 'there'},\n\nYour appointment has been confirmed for ${timeStr}.\n\nDetails:\n- Date: ${timeStr}\n- Duration: 30 minutes\n\nIf you need to reschedule or cancel, just reply to this email or call us.\n\nSee you then!`,
        tenantId
      ).catch(err => console.error('[CALENDAR] Confirm email error:', err.message))
    );
  }

  // Log activity
  tasks.push(
    supabase.from('activities').insert({
      tenant_id: tenantId,
      lead_id: lead.id,
      type: 'appointment_booked',
      data: {
        appointment_id: appointment.id,
        scheduled_at: dateTime,
        source: 'phone_call',
        calendar_event_id: calendarEvent?.id || null,
      },
    }).then(() => {}).catch(err => console.error('[CALENDAR] Activity log error:', err.message))
  );

  // Update lead status
  tasks.push(
    supabase.from('leads').update({ status: 'appointment' }).eq('id', lead.id)
      .then(() => {}).catch(err => console.error('[CALENDAR] Lead status error:', err.message))
  );

  // Ping Discord
  tasks.push(
    Promise.resolve().then(() => {
      logToDiscord('customer-logs',
        `📅 **Appointment Booked**\n` +
        `**Lead:** ${lead.name || 'Unknown'} (${lead.phone || 'no phone'})\n` +
        `**Time:** ${timeStr}\n` +
        `**Source:** Phone call\n` +
        `**Score:** ${lead.score || 'N/A'}`
      );
    }).catch(err => console.error('[CALENDAR] Discord ping error:', err.message))
  );

  await Promise.all(tasks);

  const elapsed = Date.now() - startTime;
  console.log('[CALENDAR] bookFromCall completed in ' + elapsed + 'ms');

  return {
    appointment,
    calendarEvent,
    confirmationSent: true,
    elapsed: elapsed + 'ms',
  };
}

// ── Helper: Send SMS via Twilio ──
async function sendSMS(phone, message) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.log('[CALENDAR] SMS skipped (no Twilio creds): ' + message.substring(0, 50));
    return;
  }
  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const formatted = phone.startsWith('+') ? phone : '+1' + phone.replace(/\D/g, '');
  await client.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: formatted,
  });
}

module.exports = {
  createAppointment,
  getUpcomingAppointments,
  cancelAppointment,
  rescheduleAppointment,
  checkNoShows,
  sendReminders,
  bookFromCall,
};
