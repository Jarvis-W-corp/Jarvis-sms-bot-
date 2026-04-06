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

// ── Video Processing with Whisper Transcription ──

async function processVideoAttachment(videoUrl, context, tenantId, filename) {
  const fs = require('fs');
  const { execSync } = require('child_process');
  const OpenAI = require('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let transcript = '';
  const ts = Date.now();
  const tmpVideo = '/tmp/jarvis_vid_' + ts + '.mp4';
  const tmpAudio = '/tmp/jarvis_vid_' + ts + '.mp3';

  try {
    // 1. Download or copy video
    console.log('[CONTENT] Loading video: ' + (filename || videoUrl.substring(0, 60)));
    if (videoUrl.startsWith('file://')) {
      const localPath = videoUrl.replace('file://', '');
      fs.copyFileSync(localPath, tmpVideo);
    } else {
      const res = await fetch(videoUrl);
      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(tmpVideo, buffer);
    }
    console.log('[CONTENT] Video size: ' + Math.round(fs.statSync(tmpVideo).size / 1024) + 'KB');

    // 2. Extract audio with ffmpeg
    try {
      execSync('ffmpeg -y -i "' + tmpVideo + '" -vn -acodec libmp3lame -q:a 4 -ac 1 -ar 16000 "' + tmpAudio + '" 2>/dev/null', { timeout: 120000 });
    } catch (e) {
      console.error('[CONTENT] ffmpeg extract failed:', e.message);
    }

    // 3. Transcribe with Whisper
    if (fs.existsSync(tmpAudio) && fs.statSync(tmpAudio).size > 0) {
      const audioSize = fs.statSync(tmpAudio).size;
      console.log('[CONTENT] Sending to Whisper (' + Math.round(audioSize / 1024) + 'KB)...');
      if (audioSize < 25 * 1024 * 1024) {
        transcript = await openai.audio.transcriptions.create({
          file: fs.createReadStream(tmpAudio),
          model: 'whisper-1',
          response_format: 'text',
        });
        console.log('[CONTENT] Transcript length: ' + transcript.length + ' chars');
      } else {
        transcript = '[Audio over 25MB — too large for Whisper in one shot]';
      }
    }
  } catch (err) {
    console.error('[CONTENT] Video processing error:', err.message);
  } finally {
    try { require('fs').unlinkSync(tmpVideo); } catch(e) {}
    try { require('fs').unlinkSync(tmpAudio); } catch(e) {}
  }

  // 4. Analyze with Claude
  const hasTranscript = transcript && transcript.length > 20;
  const analysisInput = hasTranscript
    ? 'Video: "' + (filename || 'video') + '"\n\nTranscript:\n' + transcript + (context ? '\n\nUser notes: ' + context : '')
    : 'Video: "' + (filename || 'video') + '"\nUser notes: ' + (context || 'none') + '\n\n(Transcript unavailable)';

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: 'You are Jarvis, an AI CEO. Analyze this video content. Extract: 1) Key takeaways 2) Strategies/tactics mentioned 3) Action items for the team 4) How it applies to our ventures (solar, med spa, Snack AI, AI workforce) 5) Revenue opportunities. Pull exact quotes from the transcript. Be specific and tactical.',
    messages: [{ role: 'user', content: analysisInput }],
  });

  const analysis = response.content[0].text;

  // 5. Store to memory
  if (tenantId) {
    const mem = require('./memory');
    const memText = hasTranscript
      ? 'Video "' + (filename || 'video') + '" key points: ' + transcript.substring(0, 500)
      : 'Video "' + (filename || 'video') + '" context: ' + (context || '').substring(0, 300);
    await mem.storeMemory(tenantId, 'training', memText, 8, 'whisper');
  }

  return {
    content: { transcript: transcript || null, filename, context },
    analysis,
    source: filename || 'video upload',
  };
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
  processVideoAttachment,
  getYouTubeTranscript,
  getTikTokContent,
  getWebPageContent,
  getPDFContent,
};
