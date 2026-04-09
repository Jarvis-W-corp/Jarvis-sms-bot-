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

function isBoss(message, tenant) {
  return message.author.id === tenant.config?.boss_discord_id;
}

const BOSS_ONLY = ['!forget', '!agent', '!drip', '!remittance', '!gmail', '!drive', '!code', '!spy', '!adpipeline', '!shop', '!task'];

async function handleCommand(message, command, args, tenant) {
  const tenantId = tenant.id;
  if (BOSS_ONLY.includes(command) && !isBoss(message, tenant)) {
    return message.reply('That command is restricted to the boss.');
  }
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
        await voice.sendVoiceMemo(voiceText, message.channel);
        // Don't send a text reply - the voice memo is the response
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
    case '!shop': {
      if (!isBoss(message, tenant)) return message.reply('Boss only.');
      const sub = args[0];
      const ecom = require('../core/ecommerce');
      const printifyMod = require('../core/printify');
      if (sub === 'research') {
        const niche = args.slice(1).join(' ') || 'trending';
        await message.reply('🔍 Researching trending products for "' + niche + '"...');
        await message.channel.sendTyping();
        const research = await ecom.researchTrending(niche, 5);
        await sendLongMessage(message, '🛍️ **Product Research: ' + niche + '**\n\n' + research);
        return;
      }
      if (sub === 'create') {
        const designPrompt = args.slice(1).join(' ');
        if (!designPrompt) return message.reply('Usage: !shop create <design description>\nExample: !shop create minimalist mountain sunset design');
        await message.reply('🎨 Generating design + creating product...');
        await message.channel.sendTyping();
        const result = await ecom.createAndListProduct({
          title: designPrompt.substring(0, 60),
          description: designPrompt,
          tags: designPrompt.split(' ').slice(0, 5),
          designPrompt,
          productType: 'tshirt',
          price: 1999,
        });
        return message.reply('✅ Product created on Printify!\nTitle: ' + result.title + '\nVariants: ' + result.variantCount + '\nPublish with: !shop publish ' + result.productId);
      }
      if (sub === 'publish') {
        const productId = args[1];
        if (!productId) return message.reply('Usage: !shop publish <productId>');
        await printifyMod.publishProduct(productId);
        return message.reply('✅ Product published to connected store!');
      }
      if (sub === 'pipeline') {
        const niche = args.slice(1).join(' ') || 'trending';
        await message.reply('🚀 Running full product pipeline: research → design → create...');
        await message.channel.sendTyping();
        const result = await ecom.runProductPipeline(niche, 3, tenantId);
        let response = '🛍️ **Product Pipeline Complete**\n\n';
        response += '**Products Created:** ' + result.products.filter(p => !p.error).length + '\n\n';
        result.products.forEach(p => {
          if (p.error) response += '❌ ' + p.title + ': ' + p.error + '\n';
          else response += '✅ ' + p.title + ' (ID: ' + p.productId + ')\n';
        });
        await sendLongMessage(message, response);
        return;
      }
      if (sub === 'stats') {
        const stats = await printifyMod.getStats();
        return message.reply('🛍️ **Store Stats**\nProducts: ' + stats.totalProducts + '\nOrders: ' + stats.totalOrders);
      }
      if (sub === 'report') {
        await message.reply('📊 Running shop performance report...');
        const shopOpt = require('../core/shop-optimizer');
        const report = await shopOpt.smartRotation(tenantId);
        await sendLongMessage(message, '🏪 ' + report);
        return;
      }
      if (sub === 'fix') {
        await message.reply('🔧 Optimizing all listings...');
        const shopOpt = require('../core/shop-optimizer');
        const results = await shopOpt.optimizeAllListings();
        const summary = results.map(r => r.title + ' → ' + r.status).join('\n');
        return message.reply('✅ **SEO Optimization**\n' + summary);
      }
      return message.reply('Usage:\n`!shop research <niche>` — Find trending products\n`!shop create <design>` — Generate design + create product\n`!shop pipeline <niche>` — Full auto: research → design → list\n`!shop publish <id>` — Publish product to store\n`!shop stats` — Store overview\n`!shop report` — Performance report + recommendations\n`!shop fix` — Fix SEO tags on all listings');
    }
    case '!task': {
      const sub = args[0];
      const taskText = args.slice(1).join(' ');
      if (!sub || !taskText) {
        return message.reply('Usage:\n`!task research <topic>` — Queue Hawk research job\n`!task create <content>` — Queue Ghost content job\n`!task report <topic>` — Queue full research report pipeline\nExamples:\n`!task research 10 peptide companies like Hims`\n`!task create PDF checklist of FDA requirements for peptide sales`\n`!task report competitor analysis for med spa industry`');
      }
      await message.channel.sendTyping();
      try {
        const fulfillment = require('../core/fulfillment');
        const crew = require('../core/crew');

        if (sub === 'research') {
          // Check for count pattern like "10 peptide companies"
          const countMatch = taskText.match(/^(\d+)\s+(.+)/);
          if (countMatch) {
            const count = parseInt(countMatch[1]);
            const topic = countMatch[2];
            const queued = await fulfillment.queueResearchReport(tenantId, topic, null, count);
            return message.reply('**Queued ' + queued.length + ' research jobs:**\n' + queued.map(q => '> ' + q.title + ' (' + q.worker + ')').join('\n') + '\n\nJobs will execute in the next crew cycle.');
          }
          const jobId = await crew.createJob('hawk', 'Research: ' + taskText, 'Research ' + taskText + '. Provide detailed analysis with data, pricing, and actionable insights.', { tenant_id: tenantId, source: 'task_command' }, 7);
          return message.reply('**Research job queued** (ID: ' + jobId + ')\nHawk will research: ' + taskText);
        }

        if (sub === 'create') {
          const jobId = await crew.createJob('ghost', 'Create: ' + taskText, 'Create ' + taskText + '. Make it professional, detailed, and ready to use.', { tenant_id: tenantId, source: 'task_command' }, 7);
          return message.reply('**Content job queued** (ID: ' + jobId + ')\nGhost will create: ' + taskText);
        }

        if (sub === 'report') {
          const queued = await fulfillment.queueResearchReport(tenantId, taskText, null, null);
          return message.reply('**Report pipeline queued** (' + queued.length + ' jobs):\n' + queued.map(q => '> ' + q.title + ' (' + q.worker + ')').join('\n') + '\n\nResearch + compilation will run in the next crew cycle.');
        }

        if (sub === 'build') {
          const jobId = await crew.createJob('ghost', 'Build: ' + taskText, 'Build ' + taskText + '. Create all necessary content, copy, and structure.', { tenant_id: tenantId, source: 'task_command' }, 7);
          return message.reply('**Build job queued** (ID: ' + jobId + ')\nGhost will build: ' + taskText);
        }

        // Default: try to auto-detect worker
        const isResearch = /research|find|analyze|competitor|market|companies/i.test(taskText);
        const worker = isResearch ? 'hawk' : 'ghost';
        const jobId = await crew.createJob(worker, sub + ': ' + taskText, sub + ' ' + taskText + '. Context from !task command.', { tenant_id: tenantId, source: 'task_command' }, 7);
        return message.reply('**Job queued** → ' + (worker === 'hawk' ? 'Hawk' : 'Ghost') + ' (ID: ' + jobId + ')\nTask: ' + sub + ' ' + taskText);
      } catch (err) {
        return message.reply('Task queue error: ' + err.message);
      }
    }
    case '!status': {
      try {
        const crew = require('../core/crew');
        const status = await crew.getCrewStatus();

        let msg = '**Job Status**\n\n';
        msg += '**Queue:** ' + status.jobs.pending + ' pending | ' + status.jobs.running + ' running | ' + status.jobs.completed + ' completed | ' + status.jobs.failed + ' failed\n\n';

        if (status.runningNow && status.runningNow.length > 0) {
          msg += '**Running Now:**\n';
          status.runningNow.forEach(j => {
            msg += '> ' + j.worker + ': ' + j.title + ' (' + j.elapsed + 's, ' + j.iterations + ' iterations)\n';
          });
          msg += '\n';
        }

        if (status.recentJobs && status.recentJobs.length > 0) {
          msg += '**Recent Jobs:**\n';
          status.recentJobs.slice(0, 8).forEach(j => {
            const statusIcon = j.status === 'completed' ? '**done**' : j.status === 'pending' ? '**pending**' : j.status === 'running' ? '**running**' : '**' + j.status + '**';
            const result = j.result ? ' — ' + j.result.substring(0, 80) : '';
            msg += '> [' + statusIcon + '] ' + j.title + result + '\n';
          });
          msg += '\n';
        }

        if (status.workers && status.workers.length > 0) {
          msg += '**Workers:**\n';
          status.workers.forEach(w => {
            msg += '> ' + w.name + ': ' + w.tasks_completed + ' done, ' + w.tasks_failed + ' failed (' + w.successRate + '% success)\n';
          });
        }

        if (status.costs) {
          msg += '\n**24h Cost:** $' + ((status.costs.total_cost || 0).toFixed(4));
        }

        if (msg.length > 2000) msg = msg.substring(0, 1997) + '...';
        return message.reply(msg);
      } catch (err) {
        return message.reply('Status error: ' + err.message);
      }
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
          { name: '--- Tasks ---', value: '\u200b' },
          { name: '!task research/create/report <desc>', value: 'Queue work for agents directly' },
          { name: '!status', value: 'Show all pending/running/completed jobs' },
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
      // Handle file attachments — Videos, PDFs, images, etc.
      const attachment = message.attachments.first();
      const fileName = attachment.name?.toLowerCase() || '';
      const isVideo = fileName.endsWith('.mp4') || fileName.endsWith('.mov') || fileName.endsWith('.webm') || fileName.endsWith('.avi') || fileName.endsWith('.mkv');
      const isPDF = fileName.endsWith('.pdf');
      
      if (isVideo || isPDF) {
        try {
          await message.channel.sendTyping();
          
          if (isVideo) {
            // For videos, analyze the attachment URL and any user text context
            const contentModule = require('../core/content');
            const context = userText || 'Analyze this video content for business insights, opportunities, and actionable items.';
            const result = await contentModule.processVideoAttachment(attachment.url, context, tenant?.id, attachment.name);
            let response = '🎥 **Video Analysis: ' + attachment.name + '**\n\n' + result.analysis;
            if (response.length > 2000) response = response.substring(0, 1997) + '...';
            return message.reply(response);
          }
          
          if (isPDF) {
            const res = await fetch(attachment.url);
            const buffer = Buffer.from(await res.arrayBuffer());
            const contentModule = require('../core/content');
            const result = await contentModule.processContent(buffer, userText || null, tenant?.id);
            let response = '📄 **Analyzed: ' + attachment.name + '**\n\n' + result.analysis;
            if (response.length > 2000) response = response.substring(0, 1997) + '...';
            return message.reply(response);
          }
        } catch (err) {
          return message.reply('Error analyzing ' + (isVideo ? 'video' : 'PDF') + ': ' + err.message);
        }
      }
      // For other attachments, fall through to brain
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
