// shop-optimizer.js — Track, analyze, and optimize Printify/Etsy products
// Monitors performance → kills underperformers → creates new products based on winners

const printify = require('./printify');
const ecommerce = require('./ecommerce');
const db = require('../db/queries');
const { sendBossMessage } = require('../channels/discord');

const SHOP_ID = 27113236;

// ── Etsy SEO tags for each product niche ──
// Etsy allows 13 tags, max 20 chars each — these are researched high-volume tags
const PRODUCT_SEO = {
  'Cottage Core Mushroom Stickers': {
    tags: ['mushroom stickers', 'cottagecore sticker', 'cottage core', 'journal stickers', 'laptop stickers', 'nature stickers', 'mushroom art', 'aesthetic sticker', 'goblincore', 'botanical sticker', 'cute stickers', 'planner stickers', 'fungi art'],
    description: 'Cottage Core Mushroom Stickers — Beautiful hand-illustrated mushroom sticker set perfect for journals, planners, laptops, and water bottles.\n\n🍄 WHAT YOU GET:\n• High-quality kiss-cut stickers\n• Vibrant cottagecore mushroom designs\n• Waterproof and durable vinyl\n• Perfect for decorating journals, laptops, phone cases, and more\n\n🌿 PERFECT FOR:\n• Cottagecore and goblincore lovers\n• Nature journal enthusiasts\n• Planner decoration\n• Laptop and water bottle customization\n• Gifts for mushroom lovers\n\n✨ These beautiful botanical mushroom stickers bring a touch of woodland magic to everything you own. Each sticker features detailed fungi illustrations in a soft, aesthetic cottagecore style.\n\nMade with high-quality, durable vinyl that resists water and scratching. Stick them on your journal, laptop, water bottle, phone case — anywhere you want a little nature magic.\n\n🎁 Makes a perfect gift for nature lovers, journaling enthusiasts, and anyone who loves the cottagecore aesthetic.',
  },
  'Retro Gaming Pixel Art Tote': {
    tags: ['pixel art tote', 'retro gaming bag', 'gamer tote bag', 'pixel art bag', '90s nostalgia', 'retro gamer gift', 'gaming accessories', 'pixel art', 'retro arcade', 'gamer gift', 'nerd tote bag', 'geek gift', 'video game bag'],
    description: 'Retro Gaming Pixel Art Tote Bag — Nostalgic pixel art design that takes you back to the golden age of gaming.\n\n🎮 DETAILS:\n• Durable cotton canvas tote\n• Vibrant retro pixel art print\n• Spacious interior for books, groceries, and everyday carry\n• Strong handles for comfortable carrying\n\n👾 PERFECT FOR:\n• Retro gaming fans and arcade lovers\n• 90s kids and nostalgia seekers\n• Daily grocery runs and errands\n• Book bags and beach totes\n• Gifts for gamers\n\n✨ Show off your love for classic gaming with this eye-catching pixel art tote. The vibrant retro design turns heads wherever you go.\n\n🎁 Perfect gift for the gamer in your life — birthdays, holidays, or just because.',
  },
  'Moon Phase Poster': {
    tags: ['moon phase poster', 'lunar phases art', 'celestial wall art', 'moon print', 'minimalist poster', 'bedroom wall art', 'boho wall decor', 'celestial decor', 'moon phases', 'space poster', 'astronomy art', 'meditation room', 'mystic decor'],
    description: 'Moon Phase Poster — Elegant lunar phase sequence in a minimalist celestial design. Transform your space with this stunning wall art.\n\n🌙 DETAILS:\n• Premium matte poster paper\n• Clean minimalist moon phase design\n• Multiple sizes available\n• Museum-quality printing\n\n✨ PERFECT FOR:\n• Bedroom and living room wall decor\n• Meditation and yoga spaces\n• Boho and celestial themed rooms\n• Astronomy and space enthusiasts\n• Dorm room decoration\n\n🌟 This beautiful moon phase poster captures the complete lunar cycle in an elegant, minimalist style. The clean design works with any decor — from boho to modern to celestial.\n\nPrinted on premium matte paper with vibrant, fade-resistant inks. Arrives ready to frame.\n\n🎁 Wonderful gift for moon lovers, astrology enthusiasts, and anyone who appreciates beautiful celestial art.',
  },
  'Mental Health Matters Hoodie': {
    tags: ['mental health hoodie', 'self care hoodie', 'mental health matters', 'awareness hoodie', 'comfort hoodie', 'self love hoodie', 'therapy hoodie', 'cozy hoodie', 'mental health gift', 'wellness hoodie', 'kindness hoodie', 'positive hoodie', 'anxiety hoodie'],
    description: 'Mental Health Matters Hoodie — Soft, comfortable hoodie with a gentle encouraging design. Spread awareness while staying cozy.\n\n💜 DETAILS:\n• Heavy blend cotton/polyester\n• Soft fleece interior for maximum comfort\n• Subtle, tasteful mental health awareness design\n• Unisex fit — runs true to size\n• Kangaroo pocket\n\n🧠 PERFECT FOR:\n• Mental health awareness and advocacy\n• Self-care days at home\n• Therapy appointments\n• Spreading kindness and positivity\n• Gifts for anyone going through a tough time\n\n✨ This isn\'t just a hoodie — it\'s a conversation starter and a warm hug in clothing form. The subtle design lets you show support for mental health awareness without being loud about it.\n\nSuper soft fleece interior makes this your new favorite comfort hoodie. Perfect for self-care Sundays, cozy nights in, or spreading positive vibes.\n\n🎁 Meaningful gift for friends, family, therapists, counselors, and anyone who champions mental health.',
  },
  'Wildflower Botanical Tee': {
    tags: ['wildflower tee', 'botanical shirt', 'flower t shirt', 'nature tee', 'cottagecore shirt', 'garden shirt', 'plant lover tee', 'wildflower shirt', 'floral tee', 'boho shirt', 'minimalist tee', 'nature lover gift', 'botanical art'],
    description: 'Wildflower Botanical Tee — Minimalist wildflower line art on a soft, comfortable cotton tee. Perfect for nature lovers and cottagecore enthusiasts.\n\n🌸 DETAILS:\n• Soft, comfortable cotton fabric\n• Beautiful minimalist wildflower line art\n• Unisex fit — true to size\n• Durable print that won\'t fade or crack\n\n🌿 PERFECT FOR:\n• Nature walks and garden days\n• Cottagecore and boho fashion\n• Plant lovers and garden enthusiasts\n• Casual everyday wear\n• Gifts for flower lovers\n\n✨ This beautiful botanical tee features delicate wildflower illustrations in a clean, minimalist style. The subtle line art design is elegant enough for any occasion.\n\nMade with soft, breathable cotton that feels amazing against your skin. The high-quality print stays vibrant wash after wash.\n\n🎁 Perfect gift for plant moms, garden lovers, nature enthusiasts, and anyone who loves the beauty of wildflowers.',
  },
  'Cosmic Wolf Howling': {
    tags: ['wolf shirt', 'cosmic wolf tee', 'wolf howling moon', 'space wolf', 'nature shirt', 'wolf art shirt', 'moon wolf tee', 'galaxy wolf', 'wolf lover gift', 'animal tee', 'mystical wolf', 'celestial shirt', 'wolf moon'],
    description: 'Cosmic Wolf Howling Tee — Minimalist cosmic wolf howling at the moon. Where nature meets the cosmos.\n\n🐺 DETAILS:\n• Soft, comfortable cotton fabric\n• Stunning cosmic wolf design\n• Unisex fit — true to size\n• Durable print that won\'t fade\n\n🌌 PERFECT FOR:\n• Wolf and nature lovers\n• Space and astronomy fans\n• Mystical and celestial fashion\n• Casual everyday wear\n• Gifts for animal lovers\n\n✨ This striking wolf design captures the magic of a lone wolf howling at the cosmic moon. The minimalist style combines nature and space in one beautiful image.\n\nPrinted on soft, breathable cotton with fade-resistant inks. This becomes your go-to statement tee.\n\n🎁 Perfect gift for wolf enthusiasts, nature lovers, space fans, and anyone drawn to the mystical and cosmic.',
  },
};

// ── Fix all product SEO ──
async function optimizeAllListings() {
  const products = await printify.getProducts(SHOP_ID);
  const results = [];

  for (const p of (products.data || [])) {
    const seo = PRODUCT_SEO[p.title];
    if (!seo) { results.push({ title: p.title, status: 'skipped — no SEO data' }); continue; }

    const needsUpdate = !p.tags?.length || p.description?.length < 200;
    if (!needsUpdate) { results.push({ title: p.title, status: 'already optimized' }); continue; }

    try {
      const res = await fetch('https://api.printify.com/v1/shops/' + SHOP_ID + '/products/' + p.id + '.json', {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + process.env.PRINTIFY_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: p.title, description: seo.description, tags: seo.tags }),
      });
      if (!res.ok) throw new Error('API ' + res.status);
      results.push({ title: p.title, status: 'OPTIMIZED — ' + seo.tags.length + ' tags added' });
    } catch (e) {
      results.push({ title: p.title, status: 'error: ' + e.message });
    }
  }
  return results;
}

// ── Track product performance ──
// Stores snapshots in Supabase so we can compare over time
async function trackPerformance(tenantId) {
  const products = await printify.getProducts(SHOP_ID);
  const orders = await printify.getOrders(SHOP_ID);

  const ordersByProduct = {};
  (orders.data || []).forEach(o => {
    (o.line_items || []).forEach(li => {
      ordersByProduct[li.product_id] = (ordersByProduct[li.product_id] || 0) + li.quantity;
    });
  });

  const snapshot = (products.data || []).map(p => ({
    id: p.id,
    title: p.title,
    visible: p.visible,
    variants: p.variants?.length || 0,
    images: p.images?.length || 0,
    tags: p.tags?.length || 0,
    orders: ordersByProduct[p.id] || 0,
    created: p.created_at,
  }));

  // Store snapshot in memory for trend analysis
  if (tenantId) {
    const summary = snapshot.map(p => p.title + ': ' + p.orders + ' orders, ' + p.tags + ' tags').join('\n');
    await db.storeMemory(tenantId, 'fact',
      'Shop performance snapshot ' + new Date().toISOString().split('T')[0] + ':\n' + summary,
      7, 'ecommerce');
  }

  return { date: new Date().toISOString(), products: snapshot, totalOrders: orders.data?.length || 0 };
}

// ── Smart rotation: analyze + act ──
async function smartRotation(tenantId) {
  const snapshot = await trackPerformance(tenantId);
  const report = [];

  // Products with 0 orders after 7+ days = underperformers
  const now = Date.now();
  const underperformers = snapshot.products.filter(p => {
    const age = (now - new Date(p.created).getTime()) / (1000 * 60 * 60 * 24);
    return age > 7 && p.orders === 0;
  });

  // Products with orders = winners — analyze what's working
  const winners = snapshot.products.filter(p => p.orders > 0);

  report.push('**SHOP PERFORMANCE REPORT**');
  report.push('Total products: ' + snapshot.products.length);
  report.push('Total orders: ' + snapshot.totalOrders);
  report.push('');

  if (winners.length > 0) {
    report.push('**WINNERS:**');
    winners.forEach(w => report.push('✅ ' + w.title + ' — ' + w.orders + ' orders'));
    report.push('');
  }

  if (underperformers.length > 0) {
    report.push('**UNDERPERFORMERS (0 orders, 7+ days):**');
    underperformers.forEach(u => report.push('⚠️ ' + u.title));
    report.push('');
  }

  // Products missing tags — critical SEO issue
  const noTags = snapshot.products.filter(p => p.tags === 0);
  if (noTags.length > 0) {
    report.push('**MISSING TAGS (invisible on Etsy!):**');
    noTags.forEach(p => report.push('🔴 ' + p.title + ' — NO TAGS'));
    report.push('');
  }

  // Recommendations
  report.push('**ACTIONS:**');
  if (noTags.length > 0) report.push('1. Fix tags on ' + noTags.length + ' products (running now)');
  if (underperformers.length >= 3) report.push('2. Consider refreshing underperforming designs');
  if (winners.length > 0) report.push('3. Create more products in winning niches');
  if (snapshot.products.length < 20) report.push('4. Scale up — top Etsy shops have 50-100+ listings');

  return report.join('\n');
}

// ── Scheduled job: runs every 24h ──
async function dailyShopCheck() {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return;

    // 1. Optimize any listings missing tags
    const optimized = await optimizeAllListings();
    const fixed = optimized.filter(r => r.status.includes('OPTIMIZED'));
    if (fixed.length > 0) {
      console.log('[SHOP] Fixed ' + fixed.length + ' listings');
    }

    // 2. Track performance
    const report = await smartRotation(tenant.id);

    // 3. Send report to boss
    await sendBossMessage('🏪 **Daily Shop Report**\n\n' + report);
    console.log('[SHOP] Daily check complete');

    // 4. If we have winners and fewer than 20 products, auto-create more
    const snapshot = await trackPerformance(tenant.id);
    if (snapshot.products.length < 20 && snapshot.totalOrders > 0) {
      // Find winning niches and create more
      const winningTitles = snapshot.products.filter(p =>
        (snapshot.products.find(sp => sp.id === p.id)?.orders || 0) > 0
      ).map(p => p.title);

      if (winningTitles.length > 0) {
        console.log('[SHOP] Auto-creating products in winning niches');
        const niche = winningTitles[0].split(' ').slice(0, 2).join(' ');
        try {
          await ecommerce.runProductPipeline(niche, 2, tenant.id);
          await sendBossMessage('🤖 Auto-created 2 new products based on winning niche: "' + niche + '"');
        } catch (e) {
          console.error('[SHOP] Auto-create failed:', e.message);
        }
      }
    }
  } catch (e) {
    console.error('[SHOP] Daily check error:', e.message);
  }
}

module.exports = {
  optimizeAllListings,
  trackPerformance,
  smartRotation,
  dailyShopCheck,
  SHOP_ID,
};
