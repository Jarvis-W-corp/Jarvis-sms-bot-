// ecommerce.js — Autonomous product research + creation pipeline
// Hawk researches trending products → Ghost designs → Forge (Printify) creates listings

const Anthropic = require('@anthropic-ai/sdk').default;
const { searchWeb } = require('./search');
const printify = require('./printify');
const memory = require('./memory');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Step 1: Research trending products ──
async function researchTrending(niche, count) {
  const queries = [
    (niche || 'trending') + ' etsy products 2026',
    (niche || 'trending') + ' print on demand best sellers',
    'best selling ' + (niche || 'designs') + ' etsy this month',
    'trending ' + (niche || 't-shirt designs') + ' printify',
  ];

  const allResults = [];
  for (const q of queries) {
    try {
      const results = await searchWeb(q, 5);
      allResults.push(...results);
    } catch(e) {}
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: 'You are a product research analyst for an Etsy print-on-demand store. Analyze trending products and give specific, actionable product ideas. Each idea must include: product type, design concept, target audience, estimated price, and why it will sell. Focus on designs that can be created with AI image generation.',
    messages: [{ role: 'user', content: 'Research trending products for niche: ' + (niche || 'general') + '\n\nGive me ' + (count || 5) + ' specific product ideas.\n\nSearch results:\n' + allResults.map(r => r.title + ': ' + r.snippet).join('\n\n') }],
  });

  return response.content[0].text;
}

// ── Step 2: Generate design with DALL-E ──
async function generateDesign(prompt, style) {
  const OpenAI = require('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const fullPrompt = (style || 'Clean, modern, minimal') + ' design for a print-on-demand product. ' + prompt + '. White or transparent background. High contrast. No text unless specified. Suitable for printing on apparel and merchandise.';

  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: fullPrompt,
    n: 1,
    size: '1024x1024',
    quality: 'hd',
  });

  return response.data[0].url;
}

// ── Step 3: Create and list product ──
async function createAndListProduct(opts) {
  const {
    title,
    description,
    tags,
    designPrompt,
    designStyle,
    designUrl,     // use existing image URL instead of generating
    productType,   // 'tshirt', 'hoodie', 'mug', 'poster', 'sticker', 'tote'
    price,         // in cents (e.g. 1999 = $19.99)
    publish,       // auto-publish to connected store
  } = opts;

  // Generate design if no URL provided
  let imageUrl = designUrl;
  if (!imageUrl && designPrompt) {
    console.log('[ECOM] Generating design: ' + designPrompt.substring(0, 60));
    imageUrl = await generateDesign(designPrompt, designStyle);
    console.log('[ECOM] Design generated');
  }

  if (!imageUrl) throw new Error('Need designUrl or designPrompt');

  // Get blueprint and variants
  const blueprintId = printify.POPULAR_BLUEPRINTS[productType] || printify.POPULAR_BLUEPRINTS.tshirt;
  const providers = await printify.getPrintProviders(blueprintId);
  const provider = providers[0]; // use first available provider
  const variantData = await printify.getVariants(blueprintId, provider.id);
  const variantIds = variantData.variants.slice(0, 20).map(v => v.id); // top 20 variants

  // Create product
  const product = await printify.createProductFromDesign({
    title,
    description: description || title,
    tags: tags || [],
    imageUrl,
    blueprintId,
    printProviderId: provider.id,
    variants: variantIds,
    price: price || 1999,
  });

  // Auto-publish if requested
  if (publish) {
    try {
      await printify.publishProduct(product.id);
      console.log('[ECOM] Product published to store');
    } catch(e) {
      console.error('[ECOM] Publish failed:', e.message);
    }
  }

  return {
    productId: product.id,
    title,
    imageUrl,
    blueprintId,
    providerId: provider.id,
    variantCount: variantIds.length,
    published: !!publish,
  };
}

// ── Full Pipeline: Research → Design → List ──
async function runProductPipeline(niche, count, tenantId) {
  console.log('[ECOM] Starting product pipeline for: ' + (niche || 'trending'));

  // 1. Research
  const research = await researchTrending(niche, count || 3);
  console.log('[ECOM] Research complete');

  // 2. Ask Claude to extract specific product ideas from research
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: 'Extract product ideas from this research. Return ONLY a JSON array of objects, each with: title, description, tags (array), designPrompt (detailed prompt for DALL-E to create the design), productType (tshirt/hoodie/mug/poster/sticker/tote), price (in cents). No markdown, just the JSON array.',
    messages: [{ role: 'user', content: research }],
  });

  let products = [];
  try {
    const raw = response.content[0].text.trim().replace(/^```json?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
    products = JSON.parse(raw);
  } catch(e) {
    console.error('[ECOM] Failed to parse product ideas:', e.message);
    return { research, products: [], error: 'Failed to parse product ideas from research' };
  }

  console.log('[ECOM] ' + products.length + ' product ideas extracted');

  // 3. Create each product
  const created = [];
  for (const p of products.slice(0, count || 3)) {
    try {
      // GUARD: Never publish without tags — Etsy won't show untagged products in search
      if (!p.tags || p.tags.length < 5) {
        console.error('[ECOM] BLOCKED: ' + p.title + ' has ' + (p.tags?.length || 0) + ' tags — need at least 5. Skipping.');
        created.push({ title: p.title, error: 'Insufficient tags — product would be invisible on Etsy' });
        continue;
      }
      const result = await createAndListProduct({
        title: p.title,
        description: p.description,
        tags: p.tags,
        designPrompt: p.designPrompt,
        productType: p.productType || 'tshirt',
        price: p.price || p.priceInCents || 1999,
        publish: true, // auto-publish to Etsy
      });
      created.push(result);
      console.log('[ECOM] Created: ' + p.title);
    } catch(e) {
      console.error('[ECOM] Failed to create ' + p.title + ':', e.message);
      created.push({ title: p.title, error: e.message });
    }
  }

  // 4. Store to memory
  if (tenantId) {
    await memory.storeMemory(tenantId, 'decision',
      'Product pipeline for "' + (niche || 'trending') + '": created ' + created.filter(c => !c.error).length + ' products on Printify. ' + created.map(c => c.title).join(', '),
      8, 'ecommerce');
  }

  return { research, products: created };
}

// ── Daily Money-Making Pipeline ──
// Runs every day. Creates 3 new SEO-optimized products and publishes them to Etsy.
async function runDailyMoneyPipeline(tenantId) {
  console.log('[ECOM] ══ DAILY MONEY PIPELINE ══');
  const report = { started: new Date().toISOString(), steps: [] };

  try {
    // 1. Research what's actually selling on Etsy RIGHT NOW
    console.log('[ECOM] Step 1: Researching top sellers on Etsy');
    const trends = [];
    const queries = [
      'best selling etsy items this week 2026',
      'trending etsy products march april 2026',
      'viral etsy shops print on demand 2026',
      'what is selling on etsy right now',
    ];
    for (const q of queries) {
      try {
        const results = await searchWeb(q, 5);
        trends.push(...results);
      } catch(e) {}
    }
    report.steps.push({ step: 'research', found: trends.length });

    // 2. Ask Claude to extract 3 HIGH-DEMAND product ideas with Etsy SEO
    console.log('[ECOM] Step 2: Generating 3 product ideas with SEO');
    const ideaResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      system: `You are an Etsy SEO expert. Generate EXACTLY 3 products that will rank + sell on Etsy in 2026.

HARD RULES (research-backed for 2026 algo):

TITLE (all 140 chars used):
- First 40 chars = mobile thumbnail. Front-load the primary long-tail keyword here.
- Formula: [Primary long-tail phrase] [descriptor] [descriptor] [occasion/recipient]
- Natural phrasing only. 2026 algo penalizes keyword-stuffed gibberish.
- NO repeating words. Use variations.

13 TAGS (exactly 13, 20 chars each max):
- 3-4 high-volume broad ("dog mom gift")
- 4-5 mid-tail ("funny dog mom shirt")
- 4-5 long-tail buyer-intent ("funny dog mom gift christmas")
- Each tag = full phrase, Etsy matches phrases not words
- Never duplicate tags in the title

DESCRIPTION:
- First line = hook with primary keyword (mobile truncates fast)
- Lines 2-4: specific use cases + gift occasions
- Include material/production info
- End with shop CTA

PRODUCT TYPE (pick one): tshirt, hoodie, mug, poster, sticker, tote, phonecase, pillow

PRICING (research-backed sweet spots, in cents):
- tshirt: 2299 or 2499 (ends in .99)
- hoodie: 3999 or 4299
- mug: 1599
- sticker: 499 or 599
- poster: 1799 or 2299
- tote: 2299
- phonecase: 1999
- pillow: 2499

NICHE SELECTION:
- Pick TIGHT niches not broad ones. "Bookish gift" beats "book lover"
- Target specific audiences: teachers, nurses, dog moms, plant moms, gamers, bookish types
- Mix evergreen + seasonal/holiday angles

designPrompt: Extremely specific for DALL-E. Describe style (minimalist/vintage/bold), exact colors, composition, vibe. NO text on design unless essential.

Return ONLY a JSON array. No markdown. No explanations.
Format: [{"title":"...","description":"...","tags":["tag1","tag2",...13],"designPrompt":"...","productType":"tshirt","priceInCents":2299}]`,
      messages: [{ role: 'user', content: 'Top sellers on Etsy this week:\n\n' + trends.map(r => r.title + ': ' + r.snippet).join('\n\n') + '\n\nGenerate 3 winning product ideas following the rules above.' }],
    });

    let ideas = [];
    try {
      const raw = ideaResponse.content[0].text.trim().replace(/^```json?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
      ideas = JSON.parse(raw);
    } catch(e) {
      console.error('[ECOM] Failed to parse ideas:', e.message);
      report.error = 'idea_parse_failed';
      return report;
    }
    console.log('[ECOM] Got ' + ideas.length + ' ideas:', ideas.map(i => i.title).join(' | '));
    report.steps.push({ step: 'ideas', count: ideas.length, titles: ideas.map(i => i.title) });

    // 3. Create each product + publish to Etsy
    const created = [];
    for (const idea of ideas.slice(0, 3)) {
      try {
        console.log('[ECOM] Creating: ' + idea.title);
        const result = await createAndListProduct({
          title: idea.title,
          description: idea.description,
          tags: idea.tags || [],
          designPrompt: idea.designPrompt,
          productType: idea.productType || 'tshirt',
          price: idea.priceInCents || idea.price || 1999,
          publish: true, // PUBLISH TO ETSY
        });
        created.push(result);
        console.log('[ECOM] ✓ Published: ' + idea.title);
        // Small delay between creations to avoid rate limits
        await new Promise(r => setTimeout(r, 2000));
      } catch(e) {
        console.error('[ECOM] ✗ Failed: ' + idea.title + ' — ' + e.message);
        created.push({ title: idea.title, error: e.message });
      }
    }
    report.steps.push({ step: 'create', count: created.length, successes: created.filter(c => !c.error).length });
    report.products = created;

    // 4. Store to memory
    if (tenantId) {
      try {
        await memory.storeMemory(tenantId, 'decision',
          'Daily money pipeline: created ' + created.filter(c => !c.error).length + '/3 products on Etsy via Printify. ' + created.filter(c => !c.error).map(c => c.title).join(', '),
          9, 'daily_pipeline');
      } catch(e) {}
    }

    report.completed = new Date().toISOString();
    console.log('[ECOM] ══ DAILY PIPELINE COMPLETE: ' + created.filter(c => !c.error).length + '/3 published ══');
  } catch(e) {
    console.error('[ECOM] Pipeline fatal error:', e.message);
    report.error = e.message;
  }

  return report;
}

// ── Optimize existing listings (SEO boost) ──
async function optimizeExistingListings(tenantId) {
  console.log('[ECOM] Optimizing existing Printify listings');
  const report = { started: new Date().toISOString(), optimized: [] };

  try {
    const sid = await printify.getShopId();
    const products = await printify.getProducts(sid);
    const unpublished = (products.data || []).filter(p => !p.external?.id);

    // Publish any unpublished products
    for (const p of unpublished) {
      try {
        await printify.publishProduct(p.id, sid);
        report.optimized.push({ id: p.id, title: p.title, action: 'published' });
        console.log('[ECOM] Published: ' + p.title);
      } catch(e) {
        report.optimized.push({ id: p.id, title: p.title, action: 'failed', error: e.message });
      }
    }

    if (tenantId && report.optimized.length > 0) {
      await memory.storeMemory(tenantId, 'decision',
        'Optimized ' + report.optimized.length + ' listings: ' + report.optimized.map(o => o.title).join(', '),
        7, 'ecommerce_optimize');
    }
  } catch(e) {
    report.error = e.message;
  }

  return report;
}

module.exports = {
  researchTrending,
  generateDesign,
  createAndListProduct,
  runProductPipeline,
  runDailyMoneyPipeline,
  optimizeExistingListings,
};
