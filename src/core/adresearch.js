const Anthropic = require('@anthropic-ai/sdk').default;
const { searchWeb } = require('./search');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Jarvis Ad Research Engine ──
// Scrape competitor ads, analyze strategies, generate better ones.
// Like noevarner.ai's 4-step system: RESEARCH → SCRAPE → STRATEGIZE → LAUNCH

// ── Step 1: Research Competitors ──
async function researchCompetitorAds(niche, competitors) {
  const queries = [
    `${niche} facebook ads examples 2026`,
    `${niche} instagram ads best performing`,
    `${niche} meta ad library`,
    ...(competitors || []).map(c => c + ' facebook ads'),
  ];

  const allResults = [];
  for (const q of queries) {
    const results = await searchWeb(q, 5);
    allResults.push(...results);
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: `You are a performance marketing analyst. Analyze competitor ad strategies.

Break down:
1. HOOKS — what opening lines/visuals they use
2. ANGLES — pain points, desires, fears they target
3. OFFERS — what they're selling and at what price
4. CREATIVE — video vs image, UGC vs polished, format
5. CTA — what action they drive
6. WEAKNESSES — gaps in their approach you can exploit

Be specific. Give examples. This is competitive intelligence.`,
    messages: [{
      role: 'user',
      content: `Analyze ad strategies for "${niche}" based on this research:\n\n` +
        allResults.map(r => r.title + '\n' + r.snippet).join('\n\n'),
    }],
  });

  return { analysis: response.content[0].text, sources: allResults.length };
}

// ── Step 2: Generate Ad Strategy ──
async function generateAdStrategy(niche, product, budget, targetAudience) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: `You are a Meta/Google Ads strategist managing a ${budget || '$500'}/month budget.

Create a complete ad strategy:

1. CAMPAIGN STRUCTURE
   - Campaign objective
   - Ad sets (audiences)
   - Number of creatives per ad set

2. TARGETING
   - Interest targeting
   - Lookalike suggestions
   - Age/gender/location
   - Exclusions

3. CREATIVE PLAN
   - 3 hook variations
   - 2 angles (pain vs desire)
   - Format recommendations (video/image/carousel)
   - UGC vs branded ratio

4. TESTING FRAMEWORK
   - Phase 1: Creative testing (what to test first)
   - Phase 2: Audience testing
   - Phase 3: Scale winners
   - Kill criteria (when to cut an ad)

5. BUDGET ALLOCATION
   - Daily spend per ad set
   - Testing budget vs scaling budget
   - Timeline to first results

Be tactical and specific. Include actual ad copy examples.`,
    messages: [{
      role: 'user',
      content: `Create ad strategy for "${product || niche}"\nTarget: ${targetAudience || 'broad'}\nBudget: ${budget || '$500/month'}\nNiche: ${niche}`,
    }],
  });

  return { strategy: response.content[0].text };
}

// ── Step 3: Generate Ad Creatives ──
async function generateAdCreatives(product, platform, audience, angle, count = 3) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2500,
    system: `You are a top-tier ad copywriter who has spent $10M+ on paid social.

Create ${count} complete ad creatives for ${platform || 'Facebook/Instagram'}.

For each ad, provide:
1. HOOK (first 3 seconds / first line — this is everything)
2. BODY COPY (the full ad text)
3. HEADLINE (under the creative)
4. DESCRIPTION (secondary text)
5. CTA BUTTON (Shop Now / Learn More / Sign Up / etc)
6. CREATIVE DIRECTION (what the image/video should show)
7. ANGLE (what pain/desire this targets)

Rules:
- Hooks must stop the scroll. Be provocative, specific, or pattern-breaking.
- Use the PAS, AIDA, or Before/After/Bridge framework
- Include social proof angles (even placeholder)
- Write for ${audience || 'broad audience'}
- Tone: ${angle || 'conversational, not corporate'}`,
    messages: [{
      role: 'user',
      content: `Create ${count} ad creatives for: ${product}`,
    }],
  });

  return { creatives: response.content[0].text };
}

// ── Step 4: Analyze Ad Performance (when we have data) ──
async function analyzePerformance(metrics) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: `You are a media buyer analyzing ad performance. Given these metrics, provide:
1. What's working and why
2. What to kill immediately
3. What to scale
4. Next tests to run
5. Budget reallocation recommendations

Be decisive. No maybes.`,
    messages: [{
      role: 'user',
      content: 'Ad performance data:\n' + (typeof metrics === 'string' ? metrics : JSON.stringify(metrics, null, 2)),
    }],
  });

  return { analysis: response.content[0].text };
}

module.exports = {
  researchCompetitorAds,
  generateAdStrategy,
  generateAdCreatives,
  analyzePerformance,
};
