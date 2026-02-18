require("dotenv").config();
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk").default;

const app = express();
app.use(express.urlencoded({ extended: false }));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const conversationHistory = {};

const SYSTEM_PROMPT = 'You are Jarvis, an AI business assistant. You are helpful, professional, and efficient. You respond via text message so keep responses concise. If you don\'t know something, say so honestly. Always be friendly and professional.';

app.post("/sms", async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body;
  console.log("Message from " + from + ": " + body);

  if (!conversationHistory[from]) {
    conversationHistory[from] = [];
  }
  conversationHistory[from].push({ role: "user", content: body });

  if (conversationHistory[from].length > 20) {
    conversationHistory[from] = conversationHistory[from].slice(-20);
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: conversationHistory[from],
    });

    const reply = response.content[0].text;
    conversationHistory[from].push({ role: "assistant", content: reply });
    console.log("Reply to " + from + ": " + reply);

    res.type("text/xml").send(`<Response><Message>${reply}</Message></Response>`);
  } catch (error) {
    console.error("Error:", error.message);
    res.type("text/xml").send("<Response><Message>Sorry, I'm having trouble right now. Try again in a moment.</Message></Response>");
  }
});

app.get("/", (req, res) => {
  res.send("Jarvis AI Bot is running!");
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log("Jarvis is alive on port " + PORT);
});
