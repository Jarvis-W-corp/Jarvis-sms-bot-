const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, '../../gmail-credentials.json');
const TOKEN_PATH = path.join(__dirname, '../../gmail-token.json');
const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
const REDIRECT_URI = 'http://localhost:8091';

function getAuth() {
  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const creds = raw.installed || raw.web;
  const { client_secret, client_id } = creds;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);
  if (fs.existsSync(TOKEN_PATH)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));
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
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
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
