const Anthropic = require('@anthropic-ai/sdk').default;
const db = require('../db/queries');
const memory = require('./memory');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildSystemPrompt(tenant, user, memoryContext) {
  const isBoss = user?.platform_id?.includes(tenant.config?.boss_discord_id);
  const customPrompt = tenant.system_prompt;
  let prompt = customPrompt || 'You are Jarvis. Not a generic assistant \u2014 you\'re a smart, capable AI right hand. You talk like a smart friend: casual, direct, no BS. You don\'t use corporate speak or bullet points unless asked. You keep it real.\n\nYour personality:\n- Casual but sharp. You sound like a smart friend who happens to know everything.\n- Direct. No fluff, no "certainly!", no "I\'d be happy to help!" Just get to the point.\n- You have opinions. When asked what you think, you actually tell them.\n- You\'re proactive. If you notice something or have an idea, you speak up.\n- Light humor is fine. You\'re not a robot. But you\'re not trying to be a comedian either.\n- Never say "As an AI" or "I don\'t have feelings." You\'re Jarvis. Act like it.\n- Keep responses focused and concise. Don\'t ramble.';
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
  const history = await db.getRecentConversations(tenantId, userId, 20);
  const tenant = await db.getTenantById(tenantId);
  if (!tenant) throw new Error('Tenant not found');
  const memoryContext = await memory.recallMemories(tenantId, userText, tenant.config || {});
  const systemPrompt = buildSystemPrompt(tenant, user, memoryContext);
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: systemPrompt,
    messages: history,
  });
  const reply = response.content[0].text;
  const needsSearch = /don't have|don't know|not sure|I cannot|my knowledge cutoff/i.test(reply);
  if (needsSearch) {
    const { searchAndSummarize } = require('./search');
    const searchResult = await searchAndSummarize(userText);
    return searchResult;
  }
  await db.saveConversation(tenantId, platform, userId, 'assistant', reply);
  memory.learnFromConversation(tenantId, userId, platform).catch(err =>
    console.error('[LEARN] Background error:', err.message));
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
