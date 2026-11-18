// Headless end-to-end run: a video file stands in for the webcam. No window opens.
import http from 'http';import fs from 'fs';import path from 'path';import {createRequire} from 'module';
const require=createRequire(new URL('./node/package.json',import.meta.url));const puppeteer=require('puppeteer');
const [,,cam,outDir,query='']=process.argv;const root=path.resolve('web');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm'};
const srv=http.createServer((q,r)=>{let p=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(p.endsWith('/'))p+='index.html';if(!p.startsWith(root)||!fs.existsSync(p)){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(r);}); await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const port=srv.address().port;
const b=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-video-capture=${cam}`,'--autoplay-policy=no-user-gesture-required','--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
const pg=await b.newPage();await pg.setViewport({width:1280,height:720});
const errs=[];pg.on('pageerror',e=>errs.push('PAGE '+e.message));pg.on('console',m=>{if(m.type()==='error')errs.push('CON '+m.text());});pg.on('response',r=>{if(r.status()>=400)errs.push('HTTP '+r.status()+' '+r.url());});pg.on('requestfailed',r=>errs.push('REQ '+r.url()));
await pg.goto(`http://127.0.0.1:${port}/index.html?${query}`,{waitUntil:'load'});
await pg.waitForFunction('window.__tb&&window.__tb.ref',{timeout:15000});await new Promise(r=>setTimeout(r,800));
await pg.screenshot({path:`${outDir}/1_home.png`});
await pg.click('#start');
const T0=Date.now();let last='';let shot=0;
const stat=()=>pg.evaluate(()=>{const t=window.__tb,r=t.run;return{mode:t.mode,checks:[...document.querySelectorAll('#checks li')].map(l=>l.className==='ok'?1:0).join(''),hasPose:!!t.latest?.p,fps:t.frameTimes.length>10?+((t.frameTimes.length-1)/(t.frameTimes.at(-1)-t.frameTimes[0])).toFixed(1):0,touches:r?.touches,frames:r?.frames,ballF:r?.ballFrames,score:r?.scorer&&Math.round(r.scorer.points),offset:r?.offset,cue:r?.lastCue,hid:document.getElementById('results').hidden};});
while(Date.now()-T0<100000){const s=await stat();const k=JSON.stringify(s);if(k!==last&&true)console.log(((Date.now()-T0)/1000).toFixed(0),k);last=k;
  if(s.mode==='setup'&&shot===0&&s.hasPose){await pg.screenshot({path:`${outDir}/2_setup.png`});shot=1;}
  if(s.mode==='play'&&s.frames>120&&shot<=1){await pg.screenshot({path:`${outDir}/3_play.png`});shot=2;}
  if(s.mode==='play'&&s.frames>260&&shot===2){await pg.screenshot({path:`${outDir}/4_play.png`});shot=3;}
  if(!s.hid){console.log('RESULTS',k);await new Promise(r=>setTimeout(r,1800));await pg.screenshot({path:`${outDir}/5_results.png`});
    await pg.type('#nick','Test_Player');await pg.click('#submitForm button');await new Promise(r=>setTimeout(r,600));console.log('BOARD',await pg.evaluate(()=>document.getElementById('board').hidden+' | '+document.getElementById('boardMode').textContent+' | '+document.getElementById('rows').innerText.replace(/\n/g,' ')));await pg.screenshot({path:`${outDir}/6_board.png`});break;}
  await new Promise(r=>setTimeout(r,300));}
console.log('final',JSON.stringify(await stat()));console.log('errors',[...new Set(errs)].slice(0,12));await b.close();srv.close();process.exit(0);
