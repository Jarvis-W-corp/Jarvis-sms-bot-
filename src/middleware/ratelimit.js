// Rate limiting for expensive endpoints (Claude API calls)
const rateLimit = require('express-rate-limit');

// General API: 60 requests per minute
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests, slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Claude-calling endpoints: 10 per minute (voice, chat, feed)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'AI rate limit — max 10 requests per minute' },
  standardHeaders: true,
  legacyHeaders: false,
});

// File upload: 5 per minute
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Upload rate limit — max 5 per minute' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { generalLimiter, aiLimiter, uploadLimiter };
