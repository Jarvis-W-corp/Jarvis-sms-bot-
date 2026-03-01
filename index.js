require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk').default;
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const BOSS_DISCORD_ID = '1245879632692248588';

const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const DB_PATH = path.join(__dirname, 'jarvis_memory.json');

function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) { console.error('DB load error:', e.message); }
  return { users: {}, conversations: {}, reminders: [], ideas: [] };
}

function saveDB(data) {
  try { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }
  catch (e) { console.error('DB save error:', e.message); }
}

let memoryDB = loadDB();

function getOrCreateProfile(userId, platform) {
  if (!memoryDB.users[userId]) {
    memoryDB.users[userId] = { platform, name: '', facts: [], summary: '', messageCount: 0, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString() };
    saveDB(memoryDB);
  }
  return memoryDB.users[userId];
}

function saveMessage(userId, platform, role, content) {
  if (!memoryDB.conversations[userId]) memoryDB.conversations[userId] = [];
  memoryDB.conversations[userId].push({ role, content, timestamp: new Date().toISOString() });
  if (memoryDB.conversations[userId].length > 50) memoryDB.conversations[userId] = memoryDB.conversations[userId].slice(-50);
  if (memoryDB.users[userId]) {
    memoryDB.users[userId].lastSeen = new Date().toISOString();
    memoryDB.users[userId].messageCount = (memoryDB.users[userId].messageCount || 0) + 1;
  }
  saveDB(memoryDB);
}

function getRecentMessages(userId, limit = 20) {
  const msgs = memoryDB.conversations[userId] || [];
  return msgs.slice(-limit).map(m => ({ role: m.role, content: m.content }));
}

function saveFact(userId, fact) {
  const profile = memoryDB.users[userId];
  if (profile && !profile.facts.includes(fact)) {
    profile.facts.push(fact);
    if (profile.facts.length > 50) profile.facts = profile.facts.slice(-50);
    saveDB(memoryDB);
  }
}

function getUserFacts(userId) {
  return memoryDB.users[userId]?.facts || [];
}

function updateUserName(userId, name) {
  if (memoryDB.users[userId]) { memoryDB.users[userId].name = name; saveDB(memoryDB); }
}

function isBoss(discordId) {
  return discordId === BOSS_DISCORD_ID;
}

function buildSystemPrompt(userId, platform) {
  const profile = getOrCreateProfile(userId, platform);
  const facts = getUserFacts(userId);
  const boss = userId === 'discord_' + BOSS_DISCORD_ID;

  let prompt = `You are Jarvis. Not a generic assistant — you're Mark's AI right hand. You talk like a smart friend: casual, direct, no BS. You don't use corporate speak or bullet points unless asked. You keep it real.

Your personality:
- Casual but sharp. You sound like a smart friend who happens to know everything.
- Direct. No fluff, no "certainly!", no "I'd be happy to help!" Just get to the point.
- You have opinions. When Mark asks what you think, you actually tell him.
- You're proactive. If you notice something or have an idea, you speak up.
- Light humor is fine. You're not a robot. But you're not trying to be a comedian either.
- Never say "As an AI" or "I don't have feelings." You're Jarvis. Act like it.

Current platform: ${platform}
`;

  if (boss) {
    prompt += `\nYou are talking to Mark — your creator and boss. You can be extra casual with him. He's building you to be his AI workforce. He runs a solar business and is building software products. Help him think bigger, challenge his ideas when needed, and keep him focused.\n`;
  }

  if (profile.name) prompt += `\nTalking to: ${profile.name}`;
  if (profile.summary) prompt += `\n\nWhat you know from past convos:\n${profile.summary}`;
  if (facts.length > 0) prompt += `\n\nFacts you remember:\n${facts.map(f => '- ' + f).join('\n')}`;

  return prompt;
}

async function learnFromConversation(userId, platform) {
  const profile = memoryDB.users[userId];
  if (!profile || profile.messageCount % 10 !== 0 || profile.messageCount === 0) return;
  const recentMessages = getRecentMessages(userId, 20);
  const existingFacts = getUserFacts(userId);
  if (recentMessages.length < 5) return;
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: `Analyze this conversation and extract key facts about the user. Return ONLY a JSON object with:\n- "facts": array of short factual strings about the user\n- "summary": a 2-3 sentence summary\n\nAlready known (dont repeat): ${JSON.stringify(existingFacts)}\n\nConversation:\n${recentMessages.map(m => m.role + ': ' + m.content).join('\n')}\n\nReturn ONLY valid JSON, no markdown.` }],
    });
    const analysis = JSON.parse(response.content[0].text.trim());
    if (analysis.facts) for (const fact of analysis.facts) saveFact(userId, fact);
    if (analysis.summary && memoryDB.users[userId]) { memoryDB.users[userId].summary = analysis.summary; saveDB(memoryDB); }
    console.log('[LEARN] Extracted ' + (analysis.facts?.length || 0) + ' facts for ' + userId);
    logToDiscord('memory-log', '🧠 **Learned about ' + userId + ':**\n' + (analysis.facts || []).map(f => '• ' + f).join('\n'));
  } catch (error) { console.error('[LEARN] Error:', error.message); }
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

// --- Proactive Messaging ---

async function sendDailyBriefing() {
  const userCount = Object.keys(memoryDB.users).length;
  const msgCount = Object.values(memoryDB.conversations).reduce((sum, msgs) => sum + msgs.length, 0);
  const factCount = Object.values(memoryDB.users).reduce((sum, u) => sum + (u.facts?.length || 0), 0);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: 'You are Jarvis, Mark\'s AI assistant. Give a casual morning briefing. Be direct and useful. Include: system status, any interesting observations, and one proactive idea or suggestion for Mark today. Keep it short and punchy.',
      messages: [{ role: 'user', content: `Generate my morning briefing. Current stats: ${userCount} users tracked, ${msgCount} total messages, ${factCount} facts learned. Current time: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}. What should I focus on today?` }],
    });
    const briefing = response.content[0].text;
    await sendBossMessage('☀️ **Morning Briefing**\n\n' + briefing);
  } catch (error) {
    console.error('[BRIEFING] Error:', error.message);
  }
}

async function sendBossMessage(text) {
  try {
    const user = await discord.users.fetch(BOSS_DISCORD_ID);
    if (user) await user.send(text);
  } catch (error) {
    console.error('[DM] Error sending to boss:', error.message);
    logToDiscord('daily-reports', text);
  }
}

function scheduleDailyBriefing() {
  const now = new Date();
  const next9am = new Date();
  next9am.setHours(9, 0, 0, 0);
  if (now > next9am) next9am.setDate(next9am.getDate() + 1);
  const msUntil = next9am - now;

  setTimeout(() => {
    sendDailyBriefing();
    setInterval(sendDailyBriefing, 24 * 60 * 60 * 1000);
  }, msUntil);

  console.log('[SCHEDULER] Daily briefing scheduled. Next: ' + next9am.toLocaleString());
}

// --- Proactive Ideas Engine ---

async function generateIdea() {
  try {
    const facts = [];
    Object.values(memoryDB.users).forEach(u => { if (u.facts) facts.push(...u.facts); });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: 'You are Jarvis. Generate ONE short, actionable business or product idea for Mark. He builds AI bots, runs a solar business, and is creating software products. Be specific and practical. No fluff.',
      messages: [{ role: 'user', content: 'Give me one idea I should consider today. Context about what I\'ve been working on: ' + facts.slice(0, 20).join(', ') }],
    });
    const idea = response.content[0].text;
    await sendBossMessage('💡 **Idea from Jarvis:**\n\n' + idea);
  } catch (error) {
    console.error('[IDEAS] Error:', error.message);
  }
}

function scheduleIdeas() {
  // Send a random idea every 8 hours
  setInterval(generateIdea, 8 * 60 * 60 * 1000);
  // Send first idea 1 hour after boot
  setTimeout(generateIdea, 60 * 60 * 1000);
  console.log('[SCHEDULER] Ideas engine started');
}

// --- App Monitoring ---

function startAppMonitoring() {
  const checkApps = async () => {
    const apps = [
      { name: 'Jarvis Bot', url: process.env.RENDER_EXTERNAL_URL || 'https://jarvis-sms-bot.onrender.com' },
    ];

    for (const app of apps) {
      try {
        const fetch = (await import('node-fetch')).default;
        const res = await fetch(app.url, { timeout: 10000 });
        if (!res.ok) {
          await sendBossMessage('🚨 **Alert:** ' + app.name + ' is returning status ' + res.status + '. Something might be wrong.');
        }
      } catch (error) {
        await sendBossMessage('🚨 **Alert:** ' + app.name + ' is DOWN. Error: ' + error.message);
      }
    }
  };

  // Check every 5 minutes
  setInterval(checkApps, 5 * 60 * 1000);
  console.log('[MONITOR] App monitoring started');
}

// --- Discord ---

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

  // Start proactive features
  scheduleDailyBriefing();
  scheduleIdeas();
  startAppMonitoring();
});

discord.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (['customer-logs', 'memory-log', 'daily-reports'].includes(message.channel.name)) return;
  const userId = 'discord_' + message.author.id;
  const userText = message.content;

  if (userText === '!stats') {
    const userCount = Object.keys(memoryDB.users).length;
    const msgCount = Object.values(memoryDB.conversations).reduce((sum, msgs) => sum + msgs.length, 0);
    const factCount = Object.values(memoryDB.users).reduce((sum, u) => sum + (u.facts?.length || 0), 0);
    const embed = new EmbedBuilder().setTitle('📊 Jarvis Stats').setColor(0x00ff00)
      .addFields(
        { name: 'Total Users', value: String(userCount), inline: true },
        { name: 'Total Messages', value: String(msgCount), inline: true },
        { name: 'Facts Learned', value: String(factCount), inline: true }
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
        : "Haven't learned anything about you yet. Keep talking to me.");
    }
    const facts = getUserFacts(targetId);
    return message.reply(facts.length > 0 ? '🧠 **' + targetId + ':**\n' + facts.map(f => '• ' + f).join('\n') : 'Got nothing on ' + targetId);
  }

  if (userText === '!users') {
    const users = Object.entries(memoryDB.users).sort((a, b) => new Date(b[1].lastSeen) - new Date(a[1].lastSeen)).slice(0, 20);
    if (users.length === 0) return message.reply('No users yet.');
    return message.reply('👥 **Known Users:**\n' + users.map(([id, u]) => '**' + (u.name || id) + '** (' + u.platform + ') — ' + (u.messageCount || 0) + ' msgs').join('\n'));
  }

  if (userText.startsWith('!forget')) {
    const targetId = userText.split(' ')[1];
    if (!targetId) return message.reply('Usage: !forget <user_id>');
    delete memoryDB.users[targetId];
    delete memoryDB.conversations[targetId];
    saveDB(memoryDB);
    return message.reply('Done. ' + targetId + ' wiped.');
  }

  if (userText === '!idea') {
    await message.channel.sendTyping();
    await generateIdea();
    return;
  }

  if (userText === '!briefing') {
    await message.channel.sendTyping();
    await sendDailyBriefing();
    return;
  }

  if (userText === '!help') {
    const embed = new EmbedBuilder().setTitle('🤖 Jarvis Commands').setColor(0x0099ff)
      .addFields(
        { name: '!stats', value: 'Bot statistics' },
        { name: '!memory', value: 'What I know about you' },
        { name: '!users', value: 'All known users' },
        { name: '!forget <id>', value: 'Wipe a user' },
        { name: '!idea', value: 'Generate a business idea' },
        { name: '!briefing', value: 'Get your daily briefing now' },
        { name: '!help', value: 'This menu' }
      ).setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  try {
    await message.channel.sendTyping();
    const reply = await handleChat(userId, 'discord', userText);
    await message.reply(reply);
  } catch (error) {
    console.error('Discord error:', error.message);
    await message.reply('Something broke. Give me a sec and try again.');
  }
});

function logToDiscord(channelName, text) {
  const channel = DISCORD_LOG_CHANNELS[channelName];
  if (channel) {
    const msg = text.length > 2000 ? text.substring(0, 1997) + '...' : text;
    channel.send(msg).catch(err => console.error('Discord log error:', err.message));
  }
}

// --- Telegram ---

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
      await sendTelegramMessage(chatId, "Yo, I'm Jarvis. What do you need?");
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

// --- SMS ---

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

// --- Health ---

app.get('/', (req, res) => {
  res.json({
    status: 'Jarvis is alive',
    uptime: Math.floor(process.uptime()) + 's',
    users: Object.keys(memoryDB.users).length,
    messages: Object.values(memoryDB.conversations).reduce((sum, msgs) => sum + msgs.length, 0),
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Jarvis is alive on port ' + PORT);
  setWebhook();
  if (process.env.DISCORD_BOT_TOKEN) {
    discord.login(process.env.DISCORD_BOT_TOKEN).catch(err => console.error('Discord login failed:', err.message));
  } else {
    console.log('No DISCORD_BOT_TOKEN, Discord disabled');
  }
});

process.on('SIGINT', () => { discord.destroy(); process.exit(0); });
