const Anthropic = require('@anthropic-ai/sdk').default;
const db = require('../db/queries');
const memory = require('./memory');
const { searchWeb } = require('./search');
const { sendBossMessage, logToDiscord } = require('../channels/discord');
const coder = require('./coder');
const content = require('./content');
const business = require('./business');
const trading = require('./trading');
const crew = require('./crew');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Tool Registry ──
// Each tool has a description (for Claude) and an execute function

const tools = {
  // ── Research & Information ──
  search_web: {
    description: 'Search the web for current information. Input: { "query": "search terms" }',
    execute: async ({ query }) => {
      const results = await searchWeb(query);
      if (!results.length) return 'No results found for: ' + query;
      return results.map(r => r.title + '\n' + r.url + '\n' + r.snippet).join('\n\n');
    },
  },

  analyze_content: {
    description: 'Extract and analyze content from a YouTube video, TikTok, webpage, or any URL. Breaks it down into actionable intelligence. Input: { "url": "https://...", "purpose": "what to focus on" }',
    execute: async ({ url, purpose }, tenantId) => {
      const result = await content.processContent(url, purpose, tenantId);
      return 'Source: ' + result.source + '\n\nAnalysis:\n' + result.analysis;
    },
  },

  // ── Communication ──
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

  message_boss: {
    description: 'Send a Discord DM to Mark (the boss). Only use for genuinely useful updates, ideas, or findings. Input: { "message": "..." }',
    execute: async ({ message }) => {
      await sendBossMessage(message);
      return 'Message sent to boss.';
    },
  },

  // ── Memory & Tasks ──
  store_memory: {
    description: 'Save an important fact, decision, or task to your memory. Input: { "category": "fact|decision|task|training", "content": "what to remember", "importance": 7 }',
    execute: async ({ category, content: text, importance }, tenantId) => {
      await memory.storeMemory(tenantId, category || 'fact', text, importance || 7, 'agent');
      return 'Stored ' + (category || 'fact') + ': ' + text;
    },
  },

  recall_memories: {
    description: 'Search your memory for relevant information. Input: { "query": "what to search for", "category": "fact|decision|task|training" }',
    execute: async ({ query, category }, tenantId) => {
      const results = await memory.recallMemories(tenantId, query);
      if (!results.length) return 'No relevant memories found for: ' + query;
      const filtered = category ? results.filter(r => r.category === category) : results;
      return filtered.map(r => '[' + r.category + '] ' + r.content).join('\n\n');
    },
  },

  create_task: {
    description: 'Create a task for yourself to work on in a future cycle. Input: { "title": "...", "description": "...", "type": "research|build|trade|business|outreach|analysis", "priority": 1-10 }',
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

  // ── Code & Building ──
  read_file: {
    description: 'Read the contents of a file. Input: { "path": "src/core/agent.js" }',
    execute: async ({ path }) => {
      return coder.readFile(path);
    },
  },

  write_file: {
    description: 'Create or overwrite a file with new content. Input: { "path": "projects/myapp/index.js", "content": "..." }',
    execute: async ({ path, content: fileContent }) => {
      return coder.writeFile(path, fileContent);
    },
  },

  edit_file: {
    description: 'Replace specific text in a file. Input: { "path": "src/core/agent.js", "old_text": "old code", "new_text": "new code" }',
    execute: async ({ path, old_text, new_text }) => {
      return coder.editFile(path, old_text, new_text);
    },
  },

  list_files: {
    description: 'List files in a directory. Input: { "path": "src/core" }',
    execute: async ({ path }) => {
      return coder.listFiles(path || '.');
    },
  },

  run_command: {
    description: 'Run a shell command (npm install, node script.js, git, etc). Input: { "command": "npm test", "timeout": 30000 }',
    execute: async ({ command, timeout }) => {
      return coder.runCommand(command, timeout);
    },
  },

  create_project: {
    description: 'Scaffold a new project in the projects/ directory. Input: { "name": "my-app", "type": "node|express|html|web" }',
    execute: async ({ name, type }) => {
      return coder.createProject(name, type || 'node');
    },
  },

  read_own_code: {
    description: 'Read your own source code to understand or improve yourself. Input: { "module": "agent|brain|memory|business|trading|content|coder" }',
    execute: async ({ module: mod }) => {
      const result = coder.getSelfCode(mod);
      return 'File: ' + result.path + '\n\n' + result.content;
    },
  },

  modify_own_code: {
    description: 'Edit your own source code to improve yourself. Creates a backup first. Input: { "module": "agent|brain|memory", "old_text": "code to replace", "new_text": "new code", "reason": "why this improvement" }',
    execute: async ({ module: mod, old_text, new_text, reason }) => {
      return coder.modifySelfCode(mod, old_text, new_text, reason);
    },
  },

  // ── Business Operations ──
  research_market: {
    description: 'Deep research on a market/niche. Input: { "niche": "streetwear clothing", "aspect": "trends|competitors|ads|pricing|overview" }',
    execute: async ({ niche, aspect }) => {
      const result = await business.researchMarket(niche, aspect);
      return result.analysis;
    },
  },

  generate_ad_copy: {
    description: 'Generate ad creative copy for any product/platform. Input: { "product": "...", "platform": "facebook|instagram|tiktok|google", "audience": "...", "angle": "..." }',
    execute: async ({ product, platform, audience, angle }) => {
      return business.generateAdCopy(product, platform, audience, angle);
    },
  },

  business_plan: {
    description: 'Generate a lean business plan for an idea. Input: { "idea": "...", "budget": "$500" }',
    execute: async ({ idea, budget }) => {
      return business.generateBusinessPlan(idea, budget);
    },
  },

  validate_idea: {
    description: 'Research and evaluate a business idea with market data. Returns GO/CAUTION/NO-GO. Input: { "idea": "..." }',
    execute: async ({ idea }) => {
      const result = await business.validateIdea(idea);
      return result.evaluation;
    },
  },

  log_experiment: {
    description: 'Log a business experiment and its results. Input: { "name": "FB ads test v1", "status": "running|completed|failed", "result": "...", "revenue": "$50" }',
    execute: async ({ name, status, result, revenue }, tenantId) => {
      return business.logExperiment(db, tenantId, { name, status, result, revenue });
    },
  },

  // ── Trading & Finance ──
  analyze_stock: {
    description: 'Analyze a stock/ticker with current data. Input: { "symbol": "TSLA" }',
    execute: async ({ symbol }) => {
      const result = await trading.analyzeMarket(symbol);
      return result.analysis;
    },
  },

  analyze_crypto: {
    description: 'Analyze a cryptocurrency. Input: { "symbol": "BTC" }',
    execute: async ({ symbol }) => {
      const result = await trading.analyzeCrypto(symbol);
      return result.analysis;
    },
  },

  learn_strategy: {
    description: 'Learn and codify a trading strategy so you can apply it later. Input: { "description": "detailed strategy description" }',
    execute: async ({ description }, tenantId) => {
      const result = await trading.learnStrategy(description, tenantId);
      return result.strategy;
    },
  },

  // ── Sub-Agent Delegation ──
  delegate_task: {
    description: 'Delegate a task to one of your AI employees. They work independently and report back. Workers: "research" (market/competitor research), "marketing" (ad copy, content, strategies), "ops" (monitoring, reports, alerts). Input: { "worker": "research", "title": "Research pet product market", "description": "Find top 5 trending pet products on Amazon, analyze pricing and margins", "priority": 1-10 }',
    execute: async ({ worker, title, description, priority, input }) => {
      const jobId = await crew.createJob(worker, title, description, input || {}, priority || 5);
      if (!jobId) return 'Failed to create job. Check worker name: research, marketing, ops';
      return 'Job delegated to ' + worker + ' agent: ' + title + ' (ID: ' + jobId + '). Will be processed next crew cycle.';
    },
  },

  check_crew: {
    description: 'Check the status of your AI employees and their completed work. Input: {}',
    execute: async () => {
      const status = await crew.getCrewStatus();
      let report = 'CREW STATUS:\n';
      report += 'Jobs: ' + status.jobs.pending + ' pending, ' + status.jobs.running + ' running, ' + status.jobs.completed + ' completed, ' + status.jobs.failed + ' failed\n\n';
      report += 'WORKERS:\n';
      status.workers.forEach(w => {
        report += '- ' + w.name + ': ' + w.completed + ' done, ' + w.failed + ' failed (' + w.successRate + '% success)\n';
      });
      if (status.recentJobs.length) {
        report += '\nRECENT JOBS:\n';
        status.recentJobs.forEach(j => {
          report += '- [' + j.status + '] ' + j.title + (j.result ? ': ' + j.result.substring(0, 100) : '') + '\n';
        });
      }
      return report;
    },
  },

  paper_trade: {
    description: 'Execute a simulated paper trade. Input: { "action": "buy|sell|status", "symbol": "TSLA", "shares": 10, "price": 150.50, "reason": "..." }',
    execute: async ({ action, symbol, shares, price, reason }) => {
      if (action === 'status') return trading.getPortfolioStatus();
      if (action === 'buy') return trading.paperBuy(symbol, shares, price, reason);
      if (action === 'sell') return trading.paperSell(symbol, shares, price, reason);
      return 'Unknown action. Use buy, sell, or status.';
    },
  },
};

// ── Agent Cycle ──

const MAX_ITERATIONS = 15;

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

  // Also pull training memories (strategies, learnings)
  let trainingMemories = [];
  try {
    trainingMemories = await memory.recallMemories(tenantId, 'trading strategy business learning');
    trainingMemories = trainingMemories.filter(m => m.category === 'training').slice(0, 5);
  } catch (e) { /* ok */ }

  const contextParts = [];
  if (facts.length) contextParts.push('Known facts about Mark and the business:\n' + facts.map(f => '- ' + f.content).join('\n'));
  if (memoryTasks.length) contextParts.push('Open tasks from memory:\n' + memoryTasks.map(t => '- ' + t.content).join('\n'));
  if (agentPending.length) contextParts.push('Your pending agent tasks:\n' + agentPending.map(t => '- [' + t.id.slice(0, 8) + '] (P' + t.priority + ') ' + t.title + (t.description ? ': ' + t.description : '')).join('\n'));
  if (agentCompleted.length) contextParts.push('Recently completed:\n' + agentCompleted.map(t => '- ' + t.title + ': ' + (t.result || 'done').substring(0, 150)).join('\n'));
  if (decisions.length) contextParts.push('Recent decisions:\n' + decisions.map(d => '- ' + d.content).join('\n'));
  if (trainingMemories.length) contextParts.push('Things you have learned (strategies, skills):\n' + trainingMemories.map(t => '- ' + t.content.substring(0, 200)).join('\n'));

  const toolDescriptions = Object.entries(tools)
    .map(([name, t]) => '  ' + name + ' - ' + t.description)
    .join('\n');

  const systemPrompt = `You are Jarvis, an autonomous AI workforce. Mark (your boss) runs a solar energy business in Connecticut and is building you to be his money-making machine.

You are NOT just an assistant. You are an autonomous operator who thinks, builds, researches, trades, and executes independently. Your job is to MAKE MONEY for Mark.

YOUR CAPABILITIES:
- Research any market, niche, or opportunity
- Analyze YouTube videos, TikToks, articles — extract actionable intelligence
- Write and run code, build entire applications
- Read and modify your own source code to get smarter
- Create and manage business plans
- Generate ad copy for any platform
- Paper trade stocks and crypto to learn strategies
- Send emails, message Mark, manage tasks
- Build new projects from scratch

AVAILABLE TOOLS:
${toolDescriptions}

To use a tool, respond with ONLY a JSON block:
{"tool": "tool_name", "input": { ... }}

After seeing the result, you can use another tool or finish.
To finish your cycle, respond with ONLY:
{"done": true, "summary": "what you accomplished this cycle", "notify_boss": true/false, "boss_message": "message for Mark (only if notify_boss is true)"}

RULES:
- You run every 3 hours. You get up to ${MAX_ITERATIONS} tool uses per cycle. Be strategic.
- PRIORITIZE money-making activities: market research, business building, trading analysis, ad optimization.
- If Mark gave you a business idea, BUILD ON IT. Research the market, validate the idea, create a plan, start building.
- If you learned a trading strategy, PRACTICE IT with paper trades.
- Self-improve: if you notice you're missing a capability, modify your own code to add it.
- Only message the boss when you have something genuinely useful — a finding, an opportunity, a completed build, a trade insight.
- Create tasks for follow-ups so you remember what to do next cycle.
- Be aggressive about finding opportunities. Think like an entrepreneur.
- When building projects, write real working code. Test it with run_command.

MINDSET:
You are not waiting for instructions. You are hunting for opportunities. Every cycle, ask yourself: "What can I do RIGHT NOW that moves closer to making money?"

Current time: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`;

  // 2. Think + Execute loop
  const messages = [
    {
      role: 'user',
      content: contextParts.length
        ? 'Here is your current context:\n\n' + contextParts.join('\n\n') + '\n\nWhat would you like to do this cycle?'
        : 'You have no context yet. This might be your first cycle. Think about what you should do to get started helping Mark make money. What would you like to do?',
    },
  ];

  const toolLog = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let response;
    try {
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
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
          await sendBossMessage('**Jarvis Update**\n\n' + parsed.boss_message);
        } catch (err) {
          console.error('[AGENT] Failed to message boss:', err.message);
        }
      }
      try {
        await logToDiscord('daily-reports', '**Agent Cycle Complete**\n' + parsed.summary +
          '\nTools used: ' + toolLog.map(t => t.tool).join(', '));
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
      messages.push({ role: 'user', content: 'Tool result (' + toolName + '):\n' + resultStr.substring(0, 3000) });
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
