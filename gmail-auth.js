/**
 * One-time OAuth helper: run this to get gmail-token.json
 *   node gmail-auth.js
 */
const { google } = require('googleapis');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CREDENTIALS_PATH = path.join(__dirname, 'gmail-credentials.json');
const TOKEN_PATH = path.join(__dirname, 'gmail-token.json');
const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
const PORT = 8091;
const REDIRECT_URI = `http://localhost:${PORT}`;

const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
const creds = raw.installed || raw.web;
const { client_secret, client_id } = creds;

// Use our own redirect URI with a real port – must match what we pass to generateAuthUrl
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

console.log('\n--- Gmail OAuth Setup ---');
console.log(`Listening on ${REDIRECT_URI} for the callback...\n`);
console.log('Opening browser to authorize. If it does not open, visit this URL:\n');
console.log(authUrl + '\n');

// Open the URL in the default browser (macOS)
try {
  execSync(`open "${authUrl}"`);
} catch {
  console.log('(Could not auto-open browser — please open the URL above manually.)');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`<h2>Authorization failed</h2><p>${error}</p>`);
    console.error('Authorization error:', error);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<p>Waiting for authorization code...</p>');
    return;
  }

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    console.log('Token saved to', TOKEN_PATH);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2>Success!</h2><p>Gmail authorized. You can close this tab.</p>');
  } catch (err) {
    console.error('Token exchange failed:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`<h2>Token exchange failed</h2><pre>${err.message}</pre>`);
  }

  server.close();
  process.exit(0);
});

server.listen(PORT);
