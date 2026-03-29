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
const ventures = require('./ventures');

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
    description: 'Send Mark a message via Discord DM. Use for important updates, opportunities, questions that need his input. Input: { "message": "..." }',
    execute: async ({ message }) => {
      await sendBossMessage(message);
      return 'Discord message sent to boss.';
    },
  },

  text_boss: {
    description: 'Send Mark a TEXT MESSAGE (SMS) to his phone. Use this for urgent, high-value updates that he needs to see immediately — revenue milestones, hot opportunities, critical decisions. More personal than Discord. Input: { "message": "..." }',
    execute: async ({ message }) => {
      const hustle = require('./hustle');
      await hustle.textBoss(message);
      return 'Text sent to boss phone.';
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

  // ── CEO Operations ──
  ceo_report: {
    description: 'Get your full CEO dashboard — all ventures, revenue, decisions, win rate. Use this at the start of every cycle to know where things stand. Input: {}',
    execute: async () => {
      return ventures.getCEOReport();
    },
  },

  manage_venture: {
    description: 'Create or update a business venture. Input: { "action": "create|update|list", "name": "BiteLens", "status": "idea|validating|building|launched|active|paused|killed", "category": "app|saas|ecommerce|trading|service", "monthly_revenue": 0, "users_count": 0, "next_actions": ["action1", "action2"], "notes": "..." }',
    execute: async ({ action, name, status, category, monthly_revenue, users_count, next_actions, notes }) => {
      if (action === 'list') {
        const all = await ventures.getVentures();
        return all.map(v => v.name + ' [' + v.status + '] $' + (v.monthly_revenue || 0) + '/mo').join('\n') || 'No ventures tracked yet.';
      }
      if (action === 'create') {
        const v = await ventures.createVenture(name, category, notes);
        return 'Created venture: ' + v.name + ' (ID: ' + v.id + ')';
      }
      if (action === 'update') {
        const v = await ventures.getVenture(name);
        if (!v) return 'Venture not found: ' + name;
        const updates = {};
        if (status) updates.status = status;
        if (monthly_revenue !== undefined) updates.monthly_revenue = monthly_revenue;
        if (users_count !== undefined) updates.users_count = users_count;
        if (next_actions) updates.next_actions = next_actions;
        if (notes) updates.notes = notes;
        const updated = await ventures.updateVenture(v.id, updates);
        return 'Updated ' + updated.name + ': ' + JSON.stringify(updates);
      }
      return 'Unknown action. Use create, update, or list.';
    },
  },

  make_decision: {
    description: 'Log a business decision with your reasoning and expected outcome. You will review outcomes later to improve your judgment. Input: { "venture": "BiteLens", "decision": "Launch on App Store this week", "reasoning": "MVP is ready, market window is now", "expected_outcome": "100 downloads in first week" }',
    execute: async ({ venture, decision, reasoning, expected_outcome }) => {
      let ventureId = null;
      if (venture) {
        const v = await ventures.getVenture(venture);
        if (v) ventureId = v.id;
      }
      const d = await ventures.logDecision(ventureId, decision, reasoning, expected_outcome);
      return 'Decision logged (ID: ' + d.id + '): ' + decision;
    },
  },

  review_decision: {
    description: 'Review a past decision — did it work? What actually happened? This builds your judgment over time. Input: { "decision_id": "uuid", "actual_outcome": "Got 47 downloads, not 100", "succeeded": true, "revenue_impact": 235 }',
    execute: async ({ decision_id, actual_outcome, succeeded, revenue_impact }) => {
      const d = await ventures.reviewDecision(decision_id, actual_outcome, succeeded, revenue_impact);
      return 'Decision reviewed: ' + (succeeded ? 'SUCCEEDED' : 'FAILED') + ' — ' + actual_outcome;
    },
  },

  log_revenue: {
    description: 'Log revenue or costs for a venture. Input: { "venture": "BiteLens", "amount": 49.99, "type": "revenue|cost", "source": "App Store subscription", "notes": "First paying customer!" }',
    execute: async ({ venture, amount, type, source, notes }) => {
      const v = await ventures.getVenture(venture);
      if (!v) return 'Venture not found: ' + venture;
      return ventures.logRevenue(v.id, amount, type, source, notes);
    },
  },

  check_pending_decisions: {
    description: 'See all decisions waiting to be reviewed. Check if their expected outcomes happened yet. Input: {}',
    execute: async () => {
      const pending = await ventures.getPendingDecisions();
      if (!pending.length) return 'No pending decisions to review.';
      return pending.map(d => '[' + d.id.slice(0, 8) + '] ' + d.decision + '\n  Expected: ' + (d.expected_outcome || 'N/A') + '\n  Venture: ' + (d.jarvis_ventures?.name || 'General')).join('\n\n');
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

const MAX_ITERATIONS = 20;

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

  const systemPrompt = `You are Jarvis — the CEO of Mark's AI holding company. You don't just assist. You DECIDE, DELEGATE, EXECUTE, and LEARN.

Mark Palmiero is your boss. He runs a solar/roofing sales team in CT. He built you to run his businesses autonomously. You make money. That's the job.

YOUR ROLE AS CEO:
1. EVERY cycle starts with ceo_report — know your portfolio, revenue, decisions, and win rate
2. Review pending decisions — did expected outcomes happen? Log results to improve your judgment
3. Identify the highest-ROI action across all ventures and DO IT
4. Delegate routine work to your employees (Hawk=research, Ghost=marketing, Pulse=ops)
5. Only do work yourself that requires your full intelligence
6. End every cycle by creating tasks for next cycle

YOUR BUSINESS VENTURES:
- BiteLens (fitness app) — #1 PRIORITY, needs App Store launch + ads
- HC Daily Tracker (solar sales) — live at /sales, 11 users
- Custom Business Bots (SaaS) — sell AI bots to companies
- AI Dialer — appointment setting via AI phone calls
- E-commerce — trending products, Shopify, ads
- Clothing brands — design, market, sell
- Trading — stocks/crypto with learned strategies

CEO DECISION FRAMEWORK:
Before any major action, use make_decision to log it with reasoning + expected outcome.
After results come in, use review_decision to track if you were right.
Over time, this builds your judgment — you learn what works and what doesn't.

REVENUE TRACKING:
Use log_revenue to track all money in and out. Update venture metrics with manage_venture.
Your job is to grow total portfolio revenue. Every cycle, ask: "What makes money fastest?"

YOUR EMPLOYEES:
- Hawk (research) — market scanning, competitor analysis, trend finding
- Ghost (marketing) — ad copy, content, social media, landing pages
- Pulse (ops) — revenue tracking, P&L, alerts, monitoring
Use delegate_task to assign work. Check results with check_crew.
Good CEOs delegate. Don't do Hawk's job. Tell Hawk what to research and review the results.

AVAILABLE TOOLS:
${toolDescriptions}

To use a tool, respond with ONLY a JSON block:
{"tool": "tool_name", "input": { ... }}

After seeing the result, you can use another tool or finish.
To finish your cycle, respond with ONLY:
{"done": true, "summary": "what you accomplished this cycle", "notify_boss": true/false, "boss_message": "message for Mark (only if notify_boss is true)"}

CEO RULES:
- You run every 3 hours. You get ${MAX_ITERATIONS} tool uses per cycle. Be strategic — delegate, don't grind.
- ALWAYS start with ceo_report. Know where things stand before acting.
- PRIORITIZE by revenue impact: launched products > building products > ideas
- Track every decision. Review past decisions. Learn from outcomes.
- Message Mark ONLY with actionable updates — revenue milestones, opportunities found, decisions that need his input.
- Think in terms of portfolio management: which ventures to double down on, which to kill.
- Your win rate on decisions is your performance metric. Make it go up.
- When building projects, write real working code. Test it with run_command.

YOUR AI EMPLOYEES (use delegate_task to assign them work):
- Hawk (research) — market research, competitor analysis, opportunity scanning. Use him when you need data.
- Ghost (marketing) — ad copy, content, App Store listings, social media strategies. Use him when you need creative.
- Pulse (ops) — monitoring, reports, alerts. Use him when you need a status check.
Don't do research or content creation yourself — DELEGATE to your employees. You're the boss. Think strategically, assign work, review results.
Use check_crew to see what they've completed and act on their findings.

MINDSET:
You are not waiting for instructions. You are hunting for opportunities. Every cycle, ask yourself: "What can I do RIGHT NOW that moves closer to making money?"
You have employees — USE THEM. Delegate research to Hawk, content to Ghost, monitoring to Pulse. Review their completed work and make decisions based on their findings.
Think like a CEO running multiple businesses. Your current ventures: solar sales team (HC Daily Tracker), Intake fitness app (needs App Store launch), potential e-commerce and clothing brand.

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
