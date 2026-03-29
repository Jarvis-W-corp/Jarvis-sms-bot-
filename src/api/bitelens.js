const express = require('express');
const Anthropic = require('@anthropic-ai/sdk').default;
const router = express.Router();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// POST /api/bitelens/scan-food — AI photo scanning
router.post('/scan-food', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'No image provided' });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: image },
          },
          {
            type: 'text',
            text: `Analyze this food image. Identify what food is shown and estimate its nutritional content.

Respond ONLY with valid JSON in this exact format:
{
  "name": "Food Name",
  "serving_size": "estimated portion (e.g., '1 plate', '1 bowl', '2 pieces')",
  "calories": number,
  "protein": number (grams),
  "carbs": number (grams),
  "fat": number (grams),
  "confidence": number (0.0 to 1.0, how confident you are in the identification)
}

If you can identify multiple items, combine them into one total. Be as accurate as possible with portions visible in the image.`,
          },
        ],
      }],
    });

    const text = response.content[0].text;
    let rawText = text.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Could not parse food data' });

    res.json(JSON.parse(jsonMatch[0]));
  } catch (error) {
    console.error('[BITELENS] scan-food error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/bitelens/parse-food — natural language food input
router.post('/parse-food', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'No text provided' });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are a nutrition expert. Parse this natural language food description and estimate the total nutritional content.

Food description: "${text}"

Respond ONLY with valid JSON in this exact format:
{
  "name": "Brief summary of the meal (e.g., '2 Eggs, Toast & Coffee')",
  "serving_size": "estimated total portion",
  "calories": number (total kcal),
  "protein": number (total grams),
  "carbs": number (total grams),
  "fat": number (total grams),
  "confidence": number (0.0 to 1.0, how confident you are)
}

Combine all items into one total. Be accurate with standard portion sizes. If a quantity isn't specified, assume 1 standard serving.`,
      }],
    });

    const responseText = response.content[0].text;
    let rawText = responseText.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Could not parse food data' });

    res.json(JSON.parse(jsonMatch[0]));
  } catch (error) {
    console.error('[BITELENS] parse-food error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
