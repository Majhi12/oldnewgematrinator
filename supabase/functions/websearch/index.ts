// Edge Function: websearch (Tavily primary)
import 'jsr:@supabase/functions@1.4.5/types';

interface WebSearchArgs { query: string; k?: number }
const TAVILY_API_KEY = Deno.env.get('TAVILY_API_KEY');

Deno.serve(async (req:Request)=>{
  if(req.method!=='POST') return new Response('Method Not Allowed',{ status:405 });
  if(!TAVILY_API_KEY) return new Response(JSON.stringify({ error:'Missing TAVILY_API_KEY'}),{ status:500 });
  let body: WebSearchArgs; try{ body=await req.json(); }catch{ return new Response(JSON.stringify({ error:'Invalid JSON'}),{ status:400 }); }
  if(!body.query) return new Response(JSON.stringify({ error:'Missing query'}),{ status:400 });
  const k = body.k || 5;
  try{
    const r = await fetch('https://api.tavily.com/search', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'X-API-Key': TAVILY_API_KEY },
      body: JSON.stringify({ query: body.query, search_depth:'basic', include_answer:false, max_results: k })
    });
    if(!r.ok){ return new Response(JSON.stringify({ error:`Tavily ${r.status}` }),{ status:502 }); }
    const j = await r.json();
    const out = (j.results||[]).slice(0,k).map((res:any)=>({ title:res.title, url:res.url, snippet:res.content?.slice(0,240) }));
    return new Response(JSON.stringify(out), { headers:{ 'Content-Type':'application/json','Cache-Control':'no-store'} });
  }catch(e){
    return new Response(JSON.stringify({ error:String(e) }),{ status:500 });
  }
});
