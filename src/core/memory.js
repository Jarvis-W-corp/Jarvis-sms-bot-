const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk').default;
const db = require('../db/queries');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function createEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text.substring(0, 8000),
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('[MEMORY] Embedding error:', error.message);
    return null;
  }
}

async function storeMemory(tenantId, category, content, importance = 5, source = 'system') {
  const embedding = await createEmbedding(content);
  const memory = await db.saveMemory(tenantId, category, content, embedding, importance, source);
  console.log('[MEMORY] Stored ' + category + ': "' + content.substring(0, 60) + '..."');
  return memory;
}

async function recallMemories(tenantId, query, config = {}) {
  const recallCount = config.memory_recall_count || 15;
  const [facts, tasks, decisions, embedding] = await Promise.all([
    db.getFactMemories(tenantId),
    db.getOpenTasks(tenantId),
    db.getRecentDecisions(tenantId),
    createEmbedding(query),
  ]);
  const context = [];
  if (facts.length > 0) {
    context.push('**Permanent Facts:**');
    facts.forEach(f => context.push('- ' + f.content));
  }
  if (tasks.length > 0) {
    context.push('\n**Open Tasks:**');
    tasks.forEach(t => context.push('- ' + t.content));
  }
  if (decisions.length > 0) {
    context.push('\n**Recent Decisions:**');
    decisions.forEach(d => context.push('- ' + d.content));
  }
  if (embedding) {
    const relevant = await db.searchMemories(tenantId, embedding, recallCount, 0.7);
    if (relevant.length > 0) {
      context.push('\n**Relevant Context:**');
      relevant.forEach(r => {
        if (!facts.some(f => f.content === r.content)) {
          context.push('- [' + r.category + '] ' + r.content);
        }
      });
    }
  }
  return context.join('\n');
}

async function learnFromConversation(tenantId, userId, platform) {
  const rawMsgs = await db.getRecentRawConversations(tenantId, userId, 20);
  if (rawMsgs.length < 3) return;
  const userMsgCount = rawMsgs.filter(m => m.role === 'user').length;
  if (userMsgCount % 5 !== 0 || userMsgCount === 0) return;
  const existingFacts = await db.getFactMemories(tenantId);
  const existingFactTexts = existingFacts.map(f => f.content);
  try {
    const convoText = rawMsgs.map(m => m.role + ': ' + m.message).join('\n');
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: 'Analyze this conversation and extract information worth remembering long-term. Return ONLY a JSON object with:\n- "facts": array of short factual strings about the user\n- "decisions": array of decisions made\n- "tasks": array of things to follow up on\n- "summary": a 2-3 sentence summary\n\nAlready known (dont repeat): ' + JSON.stringify(existingFactTexts) + '\n\nConversation:\n' + convoText + '\n\nReturn ONLY valid JSON, no markdown.' }],
    });
    const analysis = JSON.parse(response.content[0].text.trim());
    let stored = 0;
    if (analysis.facts?.length) {
      for (const fact of analysis.facts) {
        if (!existingFactTexts.includes(fact)) { await storeMemory(tenantId, 'fact', fact, 8, userId); stored++; }
      }
    }
    if (analysis.decisions?.length) {
      for (const d of analysis.decisions) { await storeMemory(tenantId, 'decision', d, 7, userId); stored++; }
    }
    if (analysis.tasks?.length) {
      for (const t of analysis.tasks) { await storeMemory(tenantId, 'task', t, 9, userId); stored++; }
    }
    if (analysis.summary) { await storeMemory(tenantId, 'summary', analysis.summary, 5, userId); stored++; }
    console.log('[LEARN] Extracted ' + stored + ' memories from ' + userId);
    return { stored, analysis };
  } catch (error) {
    console.error('[LEARN] Error:', error.message);
    return null;
  }
}

module.exports = { createEmbedding, storeMemory, recallMemories, learnFromConversation };
