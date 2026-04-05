// adslibrary.js — Meta Ad Library scraper + ad creative pipeline
// Scrapes real competitor ads from Facebook Ad Library, analyzes them, generates better ones

const Anthropic = require('@anthropic-ai/sdk').default;
const { searchWeb } = require('./search');
const db = require('../db/queries');
const memory = require('./memory');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Meta Ad Library API ──
// Uses the public Meta Ad Library API (no auth needed for public ads)
// Docs: https://www.facebook.com/ads/library/api/

const AD_LIBRARY_BASE = 'https://ad-library-api.facebook.com/ads_archive';

async function searchAdLibrary(query, options = {}) {
  const token = process.env.META_ACCESS_TOKEN;

  // If we have a Meta token, use the official API
  if (token) {
    return searchAdLibraryAPI(query, token, options);
  }

  // Fallback: scrape the web-accessible Ad Library
  return searchAdLibraryWeb(query, options);
}

// Official Meta Ad Library API
async function searchAdLibraryAPI(query, token, options = {}) {
  const params = new URLSearchParams({
    access_token: token,
    search_terms: query,
    ad_reached_countries: options.country || 'US',
    ad_active_status: options.status || 'ACTIVE',
    ad_type: 'POLITICAL_AND_ISSUE_ADS', // or ALL for business ads (requires review)
    fields: 'id,ad_creation_time,ad_creative_bodies,ad_creative_link_captions,ad_creative_link_descriptions,ad_creative_link_titles,ad_delivery_start_time,ad_snapshot_url,bylines,estimated_audience_size,impressions,page_id,page_name,publisher_platforms,spend',
    limit: options.limit || 20,
  });

  try {
    const res = await fetch(AD_LIBRARY_BASE + '?' + params.toString());
    if (!res.ok) {
      console.error('[ADLIB] API error:', res.status);
      // Fall back to web scraping
      return searchAdLibraryWeb(query, options);
    }
    const data = await res.json();
    return (data.data || []).map(ad => ({
      id: ad.id,
      page_name: ad.page_name,
      body: (ad.ad_creative_bodies || [])[0] || '',
      headline: (ad.ad_creative_link_titles || [])[0] || '',
      description: (ad.ad_creative_link_descriptions || [])[0] || '',
      link_caption: (ad.ad_creative_link_captions || [])[0] || '',
      platforms: ad.publisher_platforms || [],
      started: ad.ad_delivery_start_time,
      snapshot_url: ad.ad_snapshot_url,
      spend: ad.spend,
      impressions: ad.impressions,
      audience_size: ad.estimated_audience_size,
      source: 'meta_api',
    }));
  } catch (err) {
    console.error('[ADLIB] API failed:', err.message);
    return searchAdLibraryWeb(query, options);
  }
}

// Web scraping fallback — uses Brave Search to find ads from Meta Ad Library
async function searchAdLibraryWeb(query, options = {}) {
  const searches = [
    `site:facebook.com/ads/library "${query}" active`,
    `"${query}" facebook ads 2026 examples hooks`,
    `"${query}" instagram ad copy high performing`,
    `"${query}" meta ad library competitor ads`,
  ];

  const allResults = [];
  for (const q of searches) {
    try {
      const results = await searchWeb(q, 5);
      allResults.push(...results);
    } catch (e) {
      console.error('[ADLIB] Search error:', e.message);
    }
  }

  // Dedupe by URL
  const seen = new Set();
  const unique = allResults.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  return unique.map(r => ({
    page_name: extractPageName(r.title),
    body: r.snippet,
    headline: r.title,
    url: r.url,
    source: 'web_scrape',
  }));
}

function extractPageName(title) {
  // Try to pull advertiser name from ad library title format
  const match = title.match(/^(.+?)(?:\s*[-–|]|$)/);
  return match ? match[1].trim() : title.substring(0, 50);
}

// ── Full Ad Pipeline ──
// This is the main function — scrape competitors, analyze, generate better ads

async function runAdPipeline(niche, options = {}) {
  const {
    competitors = [],
    product,
    budget,
    audience,
    platform = 'facebook,instagram',
    count = 3,
    tenantId,
  } = options;

  const results = { steps: [] };

  // Step 1: Scrape competitor ads
  console.log('[ADLIB] Step 1: Scraping competitor ads for "' + niche + '"');
  const queries = [niche, ...competitors];
  let allAds = [];
  for (const q of queries) {
    const ads = await searchAdLibrary(q, { limit: 10 });
    allAds.push(...ads);
  }
  results.steps.push({ step: 'scrape', adsFound: allAds.length });

  // Step 2: Analyze what's working
  console.log('[ADLIB] Step 2: Analyzing ' + allAds.length + ' ads');
  const adSummaries = allAds.slice(0, 20).map(ad =>
    'Page: ' + (ad.page_name || 'Unknown') +
    '\nHeadline: ' + (ad.headline || 'N/A') +
    '\nBody: ' + (ad.body || 'N/A') +
    '\nPlatforms: ' + (ad.platforms?.join(', ') || 'unknown') +
    (ad.spend ? '\nSpend: ' + JSON.stringify(ad.spend) : '') +
    (ad.impressions ? '\nImpressions: ' + JSON.stringify(ad.impressions) : '')
  ).join('\n---\n');

  const analysisResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: `You are an elite media buyer analyzing competitor ads from the Meta Ad Library.

Analyze these real ads and provide:

**PATTERNS:**
- What hooks are competitors using? (first line / first 3 seconds)
- What pain points and desires are they targeting?
- What offers are they making?
- What creative formats dominate? (video/image/carousel/UGC)

**GAPS:**
- What angles are NO ONE running? (untapped opportunities)
- What objections aren't being addressed?
- What audiences are being ignored?

**TOP PERFORMERS:**
- Which ads have the highest engagement signals?
- What makes them work?

**STEAL-WORTHY:**
- 3 specific hooks you'd steal and improve
- 2 offers that could be beaten

Be specific and tactical. This is competitive intelligence for a real campaign.`,
    messages: [{ role: 'user', content: 'Niche: ' + niche + '\n\nCompetitor ads scraped from Meta Ad Library:\n\n' + adSummaries }],
  });

  results.analysis = analysisResponse.content[0].text;
  results.steps.push({ step: 'analyze', done: true });

  // Step 3: Generate winning ad creatives
  console.log('[ADLIB] Step 3: Generating ad creatives');
  const creativeResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    system: `You are a top performance marketer. Based on the competitor analysis, create ${count} ads that beat the competition.

For each ad, provide:
1. **HOOK** — The first line/visual (scroll-stopper)
2. **PRIMARY TEXT** — Full ad body copy
3. **HEADLINE** — Below the image/video
4. **DESCRIPTION** — Secondary text
5. **CTA** — Button text
6. **CREATIVE BRIEF** — What the image/video should show (for a designer or AI image gen)
7. **ANGLE** — What pain/desire this targets
8. **WHY IT WINS** — What gap in competitor ads this exploits

Target product: ${product || niche}
Platform: ${platform}
Audience: ${audience || 'broad'}
Budget: ${budget || 'not specified'}

Make these BETTER than what competitors are running. Exploit the gaps you found.`,
    messages: [{
      role: 'user',
      content: 'Competitor analysis:\n\n' + results.analysis + '\n\nNow generate ' + count + ' winning ad creatives.',
    }],
  });

  results.creatives = creativeResponse.content[0].text;
  results.steps.push({ step: 'create', count });

  // Step 4: Generate campaign structure
  console.log('[ADLIB] Step 4: Building campaign structure');
  const campaignResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: `You are a Meta Ads campaign architect. Create the exact campaign structure to launch these ads.

Include:
- Campaign objective (Conversions, Traffic, Lead Gen, etc)
- Ad set structure (how many, what audiences)
- Interest targeting (specific interests to target)
- Budget split (daily budget per ad set)
- Testing plan (what to test first, kill criteria, scale criteria)
- Timeline (day 1-3: testing, day 4-7: optimize, day 7+: scale)

Be specific enough that someone could set this up in Ads Manager in 15 minutes.`,
    messages: [{
      role: 'user',
      content: 'Product: ' + (product || niche) + '\nBudget: ' + (budget || '$500/month') + '\nAudience: ' + (audience || 'broad') + '\n\nAd creatives:\n' + results.creatives,
    }],
  });

  results.campaign = campaignResponse.content[0].text;
  results.steps.push({ step: 'campaign', done: true });

  // Save to memory if tenantId provided
  if (tenantId) {
    try {
      await memory.storeMemory(tenantId, 'training',
        'Ad pipeline for ' + niche + ': ' + allAds.length + ' competitor ads scraped. Key insight: ' + results.analysis.substring(0, 300),
        8, 'ghost_agent');
    } catch (e) {
      console.error('[ADLIB] Memory save error:', e.message);
    }
  }

  console.log('[ADLIB] Pipeline complete for "' + niche + '"');
  return results;
}

// ── Quick functions for individual steps ──

async function scrapeCompetitorAds(query, limit = 20) {
  return searchAdLibrary(query, { limit });
}

async function analyzeAds(ads, niche) {
  const adText = ads.map(ad =>
    'Page: ' + (ad.page_name || '?') + ' | ' + (ad.headline || '') + ' | ' + (ad.body || '').substring(0, 200)
  ).join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: 'You are an ad analyst. Break down what hooks, angles, offers, and formats these ads use. Identify patterns and gaps. Be specific.',
    messages: [{ role: 'user', content: 'Niche: ' + niche + '\n\nAds:\n' + adText }],
  });

  return response.content[0].text;
}

module.exports = {
  searchAdLibrary,
  runAdPipeline,
  scrapeCompetitorAds,
  analyzeAds,
};
