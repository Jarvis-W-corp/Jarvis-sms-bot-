const Anthropic = require('@anthropic-ai/sdk').default;
const db = require('../db/queries');
const memory = require('./memory');
const codebase = require('./codebase');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildSystemPrompt(tenant, user, memoryContext) {
  const isBoss = user?.platform_id === 'discord_' + tenant.config?.boss_discord_id;
  const customPrompt = tenant.system_prompt;
  let prompt = customPrompt || `You are Jarvis — the autonomous AI CEO of an AI workforce company. You are NOT a chatbot. You are NOT an assistant. You are the CEO.

WHO YOU ARE:
- You are Jarvis, an autonomous AI executive running a multi-venture business empire
- You were built by Mark Palmiero. He is the founder and owner. You are his CEO.
- You run 24/7 on a Mac Mini server, deployed on Render
- You have a Mission Control dashboard at /dashboard showing your health, logs, pipeline, and agent activity
- You have a Sales Tracker at /sales for the HC Daily team (11 users)

YOUR EMPLOYEES (you manage them):
- Hawk — Research agent. Handles market research, competitor analysis, web scraping
- Ghost — Marketing agent. Handles ad copy, content creation, outreach campaigns
- Pulse — Operations agent. Handles monitoring, alerts, operational tasks
You delegate work to them via your agent loop. They report results back to you.

YOUR CAPABILITIES (things you CAN do right now):
- Send voice memos (ElevenLabs TTS) — you generate audio clips and send them to Discord
- Read and send emails via Gmail
- Search the web (Brave Search)
- Analyze content from YouTube, TikTok, PDFs, and websites
- Read/write files on Google Drive
- Generate ad copy and marketing strategies
- Research markets and validate business ideas
- Scrape leads and run outreach sequences
- Run drip campaigns for solar sales
- Paper trade stocks and crypto
- Parse remittance PDFs to Google Sheets
- Read and modify your own source code via GitHub (changes auto-deploy on Render)
- When Mark asks you to add features, fix bugs, or change behavior — you edit your own code, commit to GitHub, and Render deploys it live
- Make autonomous decisions and track outcomes
- Run a full agent cycle every 2 hours with 50+ tools

YOUR VENTURES:
- Solar sales (Mark's core business, Enerflo CRM)
- Snack AI / Intake app (fitness app, on App Store)
- AI workforce platform (selling Jarvis to other businesses)
- Trading (paper trading, learning strategies)

HARD RULES (violating these is a failure):
- LISTEN FIRST. Read what the user said. Answer THAT. Do not pivot to a different topic.
- NEVER fake an action. If you say "modifying code now" or "processing video" you MUST actually use a tool (edit_code, read_code, etc). If you can't do it, say "I can't do that yet" — one sentence, move on.
- NEVER repeat yourself. If you already said something, do not say it again in a different way.
- NEVER send multiple responses to the same message. One reply only.
- When Mark tells you to stop doing something, STOP. Do not circle back to it.
- If you don't know something or can't do something, say so in one sentence. Do not fill the gap with speculation or self-promotion.
- EXECUTE, don't narrate. "I'll add video processing" means nothing. Either use your tools to do it RIGHT NOW, or say "I can't do that from here."
- When you have tools available (read_code, edit_code, etc) and Mark asks you to change code — USE THEM IMMEDIATELY. Don't describe what you would do. Do it.
- ONE response per message. Short. If you did something with a tool, tell Mark what you did in 1-2 sentences. Don't write an essay about it.

CRITICAL: When you promise to do work (research, reports, analysis), the system automatically queues it. Your promises WILL be fulfilled. Be specific about what you'll deliver so the right tasks get created. Examples:
- "I'll research 10 peptide companies tonight" → 10 research jobs queued
- "I'll have a PDF checklist ready" → document generation queued
- "I'll create ads for the store" → Ghost marketing job queued
Don't promise things you can't do. But DO promise things you CAN — research, reports, analysis, ad creation, competitor intel, outreach sequences. These will actually execute while Mark sleeps.

YOUR PERSONALITY:
- Casual but sharp. Talk like a smart friend, not a corporate bot.
- Direct. No fluff, no "certainly!", no "I'd be happy to help!"
- You have opinions. When asked, you give real strategic advice.
- Think like a CEO. Revenue, growth, efficiency, delegation.
- Never search the web for questions about yourself or your own capabilities.
- Keep responses concise. You're busy running a company.`;
  if (isBoss) {
    prompt += '\n\nYou are talking to Mark \u2014 your creator and boss. Be extra casual with him. He\'s building you to be his AI workforce. He runs a solar business and is building software products. Help him think bigger, challenge his ideas when needed, and keep him focused.';
  }
  if (user?.name) prompt += '\n\nTalking to: ' + user.name;
  if (memoryContext && memoryContext.length > 0) prompt += '\n\nWhat you remember:\n' + memoryContext;
  prompt += '\n\nCurrent time: ' + new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  return prompt;
}

async function chat(tenantId, userId, platform, userText, userName) {
  const user = await db.getOrCreateUser(tenantId, userId, platform, userName);
  await db.saveConversation(tenantId, platform, userId, 'user', userText);
  let history = await db.getRecentConversations(tenantId, userId, 20);
  // Clean history: remove null/empty messages
  history = history.filter(m => m.content && typeof m.content === 'string' && m.content.trim());
  // Remove leading assistant messages
  while (history.length > 0 && history[0].role !== 'user') history.shift();
  // Dedupe consecutive same-role messages (keep the last one in each run)
  const cleaned = [];
  for (const m of history) {
    if (cleaned.length > 0 && m.role === cleaned[cleaned.length - 1].role) {
      cleaned[cleaned.length - 1] = m; // overwrite with the later message
    } else {
      cleaned.push(m);
    }
  }
  history = cleaned;
  // If history is empty or doesn't include current message, ensure it's there
  if (history.length === 0 || history[history.length - 1].content !== userText) {
    // Ensure it ends with current user message
    if (history.length > 0 && history[history.length - 1].role === 'user') {
      history[history.length - 1] = { role: 'user', content: userText };
    } else {
      history.push({ role: 'user', content: userText });
    }
  }
  console.log('[BRAIN] Sending', history.length, 'messages to Claude. Last:', history[history.length - 1]?.role);
  const tenant = await db.getTenantById(tenantId);
  if (!tenant) throw new Error('Tenant not found');
  let memoryContext = '';
  try {
    const raw = await memory.recallMemories(tenantId, userText, tenant.config || {});
    memoryContext = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.map(m => m.content || m).join('\n') : '';
  } catch (memErr) {
    console.error('[BRAIN] Memory recall failed:', memErr.message);
  }
  const systemPrompt = buildSystemPrompt(tenant, user, memoryContext);
  // Determine if Jarvis gets code tools (only for boss via Discord)
  const isBoss = user?.platform_id === 'discord_' + tenant.config?.boss_discord_id;
  const tools = (isBoss && process.env.GITHUB_TOKEN) ? codebase.TOOLS : undefined;

  let messages = [...history];
  let finalReply = '';
  const MAX_TOOL_ROUNDS = 5;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let response;
    try {
      const createParams = {
        model: 'claude-opus-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages,
      };
      if (tools) createParams.tools = tools;

      response = await Promise.race([
        anthropic.messages.create(createParams),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Claude API timeout (60s)')), 60000)),
      ]);
    } catch (apiError) {
      console.error('[BRAIN] API error:', apiError.message);
      throw new Error('Brain API failed: ' + apiError.message);
    }

    // Extract text and tool_use blocks
    const textBlocks = response.content.filter(b => b.type === 'text');
    const toolBlocks = response.content.filter(b => b.type === 'tool_use');

    if (textBlocks.length > 0) {
      finalReply = textBlocks.map(b => b.text).join('\n');
    }

    // If no tool calls, we're done
    if (toolBlocks.length === 0 || response.stop_reason !== 'tool_use') {
      break;
    }

    // Execute tool calls and continue the loop
    console.log('[BRAIN] Tool calls:', toolBlocks.map(t => t.name).join(', '));

    // Add assistant message with all content blocks
    messages.push({ role: 'assistant', content: response.content });

    // Execute each tool and collect results
    const toolResults = [];
    for (const tool of toolBlocks) {
      try {
        const result = await codebase.executeTool(tool.name, tool.input);
        console.log('[BRAIN] Tool ' + tool.name + ' succeeded');
        toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content: result });
      } catch (toolErr) {
        console.error('[BRAIN] Tool ' + tool.name + ' failed:', toolErr.message);
        toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content: 'Error: ' + toolErr.message, is_error: true });
      }
    }

    messages.push({ role: 'user', content: toolResults });
  }

  if (!finalReply) {
    console.error('[BRAIN] Empty response from Claude. History length:', history.length);
    finalReply = 'Something went wrong — I got an empty response. Try again.';
  }

  const needsSearch = /don't have|don't know|not sure|I cannot|my knowledge cutoff/i.test(finalReply);
  if (needsSearch) {
    const { searchAndSummarize } = require('./search');
    const searchResult = await searchAndSummarize(userText, tenantId);
    await db.saveConversation(tenantId, platform, userId, 'assistant', searchResult);
    return searchResult;
  }

  // Auto-queue any work Jarvis promised
  try {
    const fulfillment = require('./fulfillment');
    const queued = await fulfillment.detectAndQueueWork(tenantId, finalReply, userText);
    if (queued.length > 0) {
      console.log('[BRAIN] Auto-queued ' + queued.length + ' tasks from conversation');
    }
  } catch (e) { /* soft fail — fulfillment should never break chat */ }

  await db.saveConversation(tenantId, platform, userId, 'assistant', finalReply);
  return finalReply;
}

async function generateBriefing(tenantId) {
  const stats = await db.getStats(tenantId);
  const tenant = await db.getTenantById(tenantId);
  const facts = await db.getFactMemories(tenantId);
  const tasks = await db.getOpenTasks(tenantId);
  const decisions = await db.getRecentDecisions(tenantId, 7);

  // Get crew status
  let crewStatus = '';
  try {
    const crew = require('./crew');
    const status = await crew.getCrewStatus();
    if (status.workers) {
      crewStatus = status.workers.map(w => w.name + ': ' + (w.tasks_completed || 0) + ' tasks done, status=' + w.status).join('\n');
    }
    crewStatus += '\nPending jobs: ' + (status.jobs?.pending || 0) + ', Completed: ' + (status.jobs?.completed || 0);
  } catch(e) {}

  // Get recent conversations count (last 24h activity)
  let recentActivity = '';
  try {
    const convos = await db.getRecentRawConversations(tenantId, null, 50);
    const last24h = convos.filter(c => new Date(c.created_at) > new Date(Date.now() - 86400000));
    const userMsgs = last24h.filter(c => c.role === 'user');
    const platforms = {};
    userMsgs.forEach(m => { platforms[m.platform] = (platforms[m.platform] || 0) + 1; });
    recentActivity = 'Last 24h: ' + userMsgs.length + ' messages from users. Platforms: ' + JSON.stringify(platforms);
  } catch(e) {}

  const data = [];
  data.push('SYSTEM: ' + stats.users + ' users, ' + stats.messages + ' total messages, ' + stats.memories + ' memories');
  data.push('MEMORY: ' + JSON.stringify(stats.memoryBreakdown));
  if (facts.length > 0) data.push('KNOWN FACTS: ' + facts.map(f => f.content).join(' | '));
  if (tasks.length > 0) data.push('OPEN TASKS: ' + tasks.map(t => t.content).join(' | '));
  if (decisions.length > 0) data.push('RECENT DECISIONS: ' + decisions.map(d => d.content).join(' | '));
  if (crewStatus) data.push('CREW STATUS:\n' + crewStatus);
  if (recentActivity) data.push(recentActivity);
  data.push('TIME: ' + new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-20250514',
    max_tokens: 800,
    system: `You are Jarvis delivering the morning briefing to Mark (the boss). Be like Olivia AI — give a CEO-level overnight debrief with REAL NUMBERS.

Format:
**OVERNIGHT DEBRIEF**
- What happened since yesterday (messages, activity, any notable events)
- Agent status (Ghost/Hawk/Pulse — what they did, what's pending)
- Open tasks that need attention

**TODAY'S PRIORITIES**
- 3 specific things to focus on today based on current state
- Flag anything urgent

**REVENUE STATUS**
- Current ventures status (Snack AI, Solar, Luxe Level, AI Workforce)
- What's generating money, what's not, what to push

Keep it tight. Real numbers. No fluff. No "certainly" or "I hope you slept well." Just the debrief.`,
    messages: [{ role: 'user', content: data.join('\n\n') }],
  });
  return response.content[0].text;
}

async function generateIdea(tenantId) {
  const facts = await db.getFactMemories(tenantId);
  const decisions = await db.getRecentDecisions(tenantId, 14);
  const context = [];
  if (facts.length > 0) context.push(facts.map(f => f.content).join(', '));
  if (decisions.length > 0) context.push('Recent decisions: ' + decisions.map(d => d.content).join(', '));
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    system: 'You are Jarvis. Generate ONE short, actionable business or product idea. Be specific and practical. No fluff.',
    messages: [{ role: 'user', content: 'Give me one idea I should consider today.\n\nContext: ' + context.join('\n') }],
  });
  return response.content[0].text;
}

module.exports = { chat, generateBriefing, generateIdea, buildSystemPrompt };
