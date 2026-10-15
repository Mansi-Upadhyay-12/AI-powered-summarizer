const MODELS = [
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-20b'
];

export default async function handler(req, res) {
  // CORS support
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  const { messages, systemPrompt } = body || {};
  if (!messages || !systemPrompt) {
    return res.status(400).json({ error: 'Missing messages or systemPrompt' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY environment variable is not configured.' });
  }

  const formattedMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role,
      content: Array.isArray(m.content)
        ? m.content.find((c) => c.type === 'text')?.text || ''
        : m.content,
    })),
  ];

  let lastError = null;

  for (const model of MODELS) {
    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          messages: formattedMessages,
        }),
      });

      if (groqRes.ok) {
        const data = await groqRes.json();
        return res.status(200).json(data);
      }

      const errText = await groqRes.text();
      lastError = `Groq (${model}): ${errText}`;
      console.warn(`Model ${model} failed, trying fallback. Details:`, errText);
    } catch (err) {
      lastError = err.message || 'Network error calling Groq';
      console.warn(`Model ${model} network error, trying fallback. Details:`, lastError);
    }
  }

  return res.status(500).json({ error: lastError || 'Summarization failed' });
}