// Edge Function: etymology aggregator (Wiktionary + Wikipedia)
import 'jsr:@supabase/functions@1.4.5/types';

interface EtymologyArgs { term: string }
interface Source { title:string; url:string }
interface EtymologyResult { gloss:string; sources:Source[] }

async function fetchWiktionary(term:string){
  try{
    const api = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(term)}`;
    const r = await fetch(api, { headers:{ 'Accept':'application/json' }});
    if(!r.ok) return '';
    const j = await r.json();
    // Very naive extraction: pick first English definition if present
    const en = j.en || j.ENGLISH || [];
    if(Array.isArray(en) && en.length){
      const first = en[0].definitions?.[0]?.definition || '';
      return first.replace(/<[^>]+>/g,'');
    }
  }catch{}
  return '';
}

async function fetchWikipedia(term:string){
  try{
    const api = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`;
    const r = await fetch(api, { headers:{ 'Accept':'application/json' }});
    if(!r.ok) return '';
    const j = await r.json();
    return (j.extract || '').split('\n')[0];
  }catch{}
  return '';
}

Deno.serve(async (req:Request)=>{
  if(req.method!=='POST') return new Response('Method Not Allowed',{ status:405 });
  let body:EtymologyArgs; try{ body=await req.json(); }catch{ return new Response(JSON.stringify({ error:'Invalid JSON'}),{ status:400 }); }
  if(!body.term) return new Response(JSON.stringify({ error:'Missing term'}),{ status:400 });
  const term = body.term.trim();
  const wikt = await fetchWiktionary(term);
  const wiki = await fetchWikipedia(term);
  const pieces = [wikt, wiki].filter(Boolean);
  const gloss = pieces.join(' ').slice(0,600);
  const sources:Source[] = [
    { title:'Wiktionary', url:`https://en.wiktionary.org/wiki/${encodeURIComponent(term)}` },
    { title:'Wikipedia', url:`https://en.wikipedia.org/wiki/${encodeURIComponent(term)}` }
  ];
  return new Response(JSON.stringify({ gloss, sources }), { headers:{ 'Content-Type':'application/json','Cache-Control':'no-store'} });
});
