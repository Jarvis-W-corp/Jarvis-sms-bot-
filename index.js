require('dotenv').config();
const express = require('express');
const db = require('./src/db/queries');

const path = require('path');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug: check Discord token on startup
console.log('[STARTUP] Discord token starts with:', process.env.DISCORD_BOT_TOKEN?.substring(0, 10) + '...');
console.log('[STARTUP] ElevenLabs key set:', !!process.env.ELEVENLABS_API_KEY);

// Snack AI privacy policy (live URL for App Store)
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'projects/intake/intake-app/privacy-policy.html'));
});

// ── Snack AI API (food scanning for the app) ──
app.use('/api/snackai', require('./src/api/bitelens'));

// Dashboard
const dashboard = require('./src/dashboard/routes');
app.use(dashboard);

// Sales Tracker
const sales = require('./src/sales/routes');
app.use(sales);

// ── Gmail OAuth Callback (no more localhost!) ──
app.get('/auth/gmail', async (req, res) => {
  const gmail = require('./src/core/gmail');
  const url = await gmail.getAuthUrl();
  res.redirect(url);
});

app.get('/auth/gmail/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('No code received. Try again: /auth/gmail');
  try {
    const gmail = require('./src/core/gmail');
    const db = require('./src/db/queries');
    const tenant = await db.getDefaultTenant();
    const result = await gmail.setAuthCode(code, tenant?.id);
    res.send('<h2>Gmail connected!</h2><p>Account: ' + (result.email || 'saved') + '</p><p>You can close this window.</p>');
  } catch (err) {
    res.send('<h2>Error</h2><p>' + err.message + '</p><p><a href="/auth/gmail">Try again</a></p>');
  }
});

app.get('/', async (req, res) => {
  try {
    const tenant = await db.getDefaultTenant();
    const stats = tenant ? await db.getStats(tenant.id) : null;
    res.json({
      status: 'Super Jarvis is alive',
      version: '2.0.0',
      uptime: Math.floor(process.uptime()) + 's',
      database: tenant ? 'connected' : 'no tenant found',
      ...(stats && { users: stats.users, messages: stats.messages, memories: stats.memories }),
    });
  } catch (error) {
    res.json({ status: 'Super Jarvis is alive', version: '2.0.0', database: 'error: ' + error.message });
  }
});

// Voice AI routes (Twilio Voice webhooks)
const voice = require('./src/core/voice');
voice.initVoiceRoutes(app);

const { initDiscord } = require('./src/channels/discord');
initDiscord();

const { initSMS } = require('./src/channels/sms');
initSMS(app);

setTimeout(() => {
  const { startAllJobs } = require('./src/jobs/scheduler');
  startAllJobs();
}, 10000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n🚀 Super Jarvis v2.0 is alive on port ' + PORT);
  console.log('📦 Database: Supabase PostgreSQL + pgvector');
  console.log('🧠 Memory: Vector embeddings for intelligent recall');
  console.log('🏢 Architecture: Multi-tenant ready\n');
});

process.on('SIGINT', () => {
  const { discord } = require('./src/channels/discord');
  discord.destroy();
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  console.error('[FATAL] Unhandled rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  setTimeout(() => process.exit(1), 1000);
});
