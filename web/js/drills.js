export const DRILLS={
  toe_taps:{name:'Toe Taps',kind:'tap',blurb:'Tap the top of the ball, swapping feet on every beat.',pattern:i=>({foot:i%2?'R':'L'})},
  sole_rolls:{name:'Sole Rolls',kind:'roll',blurb:'Roll the ball side to side under one sole. Swap feet every four beats.',pattern:i=>({foot:Math.floor(i/4)%2?'L':'R'})},
  inside_outside:{name:'Inside-Outside',kind:'nudge',blurb:'Nudge the ball inside then outside with one foot. Swap every four beats.',pattern:i=>({foot:Math.floor(i/4)%2?'L':'R'})},
};
export const TEMPOS={warm:{name:'Warm-up',bpm:72},match:{name:'Match pace',bpm:92},elite:{name:'Elite',bpm:116}};
export const SCORED_BEATS=32,WARMUP_BEATS=4,COUNT_IN=4;
export function chart(drill,bpm,start){
  const spb=60/bpm,notes=[];
  for(let i=0;i<WARMUP_BEATS+SCORED_BEATS;i++)
    notes.push({t:start+(COUNT_IN+i)*spb,scored:i>=WARMUP_BEATS,...DRILLS[drill].pattern(i)});
  return {notes,spb,end:start+(COUNT_IN+WARMUP_BEATS+SCORED_BEATS)*spb};
}
