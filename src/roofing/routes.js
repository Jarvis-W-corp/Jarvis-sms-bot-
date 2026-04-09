const express = require('express');
const path = require('path');
const db = require('../db/queries');
const { aiLimiter } = require('../middleware/ratelimit');

const router = express.Router();

// Serve roofing CRM HTML
router.get('/roofing', (req, res) => {
  const key = process.env.DASHBOARD_API_KEY;
  if (key && req.query.key !== key) {
    return res.status(401).send('<html><body style="background:#1a3a6b;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;"><div style="text-align:center"><h1>Premium Roofing CRM</h1><p>Access denied. Add ?key=YOUR_KEY to the URL.</p></div></body></html>');
  }
  if (key) res.cookie('jarvis_key', key, { httpOnly: true, sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Health
router.get('/roofing/api/health', (req, res) => {
  res.json({ status: 'ok', crm: 'Premium Roofing', jarvis: 'connected' });
});

// AI Chat — Jarvis with roofing context
router.post('/roofing/api/chat', aiLimiter, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'No text' });
    const tenant = await db.getDefaultTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant' });
    const brain = require('../core/brain');
    const reply = await brain.chat(tenant.id, 'roofing_crm', 'roofing', text, 'Boss');
    res.json({ reply });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// AI SMS — generate and return SMS text for a contact
router.post('/roofing/api/sms', aiLimiter, async (req, res) => {
  try {
    const { contact, context } = req.body;
    const Anthropic = require('@anthropic-ai/sdk').default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: 'You are a roofing sales assistant. Write a short, friendly SMS follow-up message (under 160 chars). Be direct, professional, mention their roof project. No emojis.',
      messages: [{ role: 'user', content: 'Write an SMS to ' + (contact || 'the customer') + '. Context: ' + (context || 'follow up on their roofing estimate') }],
    });
    const message = response.content[0].text;
    res.json({ message, contact });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// AI Call Script
router.post('/roofing/api/call-script', aiLimiter, async (req, res) => {
  try {
    const { contact, jobType } = req.body;
    const Anthropic = require('@anthropic-ai/sdk').default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: 'You are a roofing sales coach. Write a natural phone call script for following up with a homeowner. Include: greeting, reason for call, questions to ask, how to handle objections, close with booking an inspection. Keep it conversational, not robotic.',
      messages: [{ role: 'user', content: 'Call script for ' + (contact || 'homeowner') + '. Job type: ' + (jobType || 'roof inspection/estimate follow-up') }],
    });
    res.json({ script: response.content[0].text, contact });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// AI Estimate Generator
router.post('/roofing/api/estimate', aiLimiter, async (req, res) => {
  try {
    const { contact, jobType, address, details, amount } = req.body;
    const Anthropic = require('@anthropic-ai/sdk').default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: 'You are a professional roofing estimator for Premium Roofing, a high-end roofing company in Connecticut. Generate a detailed, professional estimate document. Include: company header, date, customer info, scope of work, materials list, labor breakdown, timeline, warranty info, terms, total. Format in clean markdown.',
      messages: [{ role: 'user', content: 'Generate estimate for:\nCustomer: ' + (contact || 'Homeowner') + '\nAddress: ' + (address || 'CT') + '\nJob: ' + (jobType || 'Roof replacement') + '\nDetails: ' + (details || 'Standard asphalt shingle reroof') + '\nEstimated amount: ' + (amount || 'TBD') }],
    });
    res.json({ estimate: response.content[0].text, contact });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
