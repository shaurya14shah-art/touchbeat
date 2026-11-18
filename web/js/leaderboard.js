import {SUPABASE} from './config.js';
const KEY='touchbeat.local.scores';
const live=!!(SUPABASE.url&&SUPABASE.anonKey);
const hdr={apikey:SUPABASE.anonKey,Authorization:`Bearer ${SUPABASE.anonKey}`,'Content-Type':'application/json'};
const readLocal=()=>{try{return JSON.parse(localStorage.getItem(KEY))||[];}catch{return [];}};
const BLOCK=/(fuck|shit|cunt|nigg|fag|rape|hitler|nazi|bitch|slut)/i;
export const isGlobal=live;
export function validName(n){return /^[A-Za-z0-9_ ]{2,16}$/.test(n)&&!BLOCK.test(n.replace(/[ _0-9]/g,''));}
export async function submit(row){
  // Scores go through submit_score(), which rejects impossible results; direct inserts are refused.
  if(live){const body=Object.fromEntries(Object.entries(row).map(([k,v])=>[`p_${k}`,v]));
    const r=await fetch(`${SUPABASE.url}/rest/v1/rpc/submit_score`,{method:'POST',headers:hdr,body:JSON.stringify(body)});
    if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.message||'The leaderboard refused that score.');}return;}
  const all=readLocal();all.push({...row,created_at:new Date().toISOString()});try{localStorage.setItem(KEY,JSON.stringify(all));}catch{}
}
export async function top(drill,tempo,withBall,limit=20){
  if(live){const q=new URLSearchParams({select:'nickname,score,accuracy,form,best_combo,created_at',drill:`eq.${drill}`,tempo:`eq.${tempo}`,with_ball:`eq.${withBall}`,order:'score.desc',limit});
    const r=await fetch(`${SUPABASE.url}/rest/v1/scores?${q}`,{headers:hdr});if(!r.ok)throw new Error('Could not load the leaderboard.');return r.json();}
  return readLocal().filter(r=>r.drill===drill&&r.tempo===tempo&&r.with_ball===withBall).sort((a,b)=>b.score-a.score).slice(0,limit);
}
