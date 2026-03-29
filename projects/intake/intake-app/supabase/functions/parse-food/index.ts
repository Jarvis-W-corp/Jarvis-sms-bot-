import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { text } = await req.json();

    if (!text) {
      return new Response(JSON.stringify({ error: 'No text provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
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
          },
        ],
      }),
    });

    const data = await response.json();
    const responseText = data.content?.[0]?.text || '';

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'Could not parse food data' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const foodData = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify(foodData), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
