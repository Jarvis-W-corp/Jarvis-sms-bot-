require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk').default;
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const db = new Database(path.join(__dirname, 'jarvis_memory.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    name TEXT DEFAULT '',
    facts TEXT DEFAULT '[]',
    preferences TEXT DEFAULT '{}',
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    message_count INTEGER DEFAULT 0,
    summary TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS memory_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    fact TEXT NOT NULL,
    source TEXT DEFAULT '',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp);
`);

function getOrCreateProfile(userId, platform) {
  let profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);
  if (!profile) {
    db.prepare('INSERT INTO user_profiles (user_id, platform) VALUES (?, ?)').run(userId, platform);
    profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);
  }
  return profile;
}

function saveMessage(userId, platform, role, content) {
  db.prepare('INSERT INTO conversations (user_id, platform, role, content) VALUES (?, ?, ?, ?)').run(userId, platform, role, content);
  db.prepare('UPDATE user_profiles SET last_seen = CURRENT_TIMESTAMP, message_count = message_count + 1 WHERE user_id = ?').run(userId);
}

function getRecentMessages(userId, limit = 20) {
  return db.prepare('SELECT role, content FROM conversations WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?').all(userId, limit).reverse();
}

function getMessageCount(userId) {
  return db.prepare('SELECT COUNT(*) as count FROM conversations WHERE user_id = ?').get(userId).count;
}

function saveFact(userId, fact, source = '') {
  const existing = db.prepare('SELECT * FROM memory_log WHERE user_id = ? AND fact = ?').get(userId, fact);
  if (!existing) {
    db.prepare('INSERT INTO memory_log (user_id, fact, source) VALUES (?, ?, ?)').run(userId, fact, source);
    const profile = db.prepare('SELECT facts FROM user_profiles WHERE user_id = ?').get(userId);
    if (profile) {
      const facts = JSON.parse(profile.facts || '[]');
      facts.push(fact);
      db.prepare('UPDATE user_profiles SET facts = ? WHERE user_id = ?').run(JSON.stringify(facts.slice(-50)), userId);
    }
  }
}

function getUserFacts(userId) {
  const profile = db.prepare('SELECT facts FROM user_profiles WHERE user_id = ?').get(userId);
  return profile ? JSON.parse(profile.facts || '[]') : [];
}

function updateUserSummary(userId, summary) {
  db.prepare('UPDATE user_profiles SET summary = ? WHERE user_id = ?').run(summary, userId);
}

function updateUserName(userId, name) {
  db.prepare('UPDATE user_profiles SET name = ? WHERE user_id = ?').run(name, userId);
}

function buildSystemPrompt(userId, platform) {
  const profile = getOrCreateProfile(userId, platform);
  const facts = getUserFacts(userId);
  let prompt = `You are Jarvis, an AI business assistant built by Mark. You are helpful, professional, and efficient. You respond concisely but helpfully. If you don't know something, say so honestly. Always be friendly and professional.\n\nCurrent platform: ${platform}\n`;
  if (profile.name) prompt += `\nYou are speaking with: ${profile.name}`;
  if (profile.summary) prompt += `\n\nConversation summary with this user:\n${profile.summary}`;
  if (facts.length > 0) prompt += `\n\nKnown facts about this user:\n${facts.map(f => '- ' + f).join('\n')}`;
  prompt += `\n\nIMPORTANT RULES:\n- Keep responses concise for text/Telegram. Discord allows longer responses.\n- If the user shares personal info, remember it naturally.\n- If asked what you remember, share the facts you know about them.\n- You have persistent memory across conversations.`;
  return prompt;
}

async function learnFromConversation(userId, platform) {
  const messageCount = getMessageCount(userId);
  if (messageCount % 10 !== 0 || messageCount === 0) return;
  const recentMessages = getRecentMessages(userId, 20);
  const existingFacts = getUserFacts(userId);
  if (recentMessages.length < 5) return;
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: `Analyze this conversation and extract key facts about the user. Return ONLY a JSON object with:\n- "facts": array of short factual strings about the user\n- "summary": a 2-3 sentence summary\n\nAlready known facts (dont repeat): ${JSON.stringify(existingFacts)}\n\nConversation:\n${recentMessages.map(m => m.role + ': ' + m.content).join('\n')}\n\nReturn ONLY valid JSON, no markdown.` }],
    });
    const analysis = JSON.parse(response.content[0].text.trim());
    if (analysis.facts && Array.isArray(analysis.facts)) {
      for (const fact of analysis.facts) saveFact(userId, fact, 'auto-learned');
    }
    if (analysis.summary) updateUserSummary(userId, analysis.summary);
    console.log('[LEARN] Extracted ' + (analysis.facts?.length || 0) + ' facts for ' + userId);
    logToDiscord('memory-log', '📝 **Learned about ' + userId + ':**\n' + (analysis.facts || []).map(f => '• ' + f).join('\n'));
  } catch (error) {
    console.error('[LEARN] Error:', error.message);
  }
}

async function handleChat(userId, platform, userText) {
  getOrCreateProfile(userId, platform);
  saveMessage(userId, platform, 'user', userText);
  const history = getRecentMessages(userId, 20);
  const systemPrompt = buildSystemPrompt(userId, platform);
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: platform === 'discord' ? 1000 : 300,
    system: systemPrompt,
    messages: history,
  });
  const reply = response.content[0].text;
  saveMessage(userId, platform, 'assistant', reply);
  learnFromConversation(userId, platform).catch(err => console.error('[LEARN] Error:', err.message));
  return reply;
}

const DISCORD_LOG_CHANNELS = {};

discord.on('ready', () => {
  console.log('Discord: Jarvis online as ' + discord.user.tag);
  discord.guilds.cache.forEach(guild => {
    guild.channels.cache.forEach(channel => {
      if (channel.name === 'customer-logs') DISCORD_LOG_CHANNELS['customer-logs'] = channel;
      if (channel.name === 'memory-log') DISCORD_LOG_CHANNELS['memory-log'] = channel;
      if (channel.name === 'daily-reports') DISCORD_LOG_CHANNELS['daily-reports'] = channel;
    });
  });
});

discord.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (['customer-logs', 'memory-log', 'daily-reports'].includes(message.channel.name)) return;
  const userId = 'discord_' + message.author.id;
  const userText = message.content;

  if (userText === '!stats') {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM user_profiles').get().count;
    const totalMessages = db.prepare('SELECT COUNT(*) as count FROM conversations').get().count;
    const totalFacts = db.prepare('SELECT COUNT(*) as count FROM memory_log').get().count;
    const embed = new EmbedBuilder().setTitle('📊 Jarvis Stats').setColor(0x00ff00)
      .addFields(
        { name: 'Total Users', value: String(totalUsers), inline: true },
        { name: 'Total Messages', value: String(totalMessages), inline: true },
        { name: 'Facts Learned', value: String(totalFacts), inline: true }
      ).setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  if (userText.startsWith('!memory')) {
    const targetId = userText.split(' ')[1];
    if (!targetId) {
      const facts = getUserFacts(userId);
      const profile = getOrCreateProfile(userId, 'discord');
      return message.reply(facts.length > 0
        ? '🧠 **What I know about you:**\n' + facts.map(f => '• ' + f).join('\n') + '\n\n📝 **Summary:** ' + (profile.summary || 'Not enough data yet.')
        : "I haven't learned anything about you yet. Keep chatting!");
    }
    const facts = getUserFacts(targetId);
    return message.reply(facts.length > 0 ? '🧠 **Facts about ' + targetId + ':**\n' + facts.map(f => '• ' + f).join('\n') : 'No data on user ' + targetId);
  }

  if (userText === '!users') {
    const users = db.prepare('SELECT user_id, platform, name, message_count, last_seen FROM user_profiles ORDER BY last_seen DESC LIMIT 20').all();
    if (users.length === 0) return message.reply('No users yet.');
    return message.reply('👥 **Known Users:**\n' + users.map(u => '**' + (u.name || u.user_id) + '** (' + u.platform + ') — ' + u.message_count + ' msgs').join('\n'));
  }

  if (userText.startsWith('!forget')) {
    const targetId = userText.split(' ')[1];
    if (!targetId) return message.reply('Usage: !forget <user_id>');
    db.prepare('DELETE FROM conversations WHERE user_id = ?').run(targetId);
    db.prepare('DELETE FROM memory_log WHERE user_id = ?').run(targetId);
    db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(targetId);
    return message.reply('🗑️ All data for ' + targetId + ' deleted.');
  }

  if (userText === '!help') {
    const embed = new EmbedBuilder().setTitle('🤖 Jarvis Commands').setColor(0x0099ff)
      .addFields(
        { name: '!stats', value: 'Show bot statistics' },
        { name: '!memory', value: 'What I know about you' },
        { name: '!users', value: 'List all known users' },
        { name: '!forget <id>', value: 'Delete user data' },
        { name: '!help', value: 'Show this menu' }
      ).setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  try {
    await message.channel.sendTyping();
    const reply = await handleChat(userId, 'discord', userText);
    await message.reply(reply);
  } catch (error) {
    console.error('Discord error:', error.message);
    await message.reply('Sorry, I hit an error. Try again.');
  }
});

function logToDiscord(channelName, text) {
  const channel = DISCORD_LOG_CHANNELS[channelName];
  if (channel) {
    const msg = text.length > 2000 ? text.substring(0, 1997) + '...' : text;
    channel.send(msg).catch(err => console.error('Discord log error:', err.message));
  }
}

async function sendTelegramMessage(chatId, text) {
  const fetch = (await import('node-fetch')).default;
  if (text.length > 4000) text = text.substring(0, 4000) + '...';
  const res = await fetch(TELEGRAM_API + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text }),
  });
  return res.json();
}

async function setWebhook() {
  const fetch = (await import('node-fetch')).default;
  const webhookUrl = process.env.RENDER_EXTERNAL_URL || process.env.WEBHOOK_URL;
  if (webhookUrl) {
    const res = await fetch(TELEGRAM_API + '/setWebhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl + '/telegram' }),
    });
    console.log('Telegram webhook set:', await res.json());
  }
}

app.post('/telegram', async (req, res) => {
  try {
    const message = req.body.message;
    if (!message || !message.text) return res.sendStatus(200);
    const chatId = message.chat.id;
    const userText = message.text;
    const userId = 'telegram_' + chatId;
    console.log('[Telegram] ' + chatId + ': ' + userText);
    if (userText === '/start') {
      await sendTelegramMessage(chatId, "Hello! I'm Jarvis, your AI business assistant. What can I help you with?");
      return res.sendStatus(200);
    }
    if (message.from) {
      const name = [message.from.first_name, message.from.last_name].filter(Boolean).join(' ');
      if (name) updateUserName(userId, name);
    }
    const reply = await handleChat(userId, 'telegram', userText);
    await sendTelegramMessage(chatId, reply);
    const profile = getOrCreateProfile(userId, 'telegram');
    logToDiscord('customer-logs', '📱 **Telegram** | ' + (profile.name || chatId) + '\n**User:** ' + userText + '\n**Jarvis:** ' + reply);
    res.sendStatus(200);
  } catch (error) {
    console.error('[Telegram] Error:', error.message);
    res.sendStatus(200);
  }
});

app.post('/sms', async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body;
  const userId = 'sms_' + from;
  console.log('[SMS] ' + from + ': ' + body);
  try {
    const reply = await handleChat(userId, 'sms', body);
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      const twilio = require('twilio');
      const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await twilioClient.messages.create({ body: reply, from: process.env.TWILIO_PHONE_NUMBER, to: from });
    }
    logToDiscord('customer-logs', '💬 **SMS** | ' + from + '\n**User:** ' + body + '\n**Jarvis:** ' + reply);
    res.type('text/xml').send('<Response></Response>');
  } catch (error) {
    console.error('[SMS] Error:', error.message);
    res.type('text/xml').send('<Response></Response>');
  }
});

app.get('/', (req, res) => {
  res.json({
    status: 'Jarvis is alive',
    uptime: Math.floor(process.uptime()) + 's',
    users: db.prepare('SELECT COUNT(*) as count FROM user_profiles').get().count,
    messages: db.prepare('SELECT COUNT(*) as count FROM conversations').get().count,
    facts_learned: db.prepare('SELECT COUNT(*) as count FROM memory_log').get().count,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Jarvis is alive on port ' + PORT);
  setWebhook();
  if (process.env.DISCORD_BOT_TOKEN) {
    discord.login(process.env.DISCORD_BOT_TOKEN).catch(err => console.error('Discord login failed:', err.message));
  } else {
    console.log('No DISCORD_BOT_TOKEN set, Discord disabled');
  }
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  db.close();
  discord.destroy();
  process.exit(0);
});
