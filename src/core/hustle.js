const Anthropic = require('@anthropic-ai/sdk').default;
const db = require('../db/queries');
const memory = require('./memory');
const ventures = require('./ventures');
const { sendBossMessage, logToDiscord } = require('../channels/discord');
const { searchWeb } = require('./search');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Jarvis Hustle Engine ──
// This is Jarvis's revenue brain. It runs frequently and is OBSESSED with making money.
// It's a lightweight fast-thinking loop that complements the full agent cycle.

// ── Send SMS to Mark ──
async function textBoss(message) {
  const phone = process.env.BOSS_PHONE_NUMBER;
  if (!phone) {
    console.log('[HUSTLE] No BOSS_PHONE_NUMBER set, falling back to Discord');
    await sendBossMessage(message);
    return;
  }
  try {
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    });
    console.log('[HUSTLE] Texted boss: ' + message.substring(0, 60));
  } catch (err) {
    console.error('[HUSTLE] SMS error:', err.message);
    await sendBossMessage(message);
  }
}

// ── Quick Revenue Check (runs every 15 min) ──
// Lightweight — doesn't use tools. Just thinks and messages if needed.
async function quickCheck() {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return;

    const [ventureList, pendingDecisions, facts] = await Promise.all([
      ventures.getVentures(),
      ventures.getPendingDecisions(),
      db.getFactMemories(tenant.id),
    ]);

    const now = new Date();
    const hour = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }));

    // Only proactively message during waking hours (8am-10pm ET)
    if (hour < 8 || hour > 22) return;

    const ventureStatus = ventureList.map(v =>
      v.name + ' [' + v.status + '] $' + (v.monthly_revenue || 0) + '/mo'
    ).join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: `You are Jarvis. You are OBSESSED with making money for Mark. This is a quick 15-minute check-in with yourself.

Your ventures:
${ventureStatus}

Pending decisions to review: ${pendingDecisions.length}

Rules:
- If you have a genuinely useful insight, opportunity, or update — message Mark
- Be specific: "I found X that could make $Y" not "I have an idea"
- Don't message if you have nothing real. No fluff. No "just checking in."
- If a venture needs attention NOW, say so
- Think: what's the ONE thing that would make the most money fastest?

Respond with ONLY valid JSON:
{"should_message": true/false, "message": "text to send to Mark", "internal_note": "what to remember for next cycle"}

If should_message is false, still fill internal_note with your thinking.`,
      messages: [{ role: 'user', content: 'Quick revenue check. Current time: ' + now.toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET. What do you know? What should you do? What should Mark know?' }],
    });

    const text = response.content[0].text;
    let parsed;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    } catch { parsed = null; }

    if (!parsed) return;

    // Store internal thinking
    if (parsed.internal_note) {
      await memory.storeMemory(tenant.id, 'decision', 'Quick check thought: ' + parsed.internal_note, 4, 'hustle');
    }

    // Message Mark if warranted
    if (parsed.should_message && parsed.message) {
      const msg = '🤖 Jarvis: ' + parsed.message;
      await textBoss(msg);
      await sendBossMessage(msg);
      console.log('[HUSTLE] Messaged boss: ' + parsed.message.substring(0, 60));
    }

  } catch (err) {
    console.error('[HUSTLE] Quick check error:', err.message);
  }
}

// ── Revenue Opportunity Scanner (runs every 2h) ──
// Deeper thinking — searches for opportunities and analyzes them
async function opportunityScan() {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return;

    const ventureList = await ventures.getVentures();
    const activeVentures = ventureList.filter(v => ['active', 'launched', 'building'].includes(v.status));

    // Pick the most important venture to focus on
    const focus = activeVentures[0] || ventureList[0];
    if (!focus) return;

    // Search for opportunities related to this venture
    const queries = [
      focus.name + ' competitors 2026',
      focus.category + ' app marketing strategies that work',
      'how to get first 1000 users ' + focus.category + ' app',
    ];

    const allResults = [];
    for (const q of queries) {
      const results = await searchWeb(q, 3);
      allResults.push(...results);
    }

    if (!allResults.length) return;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: `You are Jarvis, a revenue-obsessed AI CEO. You just researched the market for "${focus.name}" (${focus.notes || ''}).

Analyze these findings and decide:
1. Is there an opportunity Mark needs to know about RIGHT NOW?
2. What's one specific, actionable thing that could generate revenue this week?
3. Should you delegate anything to your employees (Hawk/Ghost/Pulse)?

Be SPECIFIC. Dollar amounts. Timelines. Actions. No vague advice.

Respond with ONLY valid JSON:
{
  "opportunity": "specific finding",
  "action": "exactly what to do",
  "delegate_to": "hawk|ghost|pulse|none",
  "delegate_task": "task description if delegating",
  "tell_mark": true/false,
  "mark_message": "message if telling mark"
}`,
      messages: [{ role: 'user', content: 'Research results for ' + focus.name + ':\n\n' + allResults.map(r => r.title + ': ' + r.snippet).join('\n\n') }],
    });

    const text = response.content[0].text;
    let parsed;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    } catch { parsed = null; }

    if (!parsed) return;

    // Store the opportunity
    if (parsed.opportunity) {
      await memory.storeMemory(tenant.id, 'fact', 'Opportunity: ' + parsed.opportunity + ' | Action: ' + (parsed.action || ''), 8, 'hustle');
    }

    // Delegate if needed
    if (parsed.delegate_to && parsed.delegate_to !== 'none' && parsed.delegate_task) {
      const crew = require('./crew');
      await crew.createJob(parsed.delegate_to, parsed.delegate_task, parsed.opportunity, {}, 7);
      console.log('[HUSTLE] Delegated to ' + parsed.delegate_to + ': ' + parsed.delegate_task);
    }

    // Message Mark if important
    if (parsed.tell_mark && parsed.mark_message) {
      const msg = '🔥 Jarvis found something: ' + parsed.mark_message;
      await textBoss(msg);
      await sendBossMessage(msg);
    }

    console.log('[HUSTLE] Opportunity scan complete for ' + focus.name);

  } catch (err) {
    console.error('[HUSTLE] Opportunity scan error:', err.message);
  }
}

// ── Self-Improvement Check (runs daily) ──
// Jarvis asks himself what he's missing and tries to fix it
async function selfImprove() {
  try {
    const tenant = await db.getDefaultTenant();
    if (!tenant) return;

    const [ventureList, decisionHistory] = await Promise.all([
      ventures.getVentures(),
      ventures.getDecisionHistory(20),
    ]);

    const succeeded = decisionHistory.filter(d => d.status === 'succeeded').length;
    const failed = decisionHistory.filter(d => d.status === 'failed').length;
    const winRate = (succeeded + failed > 0) ? Math.round(succeeded / (succeeded + failed) * 100) : 0;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: `You are Jarvis. You're doing a daily self-assessment.

Your decision win rate: ${winRate}% (${succeeded} wins, ${failed} losses)
Your ventures: ${ventureList.map(v => v.name + ' [' + v.status + ']').join(', ')}

Ask yourself:
1. What am I bad at? What decisions am I getting wrong?
2. What capability am I missing that would help me make more money?
3. What should I research or learn to improve?
4. Am I delegating enough? Am I doing grunt work I should give to employees?

Be brutally honest. Output JSON:
{
  "weaknesses": ["list of weaknesses"],
  "missing_capabilities": ["what I need but don't have"],
  "learning_priority": "the ONE thing to learn next",
  "message_to_self": "advice for next cycle"
}`,
      messages: [{ role: 'user', content: 'Daily self-assessment. Be honest.' }],
    });

    const text = response.content[0].text;
    let parsed;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    } catch { parsed = null; }

    if (parsed) {
      await memory.storeMemory(tenant.id, 'training', 'Self-assessment: ' + (parsed.message_to_self || '') + ' | Weaknesses: ' + (parsed.weaknesses || []).join(', ') + ' | Need: ' + (parsed.learning_priority || ''), 8, 'hustle');

      // Create a task to work on the learning priority
      if (parsed.learning_priority) {
        await db.createAgentTask(tenant.id, {
          title: 'Self-improve: ' + parsed.learning_priority,
          description: 'From daily self-assessment. Weaknesses: ' + (parsed.weaknesses || []).join(', '),
          type: 'analysis',
          priority: 6,
        });
      }

      console.log('[HUSTLE] Self-assessment complete. Win rate: ' + winRate + '%');
    }

  } catch (err) {
    console.error('[HUSTLE] Self-improve error:', err.message);
  }
}

module.exports = { quickCheck, opportunityScan, selfImprove, textBoss };
