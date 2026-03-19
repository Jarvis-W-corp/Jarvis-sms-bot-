const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const brain = require('../core/brain');
const tenantManager = require('../core/tenant');
const memoryModule = require('../core/memory');
const db = require('../db/queries');

const discord = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
});

const LOG_CHANNELS = {};

function logToDiscord(channelName, text) {
  const channel = LOG_CHANNELS[channelName];
  if (channel) {
    const msg = text.length > 2000 ? text.substring(0, 1997) + '...' : text;
    channel.send(msg).catch(err => console.error('[DISCORD LOG] Error:', err.message));
  }
}

function sendLongMessage(target, text) {
  if (text.length <= 2000) return target.reply(text);
  const chunks = text.match(/.{1,2000}/gs) || [text];
  return chunks.reduce((p, chunk) => p.then(() => target.reply(chunk)), Promise.resolve());
}

async function sendBossMessage(text) {
  try {
    const tenant = await db.getDefaultTenant();
    const bossId = tenant?.config?.boss_discord_id;
    if (!bossId) return;
    const user = await discord.users.fetch(bossId);
    if (user) await user.send(text);
  } catch (error) {
    console.error('[DM] Error:', error.message);
    logToDiscord('daily-reports', text);
  }
}

async function handleCommand(message, command, args, tenant) {
  const tenantId = tenant.id;
  switch (command) {
    case '!stats': {
      const stats = await db.getStats(tenantId);
      const embed = new EmbedBuilder().setTitle('📊 Super Jarvis Stats').setColor(0x00ff00)
        .addFields(
          { name: 'Users', value: String(stats.users), inline: true },
          { name: 'Messages', value: String(stats.messages), inline: true },
          { name: 'Memories', value: String(stats.memories), inline: true },
          { name: 'Facts', value: String(stats.memoryBreakdown.fact), inline: true },
          { name: 'Summaries', value: String(stats.memoryBreakdown.summary), inline: true },
          { name: 'Tasks', value: String(stats.memoryBreakdown.task), inline: true },
        ).setFooter({ text: 'Super Jarvis v2.0' }).setTimestamp();
      return message.reply({ embeds: [embed] });
    }
    case '!memory': {
      const facts = await db.getFactMemories(tenantId);
      const tasks = await db.getOpenTasks(tenantId);
      const decisions = await db.getRecentDecisions(tenantId, 14);
      const memCount = await db.getMemoryCount(tenantId);
      if (facts.length === 0 && tasks.length === 0 && decisions.length === 0) {
        return message.reply("Haven't learned anything yet. Keep talking to me.");
      }
      let response = '🧠 **Jarvis Memory Bank** (' + memCount + ' total)\n\n';
      if (facts.length > 0) response += '**Facts:**\n' + facts.map(f => '• ' + f.content).join('\n') + '\n\n';
      if (tasks.length > 0) response += '**Tasks:**\n' + tasks.map(t => '• ' + t.content).join('\n') + '\n\n';
      if (decisions.length > 0) response += '**Decisions:**\n' + decisions.map(d => '• ' + d.content).join('\n');
      if (response.length > 2000) response = response.substring(0, 1997) + '...';
      return message.reply(response);
    }
    case '!users': {
      const users = await db.getAllUsers(tenantId, 20);
      if (users.length === 0) return message.reply('No users yet.');
      return message.reply('👥 **Known Users:**\n' + users.map(u => '**' + (u.name || u.platform_id) + '** (' + u.platform + ') — ' + (u.message_count || 0) + ' msgs').join('\n'));
    }
    case '!forget': {
      const targetId = args[0];
      if (!targetId) return message.reply('Usage: !forget <platform_id>');
      const deleted = await db.deleteUser(tenantId, targetId);
      return message.reply(deleted ? 'Done. ' + targetId + ' wiped.' : 'Could not find ' + targetId);
    }
    case '!idea': {
      await message.channel.sendTyping();
      const idea = await brain.generateIdea(tenantId);
      await sendBossMessage('💡 **Idea from Jarvis:**\n\n' + idea);
      return;
    }
    case '!briefing': {
      await message.channel.sendTyping();
      const briefing = await brain.generateBriefing(tenantId);
      await sendBossMessage('☀️ **Morning Briefing**\n\n' + briefing);
      return;
    }
    case '!remember': {
      const factText = args.join(' ');
      if (!factText) return message.reply('Usage: !remember <fact>');
      await memoryModule.storeMemory(tenantId, 'fact', factText, 9, 'discord_' + message.author.id);
      return message.reply('🧠 Got it. I\'ll remember: "' + factText + '"');
    }
    case '!teach': {
      const trainingText = args.join(' ');
      if (!trainingText) return message.reply('Usage: !teach <knowledge>');
      await memoryModule.storeMemory(tenantId, 'training', trainingText, 8, 'discord_' + message.author.id);
      return message.reply('📚 Learned: "' + trainingText.substring(0, 100) + '"');
    }
    case '!search': {
      const query = args.join(' ');
      if (!query) return message.reply('Usage: !search <query>');
      await message.channel.sendTyping();
      const search = require('../core/search');
      const result = await search.searchAndSummarize(query, tenantId);
      return sendLongMessage(message, result);
    }
    case '!solar': {
      await message.channel.sendTyping();
      const enerflo = require('../core/enerflo');
      const summary = await enerflo.getPipelineSummary();
      const formatted = enerflo.formatForDiscord(summary);
      await enerflo.syncToMemory(tenantId);
      return message.reply(formatted);
    }
    case '!gmail': {
      const sub = args[0];
      const gmail = require('../core/gmail');
      if (sub === 'auth') {
        const url = await gmail.getAuthUrl();
        return message.reply('Authorize here: ' + url);
      }
      if (sub === 'code') {
        const code = args.slice(1).join(' ');
        await gmail.setAuthCode(code);
        return message.reply('✅ Gmail authorized!');
      }
      if (sub === 'read') {
        await message.channel.sendTyping();
        const emails = await gmail.getEmails(5);
        if (!emails.length) return message.reply('No unread emails.');
        return message.reply('📧 **Unread:**\n' + emails.map(e => '• ' + e.from + ' — ' + e.subject).join('\n'));
      }
      return message.reply('Usage: !gmail auth | !gmail code <code> | !gmail read');
    }
    case '!help': {
      const embed = new EmbedBuilder().setTitle('🤖 Super Jarvis Commands').setColor(0x0099ff)
        .addFields(
          { name: '!stats', value: 'System statistics' },
          { name: '!memory', value: 'Everything I remember' },
          { name: '!users', value: 'All known users' },
          { name: '!forget <id>', value: 'Wipe a user' },
          { name: '!remember <fact>', value: 'Store a permanent fact' },
          { name: '!teach <info>', value: 'Teach me something' },
          { name: '!idea', value: 'Generate a business idea' },
          { name: '!briefing', value: 'Daily briefing now' },
          { name: '!search <query>', value: 'Search the web' },
          { name: '!solar', value: 'Pull Enerflo pipeline data' },
          { name: '!gmail', value: 'Read emails' },
          { name: '!help', value: 'This menu' },
        ).setFooter({ text: 'Super Jarvis v2.0' }).setTimestamp();
      return message.reply({ embeds: [embed] });
    }
    default: return null;
  }
}

function initDiscord() {
  discord.on('ready', () => {
    console.log('[DISCORD] Jarvis online as ' + discord.user.tag);
    discord.guilds.cache.forEach(guild => {
      guild.channels.cache.forEach(channel => {
        if (channel.name === 'customer-logs') LOG_CHANNELS['customer-logs'] = channel;
        if (channel.name === 'memory-log') LOG_CHANNELS['memory-log'] = channel;
        if (channel.name === 'daily-reports') LOG_CHANNELS['daily-reports'] = channel;
      });
    });
    console.log('[DISCORD] Log channels:', Object.keys(LOG_CHANNELS).join(', ') || 'none');
  });

  discord.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (['customer-logs', 'memory-log', 'daily-reports'].includes(message.channel?.name)) return;
    const discordId = message.author.id;
    if (message.attachments.size > 0) return message.reply("I can't read files yet — send me text only.");
    const userText = message.content.trim();
    const userName = message.author.displayName || message.author.username;
    const tenant = await tenantManager.resolveTenant(discordId);
    if (!tenant) return message.reply("I'm not set up yet. Database needs initialization.");
    if (userText.startsWith('!')) {
      const parts = userText.split(' ');
      try {
        const result = await handleCommand(message, parts[0].toLowerCase(), parts.slice(1), tenant);
        if (result !== null) return;
      } catch (err) {
        console.error('[DISCORD] Command error:', err.message);
        await message.reply('⚠️ Command failed: ' + err.message);
        return;
      }
    }
    try {
      await message.channel.sendTyping();
      const userId = 'discord_' + discordId;
      const reply = await brain.chat(tenant.id, userId, 'discord', userText, userName);
      await sendLongMessage(message, reply);
      const learnResult = await memoryModule.learnFromConversation(tenant.id, userId, 'discord').catch(() => null);
      if (learnResult?.stored > 0) {
        logToDiscord('memory-log', '🧠 **Learned ' + learnResult.stored + ' memories from ' + userName + '**\n' + (learnResult.analysis?.facts || []).map(f => '• ' + f).join('\n'));
      }
    } catch (error) {
      console.error('[DISCORD] Error:', error.message);
      await message.reply('Something broke. Give me a sec and try again.');
    }
  });

  if (process.env.DISCORD_BOT_TOKEN) {
    console.log('[DISCORD] Attempting login...');
    discord.login(process.env.DISCORD_BOT_TOKEN)
      .then(() => console.log('[DISCORD] Login successful'))
      .catch(err => {
        console.error('[DISCORD] Login failed:', err.message);
        setTimeout(() => process.exit(1), 1000);
      });
  } else {
    console.log('[DISCORD] No token, disabled');
  }
}

module.exports = { initDiscord, logToDiscord, sendBossMessage, discord };
