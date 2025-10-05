// Edge Function: gematria-batch
// Provides server-side batch gematria computation for a subset of ciphers.
// NOTE: This duplicates minimal cipher logic; future refactor should share a JSON/formal spec with front-end.

import 'jsr:@supabase/functions@1.4.5/types';

interface BatchRequest { phrases: string[]; ciphers?: string[]; limit?: number }

// --- Cipher Logic (subset) -------------------------------------------------
const A_CODE = 'A'.charCodeAt(0);
function alphaIndex(ch: string): number {
  const c = ch.toUpperCase();
  const code = c.charCodeAt(0);
  if (code < 65 || code > 90) return -1;
  return code - A_CODE; // 0-25
}

type Cipher = { name: string; calc: (phrase: string) => number };

const Ordinal: Cipher = {
  name: 'Ordinal',
  calc: (phrase) => {
    let sum = 0; for (const ch of phrase) { const i = alphaIndex(ch); if (i >= 0) sum += i + 1; } return sum;
  }
};

const FullReduction: Cipher = {
  name: 'Full Reduction',
  calc: (phrase) => {
    let sum = 0; for (const ch of phrase) { const i = alphaIndex(ch); if (i >= 0) sum += (i % 9) + 1; } return sum;
  }
};

const ReverseOrdinal: Cipher = {
  name: 'Reverse Ordinal',
  calc: (phrase) => {
    let sum = 0; for (const ch of phrase) { const i = alphaIndex(ch); if (i >= 0) sum += 26 - i; } return sum;
  }
};

const ReverseFullReduction: Cipher = {
  name: 'Reverse Full Reduction',
  calc: (phrase) => {
    let sum = 0; for (const ch of phrase) { const i = alphaIndex(ch); if (i >= 0) { const rev = 26 - i; sum += ((rev - 1) % 9) + 1; } } return sum;
  }
};

const ALWSimple: Cipher = {
  name: 'ALW Simple',
  calc: (phrase) => {
    let sum = 0; for (const ch of phrase) { const i = alphaIndex(ch); if (i >= 0) { let v = i + 1; if (v >= 9) v -= 1; sum += v; } } return sum;
  }
};

const ALL_CIPHERS: Cipher[] = [Ordinal, FullReduction, ReverseOrdinal, ReverseFullReduction, ALWSimple];

function selectCiphers(names?: string[]): Cipher[] {
  if (!names || names.length === 0) return ALL_CIPHERS;
  const set = new Set(names.map(n => n.toLowerCase()));
  return ALL_CIPHERS.filter(c => set.has(c.name.toLowerCase()));
}

function compute(phrase: string, ciphers: Cipher[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of ciphers) out[c.name] = c.calc(phrase);
  return out;
}

// --- Handler ----------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  let body: BatchRequest;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  if (!body.phrases || !Array.isArray(body.phrases)) {
    return new Response(JSON.stringify({ error: 'Missing phrases[]' }), { status: 400 });
  }

  const limit = body.limit && body.limit > 0 ? Math.min(body.limit, 200) : 100; // safety cap
  const phrases = body.phrases.slice(0, limit);
  const ciphers = selectCiphers(body.ciphers);

  const batch = phrases.map(p => ({ phrase: p, values: compute(p, ciphers) }));

  return new Response(JSON.stringify({ ciphers: ciphers.map(c => c.name), count: batch.length, batch }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
});
