// crew.js — Sub-agent system with scoped tools, cost tracking, timeouts, kill switch
// Ghost (marketing), Hawk (research), Pulse (ops) — each gets ONLY their tools
// Every API call is tracked. Every job has a timeout. Any job can be killed.

const Anthropic = require('@anthropic-ai/sdk').default;
const { supabase } = require('../db/supabase');
const { searchWeb } = require('./search');
const { sendBossMessage, logToDiscord } = require('../channels/discord');
const db = require('../db/queries');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ═══ KILL SWITCH ═══
// Set a job ID here to kill it mid-execution
const killedJobs = new Set();
function killJob(jobId) { killedJobs.add(jobId); }
function isKilled(jobId) { return killedJobs.has(jobId); }
function clearKill(jobId) { killedJobs.delete(jobId); }

// Track running jobs so dashboard can see them
const runningJobs = new Map();

// ═══ TOOL DEFINITIONS ═══
// Every tool returns a string. Every tool has a timeout.

const TOOL_TIMEOUT = 30_000; // 30s max per tool call

function withTimeout(fn, ms) {
  return (...args) => Promise.race([
    fn(...args),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Tool timeout (' + (ms / 1000) + 's)')), ms)),
  ]);
}

// All available tools (scoped per agent below)
const allTools = {
  // ── Research tools (Hawk) ──
  brave_search: {
    scope: ['hawk', 'ghost', 'pulse'],
    description: 'Search the web',
    execute: withTimeout(async ({ query }) => {
      const results = await searchWeb(query);
      if (!results.length) return 'No results for: ' + query;
      return results.map(r => r.title + '\n' + r.url + '\n' + r.snippet).join('\n\n');
    }, TOOL_TIMEOUT),
  },

  web_fetch: {
    scope: ['hawk'],
    description: 'Fetch a web page',
    execute: withTimeout(async ({ url }) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const text = await res.text();
      return text.substring(0, 5000);
    }, TOOL_TIMEOUT),
  },

  competitor_analysis: {
    scope: ['hawk'],
    description: 'Analyze a competitor',
    execute: withTimeout(async ({ company, focus }) => {
      const results = await searchWeb(company + ' ' + (focus || 'review pricing features'));
      const res = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: 'You are a competitive intelligence analyst. Break down: pricing, features, weaknesses, market position, and how to beat them.',
        messages: [{ role: 'user', content: 'Analyze competitor: ' + company + '\n\nResearch:\n' + results.map(r => r.title + ': ' + r.snippet).join('\n') }],
      });
      return res.content[0].text;
    }, 60_000),
  },

  research_products: {
    scope: ['hawk'],
    description: 'Research trending products',
    execute: withTimeout(async ({ niche, count }) => {
      const ecom = require('./ecommerce');
      return ecom.researchTrending(niche, count || 5);
    }, 60_000),
  },

  // ── Marketing tools (Ghost) ──
  analyze: {
    scope: ['ghost', 'hawk'],
    description: 'Analyze data with AI',
    execute: withTimeout(async ({ data, question }) => {
      const res = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: 'Analyze this data and answer the question.\n\nData:\n' + (data || '').substring(0, 4000) + '\n\nQuestion: ' + question }],
      });
      return res.content[0].text;
    }, 60_000),
  },

  content_create: {
    scope: ['ghost'],
    description: 'Create marketing content',
    execute: withTimeout(async ({ type, brief }) => {
      const res = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: 'Create the following content. Be specific, compelling, and ready to use.\n\nType: ' + type + '\nBrief: ' + brief }],
      });
      return res.content[0].text;
    }, 60_000),
  },

  generate_ad: {
    scope: ['ghost'],
    description: 'Generate ad creatives',
    execute: withTimeout(async ({ product, platform, audience }) => {
      const res = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: 'You are a top-tier performance marketer. Create 3 ad variations with hooks, body copy, and CTAs. Include image/video direction. Format for ' + (platform || 'Facebook') + '.',
        messages: [{ role: 'user', content: 'Product: ' + product + '\nAudience: ' + (audience || 'broad') + '\n\nCreate 3 high-converting ad variations.' }],
      });
      return res.content[0].text;
    }, 60_000),
  },

  write_landing_page: {
    scope: ['ghost'],
    description: 'Write a landing page',
    execute: withTimeout(async ({ product, headline, audience }) => {
      const res = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        system: 'You are a conversion copywriter. Write a complete landing page with: hero section, problem/solution, features, social proof, pricing, FAQ, and CTA. Output clean HTML with inline Tailwind CSS classes.',
        messages: [{ role: 'user', content: 'Product: ' + product + '\nHeadline: ' + (headline || 'auto-generate') + '\nAudience: ' + (audience || 'broad') }],
      });
      return res.content[0].text;
    }, 60_000),
  },

  scrape_ads: {
    scope: ['ghost', 'hawk'],
    description: 'Scrape Meta Ad Library',
    execute: withTimeout(async ({ query, limit }) => {
      const adslibrary = require('./adslibrary');
      const ads = await adslibrary.scrapeCompetitorAds(query, limit || 15);
      if (!ads.length) return 'No ads found for "' + query + '".';
      return ads.map(ad =>
        'Page: ' + (ad.page_name || '?') + ' | Headline: ' + (ad.headline || 'N/A') + ' | Body: ' + (ad.body || 'N/A').substring(0, 200)
      ).join('\n---\n');
    }, 60_000),
  },

  run_ad_pipeline: {
    scope: ['ghost'],
    description: 'Run full ad pipeline: scrape → analyze → generate → campaign structure',
    execute: withTimeout(async ({ niche, product, competitors, budget, audience, count }) => {
      const adslibrary = require('./adslibrary');
      const result = await adslibrary.runAdPipeline(niche, { product, competitors, budget, audience, count: count || 3 });
      let output = 'Ads scraped: ' + (result.steps[0]?.adsFound || 0) + '\n\n';
      output += 'ANALYSIS:\n' + result.analysis.substring(0, 2000) + '\n\n';
      output += 'CREATIVES:\n' + result.creatives.substring(0, 2000) + '\n\n';
      output += 'CAMPAIGN:\n' + result.campaign.substring(0, 2000);
      return output;
    }, 180_000), // 3 min — this is a multi-step pipeline
  },

  // ── Ops tools (Pulse) ──
  alert: {
    scope: ['pulse'],
    description: 'Send an alert to boss or daily-reports',
    execute: withTimeout(async ({ message, channel }) => {
      if (channel === 'boss') await sendBossMessage(message);
      else await logToDiscord('daily-reports', message);
      return 'Alert sent';
    }, TOOL_TIMEOUT),
  },

  store_finding: {
    scope: ['hawk', 'ghost', 'pulse'],
    description: 'Store a finding to Jarvis memory',
    execute: withTimeout(async ({ category, content, importance }) => {
      const memory = require('./memory');
      const tenant = await db.getDefaultTenant();
      if (tenant) {
        await memory.storeMemory(tenant.id, category || 'fact', content, importance || 7, 'crew');
      }
      return 'Finding stored: ' + content.substring(0, 80);
    }, TOOL_TIMEOUT),
  },

  create_product: {
    scope: ['ghost'],
    description: 'Create a print-on-demand product on Printify',
    execute: withTimeout(async ({ title, designPrompt, productType, price, tags }) => {
      const ecom = require('./ecommerce');
      const result = await ecom.createAndListProduct({ title, designPrompt, productType: productType || 'tshirt', price: price || 1999, tags, description: title });
      return 'Created: ' + result.title + ' (ID: ' + result.productId + ')';
    }, 90_000),
  },

  product_pipeline: {
    scope: ['ghost'],
    description: 'Full e-commerce pipeline: research → design → list',
    execute: withTimeout(async ({ niche, count }) => {
      const ecom = require('./ecommerce');
      const result = await ecom.runProductPipeline(niche, count || 3);
      return 'Pipeline done. Created ' + result.products.filter(p => !p.error).length + ' products.';
    }, 180_000),
  },
};

// ═══ SCOPED TOOL GETTER ═══
function getToolsForWorker(workerName) {
  const name = (workerName || '').toLowerCase();
  const scoped = {};
  for (const [toolName, tool] of Object.entries(allTools)) {
    if (tool.scope.includes(name)) {
      scoped[toolName] = tool;
    }
  }
  return scoped;
}

// ═══ WORKERS ═══

async function getWorkers() {
  const { data } = await supabase.from('agent_workers').select('*').eq('status', 'active');
  return data || [];
}

async function getWorker(workerId) {
  const { data } = await supabase.from('agent_workers').select('*').eq('id', workerId).single();
  return data;
}

// ═══ JOB QUEUE ═══

async function createJob(workerIdOrName, title, description, input, priority, parentJobId) {
  let workerId = workerIdOrName;
  const workerNameMap = { research: 'Hawk', marketing: 'Ghost', ops: 'Pulse', hawk: 'Hawk', ghost: 'Ghost', pulse: 'Pulse' };
  if (workerNameMap[workerIdOrName]) {
    const { data: worker } = await supabase.from('agent_workers').select('id')
      .ilike('name', '%' + workerNameMap[workerIdOrName] + '%').single();
    if (worker) workerId = worker.id;
  }

  const id = 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const { error } = await supabase.from('agent_jobs').insert({
    id, worker_id: workerId, title, description,
    status: 'pending', priority: priority || 5,
    input: input || {}, parent_job_id: parentJobId || '',
  });
  if (error) { console.error('[CREW] Create job error:', error.message); return null; }
  console.log('[CREW] Job created: ' + title + ' -> ' + workerId);
  return id;
}

async function getPendingJobs(workerId) {
  let q = supabase.from('agent_jobs').select('*').eq('status', 'pending').order('priority', { ascending: false }).order('created_at').limit(5);
  if (workerId) q = q.eq('worker_id', workerId);
  const { data } = await q;
  return data || [];
}

async function getAllJobs(limit) {
  const { data } = await supabase.from('agent_jobs').select('*').order('created_at', { ascending: false }).limit(limit || 20);
  return data || [];
}

async function updateJob(jobId, updates) {
  const { error } = await supabase.from('agent_jobs').update(updates).eq('id', jobId);
  if (error) console.error('[CREW] Update job error:', error.message);
}

async function updateWorkerStats(workerId, success) {
  const field = success ? 'tasks_completed' : 'tasks_failed';
  const worker = await getWorker(workerId);
  if (worker) {
    await supabase.from('agent_workers').update({ [field]: (worker[field] || 0) + 1 }).eq('id', workerId);
  }
}

// ═══ EXECUTE A JOB ═══
// Scoped tools, cost tracking, per-iteration timeout, kill switch

const MAX_WORKER_ITERATIONS = 8;
const JOB_TIMEOUT = 5 * 60 * 1000; // 5 min max per job

async function executeJob(job) {
  const worker = await getWorker(job.worker_id);
  if (!worker) {
    await updateJob(job.id, { status: 'failed', error: 'Worker not found: ' + job.worker_id });
    return null;
  }

  const workerType = (worker.name || '').toLowerCase().replace(/[^a-z]/g, '');
  const scopedTools = getToolsForWorker(workerType);
  const toolNames = Object.keys(scopedTools);

  if (toolNames.length === 0) {
    await updateJob(job.id, { status: 'failed', error: 'No tools scoped for worker: ' + worker.name });
    return null;
  }

  console.log('[CREW] ' + worker.name + ' starting: ' + job.title + ' (' + toolNames.length + ' tools)');
  await updateJob(job.id, { status: 'running', started_at: new Date().toISOString() });

  // Track as running
  runningJobs.set(job.id, { worker: worker.name, title: job.title, startedAt: Date.now(), iterations: 0 });

  const toolDescriptions = toolNames.map(t => '  ' + t + ' — ' + scopedTools[t].description).join('\n');

  const systemPrompt = (worker.system_prompt || 'You are ' + worker.name + ', a sub-agent.') +
    '\n\nAVAILABLE TOOLS (you can ONLY use these):\n' + toolDescriptions +
    '\n\nTo use a tool, respond with ONLY a JSON block: {"tool": "tool_name", "input": {...}}' +
    '\nWhen done, respond with ONLY: {"done": true, "result": "your findings/output"}' +
    '\nYou have up to ' + MAX_WORKER_ITERATIONS + ' tool uses. Be efficient. Finish quickly.';

  const messages = [{
    role: 'user',
    content: 'TASK: ' + job.title + '\n\nDETAILS: ' + (job.description || 'No details') +
      (job.input && Object.keys(job.input).length ? '\n\nINPUT: ' + JSON.stringify(job.input) : ''),
  }];

  const toolLog = [];
  let totalCost = 0;
  let finalResult = null;

  // Master timeout for entire job
  const jobTimer = setTimeout(() => {
    if (runningJobs.has(job.id)) {
      killJob(job.id);
      console.log('[CREW] ' + worker.name + ' job timed out: ' + job.title);
    }
  }, JOB_TIMEOUT);

  try {
    for (let i = 0; i < MAX_WORKER_ITERATIONS; i++) {
      // Kill switch check
      if (isKilled(job.id)) {
        console.log('[CREW] ' + worker.name + ' killed: ' + job.title);
        await updateJob(job.id, {
          status: 'killed',
          output: { result: 'Job killed after ' + i + ' iterations', tools_used: toolLog.length },
          completed_at: new Date().toISOString(),
        });
        await updateWorkerStats(worker.id, false);
        clearKill(job.id);
        return null;
      }

      // Update running state
      const rs = runningJobs.get(job.id);
      if (rs) rs.iterations = i + 1;

      let response;
      try {
        response = await Promise.race([
          anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            system: systemPrompt,
            messages,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Claude API timeout (45s)')), 45_000)),
        ]);
      } catch (err) {
        console.error('[CREW] ' + worker.name + ' API error:', err.message);
        await updateJob(job.id, { status: 'failed', error: err.message, completed_at: new Date().toISOString() });
        await updateWorkerStats(worker.id, false);
        return null;
      }

      // Track cost
      const usage = response.usage || {};
      try {
        const tenant = await db.getDefaultTenant();
        if (tenant) {
          await db.logApiCost(tenant.id, workerType, 'claude-sonnet-4-20250514', usage.input_tokens, usage.output_tokens, null, job.id);
          totalCost += ((usage.input_tokens || 0) * 3 + (usage.output_tokens || 0) * 15) / 1_000_000;
        }
      } catch (e) { /* table may not exist yet, that's fine */ }

      const text = response.content[0].text;
      let parsed;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch { parsed = null; }

      // Plain text = treat as final result
      if (!parsed) {
        finalResult = text.substring(0, 5000);
        break;
      }

      // Done signal
      if (parsed.done) {
        finalResult = parsed.result || '';
        break;
      }

      // Tool call — must be in scoped tools
      if (parsed.tool && scopedTools[parsed.tool]) {
        console.log('[CREW] ' + worker.name + ' using: ' + parsed.tool);
        let result;
        try {
          result = await scopedTools[parsed.tool].execute(parsed.input || {});
        } catch (err) {
          result = 'Error: ' + err.message;
        }

        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        toolLog.push({ tool: parsed.tool, timestamp: new Date().toISOString() });
        messages.push({ role: 'assistant', content: text });
        messages.push({ role: 'user', content: 'Tool result (' + parsed.tool + '):\n' + resultStr.substring(0, 4000) });
      } else if (parsed.tool) {
        // Tried to use a tool they don't have access to
        messages.push({ role: 'assistant', content: text });
        messages.push({ role: 'user', content: 'ERROR: Tool "' + parsed.tool + '" is not available to you. Your tools are: ' + toolNames.join(', ') });
      } else {
        break;
      }
    }
  } finally {
    clearTimeout(jobTimer);
    runningJobs.delete(job.id);
  }

  // Finalize
  const status = finalResult ? 'completed' : 'completed';
  await updateJob(job.id, {
    status,
    output: {
      result: (finalResult || 'Max iterations reached — partial work done').substring(0, 5000),
      tools_used: toolLog.length,
      cost_usd: Math.round(totalCost * 1_000_000) / 1_000_000,
    },
    completed_at: new Date().toISOString(),
  });
  await updateWorkerStats(worker.id, !!finalResult);
  console.log('[CREW] ' + worker.name + ' completed: ' + job.title + ' (' + toolLog.length + ' tools, $' + totalCost.toFixed(4) + ')');
  return finalResult;
}

// ═══ PROCESS QUEUE ═══

async function processQueue() {
  const jobs = await getPendingJobs();
  if (!jobs.length) {
    console.log('[CREW] No pending jobs');
    return [];
  }

  console.log('[CREW] Processing ' + jobs.length + ' pending jobs');
  const results = [];

  for (const job of jobs) {
    try {
      const result = await executeJob(job);
      results.push({ jobId: job.id, worker: job.worker_id, title: job.title, status: result ? 'completed' : 'no_result' });
    } catch (err) {
      console.error('[CREW] Job failed:', job.title, err.message);
      await updateJob(job.id, { status: 'failed', error: err.message, completed_at: new Date().toISOString() });
      await updateWorkerStats(job.worker_id, false);
      results.push({ jobId: job.id, worker: job.worker_id, title: job.title, status: 'error', error: err.message });
    }
  }

  return results;
}

// ═══ FOLLOW UP — check completed jobs and notify boss ═══

async function followUpCompletedJobs() {
  const { data: jobs } = await supabase.from('agent_jobs').select('*')
    .eq('status', 'completed')
    .is('followed_up', null)
    .order('completed_at', { ascending: false })
    .limit(10);

  if (!jobs || !jobs.length) return [];

  const followups = [];
  for (const job of jobs) {
    const result = job.output?.result || '';
    if (result.length > 50) {
      // Has meaningful output — send summary to daily-reports
      try {
        await logToDiscord('daily-reports', '**' + (job.title || 'Job') + '** completed\n' + result.substring(0, 500));
      } catch (e) {}
      followups.push(job.id);
    }
    // Mark as followed up regardless
    await supabase.from('agent_jobs').update({ followed_up: true }).eq('id', job.id);
  }

  return followups;
}

// ═══ STATUS FOR DASHBOARD ═══

async function getCrewStatus() {
  const [workers, recentJobs] = await Promise.all([
    getWorkers(),
    getAllJobs(30),
  ]);

  // Include running jobs
  const running = [];
  for (const [id, state] of runningJobs) {
    running.push({ id, worker: state.worker, title: state.title, elapsed: Math.round((Date.now() - state.startedAt) / 1000), iterations: state.iterations });
  }

  const pending = recentJobs.filter(j => j.status === 'pending').length;
  const runningCount = recentJobs.filter(j => j.status === 'running').length;
  const completed = recentJobs.filter(j => j.status === 'completed').length;
  const failed = recentJobs.filter(j => j.status === 'failed').length;
  const killed = recentJobs.filter(j => j.status === 'killed').length;

  // Get cost summary (last 24h)
  let costSummary = null;
  try {
    const since = new Date(Date.now() - 86400000).toISOString();
    const tenant = await db.getDefaultTenant();
    if (tenant) costSummary = await db.getApiCostSummary(tenant.id, since);
  } catch (e) { /* table may not exist */ }

  return {
    workers: workers.map(w => ({
      id: w.id, name: w.name, type: w.type,
      system_prompt: w.system_prompt,
      status: w.status,
      tasks_completed: w.tasks_completed || 0,
      tasks_failed: w.tasks_failed || 0,
      successRate: (w.tasks_completed || 0) > 0
        ? Math.round(((w.tasks_completed || 0) / ((w.tasks_completed || 0) + (w.tasks_failed || 0))) * 100)
        : 0,
      tools: Object.keys(getToolsForWorker((w.name || '').toLowerCase().replace(/[^a-z]/g, ''))),
    })),
    jobs: { pending, running: runningCount, completed, failed, killed, total: recentJobs.length },
    runningNow: running,
    recentJobs: recentJobs.slice(0, 10).map(j => ({
      id: j.id, worker: j.worker_id, title: j.title, status: j.status,
      result: j.output?.result ? String(j.output.result).substring(0, 300) : '',
      cost: j.output?.cost_usd || null,
      created: j.created_at, completed: j.completed_at,
    })),
    costs: costSummary,
  };
}

module.exports = {
  createJob,
  getPendingJobs,
  getAllJobs,
  executeJob,
  processQueue,
  followUpCompletedJobs,
  getWorkers,
  getCrewStatus,
  updateJob,
  killJob,
  isKilled,
  runningJobs,
  getToolsForWorker,
};
