// Edge Function: rag-query
// Planned: semantic retrieval over rag_documents table.
// Schema (proposed):
//   rag_documents(id uuid pk, heading text, body text, source text, url text, embedding vector(1536))
// Request: { topic: string, topK?: number }
// Response (future): { queryEmbedding: number[], matches: [ { id, heading, snippet, score, url, source } ], usedTopK }
// Current placeholder returns empty matches.
import 'jsr:@supabase/functions@1.4.5/types';

interface RagQueryArgs { topic: string; topK?: number }

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  let body: RagQueryArgs; try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }
  if (!body.topic || typeof body.topic !== 'string') return new Response(JSON.stringify({ error: 'Missing topic' }), { status: 400 });
  const topK = body.topK && body.topK > 0 ? Math.min(body.topK, 12) : 5;
  // TODO: generate embedding for body.topic, perform similarity search (cosine distance) via RPC or pgvector index.
  const placeholder = { queryEmbedding: [], matches: [], usedTopK: topK, note: 'Semantic retrieval not yet implemented' };
  return new Response(JSON.stringify(placeholder), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
});
