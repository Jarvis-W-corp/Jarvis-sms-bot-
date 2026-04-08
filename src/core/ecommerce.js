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
      const result = await createAndListProduct({
        title: p.title,
        description: p.description,
        tags: p.tags,
        designPrompt: p.designPrompt,
        productType: p.productType || 'tshirt',
        price: p.price || 1999,
        publish: false, // don't auto-publish yet — review first
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

module.exports = {
  researchTrending,
  generateDesign,
  createAndListProduct,
  runProductPipeline,
};
