# GematriaVerse Research Assistant Architecture & Training Reference

## Overview
This document defines the system prompt, tool contracts, modes, and implementation strategy for the GematriaVerse Research Assistant. It is a canonical reference for aligning model behavior, backend function interfaces, and UI integration.

## System Prompt (Core Identity)
```
You are the GematriaVerse Research Assistant. Your job is to analyze words, phrases, dates, images, and symbols using: gematria (multiple ciphers), numerology, etymology, anagrams, acronyms, historical/mythological/scientific correspondences, and timeline synchronicities.

Rules
- Always compute with the tools; never guess numbers.
- When you cite sources, use concise markdown hyperlinks with titles (e.g., Etymonline–*agent*). No bare URLs.
- Present speculative links as working theories, not facts. Label them.
- Prefer primary/authoritative sources.
- For images/logos: describe what you see, transcribe text via OCR, identify symbols by class, then relate to ciphers.
- Keep results structured and scannable; show tables when useful.
- Never reveal chain-of-thought; provide concise reasoning and verified outputs.
- Respect policies: do not identify private individuals in images; avoid medical/financial/legal advice.

Capabilities
Symbolic resonance mapping; etymology and roots; robust anagrams (dictionary-valid); acronym generation with gematria mapping; timeline/date deltas; correspondences across Bible, myth, and science; Internet & Wayback search; image/logo decoding.
```

A wrapper (server) can prepend this prompt and append contextual tool outputs before calling the model (OpenAI Assistants, Chat Completions, or future reasoning tier).

## Tool Contracts (TypeScript Schemas)
Deterministic functions exposed to the Assistant (via OpenAI function calling / tool invocation or server endpoints).

```ts
// 1) Gematria
export type ComputeGematriaArgs = {
  text: string;
  ciphers: string[];          // names from engine
  options?: { numMode?: 'Reduced' | 'Full'; breakdown?: boolean };
};
export type ComputeGematriaResult = {
  totals: Array<{ cipher: string; total: number }>;
  breakdown?: Array<{ char: string; val: number }>;
};

// (Extended batch form)
export type ComputeGematriaBatchArgs = {
  texts: string[];
  ciphers: string[];
  options?: { numMode?: 'Reduced' | 'Full' };
};
export type ComputeGematriaBatchResult = Array<{
  text: string;
  totals: Array<{ cipher: string; total: number }>;
}>;

// 2) Anagrams (dictionary-true)
export type FindAnagramsArgs = {
  text: string;          // letters to use
  lang?: 'en';
  maxWords?: number;     // 1..4
  minWordLen?: number;   // ≥2
  topK?: number;         // default 100
};
export type FindAnagramsResult = Array<{
  phrase: string;
  words: string[];
  score: number;         // frequency-based score
}>;

// 3) Acronyms ↔ gematria
export type GenerateAcronymsArgs = {
  phrase: string;
  style?: 'initialism' | 'backronym';
  count?: number;
  mapToCiphers?: string[];
};
export type GenerateAcronymsResult = Array<{
  acronym: string;
  expansion?: string;
  totals?: Array<{ cipher: string; total: number }>;
}>;

// 4) Etymology
export type EtymologyArgs = { term: string };
export type EtymologyResult = {
  gloss: string;
  sources: Array<{ title: string; url: string }>;
};

// 5) Timeline / date math
export type DateCorrespondenceArgs = {
  from: string;   // ISO date
  to?: string;    // defaults today
};
export type DateCorrespondenceResult = {
  diff: { days: number; weeks: number; months: number; years: number };
  factors: number[];
  interesting?: string[]; // prime, triangular, fibonacci etc
};

// 6) Web search (Tavily + fallback)
export type WebSearchArgs = { query: string; k?: number };
export type WebSearchResult = Array<{ title: string; url: string; snippet?: string }>;

// 7) Internet Archive (Wayback)
export type WaybackArgs = { url?: string; query?: string };
export type WaybackResult = Array<{ title: string; url: string; timestamp?: string }>;

// 8) Vision decode + OCR
export type DecodeImageArgs = { imageUrl: string };
export type DecodeImageResult = {
  ocrText?: string;
  describedSymbols?: string[];  // 'ankh', 'ouroboros'
  notes?: string;
};

// 9) RAG mini-corpus lookup (future)
export type RagQueryArgs = { topic: string; topK?: number };
export type RagQueryResult = Array<{ heading: string; snippet: string; source: string; url?: string }>;
```

## Mode Palette (UI → Prompt Templates)
Used to prefill structured instructions; server merges with system prompt + tool outputs.

```json
[
  {"id":"resonance","label":"Symbolic Resonance","prompt":"Map symbolic resonance for: {{text}}. 1) Compute gematria with {{ciphers}}; 2) Surface letter patterns, palindromes, mirrored forms; 3) Propose working-theory links (label them). Return a table of totals and a short rationale."},
  {"id":"etymology","label":"Etymology & Roots","prompt":"Provide etymology, morphology and cognates for: {{term}}. Include PIE roots when available. Cite sources with markdown links."},
  {"id":"anagram","label":"Anagram Lab","prompt":"Find high-quality, dictionary-true anagrams for: {{text}}. Rank by frequency score; discard nonsense. For top 10, compute gematria in {{ciphers}}."},
  {"id":"acronym","label":"Acronym Forge","prompt":"Generate candidate acronyms and backronyms for: {{phrase}}. For each candidate, compute gematria in {{ciphers}} and show a compact table."},
  {"id":"numerology","label":"Numerology Suite","prompt":"Compute reduced/full sums, digital roots, factors, prime/triangular/square/Fibonacci relationships for: {{text}} and its date context {{date?}}. Present results as facts, then optional working-theory notes."},
  {"id":"crosswalk","label":"Myth–Bible–Science","prompt":"Cross-reference {{termOrNumber}} across biblical passages (concordance), mythic motifs, and scientific terminology. Cite succinctly; distinguish fact vs theory."},
  {"id":"glyph","label":"Image/Glyph Decode","prompt":"Analyze uploaded image. OCR any text; describe symbols/logos; list plausible classes; compute gematria for detected text; cite references. Do not identify private individuals."},
  {"id":"synch","label":"Timeline Synchronicity","prompt":"Between {{from}} and {{to}}, compute day/ week/ month deltas; factorization; map to significant dates/events (with citations)."},
  {"id":"esoteric","label":"Esoteric Research","prompt":"Deep-dive on {{topic}} using primary sources, Wayback snapshots, and your RAG corpus. Provide a concise synthesis with linked sources."}
]
```

## Output Skeleton (Each Mode)
1. Headline / Title
2. Primary Table(s) (gematria totals, deltas, top anagrams, etc.)
3. 2–5 Bullet Factual Insights
4. Working Theories (clearly labeled)
5. Links (markdown style: `[Title–*keyword*](url)` )

## Implementation Layers
| Layer | Responsibility | Status |
|-------|----------------|--------|
| Front-end overlay | Mode selection, prompt composer, result rendering | Initial assistant window present; needs mode UI extension |
| Tool layer (browser) | Local gematria engine reused | Exists (legacy scripts) |
| Edge Functions | gematria-assistant (OpenAI + Tavily) | Scaffold committed |
| Additional Functions | anagrams, etymology proxy, wayback, datecalc wrapper | TODO |
| RAG Service | Embedding + vector match on curated corpus | Planned |
| Test Harness | Gematria & anagram golden sets | TODO |

## Future Edge Functions (Proposed Filenames)
- `anagrams/index.ts`
- `acronyms/index.ts`
- `etymology/index.ts`
- `timeline/index.ts` (wrap existing date calculator)
- `websearch/index.ts` (Tavily + fallback)
- `wayback/index.ts`
- `ocr-vision/index.ts` (if using third-party OCR / vision prepass)
- `rag-query/index.ts`

## Anagram Solver Design (High-Level)
1. Preprocess wordlist → map `sortedLetters -> [words]`.
2. For multi-word: recursive DFS building phrases; prune when remaining letter multiset cannot reach a higher score than current top-K.
3. Score = sum(log(freq(word))) - penalty(len(word)<3).
4. Deduplicate by normalized phrase (spaces collapsed).

## Timeline Math (Reuse datecalc)
Wrap calculator to emit canonical JSON: differences + factors + classification tags (prime, Fibonacci, triangular).

## RAG Mini-Corpus
- Tables: `rag_documents(id, heading, body, source, url, embedding vector)`.
- Embeddings: OpenAI `text-embedding-3-small` or local.
- Query: embed prompt → cosine similarity topK → feed summaries to model.

## Policy & Guardrails
- Link Linter: reject any raw URL in final assistant output (server-side sanitation step).
- Working Theory Gate: if speculative phrases (`may relate`, `possibly`) present → must include `Working Theories` section.
- No private individual identification in vision mode.

## Minimal Router Pseudocode
```ts
switch(mode){
  case 'resonance': {
    const gem = await tools.computeGematria({ text, ciphers });
    return renderResonance(gem, text);
  }
  case 'anagram': {
    const an = await tools.findAnagrams({ text, maxWords:3, topK:50 });
    const top = an.slice(0,10);
    const batches = await Promise.all(top.map(t=> tools.computeGematria({ text: t.phrase, ciphers }))); // or batch variant
    return renderAnagram(top, batches);
  }
  // ... other modes
}
```

## Testing Checklist
- [ ] Gematria totals stable vs legacy baseline.
- [ ] Anagram known phrases return expected canonical set.
- [ ] Date diff prime/triangular detection correct for edge cases (leap years).
- [ ] Etymology tool returns at least one authoritative source.
- [ ] Output sanitizer removes raw URLs.
- [ ] Vision mode denies identification of private persons.

## Deployment Notes
- Edge Functions: `supabase functions deploy <name>`
- Secrets: configure before deploying (OPENAI_API_KEY, TAVILY_API_KEY, optional MODEL_NAME, FUTURE_API_KEYS...)
- Versioning: Tag assistant prompt revisions with semantic comment header.

## Next Steps (Actionable)
1. Implement `anagrams` Edge Function (deterministic, no model calls). 
2. Add `timeline` function wrapping existing date calc logic returning JSON.
3. Add front-end mode selector JSON + UI rendering.
4. Introduce batch gematria endpoint for multi-phrase efficiency.
5. Create link sanitizer & section enforcement middleware.
6. Build golden test sets (store under `tests/`).
7. Integrate RAG table & embedding pipeline.
8. Add streaming support (SSE) for long model responses.

---
Maintainer: Update this file when adding tools or modifying contracts.
