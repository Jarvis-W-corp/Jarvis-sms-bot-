// fulfillment.js — Promise Detection & Auto-Queuing System
// When Jarvis says "I'll research that tonight" — this module makes it ACTUALLY HAPPEN.
// Parses Jarvis's replies for commitments, creates real crew jobs that execute.

const crew = require('./crew');

// ═══ PROMISE DETECTION PATTERNS ═══
// Each pattern: { regex, worker, jobType, extractDescription }

const PROMISE_PATTERNS = [
  // Research promises → Hawk
  {
    regex: /I'll research\s+(.+?)(?:\.|$)/i,
    worker: 'hawk',
    jobType: 'research',
    extract: (match, userMsg) => ({ title: 'Research: ' + match[1].trim(), description: 'Research ' + match[1].trim() + '. User asked: ' + userMsg.substring(0, 500) }),
  },
  {
    regex: /Let me research\s+(.+?)(?:\.|$)/i,
    worker: 'hawk',
    jobType: 'research',
    extract: (match, userMsg) => ({ title: 'Research: ' + match[1].trim(), description: 'Research ' + match[1].trim() + '. User asked: ' + userMsg.substring(0, 500) }),
  },
  {
    regex: /I'll (?:look into|dig into|investigate)\s+(.+?)(?:\.|$)/i,
    worker: 'hawk',
    jobType: 'research',
    extract: (match, userMsg) => ({ title: 'Investigate: ' + match[1].trim(), description: 'Deep dive into ' + match[1].trim() + '. Context: ' + userMsg.substring(0, 500) }),
  },
  {
    regex: /I'll (?:find|identify|scout)\s+(\d+)\s+(.+?)(?:\.|$)/i,
    worker: 'hawk',
    jobType: 'research_batch',
    extract: (match, userMsg) => ({ title: 'Find ' + match[1] + ' ' + match[2].trim(), description: 'Find ' + match[1] + ' ' + match[2].trim() + '. Context: ' + userMsg.substring(0, 500), count: parseInt(match[1]) }),
  },
  {
    regex: /(?:researching|analyzing|investigating)\s+(.+?)(?:\s+tonight|\s+overnight|\s+while you sleep|\s+in the background|\.)/i,
    worker: 'hawk',
    jobType: 'research',
    extract: (match, userMsg) => ({ title: 'Research: ' + match[1].trim(), description: 'Background research on ' + match[1].trim() + '. Context: ' + userMsg.substring(0, 500) }),
  },
  // Numbered research — "10 peptide companies", "5 competitors"
  {
    regex: /(\d+)\s+((?:companies|competitors|businesses|brands|stores|products|suppliers|vendors|agencies)(?:\s+(?:like|similar to|in|for|that)\s+.+?)?)\b/i,
    worker: 'hawk',
    jobType: 'research_batch',
    extract: (match, userMsg) => ({ title: 'Research ' + match[1] + ' ' + match[2].trim(), description: 'Find and analyze ' + match[1] + ' ' + match[2].trim() + '. Context: ' + userMsg.substring(0, 500), count: parseInt(match[1]) }),
  },
  // Competitor analysis
  {
    regex: /competitor (?:analysis|intel|research|breakdown)\s*(?:on|for|of)?\s*(.+?)(?:\.|$)/i,
    worker: 'hawk',
    jobType: 'research',
    extract: (match, userMsg) => ({ title: 'Competitor Analysis: ' + match[1].trim(), description: 'Full competitor analysis of ' + match[1].trim() + '. Include pricing, features, weaknesses, market position. Context: ' + userMsg.substring(0, 500) }),
  },

  // Content/marketing promises → Ghost
  {
    regex: /I'll (?:create|generate|build|write|draft)\s+(.+?)(?:\.|$)/i,
    worker: 'ghost',
    jobType: 'content',
    extract: (match, userMsg) => ({ title: 'Create: ' + match[1].trim(), description: 'Create ' + match[1].trim() + '. Context: ' + userMsg.substring(0, 500) }),
  },
  {
    regex: /I'll (?:put together|prepare|compile)\s+(.+?)(?:\.|$)/i,
    worker: 'ghost',
    jobType: 'content',
    extract: (match, userMsg) => ({ title: 'Prepare: ' + match[1].trim(), description: 'Prepare ' + match[1].trim() + '. Context: ' + userMsg.substring(0, 500) }),
  },
  {
    regex: /(?:generating|building|creating|writing|drafting)\s+(.+?)(?:\s+tonight|\s+overnight|\s+for you|\.)/i,
    worker: 'ghost',
    jobType: 'content',
    extract: (match, userMsg) => ({ title: 'Generate: ' + match[1].trim(), description: 'Generate ' + match[1].trim() + '. Context: ' + userMsg.substring(0, 500) }),
  },

  // Ad creation → Ghost
  {
    regex: /I'll (?:create|generate|build|run)\s+(?:ads?|ad creatives?|campaigns?)\s*(?:for|on|about)?\s*(.+?)(?:\.|$)/i,
    worker: 'ghost',
    jobType: 'ads',
    extract: (match, userMsg) => ({ title: 'Ad Creation: ' + match[1].trim(), description: 'Create ad creatives for ' + match[1].trim() + '. Include multiple variations, hooks, CTAs. Context: ' + userMsg.substring(0, 500) }),
  },

  // Email sequences → Ghost
  {
    regex: /(?:email|outreach|drip)\s+(?:sequence|campaign|series)\s*(?:for|about|on)?\s*(.+?)(?:\.|$)/i,
    worker: 'ghost',
    jobType: 'content',
    extract: (match, userMsg) => ({ title: 'Email Sequence: ' + match[1].trim(), description: 'Create a multi-step email/outreach sequence for ' + match[1].trim() + '. Context: ' + userMsg.substring(0, 500) }),
  },

  // Document generation promises
  {
    regex: /(?:PDF|checklist|document|report)\s+(?:of|for|about|on|listing|covering)\s+(.+?)(?:\.|$)/i,
    worker: 'ghost',
    jobType: 'document',
    extract: (match, userMsg) => ({ title: 'Document: ' + match[1].trim(), description: 'Generate a detailed document/checklist about ' + match[1].trim() + '. Context: ' + userMsg.substring(0, 500) }),
  },
  {
    regex: /I'll have\s+(?:a |the )?(.+?)\s+(?:ready|done|prepared|compiled)/i,
    worker: 'ghost',
    jobType: 'content',
    extract: (match, userMsg) => ({ title: 'Prepare: ' + match[1].trim(), description: 'Prepare ' + match[1].trim() + '. Context: ' + userMsg.substring(0, 500) }),
  },

  // Time-bound promises
  {
    regex: /(?:by|ready by|done by|have it by)\s+(?:morning|tonight|tomorrow|end of day|EOD)/i,
    worker: null, // inferred from context
    jobType: 'time_bound',
    extract: (match, userMsg) => ({ title: 'Scheduled: ' + userMsg.substring(0, 80), description: 'Time-bound task from conversation. User message: ' + userMsg.substring(0, 500) }),
  },

  // Report promises
  {
    regex: /I'll (?:send|deliver|have)\s+(?:a |the )?report\s*(?:on|about|for|of)?\s*(.+?)(?:\.|$)/i,
    worker: 'hawk',
    jobType: 'report',
    extract: (match, userMsg) => ({ title: 'Report: ' + match[1].trim(), description: 'Generate a comprehensive report on ' + match[1].trim() + '. Include data, analysis, and recommendations. Context: ' + userMsg.substring(0, 500) }),
  },
];

// ═══ MAIN DETECTION FUNCTION ═══

async function detectAndQueueWork(tenantId, jarvisReply, userMessage) {
  if (!jarvisReply || !userMessage) return [];

  const queued = [];
  const seenTitles = new Set(); // avoid duplicate jobs from overlapping patterns

  for (const pattern of PROMISE_PATTERNS) {
    const match = jarvisReply.match(pattern.regex);
    if (!match) continue;

    try {
      const { title, description, count } = pattern.extract(match, userMessage);

      // Dedup
      const titleKey = title.toLowerCase().substring(0, 50);
      if (seenTitles.has(titleKey)) continue;
      seenTitles.add(titleKey);

      // Determine worker — if null, infer from keywords
      let worker = pattern.worker;
      if (!worker) {
        if (/research|analyz|compet|find|scout/i.test(jarvisReply)) worker = 'hawk';
        else if (/create|build|write|ad|content|copy|email/i.test(jarvisReply)) worker = 'ghost';
        else worker = 'hawk'; // default to research
      }

      // For batch jobs, create multiple
      if (pattern.jobType === 'research_batch' && count && count > 1) {
        const jobId = await crew.createJob(worker, title, description, {
          tenant_id: tenantId,
          source: 'fulfillment',
          count: count,
          user_message: userMessage.substring(0, 500),
          jarvis_reply: jarvisReply.substring(0, 500),
        }, 6);
        if (jobId) {
          queued.push({ jobId, title, worker, type: pattern.jobType });
          console.log('[FULFILLMENT] Queued batch job: ' + title + ' (count: ' + count + ')');
        }
      } else {
        const jobId = await crew.createJob(worker, title, description, {
          tenant_id: tenantId,
          source: 'fulfillment',
          user_message: userMessage.substring(0, 500),
          jarvis_reply: jarvisReply.substring(0, 500),
        }, 6);
        if (jobId) {
          queued.push({ jobId, title, worker, type: pattern.jobType });
          console.log('[FULFILLMENT] Queued job: ' + title + ' -> ' + worker);
        }
      }
    } catch (err) {
      console.error('[FULFILLMENT] Error queuing from pattern:', err.message);
    }
  }

  return queued;
}

// ═══ DIRECT RESEARCH REPORT QUEUING ═══

async function queueResearchReport(tenantId, topic, companies, count) {
  const queued = [];

  // Step 1: Create research jobs
  if (companies && companies.length > 0) {
    for (const company of companies) {
      const jobId = await crew.createJob('hawk', 'Research: ' + company, 'Research ' + company + ' in context of ' + topic + '. Analyze pricing, features, market position, strengths, weaknesses.', {
        tenant_id: tenantId,
        source: 'fulfillment',
        topic: topic,
        company: company,
      }, 6);
      if (jobId) queued.push({ jobId, title: 'Research: ' + company, worker: 'hawk' });
    }
  } else {
    // General topic research
    const jobId = await crew.createJob('hawk', 'Research: ' + topic + (count ? ' (' + count + ' targets)' : ''), 'Research ' + topic + '.' + (count ? ' Find and analyze ' + count + ' companies/options.' : '') + ' Provide detailed analysis with pricing, features, market position.', {
      tenant_id: tenantId,
      source: 'fulfillment',
      topic: topic,
      count: count || 10,
    }, 6);
    if (jobId) queued.push({ jobId, title: 'Research: ' + topic, worker: 'hawk' });
  }

  // Step 2: Create compilation job (runs after research)
  const compileJobId = await crew.createJob('ghost', 'Compile Report: ' + topic, 'Compile all research findings on ' + topic + ' into a structured report. Include: executive summary, detailed analysis per company, comparison matrix, recommendations, and next steps.', {
    tenant_id: tenantId,
    source: 'fulfillment',
    topic: topic,
    depends_on: queued.map(q => q.jobId),
  }, 5);
  if (compileJobId) queued.push({ jobId: compileJobId, title: 'Compile Report: ' + topic, worker: 'ghost' });

  console.log('[FULFILLMENT] Queued research report pipeline: ' + topic + ' (' + queued.length + ' jobs)');
  return queued;
}

// ═══ DOCUMENT GENERATION ═══

async function queueDocumentGeneration(tenantId, docType, content, deliverTo) {
  const worker = 'ghost';
  const title = (docType || 'Document') + ': ' + (content || '').substring(0, 60);
  const description = 'Generate a ' + (docType || 'document') + '. Content/topic: ' + (content || 'See input') + '. Format as a professional, ready-to-use document.';

  const jobId = await crew.createJob(worker, title, description, {
    tenant_id: tenantId,
    source: 'fulfillment',
    doc_type: docType,
    content: content,
    deliver_to: deliverTo || 'discord',
  }, 6);

  console.log('[FULFILLMENT] Queued document generation: ' + title);
  return jobId;
}

// ═══ PDF/CHECKLIST GENERATION ═══

function generatePDFChecklist(title, items) {
  if (!items || !items.length) return '<html><body><h1>' + (title || 'Checklist') + '</h1><p>No items provided.</p></body></html>';

  const itemsHtml = items.map((item, i) => {
    const text = typeof item === 'string' ? item : (item.text || item.name || String(item));
    const detail = (typeof item === 'object' && item.detail) ? '<p style="margin:2px 0 8px 28px;color:#94a3b8;font-size:13px;">' + item.detail + '</p>' : '';
    return '<div style="margin-bottom:4px;">' +
      '<label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;">' +
      '<input type="checkbox" style="margin-top:4px;accent-color:#8b5cf6;">' +
      '<span style="color:#e2e8f0;">' + (i + 1) + '. ' + text + '</span>' +
      '</label>' + detail + '</div>';
  }).join('\n');

  return '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title>' + (title || 'Checklist') + '</title>\n' +
    '<style>\n' +
    '  body { background: #0f172a; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }\n' +
    '  h1 { color: #8b5cf6; border-bottom: 2px solid #1e293b; padding-bottom: 12px; }\n' +
    '  .meta { color: #64748b; font-size: 13px; margin-bottom: 24px; }\n' +
    '  .checklist { background: #1e293b; border-radius: 12px; padding: 24px; }\n' +
    '  @media print { body { background: #fff; color: #1e293b; } .checklist { background: #f8fafc; border: 1px solid #e2e8f0; } h1 { color: #7c3aed; } }\n' +
    '</style>\n</head>\n<body>\n' +
    '<h1>' + (title || 'Checklist') + '</h1>\n' +
    '<div class="meta">Generated by Jarvis AI — ' + new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET</div>\n' +
    '<div class="checklist">\n' + itemsHtml + '\n</div>\n' +
    '</body>\n</html>';
}

// ═══ DELIVER REPORT ═══

async function deliverReport(tenantId, report, channel) {
  try {
    if (channel === 'discord' || !channel) {
      const { sendBossMessage, logToDiscord } = require('../channels/discord');
      const truncated = report.length > 1900 ? report.substring(0, 1900) + '\n\n...(truncated)' : report;
      await sendBossMessage('**Report Ready**\n\n' + truncated);
    }

    // Also store in memory for future reference
    try {
      const memory = require('./memory');
      await memory.storeMemory(tenantId, 'fact', 'Report delivered: ' + report.substring(0, 200), 7, 'fulfillment');
    } catch (e) { /* soft fail */ }

  } catch (err) {
    console.error('[FULFILLMENT] Deliver error:', err.message);
  }
}

module.exports = {
  detectAndQueueWork,
  queueResearchReport,
  queueDocumentGeneration,
  generatePDFChecklist,
  deliverReport,
  PROMISE_PATTERNS,
};
