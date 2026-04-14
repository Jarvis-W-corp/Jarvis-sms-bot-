// Unified auth for /sales and /roofing.
// Token is issued by POST /sales/api/login, stored in hc_sessions,
// and sent back via the `Authorization: Bearer <token>` header or a `hc_token` cookie.

const crypto = require('crypto');
const { supabase } = require('../db/supabase');

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await supabase.from('hc_sessions').insert({ token, user_id: userId });
  return token;
}

async function resolveUser(req) {
  let token = null;
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) token = h.slice(7);
  if (!token && req.cookies && req.cookies.hc_token) token = req.cookies.hc_token;
  if (!token && req.query && req.query.token) token = req.query.token;
  if (!token) return null;

  const { data: session } = await supabase
    .from('hc_sessions').select('user_id, expires_at').eq('token', token).single();
  if (!session) return null;
  if (session.expires_at && new Date(session.expires_at) < new Date()) return null;

  const { data: user } = await supabase
    .from('hc_users').select('*').eq('id', session.user_id).single();
  return user || null;
}

function requireAuth() {
  return async (req, res, next) => {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ success: false, error: 'Not authenticated' });
    req.hcUser = user;
    next();
  };
}

function requirePremium() {
  return async (req, res, next) => {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ success: false, error: 'Not authenticated' });
    if (!user.is_premium && user.role !== 'Admin') {
      return res.status(402).json({ success: false, error: 'Premium required', upgrade: true });
    }
    req.hcUser = user;
    next();
  };
}

function requireRole(...roles) {
  return async (req, res, next) => {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ success: false, error: 'Not authenticated' });
    if (!roles.includes(user.role)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    req.hcUser = user;
    next();
  };
}

module.exports = { createSession, resolveUser, requireAuth, requirePremium, requireRole };
