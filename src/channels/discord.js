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
    case '!drip': {
      await message.channel.sendTyping();
      const drip = require('../core/drip');
      const sub = args[0];
      if (sub === 'run') {
        await drip.ensureTable().catch(() => {});
        await drip.monitorPipeline();
        return message.reply('Pipeline monitor ran. Check alerts for results.');
      }
      const stats = await drip.getDripStats();
      let msg = '**Drip Campaigns**\n\n';
      msg += '**Active:** ' + stats.active + ' | **Converted:** ' + stats.converted + ' | **Completed:** ' + stats.completed + ' | **Msgs Sent:** ' + stats.totalSent + '\n\n';
      if (stats.campaigns.length > 0) {
        msg += '**Active Campaigns:**\n';
        msg += stats.campaigns.slice(0, 10).map(c =>
          '> **' + c.name + '** — ' + c.milestone + ' | Stage ' + c.stage + '/' + c.totalStages + ' | ' + c.messagesSent + ' sent'
        ).join('\n');
      } else {
        msg += 'No active drip campaigns. Run `!drip run` to start monitoring.';
      }
      return message.reply(msg);
    }
    case '!remittance': {
      await message.channel.sendTyping();
      const remittance = require('../core/remittance');
      const sub = args[0];
      if (sub === 'scan') {
        const data = await remittance.fetchRemittanceEmails(50);
        if (data.length === 0) return message.reply('No ION SOLAR PROS remittance emails found.');
        let response = '📄 **Found ' + data.length + ' Remittance PDFs:**\n\n';
        data.forEach((d, i) => {
          const ref = d.reference || 'No Ref';
          response += '**' + (i + 1) + '. ' + d.date + '** — Ref: ' + ref + ' | ' + d.lineItems.length + ' line items\n';
          d.lineItems.forEach(li => {
            const type = li.type === 'credit' ? '🔴 Credit' : '🟢 Bill';
            response += '   ' + type + ': ' + li.name + ' — $' + li.payment + '\n';
          });
          response += '\n';
        });
        if (response.length > 2000) response = response.substring(0, 1997) + '...';
        return message.reply(response);
      }
      if (sub === 'process') {
        const result = await remittance.processRemittances();
        if (result.found === 0) return message.reply('No ION SOLAR PROS remittance emails found.');
        return message.reply('✅ **Remittance Processing Complete**\nFound: ' + result.found + ' records\nWritten to Google Sheet: ' + result.added + ' rows');
      }
      return message.reply('Usage:\n`!remittance scan` — Preview what Jarvis finds\n`!remittance process` — Parse PDFs and write to Google Sheet');
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
    case '!drive': {
      const drive = require('../core/drive');
      const sub = args[0];
      if (sub === 'folders') {
        const parentId = args[1] || null;
        const folders = await drive.listFolders(parentId, tenantId);
        if (!folders.length) return message.reply('No folders found.');
        return message.reply('📁 **Drive Folders:**\n' + folders.map(f => `• ${f.name} — \`${f.id}\``).join('\n'));
      }
      if (sub === 'list') {
        const folderId = args[1] || null;
        const files = await drive.listFiles(folderId, { limit: 20 }, tenantId);
        if (!files.length) return message.reply('No files found.');
        return message.reply('📄 **Files:**\n' + files.map(f => `• ${f.name} — \`${f.id}\``).join('\n'));
      }
      if (sub === 'search') {
        const query = args.slice(1).join(' ');
        if (!query) return message.reply('Usage: !drive search <name>');
        const files = await drive.searchFiles(query, null, tenantId);
        if (!files.length) return message.reply('No files matching "' + query + '".');
        return message.reply('🔍 **Results:**\n' + files.map(f => `• ${f.name} — \`${f.id}\``).join('\n'));
      }
      if (sub === 'download') {
        const fileId = args[1];
        if (!fileId) return message.reply('Usage: !drive download <fileId> [destPath]');
        await message.reply('⏳ Downloading...');
        const result = await drive.downloadFile(fileId, args[2] || null, tenantId);
        return message.reply('✅ Downloaded: ' + result.name + ' → ' + result.path);
      }
      return message.reply('Usage: !drive folders [parentId] | !drive list [folderId] | !drive search <name> | !drive download <fileId>');
    }
    case '!voice': {
      const voice = require('../core/voice');
      const voiceText = args.join(' ');
      if (!voiceText) return message.reply('Usage: `!voice <message>` — Jarvis speaks it as audio');
      await message.channel.sendTyping();
      try {
        const result = await voice.sendVoiceMemo(voiceText, message.channel);
        if (!result.startsWith('Voice memo')) await message.reply(result);
      } catch (err) {
        await message.reply('Voice error: ' + err.message);
      }
      return;
    }

    case '!agent': {
      const sub = args[0];
      if (sub === 'run') {
        await message.reply('🤖 Starting agent cycle...');
        await message.channel.sendTyping();
        const { runAgentCycle } = require('../core/agent');
        const result = await runAgentCycle();
        return message.reply('🤖 Agent cycle complete. Tools used: ' + (result?.toolLog?.length || 0) + '. Check dashboard for details.');
      }
      if (sub === 'tasks') {
        const pending = await db.getAgentTasks(tenantId, 'pending', 15);
        if (!pending.length) return message.reply('🤖 No pending agent tasks.');
        return message.reply('🤖 **Pending Agent Tasks:**\n' + pending.map((t, i) => (i + 1) + '. [P' + t.priority + '] ' + t.title).join('\n'));
      }
      // Default: show status
      const cycles = await db.getRecentAgentCycles(tenantId, 1);
      const pending = await db.getAgentTasks(tenantId, 'pending', 20);
      const completed = await db.getAgentTasks(tenantId, 'completed', 5);
      let status = '🤖 **Agent Status**\n';
      status += 'Pending tasks: ' + pending.length + '\n';
      status += 'Completed tasks: ' + completed.length + '\n';
      if (cycles[0]) {
        const lastTime = new Date(cycles[0].created_at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        status += 'Last cycle: ' + lastTime + ' ET\n';
        if (cycles[0].tool_log?.length) {
          status += 'Tools used: ' + cycles[0].tool_log.map(t => t.tool).join(', ');
        }
      } else {
        status += 'Last cycle: never (run `!agent run` to start)';
      }
      return message.reply(status);
    }
    case '!learn': {
      const url = args[0];
      if (!url) return message.reply('Usage: !learn <youtube/tiktok/url> [purpose]\nExample: !learn https://youtube.com/watch?v=xyz how to run facebook ads');
      const purpose = args.slice(1).join(' ') || null;
      await message.reply('Analyzing content... this may take a moment.');
      await message.channel.sendTyping();
      const contentModule = require('../core/content');
      const result = await contentModule.processContent(url, purpose, tenantId);
      let response = '**Learned from: ' + (result.source || 'content') + '**\n\n' + result.analysis;
      if (response.length > 2000) response = response.substring(0, 1997) + '...';
      return message.reply(response);
    }
    case '!research': {
      const niche = args.join(' ');
      if (!niche) return message.reply('Usage: !research <niche or market>\nExample: !research streetwear clothing');
      await message.reply('Researching ' + niche + '...');
      await message.channel.sendTyping();
      const biz = require('../core/business');
      const result = await biz.researchMarket(niche, 'overview');
      let response = '**Market Research: ' + niche + '**\n\n' + result.analysis;
      if (response.length > 2000) response = response.substring(0, 1997) + '...';
      return message.reply(response);
    }
    case '!plan': {
      const idea = args.join(' ');
      if (!idea) return message.reply('Usage: !plan <business idea>\nExample: !plan dropshipping pet accessories');
      await message.reply('Building business plan...');
      await message.channel.sendTyping();
      const biz = require('../core/business');
      const plan = await biz.generateBusinessPlan(idea);
      await sendLongMessage(message, '**Business Plan: ' + idea + '**\n\n' + plan);
      return;
    }
    case '!validate': {
      const idea = args.join(' ');
      if (!idea) return message.reply('Usage: !validate <business idea>');
      await message.reply('Evaluating idea with market data...');
      await message.channel.sendTyping();
      const biz = require('../core/business');
      const result = await biz.validateIdea(idea);
      await sendLongMessage(message, '**Idea Evaluation: ' + idea + '**\n\n' + result.evaluation);
      return;
    }
    case '!ad': {
      const product = args.join(' ');
      if (!product) return message.reply('Usage: !ad <product/service>\nExample: !ad residential solar panels CT');
      await message.channel.sendTyping();
      const biz = require('../core/business');
      const copy = await biz.generateAdCopy(product);
      await sendLongMessage(message, '**Ad Copy for: ' + product + '**\n\n' + copy);
      return;
    }
    case '!spy': {
      const query = args.join(' ');
      if (!query) return message.reply('Usage: !spy <niche or competitor>\nExample: !spy med spa botox CT');
      await message.reply('🔍 Scraping Meta Ad Library for "' + query + '"...');
      await message.channel.sendTyping();
      const adslibrary = require('../core/adslibrary');
      const ads = await adslibrary.scrapeCompetitorAds(query, 15);
      if (!ads.length) return message.reply('No ads found for "' + query + '".');
      const analysis = await adslibrary.analyzeAds(ads, query);
      await sendLongMessage(message, '🕵️ **Ad Spy: ' + query + '** (' + ads.length + ' ads found)\n\n' + analysis);
      return;
    }
    case '!adpipeline': {
      const niche = args.join(' ');
      if (!niche) return message.reply('Usage: !adpipeline <niche>\nExample: !adpipeline med spa CT');
      await message.reply('🚀 Running full ad pipeline: scrape → analyze → create → campaign...');
      await message.channel.sendTyping();
      const adslibrary = require('../core/adslibrary');
      const result = await adslibrary.runAdPipeline(niche, { tenantId, count: 3 });
      let output = '🚀 **Ad Pipeline: ' + niche + '**\n\n';
      output += '**Ads Scraped:** ' + (result.steps[0]?.adsFound || 0) + '\n\n';
      output += '**COMPETITOR ANALYSIS:**\n' + result.analysis + '\n\n';
      output += '**WINNING CREATIVES:**\n' + result.creatives + '\n\n';
      output += '**CAMPAIGN STRUCTURE:**\n' + result.campaign;
      await sendLongMessage(message, output);
      return;
    }
    case '!stock': {
      const symbol = args[0]?.toUpperCase();
      if (!symbol) return message.reply('Usage: !stock <TICKER>\nExample: !stock TSLA');
      await message.channel.sendTyping();
      const tradeModule = require('../core/trading');
      const result = await tradeModule.analyzeMarket(symbol);
      await sendLongMessage(message, '**' + symbol + ' Analysis**\n\n' + result.analysis);
      return;
    }
    case '!crypto': {
      const symbol = args[0]?.toUpperCase();
      if (!symbol) return message.reply('Usage: !crypto <SYMBOL>\nExample: !crypto BTC');
      await message.channel.sendTyping();
      const tradeModule = require('../core/trading');
      const result = await tradeModule.analyzeCrypto(symbol);
      await sendLongMessage(message, '**' + symbol + ' Analysis**\n\n' + result.analysis);
      return;
    }
    case '!portfolio': {
      const tradeModule = require('../core/trading');
      return message.reply(tradeModule.getPortfolioStatus());
    }
    case '!build': {
      const projectName = args[0];
      const projectType = args[1] || 'node';
      if (!projectName) return message.reply('Usage: !build <project-name> [node|express|html]\nExample: !build my-saas express');
      const coderModule = require('../core/coder');
      const result = coderModule.createProject(projectName, projectType);
      return message.reply(result);
    }
    case '!code': {
      if (!tenant.config?.boss_discord_id || !message.author.id.includes(tenant.config.boss_discord_id)) {
        return message.reply('Only the boss can use !code.');
      }
      if (!process.env.GITHUB_TOKEN) {
        return message.reply('GITHUB_TOKEN not set — I can\'t edit my codebase yet.');
      }
      const instruction = args.join(' ');
      if (!instruction) return message.reply('Usage: !code <what to change>\nExample: !code add a !ping command that replies with pong');
      await message.reply('🔧 On it — reading my code and making changes...');
      await message.channel.sendTyping();
      const userId = 'discord_' + message.author.id;
      // Route through brain.chat so Jarvis uses his code tools
      const reply = await brain.chat(tenant.id, userId, 'discord', 'UPDATE MY CODE: ' + instruction, message.author.displayName || message.author.username);
      await sendLongMessage(message, reply);
      return;
    }
    case '!help': {
      const embed = new EmbedBuilder().setTitle('Super Jarvis Commands').setColor(0x0099ff)
        .addFields(
          { name: '--- Core ---', value: '\u200b' },
          { name: '!stats', value: 'System statistics' },
          { name: '!memory', value: 'Everything I remember' },
          { name: '!remember <fact>', value: 'Store a permanent fact' },
          { name: '!teach <info>', value: 'Teach me something' },
          { name: '!search <query>', value: 'Search the web' },
          { name: '--- Business ---', value: '\u200b' },
          { name: '!learn <url>', value: 'Analyze YouTube/TikTok/article and learn from it' },
          { name: '!research <niche>', value: 'Deep market research' },
          { name: '!plan <idea>', value: 'Generate a business plan' },
          { name: '!validate <idea>', value: 'Evaluate a business idea (GO/NO-GO)' },
          { name: '!ad <product>', value: 'Generate ad copy' },
          { name: '!spy <niche>', value: 'Scrape Meta Ad Library for competitor ads' },
          { name: '!adpipeline <niche>', value: 'Full pipeline: scrape → analyze → create → launch plan' },
          { name: '!build <name>', value: 'Scaffold a new project' },
          { name: '--- Trading ---', value: '\u200b' },
          { name: '!stock <TICKER>', value: 'Analyze a stock' },
          { name: '!crypto <SYMBOL>', value: 'Analyze a crypto' },
          { name: '!portfolio', value: 'Paper trading portfolio' },
          { name: '--- Solar ---', value: '\u200b' },
          { name: '!solar', value: 'Enerflo pipeline data' },
          { name: '!drip', value: 'Drip campaign status (run: !drip run)' },
          { name: '!remittance', value: 'Parse pay stubs to spreadsheet' },
          { name: '!gmail', value: 'Read emails' },
          { name: '!drive', value: 'Google Drive: list / search / download' },
          { name: '--- Voice ---', value: '\u200b' },
          { name: '!voice <message>', value: 'Jarvis speaks it as an audio clip' },
          { name: '--- Agent ---', value: '\u200b' },
          { name: '!agent', value: 'Agent status / !agent run / !agent tasks' },
          { name: '--- Self-Edit ---', value: '\u200b' },
          { name: '!code <instruction>', value: 'Tell Jarvis to edit his own code (boss only)' },
        ).setFooter({ text: 'Super Jarvis v2.0 — AI Workforce' }).setTimestamp();
      return message.reply({ embeds: [embed] });
    }
    case '!sales': {
      const url = (process.env.RENDER_EXTERNAL_URL || 'https://jarvis-sms-bot.onrender.com') + '/sales';
      const embed = new EmbedBuilder().setTitle('HC Daily Tracker').setColor(0x7B5EA7)
        .setDescription('**[Open Sales Dashboard](' + url + ')**\n\nTrack KPIs, roofing leads, goals, and leaderboards.')
        .setFooter({ text: 'HC Daily Tracker' }).setTimestamp();
      return message.reply({ embeds: [embed] });
    }
    case '!dashboard': {
      const dUrl = (process.env.RENDER_EXTERNAL_URL || 'https://jarvis-sms-bot.onrender.com') + '/dashboard';
      const sUrl = (process.env.RENDER_EXTERNAL_URL || 'https://jarvis-sms-bot.onrender.com') + '/sales';
      const embed = new EmbedBuilder().setTitle('Jarvis Dashboards').setColor(0xa78bfa)
        .addFields(
          { name: 'Mission Control', value: '[Open](' + dUrl + ')', inline: true },
          { name: 'Sales Tracker', value: '[Open](' + sUrl + ')', inline: true }
        )
        .setFooter({ text: 'Super Jarvis v2.0' }).setTimestamp();
      return message.reply({ embeds: [embed] });
    }
    case '!ping': {
      return message.reply('pong');
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
    const userText = message.content.trim();
    const userName = message.author.displayName || message.author.username;
    const tenant = await tenantManager.resolveTenant(discordId);
    if (message.attachments.size > 0) {
      // Handle file attachments — PDFs, images, etc.
      const attachment = message.attachments.first();
      if (attachment.name?.endsWith('.pdf')) {
        try {
          await message.channel.sendTyping();
          const res = await fetch(attachment.url);
          const buffer = Buffer.from(await res.arrayBuffer());
          const contentModule = require('../core/content');
          const result = await contentModule.processContent(buffer, userText || null, tenant?.id);
          let response = '**Analyzed: ' + attachment.name + '**\n\n' + result.analysis;
          if (response.length > 2000) response = response.substring(0, 1997) + '...';
          return message.reply(response);
        } catch (err) {
          return message.reply('Error reading PDF: ' + err.message);
        }
      }
      // For non-PDF attachments, fall through to brain
    }
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
      if (!reply || reply.trim() === '') {
        await message.reply("I processed that but had nothing to say. Try rephrasing?");
        return;
      }
      await sendLongMessage(message, reply);
      // Learn in background — don't let it crash the response
      try {
        const learnResult = await memoryModule.learnFromConversation(tenant.id, userId, 'discord');
        if (learnResult?.stored > 0) {
          const factsList = Array.isArray(learnResult.analysis?.facts) ? learnResult.analysis.facts : [];
          logToDiscord('memory-log', '🧠 **Learned ' + learnResult.stored + ' memories from ' + userName + '**\n' + factsList.map(f => '• ' + f).join('\n'));
        }
      } catch (learnErr) {
        console.error('[DISCORD] Learn error (non-fatal):', learnErr.message);
      }
    } catch (error) {
      console.error('[DISCORD] Error:', error.message, error.stack?.split('\n')[1]);
      const errMsg = error.message?.includes('timeout') ? 'Took too long to respond. Try again.'
        : error.message?.includes('Tenant') ? 'Database issue — tenant not found.'
        : 'Something went wrong: ' + (error.message || 'unknown error').substring(0, 150);
      try { await message.reply(errMsg); } catch (e) { console.error('[DISCORD] Reply failed:', e.message); }
    }
  });

  if (process.env.DISCORD_BOT_TOKEN) {
    let retries = 0;
    const maxRetries = 3;
    const retryDelay = 10000;

    const attemptLogin = () => {
      console.log(`[DISCORD] Attempting login${retries > 0 ? ` (retry ${retries}/${maxRetries})` : ''}...`);
      discord.login(process.env.DISCORD_BOT_TOKEN)
        .then(() => console.log('[DISCORD] Login successful'))
        .catch(err => {
          console.error('[DISCORD] Login failed:', err.message);
          if (err.code === 'TokenInvalid') {
            console.error('[DISCORD] Token is invalid — update DISCORD_BOT_TOKEN in .env');
          } else if (retries < maxRetries) {
            retries++;
            console.log(`[DISCORD] Retrying in ${retryDelay / 1000}s...`);
            setTimeout(attemptLogin, retryDelay);
          } else {
            console.error('[DISCORD] Max retries reached. Server continues without Discord.');
          }
        });
    };

    // Wait 15s so Render kills old instance first — prevents token invalidation
    console.log('[DISCORD] Waiting 15s for old instance to shut down...');
    setTimeout(attemptLogin, 15000);
  } else {
    console.log('[DISCORD] No token, disabled');
  }
}

module.exports = { initDiscord, logToDiscord, sendBossMessage, discord };
