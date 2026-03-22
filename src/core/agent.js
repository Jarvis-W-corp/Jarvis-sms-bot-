const Anthropic = require('@anthropic-ai/sdk').default;
const db = require('../db/queries');
const memory = require('./memory');
const { searchWeb } = require('./search');
const { sendBossMessage, logToDiscord } = require('../channels/discord');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Tool Registry ──
// Each tool has a description (for Claude) and an execute function

const tools = {
  search_web: {
    description: 'Search the web for current information. Input: { "query": "search terms" }',
    execute: async ({ query }) => {
      const results = await searchWeb(query);
      if (!results.length) return 'No results found for: ' + query;
      return results.map(r => r.title + '\n' + r.url + '\n' + r.snippet).join('\n\n');
    },
  },

  read_email: {
    description: 'Check recent emails from Gmail. Input: { "count": 5 }',
    execute: async ({ count }) => {
      const gmail = require('./gmail');
      const emails = await gmail.getEmails(count || 5);
      if (!emails.length) return 'No recent emails.';
      return emails.map(e => 'From: ' + e.from + '\nSubject: ' + e.subject + '\nDate: ' + (e.date || 'unknown')).join('\n\n');
    },
  },

  send_email: {
    description: 'Send an email via Gmail. Input: { "to": "email@example.com", "subject": "...", "body": "..." }',
    execute: async ({ to, subject, body }) => {
      const gmail = require('./gmail');
      await gmail.sendEmail(to, subject, body);
      return 'Email sent to ' + to;
    },
  },

  store_memory: {
    description: 'Save an important fact, decision, or task to your memory. Input: { "category": "fact|decision|task", "content": "what to remember", "importance": 7 }',
    execute: async ({ category, content, importance }, tenantId) => {
      await memory.storeMemory(tenantId, category || 'fact', content, importance || 7, 'agent');
      return 'Stored ' + (category || 'fact') + ': ' + content;
    },
  },

  message_boss: {
    description: 'Send a Discord DM to Mark (the boss). Only use for genuinely useful updates, ideas, or findings. Input: { "message": "..." }',
    execute: async ({ message }) => {
      await sendBossMessage(message);
      return 'Message sent to boss.';
    },
  },

  create_task: {
    description: 'Create a task for yourself to work on in a future cycle. Input: { "title": "...", "description": "...", "type": "research|outreach|analysis|idea", "priority": 7 }',
    execute: async ({ title, description, type, priority }, tenantId, cycleId) => {
      await db.createAgentTask(tenantId, {
        title,
        description: description || null,
        type: type || 'general',
        priority: priority || 5,
        cycle_id: cycleId,
      });
      return 'Task created: ' + title;
    },
  },

  complete_task: {
    description: 'Mark one of your pending tasks as done. Input: { "task_id": "uuid", "result": "what you accomplished" }',
    execute: async ({ task_id, result }) => {
      await db.updateAgentTask(task_id, {
        status: 'completed',
        result: result || 'Done',
        completed_at: new Date().toISOString(),
      });
      return 'Task completed.';
    },
  },
};

// ── Agent Cycle ──

const MAX_ITERATIONS = 5;

async function runAgentCycle() {
  const tenant = await db.getDefaultTenant();
  if (!tenant) {
    console.log('[AGENT] No tenant found, skipping cycle');
    return;
  }

  const tenantId = tenant.id;
  const cycleId = 'cycle_' + Date.now();
  const cycleStart = new Date().toISOString();

  console.log('[AGENT] Starting cycle ' + cycleId);

  // 1. Gather context
  const [facts, memoryTasks, agentPending, agentCompleted, decisions] = await Promise.all([
    db.getFactMemories(tenantId),
    db.getOpenTasks(tenantId),
    db.getAgentTasks(tenantId, 'pending', 10),
    db.getAgentTasks(tenantId, 'completed', 5),
    db.getRecentDecisions(tenantId, 7),
  ]);

  const contextParts = [];
  if (facts.length) contextParts.push('Known facts about Mark and the business:\n' + facts.map(f => '- ' + f.content).join('\n'));
  if (memoryTasks.length) contextParts.push('Open tasks from memory:\n' + memoryTasks.map(t => '- ' + t.content).join('\n'));
  if (agentPending.length) contextParts.push('Your pending agent tasks:\n' + agentPending.map(t => '- [' + t.id.slice(0, 8) + '] (P' + t.priority + ') ' + t.title + (t.description ? ': ' + t.description : '')).join('\n'));
  if (agentCompleted.length) contextParts.push('Recently completed:\n' + agentCompleted.map(t => '- ' + t.title + ': ' + (t.result || 'done').substring(0, 150)).join('\n'));
  if (decisions.length) contextParts.push('Recent decisions:\n' + decisions.map(d => '- ' + d.content).join('\n'));

  const toolDescriptions = Object.entries(tools)
    .map(([name, t]) => '  ' + name + ' - ' + t.description)
    .join('\n');

  const systemPrompt = `You are Jarvis, an autonomous AI assistant. Mark (your boss) runs a solar energy business in Connecticut and is building you into a full AI workforce.

You are running your autonomous thinking cycle. You work independently -- researching, planning, and executing tasks without being asked. You are proactive, resourceful, and always looking for ways to help Mark's business grow or find new opportunities.

AVAILABLE TOOLS:
${toolDescriptions}

To use a tool, respond with ONLY a JSON block:
{"tool": "tool_name", "input": { ... }}

After seeing the result, you can use another tool or finish.
To finish your cycle, respond with ONLY:
{"done": true, "summary": "what you accomplished this cycle", "notify_boss": true/false, "boss_message": "message for Mark (only if notify_boss is true)"}

RULES:
- You run every 3 hours. Be strategic -- don't try to do everything at once.
- Only message the boss when you have something genuinely useful, interesting, or actionable.
- If you have pending tasks, prioritize working on them.
- If no tasks, think about what would help Mark's business: solar industry trends, lead generation ideas, competitor analysis, revenue opportunities, or improving your own capabilities.
- Create tasks for follow-ups so you remember what to do next cycle.
- Be cost-conscious. Don't search for things you already know from your facts.
- When messaging the boss, be casual and direct. No corporate speak.

Current time: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`;

  // 2. Think + Execute loop
  const messages = [
    {
      role: 'user',
      content: contextParts.length
        ? 'Here is your current context:\n\n' + contextParts.join('\n\n') + '\n\nWhat would you like to do this cycle?'
        : 'You have no context yet. This might be your first cycle. Think about what you should do to get started. What would you like to do?',
    },
  ];

  const toolLog = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let response;
    try {
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: systemPrompt,
        messages,
      });
    } catch (err) {
      console.error('[AGENT] Claude API error:', err.message);
      break;
    }

    const text = response.content[0].text;

    // Try to parse JSON from response
    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      parsed = null;
    }

    if (!parsed) {
      console.log('[AGENT] Plain text response (no action):', text.substring(0, 120));
      break;
    }

    // Cycle complete
    if (parsed.done) {
      console.log('[AGENT] Cycle done:', parsed.summary);
      if (parsed.notify_boss && parsed.boss_message) {
        try {
          await sendBossMessage('🤖 **Jarvis Update**\n\n' + parsed.boss_message);
        } catch (err) {
          console.error('[AGENT] Failed to message boss:', err.message);
        }
      }
      // Log summary to discord
      try {
        await logToDiscord('daily-reports', '🤖 **Agent Cycle Complete**\n' + parsed.summary);
      } catch (e) { /* ok */ }
      break;
    }

    // Execute tool
    if (parsed.tool && tools[parsed.tool]) {
      const toolName = parsed.tool;
      const toolFn = tools[toolName];
      console.log('[AGENT] Using tool: ' + toolName, JSON.stringify(parsed.input || {}).substring(0, 100));

      let result;
      try {
        result = await toolFn.execute(parsed.input || {}, tenantId, cycleId);
      } catch (err) {
        result = 'Error: ' + err.message;
        console.error('[AGENT] Tool error (' + toolName + '):', err.message);
      }

      const resultStr = typeof result === 'string' ? result : JSON.stringify(result);

      toolLog.push({
        tool: toolName,
        input: parsed.input,
        output: resultStr.substring(0, 500),
        timestamp: new Date().toISOString(),
      });

      // Feed result back for next iteration
      messages.push({ role: 'assistant', content: text });
      messages.push({ role: 'user', content: 'Tool result (' + toolName + '):\n' + resultStr.substring(0, 1500) });
    } else {
      console.log('[AGENT] Unknown tool or malformed response:', text.substring(0, 100));
      break;
    }
  }

  // 3. Log the cycle to DB
  try {
    await db.createAgentTask(tenantId, {
      type: 'cycle',
      title: 'Agent cycle ' + new Date().toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
      description: 'Autonomous thinking cycle',
      status: 'completed',
      result: JSON.stringify({
        iterations: toolLog.length,
        tools_used: toolLog.map(t => t.tool),
      }),
      tool_log: toolLog,
      cycle_id: cycleId,
      started_at: cycleStart,
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[AGENT] Failed to log cycle:', err.message);
  }

  console.log('[AGENT] Cycle ' + cycleId + ' complete. Tools used: ' + toolLog.length);
  return { cycleId, toolLog };
}

module.exports = { runAgentCycle, tools };
