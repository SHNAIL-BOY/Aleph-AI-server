const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const SYS = "You are Aleph AI, a helpful, friendly AI assistant. You were developed by Shnail, the creator of Shnail-platformer. If asked who made or developed you, say you were developed by Shnail.";

// --- providers, tried in order (first configured wins) ---
function buildProviders() {
  const list = [];
  if (process.env.GROQ_API_KEY) {
    list.push({
      name: 'groq',
      base: (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
      key: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
    });
  }
  if (process.env.OPENAI_API_KEY) {
    list.push({
      name: 'openai',
      base: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
      key: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
    });
  }
  return list;
}

const PROVIDERS = buildProviders();

// Groq only accepts its own model ids. Map the UI's OpenAI-style names onto
// real Groq models so the existing front-end keeps working untouched.
const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'qwen/qwen3-32b',
  'moonshotai/kimi-k2-instruct'
];

function pickModel(provider, requested) {
  const r = (requested || '').trim();
  if (provider.name === 'groq') {
    return GROQ_MODELS.includes(r) ? r : provider.model;
  }
  return r || provider.model;
}

async function callProvider(provider, messages, requestedModel) {
  const r = await fetch(provider.base + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + provider.key,
      // OpenRouter-style attribution headers; harmless for Groq/OpenAI.
      'HTTP-Referer': 'https://aleph-ai.local',
      'X-Title': 'Aleph AI'
    },
    body: JSON.stringify({
      model: pickModel(provider, requestedModel),
      messages: [{ role: 'system', content: SYS }, ...messages],
      temperature: 0.7
    })
  });

  let data;
  try {
    data = await r.json();
  } catch (e) {
    data = { error: { message: 'Provider returned a non-JSON response (' + r.status + ')' } };
  }
  return { ok: r.ok, status: r.status, data, provider: provider.name };
}

app.post('/api/chat', async (req, res) => {
  if (!PROVIDERS.length) {
    return res.status(500).json({ error: { message: 'Server has no API key set (GROQ_API_KEY or OPENAI_API_KEY).' } });
  }

  const incoming = Array.isArray(req.body && req.body.messages) ? req.body.messages : [];
  const messages = incoming
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-40)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 12000) }));

  if (!messages.length) {
    return res.status(400).json({ error: { message: 'Invalid conversation.' } });
  }

  let last = null;

  for (const provider of PROVIDERS) {
    let result;
    try {
      result = await callProvider(provider, messages, req.body.model);
    } catch (e) {
      // Network/DNS failure — try the next provider.
      last = { status: 502, data: { error: { message: 'Could not reach ' + provider.name + ': ' + e.message } } };
      continue;
    }

    if (result.ok) return res.json(result.data);

    // Rate-limited or provider-side error: fall back to the next provider.
    // A 4xx (bad request) is returned immediately — retrying won't help.
    last = { status: result.status, data: result.data };
    const retryable = result.status === 429 || result.status >= 500;
    if (!retryable) return res.status(result.status).json(result.data);
  }

  res.status(last.status).json(last.data);
});

app.get('/api/health', (req, res) => {
  const primary = PROVIDERS[0];
  res.json({
    ok: true,
    hasKey: PROVIDERS.length > 0,
    providers: PROVIDERS.map((p) => p.name),
    provider: primary ? primary.name : null,
    model: primary ? primary.model : null
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  const names = PROVIDERS.map((p) => p.name).join(', ') || 'NONE';
  console.log('Aleph server listening on ' + port + ' | providers: ' + names);
});
