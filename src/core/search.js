const Anthropic = require('@anthropic-ai/sdk').default;
const memory = require('./memory');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function searchWeb(query, count = 5) {
  try {
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY,
      },
    });
    const data = await res.json();
    const results = data.web?.results || [];
    return results.map(r => ({ title: r.title, url: r.url, snippet: r.description }));
  } catch (error) {
    console.error('[SEARCH] Error:', error.message);
    return [];
  }
}

async function searchAndSummarize(query, tenantId) {
  const results = await searchWeb(query);
  if (results.length === 0) return 'No results found for: ' + query;
  const context = results.map((r, i) => `[${i+1}] ${r.title}\n${r.snippet}\nURL: ${r.url}`).join('\n\n');
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    messages: [{ role: 'user', content: `Based on these search results, give a direct useful answer to: "${query}"\n\nResults:\n${context}\n\nBe concise and practical. Include the most relevant URLs at the end.` }],
  });
  const summary = response?.content?.[0]?.text || 'Could not summarize results.';
  if (tenantId) await memory.storeMemory(tenantId, 'fact', `Search: ${query} — ${summary.substring(0, 200)}`, 6, 'web_search');
  return summary;
}

module.exports = { searchWeb, searchAndSummarize };
