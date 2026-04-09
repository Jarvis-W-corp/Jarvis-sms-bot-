// business-config.js — Per-business launch configuration system
// Load, validate, and orchestrate full business launches from config files

const fs = require('fs');
const path = require('path');
const metaAds = require('./meta-ads');
const { logToDiscord } = require('../channels/discord');

const CONFIGS_DIR = path.join(__dirname, '../../businesses');

// ── Load Config ──
function loadConfig(businessSlug) {
  const filePath = path.join(CONFIGS_DIR, businessSlug + '.config.json');
  if (!fs.existsSync(filePath)) {
    throw new Error('Business config not found: ' + businessSlug + ' (looked in ' + filePath + ')');
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

// ── List Configs ──
function listConfigs() {
  if (!fs.existsSync(CONFIGS_DIR)) return [];
  const files = fs.readdirSync(CONFIGS_DIR).filter(f => f.endsWith('.config.json'));
  return files.map(f => {
    try {
      const raw = fs.readFileSync(path.join(CONFIGS_DIR, f), 'utf8');
      const config = JSON.parse(raw);
      return {
        slug: f.replace('.config.json', ''),
        id: config.id,
        name: config.name,
        type: config.type,
        offer: config.offer,
        targetCPL: config.targetCPL,
        dailyBudget: config.dailyBudget,
      };
    } catch (err) {
      return { slug: f.replace('.config.json', ''), error: err.message };
    }
  });
}

// ── Validate Config ──
function validateConfig(config) {
  const errors = [];
  const required = ['id', 'name', 'type', 'offer', 'cta', 'targetCPL', 'dailyBudget'];

  for (const field of required) {
    if (config[field] === undefined || config[field] === null || config[field] === '') {
      errors.push('Missing required field: ' + field);
    }
  }

  if (!config.meta) {
    errors.push('Missing meta configuration (adAccountId, pageId, pixelId)');
  } else {
    if (!config.meta.adAccountId) errors.push('Missing meta.adAccountId');
  }

  if (!config.audiences || !Array.isArray(config.audiences) || config.audiences.length === 0) {
    errors.push('Must have at least one audience');
  }

  if (!config.leadScoring) {
    errors.push('Missing leadScoring configuration');
  }

  if (!config.dialer) {
    errors.push('Missing dialer configuration');
  }

  if (!config.email) {
    errors.push('Missing email configuration');
  }

  if (!config.sms) {
    errors.push('Missing sms configuration');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ── Launch Business ──
// Master orchestrator: load config, generate creatives, create Meta campaign + ad sets + ads,
// register webhooks, create email sequence, configure dialer, return full launch report.
// This is what !launch calls.
async function launchBusiness(businessSlug) {
  const startTime = Date.now();
  const report = {
    slug: businessSlug,
    status: 'in_progress',
    steps: [],
    errors: [],
  };

  try {
    // Step 1: Load and validate config
    console.log('[LAUNCH] Loading config for: ' + businessSlug);
    const config = loadConfig(businessSlug);
    const validation = validateConfig(config);

    report.config = { id: config.id, name: config.name, type: config.type };
    report.steps.push({ step: 'load_config', status: 'done' });

    if (!validation.valid) {
      // Warn but don't stop — some fields might be optional for partial launches
      report.warnings = validation.errors;
      console.log('[LAUNCH] Config warnings: ' + validation.errors.join(', '));
    }

    const adAccountId = config.meta?.adAccountId;
    if (!adAccountId) {
      report.steps.push({ step: 'meta_campaign', status: 'skipped', reason: 'No adAccountId in config' });
      console.log('[LAUNCH] Skipping Meta campaign — no adAccountId');
    }

    // Step 2: Generate ad creatives
    console.log('[LAUNCH] Generating creatives...');
    let creatives = [];
    try {
      creatives = await metaAds.generateCreatives(config, 3);
      report.steps.push({ step: 'generate_creatives', status: 'done', count: creatives.length });
      report.creatives = creatives;
    } catch (err) {
      report.steps.push({ step: 'generate_creatives', status: 'error', error: err.message });
      report.errors.push('Creative generation failed: ' + err.message);
    }

    // Step 3: Create Meta campaign + ad sets + ads (all PAUSED)
    if (adAccountId) {
      try {
        console.log('[LAUNCH] Creating Meta campaign...');
        const campaign = await metaAds.createCampaign(adAccountId, config.name + ' - Lead Gen', 'OUTCOME_LEADS', 'PAUSED');
        report.campaign = campaign;
        report.steps.push({ step: 'create_campaign', status: 'done', campaign_id: campaign.campaign_id });

        // Create an ad set for each audience
        const adSets = [];
        const budgetPerAudience = Math.round((config.dailyBudget * 100) / config.audiences.length); // cents

        for (const audience of config.audiences) {
          try {
            console.log('[LAUNCH] Creating ad set: ' + audience.name);
            const adSet = await metaAds.createAdSet(
              adAccountId,
              campaign.campaign_id,
              audience.name,
              budgetPerAudience,
              audience.targeting,
              'LEAD_GENERATION'
            );
            adSets.push(adSet);

            // Create an ad for each creative in this ad set
            for (let i = 0; i < creatives.length; i++) {
              try {
                const creative = creatives[i];
                await metaAds.createAd(
                  adAccountId,
                  adSet.adset_id,
                  `${audience.name} - Variant ${i + 1}`,
                  {
                    object_story_spec: {
                      page_id: config.meta.pageId,
                      link_data: {
                        message: creative.primary_text,
                        name: creative.headline,
                        description: creative.description,
                        call_to_action: { type: creative.cta || 'LEARN_MORE' },
                      },
                    },
                  }
                );
              } catch (err) {
                report.errors.push('Ad creation error (' + audience.name + ' v' + (i + 1) + '): ' + err.message);
              }
            }
          } catch (err) {
            report.errors.push('Ad set creation error (' + audience.name + '): ' + err.message);
          }
        }

        report.adSets = adSets;
        report.steps.push({ step: 'create_adsets_and_ads', status: 'done', adSets: adSets.length, adsPerSet: creatives.length });
      } catch (err) {
        report.steps.push({ step: 'meta_campaign', status: 'error', error: err.message });
        report.errors.push('Campaign creation failed: ' + err.message);
      }
    }

    // Step 4: Create email sequence
    try {
      console.log('[LAUNCH] Setting up email sequence...');
      const { supabase } = require('../db/supabase');
      const Anthropic = require('@anthropic-ai/sdk').default;
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      // Generate email sequence via Claude
      const seqResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: `Generate a ${config.email?.sequenceLength || 5}-step email nurture sequence.

Business: ${config.name}
Offer: ${config.offer}
Tone: ${config.email?.tone || 'friendly, professional'}
CTA: ${config.cta}

Return ONLY a JSON array of objects with:
- delay_hours: hours after signup to send (0 for immediate, 24, 48, 72, 120)
- subject: email subject line
- body: full email body (plain text, use {name} for personalization)
- channel: always "email"

No markdown, no explanation. JSON only.`,
        messages: [{ role: 'user', content: 'Generate the email sequence now.' }],
      });

      let steps = [];
      try {
        const jsonMatch = seqResponse.content[0].text.match(/\[[\s\S]*\]/);
        if (jsonMatch) steps = JSON.parse(jsonMatch[0]);
      } catch (err) {
        console.error('[LAUNCH] Email sequence parse error:', err.message);
      }

      if (steps.length > 0 && config.tenantId) {
        await supabase.from('email_sequences').insert({
          tenant_id: config.tenantId,
          name: config.name + ' - Welcome Sequence',
          niche: config.type,
          steps,
          status: 'active',
        });
      }

      report.steps.push({ step: 'email_sequence', status: 'done', stepCount: steps.length });
      report.emailSequence = { steps: steps.length, subjects: steps.map(s => s.subject) };
    } catch (err) {
      report.steps.push({ step: 'email_sequence', status: 'error', error: err.message });
      report.errors.push('Email sequence failed: ' + err.message);
    }

    // Step 5: Configure dialer
    try {
      console.log('[LAUNCH] Configuring dialer...');
      report.dialer = {
        provider: config.dialer?.provider || 'bland',
        voice: config.dialer?.voice || 'maya',
        maxDuration: config.dialer?.maxDuration || 5,
        callGoal: config.dialer?.callGoal || 'book appointment',
        greeting: config.dialer?.greeting || null,
        status: 'configured',
      };
      report.steps.push({ step: 'configure_dialer', status: 'done' });
    } catch (err) {
      report.steps.push({ step: 'configure_dialer', status: 'error', error: err.message });
    }

    // Step 6: Register webhooks (log the needed URL)
    try {
      const renderUrl = process.env.RENDER_EXTERNAL_URL || 'https://jarvis-sms-bot.onrender.com';
      report.webhooks = {
        meta_leadgen: renderUrl + '/webhooks/meta-leads',
        meta_verify: renderUrl + '/webhooks/meta-leads?hub.verify_token=jarvis_meta_webhook',
        note: 'Register this URL in Meta App Dashboard > Webhooks > Page > leadgen',
      };
      report.steps.push({ step: 'register_webhooks', status: 'done' });
    } catch (err) {
      report.steps.push({ step: 'register_webhooks', status: 'error', error: err.message });
    }

    // Finalize
    report.status = report.errors.length > 0 ? 'completed_with_errors' : 'completed';
    report.elapsed = (Date.now() - startTime) + 'ms';

    // Notify Discord
    try {
      const summary = [
        `🚀 **Business Launched: ${config.name}**`,
        `**Type:** ${config.type}`,
        `**Offer:** ${config.offer}`,
        `**Target CPL:** $${config.targetCPL}`,
        `**Daily Budget:** $${config.dailyBudget}`,
        `**Creatives:** ${creatives.length}`,
        `**Audiences:** ${config.audiences.length}`,
        `**Status:** All PAUSED (ready to activate)`,
        `**Elapsed:** ${report.elapsed}`,
        report.errors.length > 0 ? `**Warnings:** ${report.errors.length}` : '',
      ].filter(Boolean).join('\n');

      logToDiscord('customer-logs', summary);
    } catch (err) {
      console.error('[LAUNCH] Discord notify error:', err.message);
    }

    console.log('[LAUNCH] ' + config.name + ' launch complete in ' + report.elapsed);
    return report;
  } catch (err) {
    report.status = 'failed';
    report.error = err.message;
    report.elapsed = (Date.now() - startTime) + 'ms';
    console.error('[LAUNCH] Fatal error:', err.message);
    return report;
  }
}

// ── Save Config ──
function saveConfig(businessSlug, config) {
  const filePath = path.join(CONFIGS_DIR, businessSlug + '.config.json');
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
  console.log('[CONFIG] Saved: ' + filePath);
}

module.exports = {
  loadConfig,
  listConfigs,
  validateConfig,
  launchBusiness,
  saveConfig,
};
