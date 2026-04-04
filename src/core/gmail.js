const { google } = require('googleapis');
const { supabase } = require('../db/supabase');

// ── Multi-Tenant Gmail ──
// Each tenant/business can have its own Gmail connected.
// Credentials stored in tenants.config.gmail = { refresh_token, email }
// Falls back to env vars for the default/owner tenant.

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
];
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || 'https://jarvis-sms-bot.onrender.com/auth/gmail/callback';

// Cache auth clients per tenant to avoid re-creating
const authCache = {};

function getAuth(refreshToken) {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET env vars required');
  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  if (refreshToken) {
    oAuth2Client.setCredentials({ refresh_token: refreshToken });
  }
  return oAuth2Client;
}

// Get auth for a specific tenant — checks tenant config first, falls back to env
async function getAuthForTenant(tenantId) {
  if (tenantId && authCache[tenantId]) return authCache[tenantId];

  let refreshToken = null;

  if (tenantId) {
    const { data: tenant } = await supabase.from('tenants').select('config').eq('id', tenantId).single();
    if (tenant?.config?.gmail?.refresh_token) {
      refreshToken = tenant.config.gmail.refresh_token;
      console.log('[GMAIL] Using tenant-specific credentials for ' + (tenant.config.gmail.email || tenantId));
    }
  }

  // Fall back to env var
  if (!refreshToken) {
    refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  }

  if (!refreshToken) throw new Error('No Gmail refresh token found for tenant ' + (tenantId || 'default'));

  const auth = getAuth(refreshToken);
  if (tenantId) authCache[tenantId] = auth;
  return auth;
}

// ── Auth Flow ──

async function getAuthUrl() {
  const auth = getAuth();
  return auth.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
}

async function setAuthCode(code, tenantId) {
  const auth = getAuth();
  const { tokens } = await auth.getToken(code);
  console.log('[GMAIL] Auth code exchanged. Refresh token: ' + (tokens.refresh_token ? 'YES' : 'NO'));

  if (tokens.refresh_token && tenantId) {
    // Get the email address for this token
    auth.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const email = profile.data.emailAddress;

    // Store in tenant config
    const { data: tenant } = await supabase.from('tenants').select('config').eq('id', tenantId).single();
    const config = tenant?.config || {};
    config.gmail = { refresh_token: tokens.refresh_token, email };
    await supabase.from('tenants').update({ config }).eq('id', tenantId);

    // Clear cache
    delete authCache[tenantId];

    console.log('[GMAIL] Saved credentials for ' + email + ' to tenant ' + tenantId);
    return { email, saved: true };
  }

  return tokens;
}

// ── Email Operations ──

async function getEmails(maxResults = 5, tenantId) {
  const auth = await getAuthForTenant(tenantId);
  const gmail = google.gmail({ version: 'v1', auth });
  const res = await gmail.users.messages.list({ userId: 'me', maxResults, q: 'is:unread' });
  const messages = res.data.messages || [];
  const emails = [];
  for (const msg of messages) {
    const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id });
    const headers = detail.data.payload.headers;
    const subject = headers.find(h => h.name === 'Subject')?.value || 'No subject';
    const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
    const date = headers.find(h => h.name === 'Date')?.value || '';
    emails.push({ id: msg.id, subject, from, date });
  }
  return emails;
}

async function sendEmail(to, subject, body, tenantId) {
  const auth = await getAuthForTenant(tenantId);
  const gmail = google.gmail({ version: 'v1', auth });
  const msg = [`To: ${to}`, `Subject: ${subject}`, '', body].join('\n');
  const encoded = Buffer.from(msg).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
}

async function getAttachments(messageId, tenantId) {
  const auth = await getAuthForTenant(tenantId);
  const gmail = google.gmail({ version: 'v1', auth });
  const detail = await gmail.users.messages.get({ userId: 'me', id: messageId });

  function findParts(payload, results) {
    if (payload.filename && payload.filename.length > 0 && payload.body?.attachmentId) {
      results.push(payload);
    }
    if (payload.parts) {
      for (const p of payload.parts) findParts(p, results);
    }
    return results;
  }

  const attachments = findParts(detail.data.payload, []);
  const files = [];

  for (const att of attachments) {
    const attData = await gmail.users.messages.attachments.get({
      userId: 'me', messageId, id: att.body.attachmentId
    });
    files.push({
      filename: att.filename,
      mimeType: att.mimeType,
      data: Buffer.from(attData.data.data, 'base64'),
    });
  }

  return files;
}

// Get which email account is connected for a tenant
async function getConnectedEmail(tenantId) {
  try {
    const auth = await getAuthForTenant(tenantId);
    const gmail = google.gmail({ version: 'v1', auth });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    return profile.data.emailAddress;
  } catch (e) {
    return null;
  }
}

module.exports = { getAuthUrl, setAuthCode, getEmails, sendEmail, getAttachments, getConnectedEmail, getAuthForTenant };
