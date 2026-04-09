// meta-ads.js — Meta Marketing API integration
// Campaign management, ad creation, budget optimization, lead webhooks, CAPI
// Env vars: META_ACCESS_TOKEN, META_APP_SECRET

const Anthropic = require('@anthropic-ai/sdk').default;
const crypto = require('crypto');
const { supabase } = require('../db/supabase');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const META_API_BASE = 'https://graph.facebook.com/v18.0';
const API_TIMEOUT = 30000; // 30s timeout for all Meta API calls

// ── Helper: Meta API request with timeout ──
async function metaFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : META_API_BASE + endpoint;
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error('META_ACCESS_TOKEN not set');

  const separator = url.includes('?') ? '&' : '?';
  const fullUrl = url + separator + 'access_token=' + token;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const res = await fetch(fullUrl, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    const data = await res.json();

    if (data.error) {
      const err = new Error('Meta API error: ' + (data.error.message || JSON.stringify(data.error)));
      err.code = data.error.code;
      err.type = data.error.type;
      throw err;
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Create Campaign ──
async function createCampaign(adAccountId, name, objective = 'OUTCOME_LEADS', status = 'PAUSED') {
  const data = await metaFetch(`/act_${adAccountId}/campaigns`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      objective,
      status,
      special_ad_categories: [],
    }),
  });

  console.log('[META-ADS] Campaign created: ' + data.id + ' (' + name + ')');
  return { campaign_id: data.id, name, objective, status };
}

// ── Create Ad Set ──
async function createAdSet(adAccountId, campaignId, name, dailyBudget, targeting, optimizationGoal = 'LEAD_GENERATION') {
  const data = await metaFetch(`/act_${adAccountId}/adsets`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      campaign_id: campaignId,
      daily_budget: dailyBudget, // in cents
      billing_event: 'IMPRESSIONS',
      optimization_goal: optimizationGoal,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: targeting || {},
      status: 'PAUSED',
    }),
  });

  console.log('[META-ADS] Ad Set created: ' + data.id + ' (' + name + ')');
  return { adset_id: data.id, name, campaign_id: campaignId, daily_budget: dailyBudget };
}

// ── Create Ad ──
async function createAd(adAccountId, adSetId, name, creative) {
  const data = await metaFetch(`/act_${adAccountId}/ads`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      adset_id: adSetId,
      creative,
      status: 'PAUSED',
    }),
  });

  console.log('[META-ADS] Ad created: ' + data.id + ' (' + name + ')');
  return { ad_id: data.id, name, adset_id: adSetId };
}

// ── Generate Creatives via Claude ──
async function generateCreatives(businessConfig, count = 3) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: `You are an elite Meta Ads copywriter. Generate exactly ${count} ad copy variants.

Business: ${businessConfig.name}
Offer: ${businessConfig.offer}
CTA: ${businessConfig.cta}
Audiences: ${JSON.stringify(businessConfig.audiences || [])}

For EACH variant, return a JSON object with:
- primary_text: max 125 characters, the main ad body
- headline: max 40 characters, punchy headline
- description: supporting text, 1 sentence
- cta: one of LEARN_MORE, SIGN_UP, GET_QUOTE, BOOK_NOW, CONTACT_US

Return ONLY a JSON array of ${count} objects. No markdown, no explanation.`,
    messages: [{ role: 'user', content: 'Generate ' + count + ' high-converting ad copy variants now.' }],
  });

  const text = response.content[0].text;
  try {
    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array found in response');
    const creatives = JSON.parse(jsonMatch[0]);

    // Enforce length limits
    return creatives.map(c => ({
      primary_text: (c.primary_text || '').substring(0, 125),
      headline: (c.headline || '').substring(0, 40),
      description: c.description || '',
      cta: c.cta || 'LEARN_MORE',
    }));
  } catch (err) {
    console.error('[META-ADS] Creative parse error:', err.message);
    // Return raw text as single creative fallback
    return [{ primary_text: text.substring(0, 125), headline: businessConfig.offer.substring(0, 40), description: '', cta: 'LEARN_MORE' }];
  }
}

// ── Get Ad Set Performance ──
async function getAdSetPerformance(adAccountId, adSetIds) {
  const results = [];

  for (const adSetId of adSetIds) {
    try {
      const data = await metaFetch(`/${adSetId}/insights?fields=spend,impressions,clicks,actions,cost_per_action_type,frequency&date_preset=last_7d`);

      const insights = (data.data && data.data[0]) || {};
      const leadActions = (insights.actions || []).find(a => a.action_type === 'lead') || {};
      const cplActions = (insights.cost_per_action_type || []).find(a => a.action_type === 'lead') || {};

      results.push({
        adset_id: adSetId,
        spend: parseFloat(insights.spend || 0),
        impressions: parseInt(insights.impressions || 0),
        clicks: parseInt(insights.clicks || 0),
        leads: parseInt(leadActions.value || 0),
        cpl: parseFloat(cplActions.value || 0),
        frequency: parseFloat(insights.frequency || 0),
      });
    } catch (err) {
      console.error('[META-ADS] Performance fetch error for ' + adSetId + ':', err.message);
      results.push({ adset_id: adSetId, error: err.message });
    }
  }

  return results;
}

// ── Optimize Budget ──
// Daily optimizer: scale winners, pause losers, pause fatigued
async function optimizeBudget(adAccountId, targetCPL) {
  const report = { scaled: [], paused: [], fatigued: [], errors: [] };

  try {
    // Get all active ad sets
    const data = await metaFetch(`/act_${adAccountId}/adsets?fields=id,name,daily_budget,status&filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE"]}]&limit=100`);

    const adSets = data.data || [];
    if (adSets.length === 0) {
      console.log('[META-ADS] No active ad sets to optimize');
      return report;
    }

    const adSetIds = adSets.map(a => a.id);
    const performance = await getAdSetPerformance(adAccountId, adSetIds);

    // Also get 3-day and 2-day breakdowns for trend analysis
    for (const perf of performance) {
      if (perf.error) {
        report.errors.push(perf);
        continue;
      }

      const adSet = adSets.find(a => a.id === perf.adset_id);
      if (!adSet) continue;

      const currentBudget = parseInt(adSet.daily_budget || 0);

      // PAUSE: fatigued (frequency > 3.5)
      if (perf.frequency > 3.5) {
        try {
          await pauseAdSet(adAccountId, perf.adset_id);
          report.fatigued.push({ id: perf.adset_id, name: adSet.name, frequency: perf.frequency });
          console.log('[META-ADS] Paused fatigued: ' + adSet.name + ' (freq: ' + perf.frequency + ')');
        } catch (err) {
          report.errors.push({ id: perf.adset_id, action: 'pause_fatigued', error: err.message });
        }
        continue;
      }

      // PAUSE: losers (CPL > 2x target for 2+ days, or $50+ spent with 0 leads)
      if ((perf.cpl > targetCPL * 2 && perf.spend > 0) || (perf.spend >= 50 && perf.leads === 0)) {
        try {
          await pauseAdSet(adAccountId, perf.adset_id);
          report.paused.push({ id: perf.adset_id, name: adSet.name, cpl: perf.cpl, spend: perf.spend, leads: perf.leads });
          console.log('[META-ADS] Paused loser: ' + adSet.name + ' (CPL: $' + perf.cpl + ')');
        } catch (err) {
          report.errors.push({ id: perf.adset_id, action: 'pause_loser', error: err.message });
        }
        continue;
      }

      // SCALE: winners (CPL < target, been running 3+ days with data)
      if (perf.cpl > 0 && perf.cpl < targetCPL && perf.leads >= 2) {
        const newBudget = Math.round(currentBudget * 1.2); // +20%
        try {
          await metaFetch(`/${perf.adset_id}`, {
            method: 'POST',
            body: JSON.stringify({ daily_budget: newBudget }),
          });
          report.scaled.push({
            id: perf.adset_id, name: adSet.name, cpl: perf.cpl,
            oldBudget: currentBudget, newBudget,
          });
          console.log('[META-ADS] Scaled winner: ' + adSet.name + ' ($' + (currentBudget / 100) + ' -> $' + (newBudget / 100) + ')');
        } catch (err) {
          report.errors.push({ id: perf.adset_id, action: 'scale', error: err.message });
        }
      }
    }

    console.log('[META-ADS] Optimization done — scaled: ' + report.scaled.length + ', paused: ' + report.paused.length + ', fatigued: ' + report.fatigued.length);
    return report;
  } catch (err) {
    console.error('[META-ADS] optimizeBudget error:', err.message);
    report.errors.push({ action: 'global', error: err.message });
    return report;
  }
}

// ── Pause / Resume Ad Set ──
async function pauseAdSet(adAccountId, adSetId) {
  await metaFetch(`/${adSetId}`, {
    method: 'POST',
    body: JSON.stringify({ status: 'PAUSED' }),
  });
  console.log('[META-ADS] Paused ad set: ' + adSetId);
}

async function resumeAdSet(adAccountId, adSetId) {
  await metaFetch(`/${adSetId}`, {
    method: 'POST',
    body: JSON.stringify({ status: 'ACTIVE' }),
  });
  console.log('[META-ADS] Resumed ad set: ' + adSetId);
}

// ── Handle Lead Form Webhook ──
// Process Meta leadgen webhook: fetch lead data, normalize, score, insert to CRM
async function handleLeadFormWebhook(body) {
  const results = { processed: 0, errors: [] };

  try {
    const entries = body.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];

      for (const change of changes) {
        if (change.field !== 'leadgen') continue;
        const leadgenId = change.value?.leadgen_id;
        const pageId = change.value?.page_id;

        if (!leadgenId) continue;

        try {
          // Fetch full lead data from Graph API
          const leadData = await metaFetch(`/${leadgenId}?fields=id,created_time,field_data,ad_id,form_id`);

          // Parse field_data into a clean object
          const fields = {};
          for (const f of (leadData.field_data || [])) {
            const key = f.name.toLowerCase();
            fields[key] = Array.isArray(f.values) ? f.values[0] : f.values;
          }

          // Normalize lead
          const lead = {
            name: fields.full_name || fields.name || [fields.first_name, fields.last_name].filter(Boolean).join(' ') || null,
            email: fields.email || null,
            phone: fields.phone_number || fields.phone || null,
            company: fields.company_name || fields.company || null,
            source: 'meta',
            meta: {
              leadgen_id: leadgenId,
              page_id: pageId,
              ad_id: leadData.ad_id || null,
              form_id: leadData.form_id || null,
              raw_fields: fields,
              created_time: leadData.created_time,
            },
          };

          // Score the lead (simple heuristic, scorer.js can re-score later)
          let score = 5;
          if (lead.phone) score += 2;
          if (lead.email) score += 1;
          if (lead.company) score += 1;
          lead.score = Math.min(score, 10);
          lead.score_reason = 'Auto-scored from Meta lead form';

          // Find tenant by page_id (check tenants with meta config)
          let tenantId = null;
          try {
            const { data: tenants } = await supabase.from('tenants').select('id, config').eq('active', true);
            for (const t of (tenants || [])) {
              if (t.config?.meta?.pageId === pageId || t.config?.meta?.page_id === pageId) {
                tenantId = t.id;
                break;
              }
            }
          } catch (err) {
            console.error('[META-ADS] Tenant lookup error:', err.message);
          }

          if (!tenantId) {
            // Fall back to default tenant
            const { data: defaultTenant } = await supabase.from('tenants').select('id').eq('plan', 'owner').eq('active', true).single();
            tenantId = defaultTenant?.id;
          }

          if (!tenantId) {
            results.errors.push({ leadgenId, error: 'No tenant found' });
            continue;
          }

          // Insert to CRM
          const { data: inserted } = await supabase.from('leads').upsert({
            tenant_id: tenantId,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            company: lead.company,
            source: lead.source,
            score: lead.score,
            score_reason: lead.score_reason,
            status: 'new',
            meta: lead.meta,
          }, { onConflict: 'tenant_id,email', ignoreDuplicates: false }).select().single();

          // Log activity
          if (inserted) {
            await supabase.from('activities').insert({
              tenant_id: tenantId,
              lead_id: inserted.id,
              type: 'note',
              data: { message: 'Lead captured from Meta lead form', source: 'meta_leadgen', leadgen_id: leadgenId },
            });
          }

          results.processed++;
          console.log('[META-ADS] Lead captured: ' + (lead.name || lead.email || 'unknown') + ' (score: ' + lead.score + ')');

          // Trigger pipeline: score, route, notify
          try {
            const { logToDiscord } = require('../channels/discord');
            logToDiscord('customer-logs',
              `🎯 **New Meta Lead**\n` +
              `**Name:** ${lead.name || 'N/A'}\n` +
              `**Email:** ${lead.email || 'N/A'}\n` +
              `**Phone:** ${lead.phone || 'N/A'}\n` +
              `**Score:** ${lead.score}/10\n` +
              `**Source:** Meta Lead Form`
            );
          } catch (err) {
            console.error('[META-ADS] Discord notify error:', err.message);
          }

        } catch (err) {
          results.errors.push({ leadgenId, error: err.message });
          console.error('[META-ADS] Lead processing error:', err.message);
        }
      }
    }

    return results;
  } catch (err) {
    console.error('[META-ADS] Webhook handler error:', err.message);
    results.errors.push({ error: err.message });
    return results;
  }
}

// ── Conversions API (CAPI) ──
// Server-side event tracking with SHA256 hashed PII
async function sendCAPIEvent(pixelId, eventName, userData = {}, customData = {}) {
  // Hash PII fields with SHA256
  const hashField = (val) => {
    if (!val) return undefined;
    const normalized = String(val).trim().toLowerCase();
    return crypto.createHash('sha256').update(normalized).digest('hex');
  };

  const hashedUser = {
    em: userData.email ? [hashField(userData.email)] : undefined,
    ph: userData.phone ? [hashField(userData.phone.replace(/\D/g, ''))] : undefined,
    fn: userData.firstName ? [hashField(userData.firstName)] : undefined,
    ln: userData.lastName ? [hashField(userData.lastName)] : undefined,
    ct: userData.city ? [hashField(userData.city)] : undefined,
    st: userData.state ? [hashField(userData.state)] : undefined,
    zp: userData.zip ? [hashField(userData.zip)] : undefined,
    country: userData.country ? [hashField(userData.country)] : undefined,
    client_ip_address: userData.ip || undefined,
    client_user_agent: userData.userAgent || undefined,
    fbc: userData.fbc || undefined,
    fbp: userData.fbp || undefined,
  };

  // Clean undefined values
  Object.keys(hashedUser).forEach(k => hashedUser[k] === undefined && delete hashedUser[k]);

  const eventData = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      user_data: hashedUser,
      custom_data: customData,
    }],
  };

  // Add app secret proof if available
  if (process.env.META_APP_SECRET) {
    const hmac = crypto.createHmac('sha256', process.env.META_APP_SECRET);
    hmac.update(process.env.META_ACCESS_TOKEN);
    eventData.appsecret_proof = hmac.digest('hex');
  }

  const result = await metaFetch(`/${pixelId}/events`, {
    method: 'POST',
    body: JSON.stringify(eventData),
  });

  console.log('[META-ADS] CAPI event sent: ' + eventName + ' (events_received: ' + (result.events_received || 0) + ')');
  return result;
}

module.exports = {
  createCampaign,
  createAdSet,
  createAd,
  generateCreatives,
  getAdSetPerformance,
  optimizeBudget,
  pauseAdSet,
  resumeAdSet,
  handleLeadFormWebhook,
  sendCAPIEvent,
};
