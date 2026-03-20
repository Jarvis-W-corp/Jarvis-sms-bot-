#!/usr/bin/env node
// Gmail OAuth helper using ngrok — run this locally to re-authorize Gmail + Sheets
// Usage: node gmail-auth-ngrok.js

require('dotenv').config();
const http = require('http');
const { google } = require('googleapis');
const { execSync, spawn } = require('child_process');

const PORT = 8091;
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/spreadsheets',
];

async function getNgrokUrl() {
  // Start ngrok in background
  console.log('[AUTH] Starting ngrok on port ' + PORT + '...');
  const ngrok = spawn('ngrok', ['http', String(PORT), '--log=stderr'], {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  ngrok.unref();

  // Wait for ngrok to start and get the public URL
  await new Promise(r => setTimeout(r, 3000));

  const res = await fetch('http://127.0.0.1:4040/api/tunnels');
  const data = await res.json();
  const tunnel = data.tunnels.find(t => t.proto === 'https');
  if (!tunnel) throw new Error('ngrok tunnel not found. Is ngrok running?');
  return { url: tunnel.public_url, pid: ngrok.pid };
}

async function main() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('ERROR: Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env');
    process.exit(1);
  }

  let ngrokUrl, ngrokPid;
  try {
    const result = await getNgrokUrl();
    ngrokUrl = result.url;
    ngrokPid = result.pid;
  } catch (err) {
    console.error('ERROR: Could not start ngrok:', err.message);
    console.error('Make sure ngrok is installed and authenticated.');
    process.exit(1);
  }

  const redirectUri = ngrokUrl;
  console.log('\n[AUTH] ngrok URL: ' + ngrokUrl);
  console.log('\n============================================');
  console.log('IMPORTANT: Add this URL to Google Cloud Console');
  console.log('as an Authorized Redirect URI:');
  console.log('\n  ' + ngrokUrl);
  console.log('\nGo to: https://console.cloud.google.com/apis/credentials');
  console.log('Edit your OAuth 2.0 Client > Add the URL above');
  console.log('============================================\n');

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force new refresh token
  });

  console.log('[AUTH] Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\n[AUTH] Waiting for callback...\n');

  // Start local server to catch the callback
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Auth Failed</h1><p>Error: ' + error + '</p>');
      console.error('[AUTH] Error: ' + error);
      cleanup();
      return;
    }

    if (!code) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Waiting for auth...</h1>');
      return;
    }

    try {
      const { tokens } = await oAuth2Client.getToken(code);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Jarvis Gmail + Sheets Authorized!</h1><p>You can close this tab.</p>');

      console.log('\n============================================');
      console.log('SUCCESS! Add this to your .env and Render:');
      console.log('\nGMAIL_REFRESH_TOKEN=' + tokens.refresh_token);
      console.log('============================================\n');
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Token Exchange Failed</h1><p>' + err.message + '</p>');
      console.error('[AUTH] Token exchange failed:', err.message);
    }

    cleanup();
  });

  function cleanup() {
    setTimeout(() => {
      server.close();
      try { process.kill(ngrokPid); } catch (e) {}
      process.exit(0);
    }, 2000);
  }

  server.listen(PORT, () => {
    console.log('[AUTH] Callback server listening on port ' + PORT);
  });
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
