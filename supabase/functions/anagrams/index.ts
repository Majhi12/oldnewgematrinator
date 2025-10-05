// Edge Function: anagrams
// Deterministic dictionary-true anagram finder (single language EN)
// Secrets: (none). Provide wordlist via remote fetch or baked minimal list.
// For production, replace WORD_LIST with a larger curated frequency-ranked list.

import 'jsr:@supabase/functions@1.4.5/types';

interface FindAnagramsArgs { text: string; maxWords?: number; minWordLen?: number; topK?: number; }
interface AnagramResult { phrase: string; words: string[]; score: number }

// Minimal placeholder list (replace with a proper frequency list)
const WORD_LIST = ['stone','tones','notes','on','no','ten','one','stonehenge','rose','sore','ores','eros','tone','set','son','sun','tar','rat','art','era','are'];

// Pre-index by sorted signature
const INDEX = new Map<string,string[]>();
for (const w of WORD_LIST){
  const key = w.split('').sort().join('');
  if(!INDEX.has(key)) INDEX.set(key, []);
  INDEX.get(key)!.push(w);
}

function multisetKey(s: string){ return s.replace(/[^a-z]/gi,'').toLowerCase().split('').sort().join(''); }

function scoreWord(word: string){ return Math.log(1 + (50000 - Math.min(49999, word.length * 1000))); }

function findSingleWordAnagrams(letters: string){
  const key = multisetKey(letters);
  const out: AnagramResult[] = [];
  INDEX.forEach((words, sig) => {
    if(sig === key){
      for(const w of words){ out.push({ phrase: w, words:[w], score: scoreWord(w) }); }
    }
  });
  return out;
}

function findMulti(letters: string, maxWords: number, minWordLen: number, topK: number){
  const clean = letters.replace(/[^a-z]/gi,'').toLowerCase();
  const counts: Record<string,number> = {};
  for(const c of clean) counts[c] = (counts[c]||0)+1;
  const dict = WORD_LIST.filter(w=> w.length >= minWordLen && w.length <= clean.length);
  dict.sort((a,b)=> a.length - b.length);
  const results: AnagramResult[] = [];
  const used = new Set<string>();

  function fits(word: string){
    const temp: Record<string,number> = {};
    for(const c of word) temp[c] = (temp[c]||0)+1;
    for(const k in temp){ if(temp[k] > (counts[k]||0)) return false; }
    return true;
  }
  function apply(word: string, delta: number){ for(const c of word){ counts[c] += delta; } }
  // Actually we want subtract greedy: we keep original counts, so clone first
  const base = { ...counts };
  function subtract(word: string){ for(const c of word){ counts[c]--; } }
  function addback(word: string){ for(const c of word){ counts[c]++; } }
  function remainingLetters(){ return Object.values(counts).reduce((a,b)=> a+b,0); }

  function backtrack(path: string[]){
    if(path.length > 0){
      const phrase = path.join(' ');
      if(!used.has(phrase)){
        const sc = path.reduce((s,w)=> s + scoreWord(w), 0);
        results.push({ phrase, words:[...path], score: sc });
        used.add(phrase);
      }
    }
    if(path.length === maxWords) return;
    if(results.length > topK*5) return; // prune early growth
    for(const w of dict){
      if(!fits(w)) continue;
      subtract(w);
      path.push(w);
      backtrack(path);
      path.pop();
      addback(w);
      if(remainingLetters() < 2) continue;
    }
  }
  // Reset counts from base each iteration (we mutated) — reinitialize
  for(const k in base) counts[k]=base[k];
  backtrack([]);
  results.sort((a,b)=> b.score - a.score);
  return results.slice(0, topK);
}

Deno.serve(async (req) => {
  if(req.method !== 'POST') return new Response('Method Not Allowed',{ status:405 });
  let body: FindAnagramsArgs;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error:'Invalid JSON'}),{ status:400 }); }
  const { text, maxWords=3, minWordLen=2, topK=100 } = body || {} as any;
  if(!text) return new Response(JSON.stringify({ error:'Missing text'}),{ status:400 });
  const single = findSingleWordAnagrams(text);
  const multi = maxWords>1 ? findMulti(text, maxWords, minWordLen, topK) : [];
  const merged = [...single, ...multi];
  merged.sort((a,b)=> b.score - a.score);
  return new Response(JSON.stringify(merged.slice(0, topK)), { headers:{ 'Content-Type':'application/json','Cache-Control':'no-store'} });
});
