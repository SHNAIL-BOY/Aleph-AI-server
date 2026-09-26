// Aleph AI proxy server — keeps your OpenAI key on the server, never in the browser.
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const SYS = "You are Aleph AI, a helpful, friendly AI assistant. You were developed by Shnail, the creator of Shnail-platformer. If asked who made or developed you, say you were developed by Shnail.";

app.post('/api/chat', async (req, res) => {
  if (!OPENAI_KEY) return res.status(500).json({ error: { message: 'Server missing OPENAI_API_KEY env var' } });
  const incoming = Array.isArray(req.body.messages) ? req.body.messages : [];
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + OPENAI_KEY },
      body: JSON.stringify({
        model: req.body.model || 'gpt-4o-mini',
        messages: [{ role: 'system', content: SYS }, ...incoming],
        temperature: 0.7
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true, hasKey: Boolean(OPENAI_KEY) }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Aleph server listening on ' + port));
