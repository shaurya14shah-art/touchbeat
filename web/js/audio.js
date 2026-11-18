// All music is synthesised at runtime: no samples, nothing to license.
export class Beat{
  constructor(){this.ctx=new (window.AudioContext||window.webkitAudioContext)();this.master=this.ctx.createGain();this.master.gain.value=.8;this.master.connect(this.ctx.destination);
    const n=this.ctx.sampleRate*.2,b=this.ctx.createBuffer(1,n,this.ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;this.noiseBuf=b;}
  async resume(){if(this.ctx.state!=='running')await this.ctx.resume();}
  tone(t,f0,f1,dur,gain,type='sine'){const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+dur);g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.connect(g).connect(this.master);o.start(t);o.stop(t+dur+.02);}
  noise(t,dur,gain,freq){const s=this.ctx.createBufferSource(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();s.buffer=this.noiseBuf;f.type='highpass';f.frequency.value=freq;g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);s.connect(f).connect(g).connect(this.master);s.start(t);s.stop(t+dur);}
  /** Schedules the whole track; returns the performance.now() time in seconds of beat zero as heard. */
  play(spb,countIn,beats){
    const lead=.25,t0=this.ctx.currentTime+lead,bass=[55,55,65.4,49];
    for(let i=0;i<countIn;i++)this.tone(t0+i*spb,1200,900,.07,.5,'square');
    for(let i=0;i<beats;i++){const t=t0+(countIn+i)*spb;
      this.tone(t,150,42,.16,.95);this.noise(t+spb/2,.05,.22,7000);
      if(i%2)this.noise(t,.11,.4,1800);
      this.tone(t+spb/2,bass[Math.floor(i/4)%4]*2,bass[Math.floor(i/4)%4]*2*.98,spb/2.2,.32,'sawtooth');}
    return performance.now()/1000+lead+(this.ctx.outputLatency||this.ctx.baseLatency||0);
  }
  hit(grade){const t=this.ctx.currentTime,f={perfect:1320,good:990,ok:740}[grade];if(f)this.tone(t,f,f*1.01,.08,.18,'triangle');}
  stop(){this.master.gain.setTargetAtTime(0,this.ctx.currentTime,.03);setTimeout(()=>this.ctx.close(),250);}
}
const say=(window.speechSynthesis||null);let lastSay=0;
export function speak(text,gap=4.5){if(!say)return;const n=performance.now()/1000;if(n-lastSay<gap)return;lastSay=n;say.cancel();const u=new SpeechSynthesisUtterance(text);u.rate=1.15;say.speak(u);}
