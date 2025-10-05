// Supabase Edge Function: gematria-assistant
// deno-lint-ignore-file no-explicit-any
// <reference lib="deno.unstable" />
// <reference lib="dom" />
// Runtime: deno (Supabase). Handles AI + optional Tavily search enrichment.
// Environment variables expected (configure in Supabase dashboard Secrets):
//   OPENAI_API_KEY   - OpenAI key
//   TAVILY_API_KEY   - (optional) Tavily key for web enrichment
//   MODEL_NAME       - (optional) override model (default: gpt-4o-mini)
// NOTE: This function never exposes keys to the client.
// Deployed via: supabase functions deploy gematria-assistant --no-verify-jwt (or keep JWT if you want auth)

import 'jsr:@supabase/functions@1.4.5/types';

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
const MODEL_NAME = Deno.env.get('MODEL_NAME') ?? 'gpt-4o-mini';

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY secret');
}

async function callOpenAI(messages: { role: string; content: string }[], imageB64?: string | null) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages,
      temperature: 0.4
    })
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${txt}`);
  }
  const json = await resp.json();
  const content = json.choices?.[0]?.message?.content || '(no reply)';
  return content.trim();
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
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  let payload: Payload | null = null;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const { message, phrase, cipherValues, history, image } = payload || {};
  if (!message || typeof message !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing message' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // Prepare system prompt
  let system = `You are the GematriaVerse Assistant. Provide insightful but concise analysis of gematria values.
If cipherValues are supplied, reference notable patterns, equalities, or interesting totals.
If user asks for research or current info, optionally integrate Tavily enrichment snippet if available.`;

  // Build conversation for OpenAI
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: system }
  ];
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
    return new Response(JSON.stringify({ reply, used: { model: MODEL_NAME, tavily: !!tavilyData } }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control':'no-store' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e && e.message ? e.message : e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
