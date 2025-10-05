// Supabase Edge Function: gematria-assistant
// deno-lint-ignore-file no-explicit-any
// <reference lib="deno.unstable" />
// <reference lib="dom" />
// Runtime: Deno (Supabase). Handles AI + optional Tavily search enrichment.
// Environment variables (set in Supabase Dashboard > Project Settings > Secrets):
//   OPENAI_API_KEY      (required)
//   OPENAI_MODEL        (optional; overrides MODEL_NAME)
//   MODEL_NAME          (legacy optional)
//   OPENAI_BASE_URL     (optional; custom/proxy base, e.g. https://api.openai.com/v1 )
//   TAVILY_API_KEY      (optional; enables web enrichment on demand)
// Defaults:
//   Model falls back to 'gpt-4o' instead of mini variant unless overridden.
// Deployment:
//   supabase functions deploy gematria-assistant --no-verify-jwt
// NOTE: Keys never reach the browser; only this edge function sees them.

// Local TypeScript editors without Deno plugin may show 'Cannot find name "Deno"'.
// Provide a lightweight ambient declaration to silence red squiggles in VS Code.
// (Supabase runtime supplies the real Deno global.)
// @ts-ignore
declare const Deno: any; // harmless for edge runtime, improves local DX

// Removed failing JSR type import (was: jsr:@supabase/functions@1.4.5/types) because deploy returned 400 JSR package not found.
// Supabase functions bundle without it; local IDE red squiggles are cosmetic.

interface ChatHistoryItem { role: string; content: string }
interface Payload {
  message: string;
  phrase?: string;
  cipherValues?: { cipher: string; value: number | null }[];
  history?: ChatHistoryItem[];
  meta?: Record<string, unknown>;
  image?: string | null; // base64 (no data: prefix)
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const TAVILY_API_KEY = Deno.env.get('TAVILY_API_KEY');
const OPENAI_BASE_URL = (Deno.env.get('OPENAI_BASE_URL') || 'https://api.openai.com/v1').replace(/\/$/, '');
// Model precedence: OPENAI_MODEL > MODEL_NAME > default
const MODEL = (Deno.env.get('OPENAI_MODEL') || Deno.env.get('MODEL_NAME') || 'gpt-4o').trim();

if (!OPENAI_API_KEY) {
  console.error('[assistant] Missing OPENAI_API_KEY secret (set it then redeploy).');
}

interface OpenAIMessage { role: string; content: string }

function buildOpenAIBody(messages: OpenAIMessage[]) {
  return {
    model: MODEL,
    messages,
    temperature: 0.4,
    // You can add max_tokens or response_format here if needed
  };
}

async function callOpenAI(messages: OpenAIMessage[], imageB64?: string | null) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000); // 45s safety timeout
  try {
    const resp = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildOpenAIBody(messages)),
      signal: controller.signal
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`OpenAI ${resp.status}: ${txt.slice(0,800)}`);
    }
    const json = await resp.json();
    const content = json.choices?.[0]?.message?.content || '(no reply)';
    return content.trim();
  } catch (e: any) {
    if (e.name === 'AbortError') throw new Error('OpenAI request timed out');
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

async function tavilyEnrich(query: string) {
  if (!TAVILY_API_KEY) return null;
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': TAVILY_API_KEY },
      body: JSON.stringify({ query, search_depth: 'basic', include_answer: true, max_results: 3 })
    });
    if (!r.ok) return null;
    const j = await r.json();
    const answer = j.answer || ''; // Tavily standard answer field
    const refs = (j.results || []).map((res: any) => `- ${res.title}: ${res.url}`).join('\n');
    return { answer, refs };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS });
  }
  let payload: Payload | null = null;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  const { message, phrase, cipherValues, history, image, meta } = payload || {};
  if (!message || typeof message !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing message' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  // Prepare system prompt
  let system = `You are the GematriaVerse Assistant. Provide insightful but concise analysis of gematria values.
If cipherValues are supplied, reference notable patterns, equalities, or interesting totals.
If user asks for research or current info, optionally integrate Tavily enrichment snippet if available.`;

  // Build conversation for OpenAI
  const messages: OpenAIMessage[] = [ { role: 'system', content: system } ];
  if (history && Array.isArray(history)) {
    history.slice(-8).forEach(h => {
      if (h.role === 'user' || h.role === 'assistant') {
        messages.push({ role: h.role, content: String(h.content).slice(0, 4000) });
      }
    });
  }

  let enrichmentBlock = '';
  if (phrase && cipherValues && cipherValues.length) {
    enrichmentBlock += `\nPhrase: ${phrase}\nCipher Values:\n` + cipherValues.map(c => `${c.cipher}: ${c.value}`).join('\n');
  }

  // Optional Tavily search if user explicitly asks for research
  let tavilyData = null;
  if (/search|research|latest|current|web|lookup/i.test(message) && TAVILY_API_KEY) {
    tavilyData = await tavilyEnrich(message);
    if (tavilyData) {
      enrichmentBlock += `\nTavily Summary: ${tavilyData.answer}\nReferences:\n${tavilyData.refs}`;
    }
  }

  messages.push({ role: 'user', content: `${message}${enrichmentBlock ? '\n\nContext:\n'+enrichmentBlock : ''}` });

  try {
    const reply = await callOpenAI(messages, image);
    return new Response(JSON.stringify({ reply, used: { model: MODEL, tavily: !!tavilyData, base: OPENAI_BASE_URL } }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control':'no-store', ...CORS }
    });
  } catch (e: any) {
    const errMsg = String(e && e.message ? e.message : e);
    console.error('[assistant] error', errMsg);
    return new Response(JSON.stringify({ error: errMsg }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
});
