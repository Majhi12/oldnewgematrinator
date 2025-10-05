// Edge Function: acronyms (initialisms + simple backronym suggestions)
import 'jsr:@supabase/functions@1.4.5/types';

interface GenerateAcronymsArgs { phrase: string; style?: 'initialism'|'backronym'; count?: number }
interface AcronymOut { acronym:string; expansion?:string }

const WORD_BANK = ['global','energy','matrix','analysis','research','assistant','truth','number','resonance','system','symbolic','cosmic','light','unity','nature','alpha','omega','vector','sequence','gamma','harmonic'];

function normalize(p:string){ return p.replace(/[^a-zA-Z ]/g,' ').replace(/ +/g,' ').trim(); }
function initials(phrase:string){ return phrase.split(' ').filter(Boolean).map(w=>w[0]).join('').toUpperCase(); }
function candidateBackronyms(target:string, limit:number){
  const upper = target.toUpperCase();
  const results:AcronymOut[] = [];
  const wordsByLetter:Record<string,string[]> = {};
  for(const w of WORD_BANK){ const k=w[0].toUpperCase(); (wordsByLetter[k] ||= []).push(w); }
  function backtrack(i:number, path:string[]){
    if(i===upper.length){ results.push({ acronym: upper, expansion: path.join(' ') }); return; }
    const letter = upper[i];
    const pool = wordsByLetter[letter] || [];
    for(const w of pool){ path.push(w); backtrack(i+1,path); path.pop(); if(results.length>=limit) return; }
  }
  backtrack(0, []);
  return results;
}

Deno.serve(async (req:Request)=>{
  if(req.method!=='POST') return new Response('Method Not Allowed',{ status:405 });
  let body:GenerateAcronymsArgs; try{ body=await req.json(); }catch{ return new Response(JSON.stringify({ error:'Invalid JSON'}),{ status:400 }); }
  if(!body.phrase) return new Response(JSON.stringify({ error:'Missing phrase'}),{ status:400 });
  const phrase = normalize(body.phrase);
  const style = body.style || 'initialism';
  const count = body.count || 10;
  const out:AcronymOut[] = [];
  const init = initials(phrase);
  if(style==='initialism' || style==='backronym'){ out.push({ acronym: init }); }
  if(style==='backronym'){
    out.push(...candidateBackronyms(init, count));
  }
  return new Response(JSON.stringify(out.slice(0,count)), { headers:{ 'Content-Type':'application/json','Cache-Control':'no-store'} });
});
