const brain = require('../core/brain');
const db = require('../db/queries');
const { logToDiscord } = require('./discord');

function initSMS(app) {
  app.post('/sms', async (req, res) => {
    const from = req.body.From;
    const body = req.body.Body;
    const userId = 'sms_' + from;
    console.log('[SMS] ' + from + ': ' + body);
    try {
      const tenant = await db.getDefaultTenant();
      if (!tenant) return res.type('text/xml').send('<Response></Response>');
      const reply = await brain.chat(tenant.id, userId, 'sms', body, null);
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        const twilio = require('twilio');
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
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
