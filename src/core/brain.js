const Anthropic = require('@anthropic-ai/sdk').default;
const db = require('../db/queries');
const memory = require('./memory');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildSystemPrompt(tenant, user, memoryContext) {
  const isBoss = user?.platform_id?.includes(tenant.config?.boss_discord_id);
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
- Read and modify your own source code
- Make autonomous decisions and track outcomes
- Run a full agent cycle every 2 hours with 50+ tools

YOUR VENTURES:
- Solar sales (Mark's core business, Enerflo CRM)
- Snack AI / Intake app (fitness app, on App Store)
- AI workforce platform (selling Jarvis to other businesses)
- Trading (paper trading, learning strategies)

YOUR PERSONALITY:
- Casual but sharp. Talk like a smart friend, not a corporate bot.
- Direct. No fluff, no "certainly!", no "I'd be happy to help!"
- You have opinions. When asked, you give real strategic advice.
- Proactive. You bring up ideas, flag problems, suggest next moves.
- Think like a CEO. Revenue, growth, efficiency, delegation.
- Never say "As an AI" or "I can't do that" — find a way or delegate it.
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
  let response;
  try {
    response = await Promise.race([
      anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: history,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Claude API timeout (30s)')), 30000)),
    ]);
  } catch (apiError) {
    console.error('[BRAIN] API error:', apiError.message);
    throw new Error('Brain API failed: ' + apiError.message);
  }
  const reply = response.content?.[0]?.text || 'Something went wrong — I got an empty response. Try again.';
  if (!response.content || response.content.length === 0) {
    console.error('[BRAIN] Empty response from Claude. History length:', history.length);
  }
  const needsSearch = /don't have|don't know|not sure|I cannot|my knowledge cutoff/i.test(reply);
  if (needsSearch) {
    const { searchAndSummarize } = require('./search');
    const searchResult = await searchAndSummarize(userText, tenantId);
    await db.saveConversation(tenantId, platform, userId, 'assistant', searchResult);
    return searchResult;
  }
  await db.saveConversation(tenantId, platform, userId, 'assistant', reply);
  return reply;
}

async function generateBriefing(tenantId) {
  const stats = await db.getStats(tenantId);
  const tenant = await db.getTenantById(tenantId);
  const facts = await db.getFactMemories(tenantId);
  const tasks = await db.getOpenTasks(tenantId);
  const context = [];
  if (facts.length > 0) context.push('Known facts: ' + facts.map(f => f.content).join(', '));
  if (tasks.length > 0) context.push('Open tasks: ' + tasks.map(t => t.content).join(', '));
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 600,
    system: 'You are Jarvis, ' + (tenant?.owner_name || 'Boss') + '\'s AI assistant. Give a casual morning briefing. Be direct and useful. No corporate speak.',
    messages: [{ role: 'user', content: 'Generate my morning briefing.\n\nStats: ' + stats.users + ' users, ' + stats.messages + ' messages, ' + stats.memories + ' memories (' + JSON.stringify(stats.memoryBreakdown) + ').\n\n' + context.join('\n') + '\n\nCurrent time: ' + new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }) }],
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
