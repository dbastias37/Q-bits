// Real Chromium + native game/WebGL, controlled local fixtures. Requires an
// installed Playwright module and Chromium, not a game build dependency.
// QBITS_PLAYWRIGHT=/path/to/playwright node tests/benchmark-cpu-browser.cjs --output=/tmp/browser.json
// The local server injects test hooks only in its response; repository assets
// and player saves are untouched. Each sample has a fresh browser context.
// Prepared for a WebGL-capable workstation; NOT validated end-to-end in the
// audit container (Chromium socket creation denied; remote Chrome lacks WebGL).
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),crypto=require('node:crypto');
const fixtureFactory=require('./cpu-audit-fixtures.cjs');
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const root=path.resolve(__dirname,'..'),roots={baseline:path.resolve(root,args['baseline-root']||'../qbits-baseline'),optimized:root};
const playwright=require(process.env.QBITS_PLAYWRIGHT||'playwright');
const hook=fs.readFileSync(path.join(__dirname,'game-harness.cjs'),'utf8').match(/const hook = `([\s\S]*?)`;\n  scripts/)[1];
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const sourceHashes=Object.fromEntries(Object.entries(roots).map(([k,p])=>[k,sha(fs.readFileSync(path.join(p,'assets/js/game.js')))]));
const browserHooks=`${hook}
window.__cpuAudit={f:(${fixtureFactory.toString()})(__testGame),samples:[],record:null};
const auditPrepare=QBitsGame.prepare;
QBitsGame.prepare=async function(...args){const result=await auditPrepare(...args);window.__auditPrepared=true;return result;};
const auditOriginalFrame=frame;
frame=function(time){
 const r=__cpuAudit.record,start=r?performance.now():0;
 auditOriginalFrame(time);
 if(!r)return;
 const end=performance.now(),elapsed=time-r.last;r.last=time;r.frames++;
 if(r.frames===r.warmup){r.initial=__testGame.getTickState();r.initialInventory=__cpuAudit.f.inventory();r.start=time;}
 if(r.frames>r.warmup){r.samples.push({workMs:end-start,rafMs:elapsed});}
 if(r.samples.length>=r.limit||end-r.wallStart>r.timeout){
  running=false;__cpuAudit.record=null;
  r.resolve({samples:r.samples,initial:r.initial||__testGame.getTickState(),final:__testGame.getTickState(),initialInventory:r.initialInventory,finalInventory:__cpuAudit.f.inventory(),elapsedMs:time-(r.start||time),timedOut:r.samples.length<r.limit});
 }
};__testGame.frame=frame;
window.__cpuAudit.runFrames=(warmup,limit,timeout)=>new Promise(resolve=>{running=true;resetSimulationClock(null,true);__cpuAudit.record={warmup,limit,timeout,frames:0,last:0,samples:[],wallStart:performance.now(),resolve};requestAnimationFrame(frame);});
`;
const server=http.createServer((req,res)=>{
 try {
  const u=new URL(req.url,'http://localhost'),segments=u.pathname.split('/').filter(Boolean),variant=segments.shift();
  if(!roots[variant]){res.writeHead(404).end();return;}
  const file=path.resolve(roots[variant],segments.join('/')||'index.html');
  if(!file.startsWith(roots[variant]+path.sep)&&file!==path.join(roots[variant],'index.html')){res.writeHead(403).end();return;}
  let body=fs.readFileSync(file);
  if(file.endsWith('/assets/js/game.js')){const source=body.toString(),at=source.lastIndexOf('})();');body=source.slice(0,at)+browserHooks+source.slice(at);}
  const ext=path.extname(file),type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf','.woff2':'font/woff2','.wav':'audio/wav','.mp3':'audio/mpeg','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.json':'application/json'}[ext]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);
 }catch{res.writeHead(404).end();}
});
const quantile=(a,q)=>{const s=[...a].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.ceil(q*s.length)-1)]??null;};
const stats=a=>({count:a.length,mean:a.reduce((s,n)=>s+n,0)/Math.max(1,a.length),p50:quantile(a,.5),p95:quantile(a,.95),p99:quantile(a,.99),min:Math.min(...a),max:Math.max(...a)});
function topProfile(profile){
 const counts=new Map();for(let i=0;i<(profile.samples||[]).length;i++){const id=profile.samples[i];counts.set(id,(counts.get(id)||0)+(profile.timeDeltas?.[i]||0));}
 return profile.nodes.map(n=>({name:n.callFrame.functionName||'(anonymous)',url:n.callFrame.url,line:n.callFrame.lineNumber+1,selfMs:(counts.get(n.id)||0)/1000})).sort((a,b)=>b.selfMs-a.selfMs).slice(0,25);
}
function topAllocations(profile){
 const rows=[];function walk(n){if(n.selfSize)rows.push({name:n.callFrame.functionName||'(anonymous)',url:n.callFrame.url,line:n.callFrame.lineNumber+1,sampledBytes:n.selfSize});for(const c of n.children||[])walk(c);}walk(profile.head);return rows.sort((a,b)=>b.sampledBytes-a.sampledBytes).slice(0,25);
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
 const browser=await playwright.chromium.launch({executablePath:process.env.QBITS_CHROMIUM||'/usr/bin/chromium',headless:args.headed!=='true'});
 const output={schema:1,method:'Real Chromium, native WebGL, actual requestAnimationFrame. Work milliseconds wrap the production frame callback and exclude idle/waiting. RAF intervals include presentation delays. DevTools profiles/allocations run separately. No CPU utilization percentage.',browser:browser.version(),node:process.version,cpuModel:os.cpus()[0]?.model,sourceHashes,configuration:{viewport:[1280,720],deviceScaleFactor:1,style:'clean',shadows:'off',warmup:Number(args.warmup||18),frames:Number(args.frames||48),repetitions:Number(args.repetitions||3),timeoutMs:15000},reports:[]};
 async function pageFor(variant){
  const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>{let seed=731;Math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};});
  await page.goto('http://127.0.0.1:'+port+'/'+variant+'/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__auditPrepared===true,null,{timeout:30000});
  await page.evaluate(()=>{
   const t=__testGame;t.setRunning(false);t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
   document.body.dataset.booting='false';for(const id of ['boot-screen','main-screen','wake-screen','panel','story-dialogue']){const el=document.getElementById(id);if(el)el.hidden=true;}
   t.applyPreferences({physicsHz:120,quality:'custom',shadows:'off',style:'clean',resolution:100,sampling:1,fps:60,music:false,guideVoice:false,footsteps:false,joinSounds:false});
   t.position.splice(0,3,0,1.7,6);t.setLook({camera:[0,1.7,6],yaw:0,pitch:-.2});t.resize();
  });
  // Drain the single frame scheduled by prepare before starting a new loop.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const meta=await page.evaluate(()=>{const gl=__testGame.canvas.getContext('webgl2')||__testGame.canvas.getContext('webgl'),ext=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),webgl:gl.getParameter(gl.VERSION),loafSupported:PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')};});
  return {context,page,errors,meta};
 }
 try{
  const mode=args.mode||'frames';
  if(mode==='frames'){
   const scales=(args.scales||'16,100,500,1000,1500,2000').split(',').map(Number),kinds=(args.kinds||'welded,independent,factory').split(',');
   for(const kind of kinds)for(const pieces of scales){
    if(kind==='factory'&&pieces<100)continue;
    for(let r=0;r<output.configuration.repetitions;r++)for(const variant of r%2?['optimized','baseline']:['baseline','optimized']){
     const {context,page,errors,meta}=await pageFor(variant);
     try{
      await page.evaluate(({kind,pieces,hz})=>{__testGame.applyPreferences({physicsHz:hz,quality:'custom',shadows:'off',style:'clean',resolution:100,sampling:1,fps:60,music:false,guideVoice:false,footsteps:false,joinSounds:false});__cpuAudit.f.scene(kind,pieces,kind==='factory');}, {kind,pieces,hz:Number(args.hz||120)});
      const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
      const before=await cdp.send('Performance.getMetrics');
      const result=await page.evaluate(c=>__cpuAudit.runFrames(c.warmup,c.frames,c.timeoutMs),output.configuration);
      const after=await cdp.send('Performance.getMetrics');
      const get=(m,n)=>m.metrics.find(x=>x.name===n)?.value??0;
      output.reports.push({scenario:kind,pieces,hz:Number(args.hz||120),variant,repetition:r+1,meta,errors,...result,workMs:stats(result.samples.map(s=>s.workMs)),rafMs:stats(result.samples.map(s=>s.rafMs)),devtoolsIncludingWarmup:{taskDurationSeconds:get(after,'TaskDuration')-get(before,'TaskDuration'),scriptDurationSeconds:get(after,'ScriptDuration')-get(before,'ScriptDuration'),layoutDurationSeconds:get(after,'LayoutDuration')-get(before,'LayoutDuration'),heapUsedBefore:get(before,'JSHeapUsedSize'),heapUsedAfter:get(after,'JSHeapUsedSize')}});
      process.stderr.write(kind+' '+pieces+' '+variant+' '+r+' completed\n');
     }finally{await context.close();}
    }
   }
  }else if(mode==='profile'||mode==='visual'){
   for(const variant of ['baseline','optimized']){
    const {context,page,errors,meta}=await pageFor(variant),cdp=await context.newCDPSession(page);
    try{
     await page.evaluate(mode=>{const f=__cpuAudit.f,t=__testGame;if(mode==='visual'){for(let i=0;i<8;i++)f.battery(i%3+1,[-.5+(i%4)*.32,.045,-.3+Math.floor(i/4)*.3],!!(i%2));t.position.splice(0,3,.2,.6,1.4);t.setLook({camera:[.2,.6,1.4],yaw:0,pitch:-.3});t.renderScene();}else{f.distant(1000);t.updateTarget();}},mode);
     if(mode==='visual'){
      const file=path.join(path.dirname(args.output||'/tmp/qbits-browser.json'),'battery-'+variant+'.png');await page.screenshot({path:file});output.reports.push({variant,meta,errors,screenshot:file});
     }else{
      await cdp.send('HeapProfiler.enable');await cdp.send('HeapProfiler.collectGarbage');const heapBefore=await cdp.send('Runtime.getHeapUsage');
      await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:100});await cdp.send('Profiler.start');
      await page.evaluate(()=>{for(let i=0;i<120;i++){__testGame.updateTarget();__testGame.tickContactSensors(1/120);__testGame.drawWorkshop();}});
      const cpu=await cdp.send('Profiler.stop');
      await cdp.send('HeapProfiler.startSampling',{samplingInterval:4096,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
      await page.evaluate(()=>{for(let i=0;i<120;i++){__testGame.updateTarget();__testGame.tickContactSensors(1/120);__testGame.drawWorkshop();}});
      const allocations=await cdp.send('HeapProfiler.stopSampling');await cdp.send('HeapProfiler.collectGarbage');const heapAfter=await cdp.send('Runtime.getHeapUsage');
      const prefix=path.join(path.dirname(args.output||'/tmp/qbits-browser.json'),'devtools-'+variant);fs.writeFileSync(prefix+'.cpuprofile',JSON.stringify(cpu.profile));fs.writeFileSync(prefix+'.heapprofile',JSON.stringify(allocations.profile));
      output.reports.push({variant,meta,errors,heapBefore,heapAfter,cpuTop:topProfile(cpu.profile),allocationTop:topAllocations(allocations.profile),profiles:[prefix+'.cpuprofile',prefix+'.heapprofile']});
     }
    }finally{await context.close();}
   }
  }else throw new Error('Unknown mode '+mode);
 }finally{await browser.close();server.close();if(args.output)fs.writeFileSync(args.output,JSON.stringify(output,null,2)+'\n');else console.log(JSON.stringify(output,null,2));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
