const { searchWeb } = require('./search');
const Anthropic = require('@anthropic-ai/sdk').default;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Market Research ──

async function researchMarket(niche, aspect) {
  const queries = [];
  if (aspect === 'trends') {
    queries.push(niche + ' market trends 2026', niche + ' trending products', niche + ' consumer demand');
  } else if (aspect === 'competitors') {
    queries.push('top ' + niche + ' brands', niche + ' competitor analysis', niche + ' best selling');
  } else if (aspect === 'ads') {
    queries.push(niche + ' facebook ads examples', niche + ' best performing ads', niche + ' ad creative strategies');
  } else if (aspect === 'pricing') {
    queries.push(niche + ' pricing strategy', niche + ' price comparison', niche + ' profit margins');
  } else {
    queries.push(niche + ' market overview 2026', niche + ' opportunities', niche + ' how to start');
  }

  const results = [];
  for (const q of queries) {
    const searchResults = await searchWeb(q);
    results.push(...searchResults);
  }

  // Deduplicate
  const seen = new Set();
  const unique = results.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  // AI summary
  const summary = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: 'You are a business intelligence analyst. Synthesize search results into actionable market intelligence. Be specific with numbers, brands, and strategies. Focus on money-making opportunities.',
    messages: [{
      role: 'user',
      content: 'Research request: ' + niche + ' (' + (aspect || 'overview') + ')\n\nSearch results:\n' +
        unique.map(r => r.title + '\n' + r.snippet).join('\n\n'),
    }],
  });

  return {
    niche,
    aspect: aspect || 'overview',
    sources: unique.length,
    analysis: summary.content[0].text,
    raw: unique.slice(0, 10),
  };
}

// ── Ad Creative Generation ──

async function generateAdCopy(product, platform, audience, angle) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: `You are a direct-response copywriter who has generated millions in revenue from paid ads.
Write ad copy that SELLS. Use proven frameworks (PAS, AIDA, hook-story-offer).
Be specific to the platform's format and character limits.
Always include: hook, body, CTA. Suggest image/video direction too.`,
    messages: [{
      role: 'user',
      content: `Platform: ${platform || 'Facebook/Instagram'}
Product: ${product}
Target audience: ${audience || 'general'}
Angle: ${angle || 'benefit-driven'}

Generate 3 ad variations with different hooks and angles.`,
    }],
  });

  return response.content[0].text;
}

// ── Business Plan Generator ──

async function generateBusinessPlan(idea, budget) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: `You are a startup advisor who has launched 50+ businesses. Create lean, actionable business plans.
Focus on: fastest path to first dollar, minimum viable product, and scaling strategy.
Be specific with costs, timelines, and step-by-step actions.`,
    messages: [{
      role: 'user',
      content: `Business idea: ${idea}
Budget: ${budget || 'bootstrapped / minimal'}

Create a lean business plan with:
1. MVP description (what to build first)
2. Week 1-4 action plan
3. Revenue model & pricing
4. Customer acquisition strategy
5. Estimated costs breakdown
6. Key metrics to track
7. First 3 tasks to start TODAY`,
    }],
  });

  return response.content[0].text;
}

// ── Product/Niche Validator ──

async function validateIdea(idea) {
  // Research demand signals
  const research = await researchMarket(idea, 'trends');
  const competition = await researchMarket(idea, 'competitors');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: 'You are a brutally honest business evaluator. Score ideas 1-10 and explain why. No sugarcoating.',
    messages: [{
      role: 'user',
      content: `Evaluate this business idea: ${idea}

Market research:
${research.analysis}

Competitor landscape:
${competition.analysis}

Score on: Market demand, Competition level, Profit potential, Ease of entry, Scalability.
Give an overall GO / CAUTION / NO-GO recommendation.`,
    }],
  });

  return {
    idea,
    research: research.analysis,
    competition: competition.analysis,
    evaluation: response.content[0].text,
  };
}

// ── Revenue Tracker ──
// Track business experiments and their results

async function logExperiment(db, tenantId, experiment) {
  // Store as a decision memory
  const memory = require('./memory');
  await memory.storeMemory(
    tenantId,
    'decision',
    'Business experiment: ' + experiment.name + ' | Status: ' + experiment.status +
    ' | Result: ' + (experiment.result || 'pending') +
    ' | Revenue: ' + (experiment.revenue || '$0'),
    9,
    'business_ops'
  );
  return 'Experiment logged: ' + experiment.name;
}

module.exports = {
  researchMarket,
  generateAdCopy,
  generateBusinessPlan,
  validateIdea,
  logExperiment,
};
