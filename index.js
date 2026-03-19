require('dotenv').config();
const express = require('express');
const db = require('./src/db/queries');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
