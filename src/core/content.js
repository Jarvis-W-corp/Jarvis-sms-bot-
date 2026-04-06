const Anthropic = require('@anthropic-ai/sdk').default;
const cheerio = require('cheerio');
const pdfParse = require('pdf-parse');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── YouTube Transcript Extraction ──

async function getYouTubeTranscript(url) {
  // Extract video ID from various YouTube URL formats
  const match = url.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (!match) throw new Error('Invalid YouTube URL');
  const videoId = match[1];

  // Fetch the video page to get captions
  const res = await fetch('https://www.youtube.com/watch?v=' + videoId, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  const html = await res.text();

  // Extract title
  const titleMatch = html.match(/<title>(.+?)<\/title>/);
  const title = titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : 'Unknown';

  // Try to extract captions from the page data
  const captionsMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
  if (!captionsMatch) {
    // Fallback: extract description and metadata
    const descMatch = html.match(/"shortDescription":"(.*?)"/);
    const desc = descMatch ? descMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '';
    return {
      type: 'youtube',
      videoId,
      title,
      transcript: null,
      description: desc,
      text: 'YouTube Video: ' + title + '\n\nDescription:\n' + desc + '\n\n(No captions available — analysis based on description only)',
    };
  }

  // Parse and fetch the caption track
  const captions = JSON.parse(captionsMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
  const englishTrack = captions.find(c => c.languageCode === 'en') || captions[0];
  if (!englishTrack?.baseUrl) throw new Error('No caption track found');

  const captionUrl = englishTrack.baseUrl.replace(/\\u0026/g, '&');
  const captionRes = await fetch(captionUrl);
  const captionXml = await captionRes.text();

  // Parse XML captions
  const lines = [];
  const textMatches = captionXml.matchAll(/<text[^>]*>(.*?)<\/text>/gs);
  for (const m of textMatches) {
    const decoded = m[1]
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n/g, ' ').trim();
    if (decoded) lines.push(decoded);
  }

  const transcript = lines.join(' ');
  return {
    type: 'youtube',
    videoId,
    title,
    transcript,
    text: 'YouTube Video: ' + title + '\n\nTranscript:\n' + transcript,
  };
}

// ── TikTok / Social Media ──

async function getTikTokContent(url) {
  // TikTok doesn't expose transcripts easily — fetch page metadata
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    redirect: 'follow',
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
  const description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
  const author = $('meta[property="og:author"]').attr('content') || '';

  // Try to extract structured data
  let scriptData = '';
  $('script[type="application/ld+json"]').each((_, el) => {
    scriptData += $(el).html() + '\n';
  });

  return {
    type: 'tiktok',
    url,
    title,
    author,
    description,
    text: 'TikTok Video' + (author ? ' by ' + author : '') + '\n\nTitle: ' + title + '\nDescription: ' + description,
  };
}

// ── Web Page Extraction ──

async function getWebPageContent(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    redirect: 'follow',
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  // Remove script, style, nav, footer elements
  $('script, style, nav, footer, header, aside, .sidebar, .nav, .footer, .header, .ad, .advertisement').remove();

  const title = $('title').text().trim() || $('h1').first().text().trim() || '';
  const article = $('article').text().trim() || $('main').text().trim() || $('body').text().trim();
  // Clean up whitespace
  const text = article.replace(/\s+/g, ' ').trim();

  return {
    type: 'webpage',
    url,
    title,
    text: 'Web Page: ' + title + '\n\n' + text.substring(0, 15000),
  };
}

// ── PDF Extraction ──

async function getPDFContent(buffer, filename) {
  const data = await pdfParse(buffer);
  return {
    type: 'pdf',
    filename: filename || 'document.pdf',
    pages: data.numpages,
    text: 'PDF Document: ' + (filename || 'document.pdf') + ' (' + data.numpages + ' pages)\n\n' + data.text,
  };
}

// ── Video Attachment Processing ──

async function processVideoAttachment(videoUrl, context, tenantId, filename) {
  // For video attachments, we can't easily extract audio/transcript without server-side processing
  // Instead, we'll analyze the context provided by the user and store it as a learning opportunity
  
  const videoInfo = {
    type: 'video_attachment',
    filename: filename || 'video.mp4',
    url: videoUrl,
    context: context,
    text: `Video Upload: ${filename || 'video.mp4'}\n\nContext: ${context}\n\nNote: Video content analysis requires transcription. Consider uploading with detailed description of key points, strategies, or insights you want Jarvis to learn from this video.`,
  };

  // Analyze the context provided
  const analysis = await analyzeVideoContext(context, filename);

  // Store as learning memory if we have tenant
  if (tenantId) {
    const memory = require('./memory');
    await memory.storeMemory(
      tenantId,
      'training',
      `Video upload: ${filename} - ${context.substring(0, 300)}`,
      7,
      'video_processor'
    );
  }

  return {
    content: videoInfo,
    analysis: analysis,
    source: filename || 'video upload',
  };
}

async function analyzeVideoContext(context, filename) {
  const prompt = `The user uploaded a video file "${filename || 'video'}" with this context/description: "${context}"\n\nSince I cannot process video content directly, analyze what the user is trying to teach me and provide actionable insights based on their description.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: `You are Jarvis, Mark's AI CEO. A video was uploaded but you cannot process video content directly. Instead, analyze the user's description/context and extract business value.

Provide:
1. **What Mark Wants Me to Learn** - Based on his description
2. **Action Items** - Specific tasks I should work on
3. **Business Applications** - How this applies to our ventures
4. **Follow-up Questions** - What clarification I need to maximize learning

Be direct and revenue-focused. If the context is vague, ask for more specific details about the key points, strategies, or insights from the video.`,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

// ── Universal Content Processor ──

async function extractContent(input) {
  // Detect type from URL pattern
  if (typeof input === 'string') {
    const url = input.trim();
    if (url.match(/youtube\.com|youtu\.be/i)) return getYouTubeTranscript(url);
    if (url.match(/tiktok\.com/i)) return getTikTokContent(url);
    if (url.match(/instagram\.com/i)) return getWebPageContent(url);
    if (url.match(/twitter\.com|x\.com/i)) return getWebPageContent(url);
    if (url.match(/^https?:\/\//i)) return getWebPageContent(url);
    // Plain text input
    return { type: 'text', text: input };
  }
  // Buffer = PDF
  if (Buffer.isBuffer(input)) return getPDFContent(input);
  throw new Error('Unknown content type');
}

// ── AI Analysis ──

async function analyzeContent(content, purpose) {
  const prompt = purpose
    ? 'The user sent this content with this goal: ' + purpose + '\n\nContent:\n' + content.text
    : 'Analyze this content thoroughly.\n\nContent:\n' + content.text;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: `You are Jarvis, an AI business analyst. Break down content and extract actionable intelligence.

When analyzing, provide:
1. **Key Takeaways** — The most important points
2. **Actionable Items** — Specific things Mark could do based on this
3. **Business Opportunities** — Any money-making angles
4. **Strategy Notes** — Tactics, frameworks, or approaches worth remembering
5. **Tasks to Create** — Specific follow-up tasks Jarvis should work on

Be direct, no fluff. Think like a business advisor who needs to turn information into revenue.`,
    messages: [{ role: 'user', content: prompt.substring(0, 50000) }],
  });

  return response.content[0].text;
}

// ── Full Pipeline: Extract → Analyze → Store ──

async function processContent(input, purpose, tenantId) {
  const memory = require('./memory');

  // 1. Extract
  const content = await extractContent(input);

  // 2. Analyze
  const analysis = await analyzeContent(content, purpose);

  // 3. Store key insights as memories
  if (tenantId) {
    const source = content.type + ': ' + (content.title || content.url || content.filename || 'direct input');
    await memory.storeMemory(
      tenantId,
      'training',
      'Learned from ' + source + ':\n' + analysis.substring(0, 500),
      8,
      'content_processor'
    );
  }

  return {
    content,
    analysis,
    source: content.title || content.url || content.type,
  };
}

module.exports = {
  extractContent,
  analyzeContent,
  processContent,
  getYouTubeTranscript,
  getTikTokContent,
  getWebPageContent,
  getPDFContent,
};
