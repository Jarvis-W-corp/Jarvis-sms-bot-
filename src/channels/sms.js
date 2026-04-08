const brain = require('../core/brain');
const db = require('../db/queries');
const { logToDiscord } = require('./discord');

let twilioClient = null;

function getTwilioClient() {
  if (!twilioClient && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const twilio = require('twilio');
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

function initSMS(app) {
  // Twilio signature verification
  app.post('/sms', (req, res, next) => {
    if (!process.env.TWILIO_AUTH_TOKEN) return next();
    const twilio = require('twilio');
    const sig = req.headers['x-twilio-signature'];
    const url = (process.env.RENDER_EXTERNAL_URL || 'https://jarvis-sms-bot.onrender.com') + '/sms';
    if (!sig || !twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, sig, url, req.body)) {
      console.log('[SMS] Invalid Twilio signature — rejected');
      return res.status(403).send('Forbidden');
    }
    next();
  });
  app.post('/sms', async (req, res) => {
    const from = req.body.From;
    const body = req.body.Body;
    const userId = 'sms_' + from;
    console.log('[SMS] ' + from + ': ' + body);
    try {
      const tenant = await db.getDefaultTenant();
      if (!tenant) return res.type('text/xml').send('<Response></Response>');
      const reply = await brain.chat(tenant.id, userId, 'sms', body, null);
      const client = getTwilioClient();
      if (client) {
        await client.messages.create({ body: reply, from: process.env.TWILIO_PHONE_NUMBER, to: from });
      }
      logToDiscord('customer-logs', '💬 **SMS** | ' + from + '\n**User:** ' + body + '\n**Jarvis:** ' + reply);
      res.type('text/xml').send('<Response></Response>');
    } catch (error) {
      console.error('[SMS] Error:', error.message);
      res.type('text/xml').send('<Response></Response>');
    }
  });
  console.log('[SMS] Twilio webhook ready at /sms');
}

module.exports = { initSMS };
