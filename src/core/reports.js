// reports.js — Deliverable Generation System
// Generates actual reports, checklists, and formatted documents.
// Uses Claude Sonnet (cheap) for all generation. Delivers via Discord or memory.

const Anthropic = require('@anthropic-ai/sdk').default;
const { searchWeb } = require('./search');
const memory = require('./memory');
const { sendBossMessage, logToDiscord } = require('../channels/discord');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const REPORT_TIMEOUT = 90_000; // 90s per Claude call

// ═══ COMPETITOR REPORT ═══

async function generateCompetitorReport(tenantId, companies, industry) {
  if (!companies || !companies.length) {
    return '**No companies provided for analysis.**';
  }

  const analyses = [];

  for (const company of companies) {
    try {
      // Step 1: Search for data
      const searchResults = await Promise.race([
        searchWeb(company + ' ' + (industry || '') + ' pricing features reviews'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Search timeout')), 30000)),
      ]);

      const searchText = Array.isArray(searchResults)
        ? searchResults.map(r => (r.title || '') + ': ' + (r.snippet || '')).join('\n')
        : String(searchResults);

      // Step 2: Claude analysis
      const response = await Promise.race([
        anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          system: 'You are a competitive intelligence analyst. Provide a structured analysis. Be specific with numbers, pricing, and facts. No fluff.',
          messages: [{
            role: 'user',
            content: 'Analyze this competitor in the ' + (industry || 'general') + ' space:\n\n**Company:** ' + company + '\n\n**Research Data:**\n' + searchText.substring(0, 4000) + '\n\nProvide:\n1. Overview (what they do, market position)\n2. Pricing (specific numbers if available)\n3. Key Features/Services\n4. Strengths\n5. Weaknesses/Gaps\n6. How to beat them',
          }],
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Claude timeout')), REPORT_TIMEOUT)),
      ]);

      analyses.push({
        company,
        analysis: response.content[0].text,
      });
    } catch (err) {
      console.error('[REPORTS] Error analyzing ' + company + ':', err.message);
      analyses.push({
        company,
        analysis: 'Analysis failed: ' + err.message,
      });
    }
  }

  // Compile into final report
  let report = '# Competitor Analysis Report: ' + (industry || 'Market') + '\n';
  report += '*Generated ' + new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET by Jarvis AI*\n\n';
  report += '---\n\n';

  for (const { company, analysis } of analyses) {
    report += '## ' + company + '\n\n' + analysis + '\n\n---\n\n';
  }

  // Generate executive summary
  try {
    const summaryResponse = await Promise.race([
      anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: 'You are a CEO writing an executive summary. Be direct and actionable.',
        messages: [{
          role: 'user',
          content: 'Write a 3-paragraph executive summary of this competitor analysis. Include: key takeaways, biggest threats, and recommended actions.\n\n' + report.substring(0, 6000),
        }],
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Summary timeout')), REPORT_TIMEOUT)),
    ]);

    report = '# Competitor Analysis Report: ' + (industry || 'Market') + '\n' +
      '*Generated ' + new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET by Jarvis AI*\n\n' +
      '## Executive Summary\n\n' + summaryResponse.content[0].text + '\n\n---\n\n' +
      report.split('---\n\n').slice(1).join('---\n\n');
  } catch (e) {
    console.error('[REPORTS] Summary generation failed:', e.message);
  }

  return report;
}

// ═══ CHECKLIST GENERATION ═══

async function generateChecklist(tenantId, topic, items) {
  // If items provided, format them directly
  if (items && items.length > 0) {
    let checklist = '# Checklist: ' + topic + '\n';
    checklist += '*Generated ' + new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET*\n\n';
    items.forEach((item, i) => {
      const text = typeof item === 'string' ? item : (item.text || item.name || String(item));
      checklist += '- [ ] **' + (i + 1) + '.** ' + text + '\n';
    });
    return checklist;
  }

  // Otherwise, generate with Claude
  try {
    const response = await Promise.race([
      anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: 'You are creating a comprehensive, actionable checklist. Format as markdown with checkbox syntax (- [ ]). Include specific steps, not vague items. Group into sections if the topic warrants it.',
        messages: [{
          role: 'user',
          content: 'Create a detailed checklist for: ' + topic + '\n\nBe specific and actionable. Include everything someone would need to complete this successfully.',
        }],
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Claude timeout')), REPORT_TIMEOUT)),
    ]);

    return '# Checklist: ' + topic + '\n*Generated ' + new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET by Jarvis AI*\n\n' + response.content[0].text;
  } catch (err) {
    console.error('[REPORTS] Checklist generation failed:', err.message);
    return '# Checklist: ' + topic + '\n\nGeneration failed: ' + err.message;
  }
}

// ═══ MARKDOWN → HTML ═══

function formatAsHTML(markdown, title) {
  if (!markdown) return '<html><body><p>No content</p></body></html>';

  // Basic markdown → HTML conversion
  let html = markdown
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Checkboxes
    .replace(/^- \[ \] (.+)$/gm, '<div class="check-item"><input type="checkbox"><span>$1</span></div>')
    .replace(/^- \[x\] (.+)$/gm, '<div class="check-item"><input type="checkbox" checked><span>$1</span></div>')
    // List items
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  html = '<p>' + html + '</p>';

  return '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n' +
    '<title>' + (title || 'Jarvis Report') + '</title>\n' +
    '<style>\n' +
    '  body { background: #0f172a; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; max-width: 900px; margin: 0 auto; line-height: 1.6; }\n' +
    '  h1 { color: #8b5cf6; font-size: 28px; border-bottom: 2px solid #1e293b; padding-bottom: 12px; }\n' +
    '  h2 { color: #a78bfa; font-size: 22px; margin-top: 32px; }\n' +
    '  h3 { color: #c4b5fd; font-size: 18px; }\n' +
    '  hr { border: none; border-top: 1px solid #1e293b; margin: 24px 0; }\n' +
    '  li { margin-bottom: 4px; }\n' +
    '  strong { color: #f1f5f9; }\n' +
    '  .check-item { display: flex; align-items: flex-start; gap: 8px; margin: 6px 0; }\n' +
    '  .check-item input { margin-top: 4px; accent-color: #8b5cf6; }\n' +
    '  .meta { color: #64748b; font-size: 13px; margin-bottom: 24px; }\n' +
    '  @media print { body { background: #fff; color: #1e293b; } h1 { color: #7c3aed; } h2 { color: #6d28d9; } }\n' +
    '</style>\n</head>\n<body>\n' +
    '<div class="meta">Generated by Jarvis AI — ' + new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET</div>\n' +
    html + '\n</body>\n</html>';
}

// ═══ SAVE REPORT ═══

async function saveReport(tenantId, title, content, format) {
  try {
    // Store in memory as training data
    await memory.storeMemory(
      tenantId,
      'training',
      'Report: ' + title + '\n\n' + content.substring(0, 2000),
      8,
      'reports'
    );

    // Send to Discord
    const truncated = content.length > 1800
      ? content.substring(0, 1800) + '\n\n...(full report saved to memory)'
      : content;

    await sendBossMessage('**Report: ' + title + '**\n\n' + truncated);
    await logToDiscord('daily-reports', '**Report Generated:** ' + title + ' (' + content.length + ' chars, format: ' + (format || 'markdown') + ')');

    console.log('[REPORTS] Saved and delivered: ' + title);
    return { success: true, title, length: content.length };
  } catch (err) {
    console.error('[REPORTS] Save error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  generateCompetitorReport,
  generateChecklist,
  formatAsHTML,
  saveReport,
};
