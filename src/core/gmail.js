const { google } = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/spreadsheets',
];
const REDIRECT_URI = 'http://localhost:8091';

function getAuth() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET env vars required');
  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  if (process.env.GMAIL_REFRESH_TOKEN) {
    oAuth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  }
  return oAuth2Client;
}

async function getAuthUrl() {
  const auth = getAuth();
  return auth.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
}

async function setAuthCode(code) {
  const auth = getAuth();
  const { tokens } = await auth.getToken(code);
  console.log('[GMAIL] Set GMAIL_TOKEN env var to:', JSON.stringify(tokens));
}

async function getEmails(maxResults = 5) {
  const auth = getAuth();
  const gmail = google.gmail({ version: 'v1', auth });
  const res = await gmail.users.messages.list({ userId: 'me', maxResults, q: 'is:unread' });
  const messages = res.data.messages || [];
  const emails = [];
  for (const msg of messages) {
    const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id });
    const headers = detail.data.payload.headers;
    const subject = headers.find(h => h.name === 'Subject')?.value || 'No subject';
    const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
    emails.push({ subject, from });
  }
  return emails;
}

async function sendEmail(to, subject, body) {
  const auth = getAuth();
  const gmail = google.gmail({ version: 'v1', auth });
  const msg = [`To: ${to}`, `Subject: ${subject}`, '', body].join('\n');
  const encoded = Buffer.from(msg).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
}

module.exports = { getAuthUrl, setAuthCode, getEmails, sendEmail };
