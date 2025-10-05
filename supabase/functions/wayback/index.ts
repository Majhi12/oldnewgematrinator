// Edge Function: wayback snapshot lookup
import 'jsr:@supabase/functions@1.4.5/types';

interface WaybackArgs { url?: string; query?: string }

async function fetchSnapshots(url: string){
  // Wayback CDX API
  const api = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&fl=timestamp,original&filter=statuscode:200&limit=20&collapse=digest`;
  const r = await fetch(api);
  if(!r.ok) return [];
  const j = await r.json();
  // first row header; rest data
  return j.slice(1).map((row:any)=>({ title: row[1], url:`https://web.archive.org/web/${row[0]}/${row[1]}`, timestamp: row[0] }));
}

async function fetchQuery(query: string){
  // naive: use Wikipedia search as proxy for historical pages (extend later)
  const api = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srsearch=${encodeURIComponent(query)}&srlimit=5`;
  const r = await fetch(api);
  if(!r.ok) return [];
  const j = await r.json();
  return (j.query?.search||[]).map((s:any)=>({ title:s.title, url:`https://en.wikipedia.org/wiki/${encodeURIComponent(s.title)}` }));
}

Deno.serve( async (req:Request)=>{
  if(req.method!=='POST') return new Response('Method Not Allowed',{ status:405 });
  let body: WaybackArgs; try{ body=await req.json(); }catch{ return new Response(JSON.stringify({ error:'Invalid JSON'}),{ status:400 }); }
  const { url, query } = body || {} as any;
  if(!url && !query) return new Response(JSON.stringify({ error:'Provide url or query'}),{ status:400 });
  const out:any[] = [];
  if(url) out.push(...await fetchSnapshots(url));
  if(query) out.push(...await fetchQuery(query));
  return new Response(JSON.stringify(out.slice(0,25)), { headers:{ 'Content-Type':'application/json','Cache-Control':'no-store'} });
});
