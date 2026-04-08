const Anthropic = require('@anthropic-ai/sdk').default;
const { supabase } = require('../db/supabase');
const memory = require('./memory');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Jarvis Voice Engine ──
// Twilio Voice + ElevenLabs = Jarvis can make and receive phone calls
// Inbound: answers calls, handles FAQs, books appointments
// Outbound: cold calls leads, qualifies, transfers or books

// ── ElevenLabs Text-to-Speech ──
async function textToSpeech(text, voiceId) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');

  const voice = voiceId || process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB'; // Default: Adam
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) throw new Error('ElevenLabs error: ' + res.status);
  return Buffer.from(await res.arrayBuffer());
}

// ── Send Voice Memo via Discord ──
async function sendVoiceMemo(message, discordChannel) {
  try {
    const audio = await textToSpeech(message);
    const fs = require('fs');
    const path = '/tmp/jarvis_voice_' + Date.now() + '.mp3';
    fs.writeFileSync(path, audio);

    if (discordChannel) {
      const { AttachmentBuilder } = require('discord.js');
      const attachment = new AttachmentBuilder(path, { name: 'jarvis_voice.mp3' });
      await discordChannel.send({ content: '🎙️ Voice memo from Jarvis:', files: [attachment] });
    }

    // Clean up
    fs.unlinkSync(path);
    return 'Voice memo sent';
  } catch (err) {
    console.error('[VOICE] Memo error:', err.message);
    return 'Voice memo failed: ' + err.message;
  }
}

// ── Twilio Voice: Generate TwiML for calls ──

// Inbound call handler — Jarvis answers the phone
function generateInboundTwiML(greeting) {
  const renderUrl = process.env.RENDER_EXTERNAL_URL || 'https://jarvis-sms-bot.onrender.com';
  const msg = greeting || "Hey, this is Jarvis. How can I help you today?";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">${msg}</Say>
  <Gather input="speech" timeout="5" speechTimeout="auto" action="${renderUrl}/voice/respond" method="POST">
    <Say voice="Polly.Matthew">I'm listening.</Say>
  </Gather>
  <Say voice="Polly.Matthew">I didn't catch that. Feel free to call back anytime.</Say>
</Response>`;
}

// Process speech input and respond
async function handleVoiceResponse(speechResult, callSid, from) {
  try {
    // Get tenant
    const db = require('../db/queries');
    const tenant = await db.getDefaultTenant();
    if (!tenant) throw new Error('No tenant');

    // Use brain to generate response
    const brain = require('./brain');
    const reply = await brain.chat(tenant.id, 'voice_' + from, 'voice', speechResult, null);

    // Store call in memory
    await memory.storeMemory(tenant.id, 'conversation', `Phone call from ${from}: "${speechResult}" → Jarvis: "${reply}"`, 6, 'voice');

    const renderUrl = process.env.RENDER_EXTERNAL_URL || 'https://jarvis-sms-bot.onrender.com';
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">${reply.replace(/[<>&"']/g, '')}</Say>
  <Gather input="speech" timeout="5" speechTimeout="auto" action="${renderUrl}/voice/respond" method="POST">
    <Say voice="Polly.Matthew">Anything else?</Say>
  </Gather>
  <Say voice="Polly.Matthew">Alright, have a great day!</Say>
</Response>`;
  } catch (err) {
    console.error('[VOICE] Response error:', err.message);
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">Sorry, I had a technical issue. Please try calling back or text us instead.</Say>
</Response>`;
  }
}

// ── Outbound call ──
async function makeCall(to, message) {
  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const renderUrl = process.env.RENDER_EXTERNAL_URL || 'https://jarvis-sms-bot.onrender.com';

  const call = await client.calls.create({
    to,
    from: process.env.TWILIO_PHONE_NUMBER,
    twiml: `<Response><Say voice="Polly.Matthew">${message.replace(/[<>&"']/g, '')}</Say>
      <Gather input="speech" timeout="5" speechTimeout="auto" action="${renderUrl}/voice/respond" method="POST">
        <Say voice="Polly.Matthew">I'm listening.</Say>
      </Gather></Response>`,
  });

  console.log('[VOICE] Outbound call to ' + to + ' — SID: ' + call.sid);
  return { callSid: call.sid, status: call.status };
}

// ── Express routes for Twilio Voice webhooks ──
function initVoiceRoutes(app) {
  const renderUrl = process.env.RENDER_EXTERNAL_URL || 'https://jarvis-sms-bot.onrender.com';

  // Twilio signature verification for voice webhooks
  const verifyTwilio = (req, res, next) => {
    if (!process.env.TWILIO_AUTH_TOKEN) return next();
    const twilio = require('twilio');
    const sig = req.headers['x-twilio-signature'];
    const url = renderUrl + req.path;
    if (!sig || !twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, sig, url, req.body)) {
      console.log('[VOICE] Invalid Twilio signature — rejected');
      return res.status(403).send('Forbidden');
    }
    next();
  };

  // Inbound call webhook
  app.post('/voice/inbound', verifyTwilio, (req, res) => {
    console.log('[VOICE] Inbound call from ' + req.body.From);
    res.type('text/xml').send(generateInboundTwiML());
  });

  // Speech response handler
  app.post('/voice/respond', verifyTwilio, async (req, res) => {
    const speech = req.body.SpeechResult;
    const from = req.body.From || 'unknown';
    const callSid = req.body.CallSid;
    console.log('[VOICE] Speech from ' + from + ': ' + speech);

    if (!speech) {
      res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="Polly.Matthew">I didn't catch that. Could you repeat?</Say>
<Gather input="speech" timeout="5" speechTimeout="auto" action="${renderUrl}/voice/respond" method="POST">
<Say voice="Polly.Matthew">Go ahead.</Say></Gather></Response>`);
      return;
    }

    const twiml = await handleVoiceResponse(speech, callSid, from);
    res.type('text/xml').send(twiml);
  });

  // Call status callback
  app.post('/voice/status', (req, res) => {
    console.log('[VOICE] Call ' + req.body.CallSid + ' status: ' + req.body.CallStatus);
    res.sendStatus(200);
  });

  console.log('[VOICE] Twilio Voice routes ready: /voice/inbound, /voice/respond, /voice/status');
}

module.exports = {
  textToSpeech,
  sendVoiceMemo,
  makeCall,
  initVoiceRoutes,
  generateInboundTwiML,
  handleVoiceResponse,
};
