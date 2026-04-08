// API key authentication middleware
// Protects all dashboard/sales API endpoints
// Key is checked via X-API-Key header or ?key= query param

function apiKeyAuth(req, res, next) {
  // Skip auth for HTML page serves and public endpoints
  if (req.method === 'GET' && !req.path.includes('/api/')) return next();
  // Skip auth for Twilio webhooks (handled by Twilio signature verification)
  if (req.path === '/sms' || req.path.startsWith('/voice/')) return next();
  // Skip auth for OAuth callbacks
  if (req.path.startsWith('/auth/')) return next();
  // Skip health check
  if (req.path === '/' || req.path === '/health') return next();
  // Skip Snack AI API (has its own auth TODO)
  if (req.path.startsWith('/api/snackai/')) return next();
  // Skip privacy page
  if (req.path === '/privacy') return next();

  const key = process.env.DASHBOARD_API_KEY;
  if (!key) return next(); // If no key set, don't block (backwards compatible)

  const provided = req.headers['x-api-key'] || req.query.key;
  if (provided === key) return next();

  // Also check cookie (set when dashboard loads)
  if (req.cookies?.jarvis_key === key) return next();

  res.status(401).json({ error: 'Unauthorized — API key required' });
}

module.exports = { apiKeyAuth };
