require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk').default;

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const conversationHistory = {};

const SYSTEM_PROMPT = "You are Jarvis, an AI business assistant. You are helpful, professional, and efficient. You respond via text message so keep responses concise but helpful. If you don't know something, say so honestly. Always be friendly and professional.";

// Send message via Telegram
async function sendTelegramMessage(chatId, text) {
  const fetch = (await import('node-fetch')).default;
  // Telegram has a 4096 character limit per message
  if (text.length > 4000) {
    text = text.substring(0, 4000) + '...';
  }
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text
    })
  });
  return res.json();
}

// Set webhook
async function setWebhook() {
  const fetch = (await import('node-fetch')).default;
  const webhookUrl = process.env.RENDER_EXTERNAL_URL || process.env.WEBHOOK_URL;
  if (webhookUrl) {
    const res = await fetch(`${TELEGRAM_API}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `${webhookUrl}/telegram`
      })
    });
    const data = await res.json();
    console.log('Webhook set:', data);
  } else {
    console.log('No RENDER_EXTERNAL_URL or WEBHOOK_URL set, skipping webhook setup');
  }
}

// Handle incoming Telegram messages
app.post('/telegram', async (req, res) => {
  try {
    const message = req.body.message;
    if (!message || !message.text) {
      return res.sendStatus(200);
    }

    const chatId = message.chat.id;
    const userText = message.text;

    console.log(`Message from ${chatId}: ${userText}`);

    // Skip bot commands like /start
    if (userText === '/start') {
      await sendTelegramMessage(chatId, "Hello! I'm Jarvis, your AI business assistant. I'm here to help with business operations, customer questions, tasks, and more. What can I assist you with today?");
      return res.sendStatus(200);
    }

    // Initialize conversation history for this chat
    if (!conversationHistory[chatId]) {
      conversationHistory[chatId] = [];
    }

    conversationHistory[chatId].push({ role: 'user', content: userText });

    // Keep last 20 messages
    if (conversationHistory[chatId].length > 20) {
      conversationHistory[chatId] = conversationHistory[chatId].slice(-20);
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: conversationHistory[chatId],
    });

    const reply = response.content[0].text;
    conversationHistory[chatId].push({ role: 'assistant', content: reply });
    console.log(`Reply to ${chatId}: ${reply}`);

    await sendTelegramMessage(chatId, reply);

    res.sendStatus(200);
  } catch (error) {
    console.error('Error:', error.message);
    res.sendStatus(200);
  }
});

// Health check
app.get('/', (req, res) => {
  res.send('Jarvis AI Bot is running!');
});

// Also keep the SMS endpoint for when Twilio verification comes through
app.post('/sms', async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body;
  console.log('SMS from ' + from + ': ' + body);

  if (!conversationHistory[from]) {
    conversationHistory[from] = [];
  }

  conversationHistory[from].push({ role: 'user', content: body });

  if (conversationHistory[from].length > 20) {
    conversationHistory[from] = conversationHistory[from].slice(-20);
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: conversationHistory[from],
    });

    const reply = response.content[0].text;
    conversationHistory[from].push({ role: 'assistant', content: reply });
    console.log('Reply to ' + from + ': ' + reply);

    // Only try Twilio if configured
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      const twilio = require('twilio');
      const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await twilioClient.messages.create({
        body: reply,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: from,
      });
    }

    res.type('text/xml').send('<Response></Response>');
  } catch (error) {
    console.error('Error:', error.message);
    res.type('text/xml').send('<Response></Response>');
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log('Jarvis is alive on port ' + PORT);
  // Set the Telegram webhook after server starts
  setWebhook();
});

