// Edge Function: timeline (date correspondence)
// Computes delta between two dates plus factorization and numeric classifications.
import 'jsr:@supabase/functions@1.4.5/types';

interface DateCorrespondenceArgs { from: string; to?: string }
interface ResultDelta { days:number; weeks:number; months:number; years:number }
interface DateCorrespondenceResult { diff: ResultDelta; factors:number[]; interesting?: string[] }

function parseISO(s:string){ const d=new Date(s); return isNaN(d.valueOf())? null : d; }
function dayDiff(a:Date,b:Date){ return Math.round((b.getTime()-a.getTime())/86400000); }
function factors(n:number){ const out:number[]=[]; const lim=Math.floor(Math.sqrt(n)); for(let i=1;i<=lim;i++){ if(n%i===0){ out.push(i); if(i!==n/i) out.push(n/i); } } return out.sort((a,b)=>a-b); }
function isPrime(n:number){ if(n<2) return false; if(n<=3) return true; if(n%2===0||n%3===0) return false; for(let i=5;i*i<=n;i+=6){ if(n%i===0||n%(i+2)===0) return false; } return true; }
function isTriangular(n:number){ const x=Math.floor((Math.sqrt(8*n+1)-1)/2); return x*(x+1)/2===n; }
function isSquare(n:number){ const r=Math.floor(Math.sqrt(n)); return r*r===n; }
function isFibonacci(n:number){ const a=5*n*n+4, b=5*n*n-4; const sa=Math.floor(Math.sqrt(a)); const sb=Math.floor(Math.sqrt(b)); return sa*sa===a || sb*sb===b; }

Deno.serve(async (req:Request)=>{
  if(req.method!=='POST') return new Response('Method Not Allowed',{ status:405 });
  let body: DateCorrespondenceArgs; try{ body=await req.json(); }catch{ return new Response(JSON.stringify({ error:'Invalid JSON'}),{ status:400 }); }
  if(!body.from) return new Response(JSON.stringify({ error:'Missing from'}),{ status:400 });
  const start=parseISO(body.from); const end=parseISO(body.to || new Date().toISOString().slice(0,10));
  if(!start||!end) return new Response(JSON.stringify({ error:'Invalid date(s)'}),{ status:400 });
  const days=dayDiff(start,end); const weeks=+(days/7).toFixed(4); const months=+(days/30.436875).toFixed(4); const years=+(days/365.2425).toFixed(6);
  const f=factors(days);
  const interesting:string[]=[];
  if(isPrime(days)) interesting.push('prime-days');
  if(isTriangular(days)) interesting.push('triangular-days');
  if(isSquare(days)) interesting.push('square-days');
  if(isFibonacci(days)) interesting.push('fibonacci-days');
  const res: DateCorrespondenceResult={ diff:{ days,weeks,months,years }, factors:f, interesting};
  return new Response(JSON.stringify(res), { headers:{ 'Content-Type':'application/json','Cache-Control':'no-store'} });
});
