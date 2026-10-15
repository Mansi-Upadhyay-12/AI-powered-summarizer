const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const { YoutubeTranscript } = require("youtube-transcript");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
app.use(cors());
app.use(express.json());

const MODELS = [
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-20b'
];

app.get("/api/transcript", async (req, res) => {
  const { videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: "Missing videoId" });
  try {
    const data = await YoutubeTranscript.fetchTranscript(videoId);
    res.json(data);
  } catch (err) {
    res.status(500).json({
      error: err.message || "Failed to fetch transcript. Captions may be disabled."
    });
  }
});

app.post("/api/summarize", async (req, res) => {
  const { messages, systemPrompt } = req.body || {};
  if (!messages || !systemPrompt) {
    return res.status(400).json({ error: "Missing messages or systemPrompt" });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GROQ_API_KEY environment variable is not configured." });
  }

  const formattedMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role,
      content: Array.isArray(m.content)
        ? m.content.find((c) => c.type === "text")?.text || ""
        : m.content,
    })),
  ];

  let lastError = null;

  for (const model of MODELS) {
    try {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
        },
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          messages: formattedMessages,
        }),
      });

      if (groqRes.ok) {
        const data = await groqRes.json();
        return res.json(data);
      }

      const errText = await groqRes.text();
      lastError = `Groq (${model}): ${errText}`;
      console.warn(`Model ${model} failed, trying fallback. Details:`, errText);
    } catch (err) {
      lastError = err.message || "Network error";
      console.warn(`Model ${model} network error, trying fallback. Details:`, lastError);
    }
  }

  res.status(500).json({ error: lastError || "Summarization failed" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Dev backend running on port " + PORT));
