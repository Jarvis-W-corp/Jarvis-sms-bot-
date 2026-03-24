const { supabase } = require('../db/supabase');
const enerflo = require('./enerflo');
const { sendBossMessage, logToDiscord } = require('../channels/discord');

// Drip campaign config
const DRIP_STAGES = [
  { day: 2, type: 'sms', template: 'followup_1' },
  { day: 5, type: 'sms', template: 'followup_2' },
  { day: 8, type: 'email', template: 'value_add' },
  { day: 14, type: 'sms', template: 'check_in' },
  { day: 21, type: 'email', template: 'last_chance' },
];

// Milestones that mean the deal is still early / needs nurturing
const EARLY_MILESTONES = ['Site Survey', 'New Project', 'Document Review', 'Unknown'];

// Templates — personalized with customer name + city
const TEMPLATES = {
  followup_1: (name) =>
    `Hi ${name}, this is Mark from Ion Solar Pros! Just following up on your solar consultation. Do you have any questions I can help with? I'm here whenever you're ready.`,
  followup_2: (name) =>
    `Hey ${name}! Wanted to make sure you saw the proposal we put together for you. CT solar incentives are really strong right now — happy to walk through the numbers whenever works for you.`,
  value_add: (name) =>
    `Hi ${name},\n\nJust a quick note — Connecticut homeowners are saving an average of 40-60% on electricity with solar right now, and the federal tax credit is still at 30%.\n\nI put together a custom proposal for your home and would love to review it with you. When works best for a quick 10-minute call?\n\nBest,\nMark Palmiero\nIon Solar Pros\n(203) 893-0894`,
  check_in: (name) =>
    `Hi ${name}, it's Mark from Ion Solar Pros. Just checking in — are you still interested in going solar? If timing isn't right, no worries at all. Just let me know!`,
  last_chance: (name) =>
    `Hi ${name},\n\nI wanted to reach out one more time about your solar project. The current CT incentives and 30% federal tax credit make this one of the best times to go solar.\n\nIf you'd like to move forward or have any questions at all, I'm just a call or text away at (203) 893-0894.\n\nAll the best,\nMark Palmiero\nIon Solar Pros`,
};

function getMessage(template, customerName) {
  const firstName = (customerName || 'there').split(' ')[0];
  const fn = TEMPLATES[template];
  return fn ? fn(firstName) : null;
}

// ── Drip State Management ──

async function getDripState(installId) {
  const { data } = await supabase
    .from('drip_campaigns')
    .select('*')
    .eq('install_id', installId)
    .single();
  return data;
}

async function upsertDripState(state) {
  const { data } = await supabase
    .from('drip_campaigns')
    .upsert(state, { onConflict: 'install_id' })
    .select()
    .single();
  return data;
}

let tableReady = false;

async function ensureTable() {
  if (tableReady) return true;
  const { error } = await supabase.from('drip_campaigns').select('id').limit(1);
  if (error) {
    console.error('[DRIP] drip_campaigns table not found. Run this SQL in Supabase SQL Editor:');
    console.error(`
CREATE TABLE drip_campaigns (
  id BIGSERIAL PRIMARY KEY,
  install_id BIGINT UNIQUE NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  status TEXT DEFAULT 'active',
  drip_stage INT DEFAULT 0,
  last_drip_at TIMESTAMPTZ,
  next_drip_at TIMESTAMPTZ,
  messages_sent INT DEFAULT 0,
  opted_out BOOLEAN DEFAULT FALSE,
  milestone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE drip_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON drip_campaigns FOR ALL USING (true) WITH CHECK (true);
    `);
    return false;
  }
  tableReady = true;
  return true;
}

// ── Pipeline Monitor ──

async function monitorPipeline() {
  try {
    const ready = await ensureTable();
    if (!ready) {
      console.log('[DRIP] Skipping monitor — table not created yet');
      return;
    }
    console.log('[DRIP] Running pipeline monitor...');
    const raw = await enerflo.getAllInstalls();
    if (!raw.length) {
      console.log('[DRIP] No installs found');
      return;
    }

    const installs = raw.map(enerflo.parseInstall);
    const now = new Date();
    let newDrips = 0;
    let alertMessages = [];

    for (const install of installs) {
      // Only drip on active deals in early milestones
      if (install.status !== 'Active') continue;
      if (!EARLY_MILESTONES.includes(install.milestone)) continue;
      if (!install.customerPhone && !install.customerEmail) continue;

      const existing = await getDripState(install.id);

      if (!existing) {
        // New deal — start drip campaign
        const firstDrip = new Date(now.getTime() + DRIP_STAGES[0].day * 24 * 60 * 60 * 1000);
        await upsertDripState({
          install_id: install.id,
          customer_name: install.customerName,
          customer_phone: install.customerPhone,
          customer_email: install.customerEmail,
          status: 'active',
          drip_stage: 0,
          next_drip_at: firstDrip.toISOString(),
          milestone: install.milestone,
          messages_sent: 0,
          opted_out: false,
        });
        newDrips++;
        continue;
      }

      // Skip opted-out or paused
      if (existing.opted_out || existing.status !== 'active') continue;

      // Update milestone if changed
      if (existing.milestone !== install.milestone) {
        // Deal progressed past early stage — pause drip
        if (!EARLY_MILESTONES.includes(install.milestone)) {
          await upsertDripState({
            ...existing,
            status: 'converted',
            milestone: install.milestone,
            updated_at: now.toISOString(),
          });
          alertMessages.push('**' + install.customerName + '** advanced to **' + install.milestone + '** — drip paused');
          continue;
        }
        await upsertDripState({
          ...existing,
          milestone: install.milestone,
          updated_at: now.toISOString(),
        });
      }

      // Check if it's time to send next drip
      if (existing.next_drip_at && new Date(existing.next_drip_at) <= now) {
        const stage = existing.drip_stage || 0;
        if (stage >= DRIP_STAGES.length) {
          // All drips sent — mark completed
          await upsertDripState({
            ...existing,
            status: 'completed',
            updated_at: now.toISOString(),
          });
          alertMessages.push('**' + install.customerName + '** — drip campaign completed (all ' + DRIP_STAGES.length + ' messages sent, no conversion)');
          continue;
        }

        const dripConfig = DRIP_STAGES[stage];
        const message = getMessage(dripConfig.template, install.customerName);

        if (message) {
          let sent = false;
          if (dripConfig.type === 'sms' && install.customerPhone) {
            sent = await sendDripSMS(install.customerPhone, message);
          } else if (dripConfig.type === 'email' && install.customerEmail) {
            sent = await sendDripEmail(install.customerEmail, install.customerName, dripConfig.template, message);
          } else if (install.customerPhone) {
            // Fallback to SMS if email not available
            sent = await sendDripSMS(install.customerPhone, message);
          }

          if (sent) {
            const nextStage = stage + 1;
            const nextDripAt = nextStage < DRIP_STAGES.length
              ? new Date(now.getTime() + (DRIP_STAGES[nextStage].day - dripConfig.day) * 24 * 60 * 60 * 1000)
              : null;

            await upsertDripState({
              ...existing,
              drip_stage: nextStage,
              last_drip_at: now.toISOString(),
              next_drip_at: nextDripAt ? nextDripAt.toISOString() : null,
              messages_sent: (existing.messages_sent || 0) + 1,
              updated_at: now.toISOString(),
            });

            alertMessages.push('Sent ' + dripConfig.type.toUpperCase() + ' to **' + install.customerName + '** (stage ' + (stage + 1) + '/' + DRIP_STAGES.length + ')');
          }
        }
      }
    }

    // Also check for deals that went stale with no drip (cancelled, etc.)
    const staleDeals = installs.filter(i => {
      if (i.status !== 'Active') return false;
      if (i.projectAge < 7) return false; // give 7 days before alerting
      return EARLY_MILESTONES.includes(i.milestone);
    });

    // Send consolidated alert to Mark
    if (newDrips > 0 || alertMessages.length > 0) {
      let alert = '**Pipeline Monitor**\n\n';
      if (newDrips > 0) alert += 'Started **' + newDrips + '** new drip campaigns\n';
      if (alertMessages.length > 0) alert += '\n' + alertMessages.map(m => '> ' + m).join('\n');
      await sendBossMessage(alert);
      logToDiscord('pipeline-alerts', alert);
    }

    console.log('[DRIP] Monitor complete. New drips: ' + newDrips + ', actions: ' + alertMessages.length);
  } catch (error) {
    console.error('[DRIP] Monitor error:', error.message);
  }
}

// ── Send Functions ──

async function sendDripSMS(phone, message) {
  try {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      console.log('[DRIP] SMS skipped (no Twilio creds): ' + phone);
      return false;
    }
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const formatted = phone.startsWith('+') ? phone : '+1' + phone.replace(/\D/g, '');
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formatted,
    });
    console.log('[DRIP] SMS sent to ' + phone);
    return true;
  } catch (error) {
    console.error('[DRIP] SMS error to ' + phone + ':', error.message);
    return false;
  }
}

async function sendDripEmail(email, name, template, message) {
  try {
    const gmail = require('./gmail');
    const subjects = {
      value_add: 'Your Solar Savings — Quick Update',
      last_chance: 'One Last Thing About Your Solar Project',
    };
    const subject = subjects[template] || 'Following Up — Ion Solar Pros';
    await gmail.sendEmail(email, subject, message);
    console.log('[DRIP] Email sent to ' + email);
    return true;
  } catch (error) {
    console.error('[DRIP] Email error to ' + email + ':', error.message);
    return false;
  }
}

// ── Stats for Dashboard ──

async function getDripStats() {
  try {
    const { data: all } = await supabase.from('drip_campaigns').select('*');
    if (!all) return { active: 0, completed: 0, converted: 0, totalSent: 0, campaigns: [] };

    const active = all.filter(d => d.status === 'active');
    const completed = all.filter(d => d.status === 'completed');
    const converted = all.filter(d => d.status === 'converted');
    const totalSent = all.reduce((sum, d) => sum + (d.messages_sent || 0), 0);

    return {
      active: active.length,
      completed: completed.length,
      converted: converted.length,
      totalSent,
      campaigns: active.slice(0, 20).map(d => ({
        name: d.customer_name,
        stage: d.drip_stage,
        totalStages: DRIP_STAGES.length,
        nextDrip: d.next_drip_at,
        messagesSent: d.messages_sent,
        milestone: d.milestone,
      })),
    };
  } catch (error) {
    console.error('[DRIP] Stats error:', error.message);
    return { active: 0, completed: 0, converted: 0, totalSent: 0, campaigns: [] };
  }
}

module.exports = { monitorPipeline, getDripStats, ensureTable, DRIP_STAGES };
