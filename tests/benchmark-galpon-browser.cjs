// Native browser run; optional Playwright dev dependency. See measurement notes.
// QBITS_CHROMIUM=/path/chromium node tests/benchmark-galpon-browser.cjs --output=/tmp/qbits-play
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.QBITS_PLAYWRIGHT||'playwright');
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const root=path.join(__dirname,'..'),output=path.resolve(args.output||'/tmp/qbits-play');
const workers=Number(args.workers||4),limit=Number(args.seconds||1800);
assert([1,4].includes(workers)&&limit>0);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.ttf':'font/ttf','.wav':'audio/wav','.mp3':'audio/mpeg','.json':'application/json'};
const hooks=`
window.galponQA={
 read(){const s=story.galpon,ext=gl.getExtension('WEBGL_debug_renderer_info');
 return {seconds:s.elapsed,scene:story.scene,mode:story.mode,built:hangarLineStatus().built,received:s.received,
 extracted:s.extracted,cubes:s.records.filter(r=>r.source==='extraction'&&r.kind==='cube').length,
 stock:hangarWorldStatus(),line:hangarLineStatus(),tabletOpen:!panel.hidden,
 families:families.map(f=>({id:f.id,count:f.count,position:[f.body.position.x,f.body.position.y,f.body.position.z]})),
 ledger:{credited:s.records.filter(r=>r.credited).length,uniqueOrigins:new Set(s.records.filter(r=>r.credited).map(r=>r.origin)).size,spent:s.spent}, workers:hangarWorldStatus().workers,energyJ:s.energyJ,bodies:world.bodies.length,groups:groups.length,
 drawSize:[gl.drawingBufferWidth,gl.drawingBufferHeight],renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),webgl:gl.getParameter(gl.VERSION),physicsHz:1/FIXED_STEP,look:{yaw,pitch,camera:[...camera],position:[...position]}};},
 advance(seconds){const start=story.galpon.elapsed;
  if(simulationSuspended())throw Error('The mission clock is suspended.');
  // Run exactly the fixed physics and slow logic steps selected by the game.
  // A block ends at an actionable milestone; decisions still require the UI.
  const first=this.read(),startBuilt=first.built;
  for(let f=0;f<seconds*60;f++){
   if(navigationJobs.size)runNavigationJobs();
   advanceSimulation(1/60);
   if(f%12===11&&(!first.cubes&&story.galpon.records.some(r=>r.source==='extraction'&&r.kind==='cube')||
      !first.extracted&&story.galpon.extracted||story.galpon.received!==first.received||
      startBuilt<8&&!document.querySelector('#galpon-build').disabled))break;
  }
  if(story.galpon.elapsed<=start)throw Error('No simulated progress.');
  return this.read();},
 measure(){const a=[],b=[],n=12;cullingLab.stats=true;
  for(let i=0;i<n+2;i++){
   const t=performance.now();if(navigationJobs.size)runNavigationJobs();advanceSimulation(1/60);const t1=performance.now();
   gl.finish();const t2=performance.now();renderScene();gl.finish();
   if(i>=2){a.push(t1-t);b.push(performance.now()-t2);}
  }
  cullingLab.stats=false;updateCullingHud(true);const summary=list=>{const s=list.sort((x,y)=>x-y);return {samples:n,medianMs:s[Math.floor(n/2)],p95Ms:s[Math.ceil(.95*n)-1]};};
  return {physicsAndLogicFor60HzFrame:summary(a),renderCpuAndGpuFence:summary(b),drawCalls:renderCounts.calls,triangles:renderCounts.triangles,lines:renderCounts.lines,glError:gl.getError()};}
};`;
async function run(){
 fs.mkdirSync(output,{recursive:true});
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
  if(file.endsWith('/assets/js/game.js')){
   const text=fs.readFileSync(file,'utf8'),at=text.lastIndexOf('})();');assert(at>=0);
   res.end(text.slice(0,at)+hooks+text.slice(at));
  }else fs.createReadStream(file).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.QBITS_CHROMIUM||undefined,
   args:['--no-sandbox','--disable-dev-shm-usage',...(args.software==='yes'?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])]});
  const context=await browser.newContext({viewport:{width:960,height:640}});
  if(args.checkpoint){
   const recovered=JSON.parse(fs.readFileSync(args.checkpoint,'utf8'));
   await context.addInitScript(entries=>{if(!sessionStorage.getItem('qa-restored')){for(const [k,v]of entries)localStorage.setItem(k,v);sessionStorage.setItem('qa-restored','1');}},recovered.entries);
  }
  const page=await context.newPage();
  const result={browser:browser.version(),workers,mode:'Real Chromium with native WebGL. Manual-equivalent menu, keyboard and mouse actions. Fixed-step accelerated mission clock between milestones; the first on-screen interaction and captures use normal rendering.',errors:[],milestones:[],costs:[]};
  page.on('pageerror',error=>{result.errors.push(error.message);console.error('pageerror',error.message);});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('#boot-play').click({timeout:90000});
  await page.locator('#main-galpon').click({timeout:180000});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.locator('#galpon-workers').selectOption(String(workers));
  await page.locator(args.checkpoint?'#galpon-continue':'#galpon-start').click();
  await page.waitForFunction(()=>document.body.dataset.gameScene==='galpon');
  const read=()=>page.evaluate(()=>galponQA.read());
  const tablet=async open=>{
   if((await read()).tabletOpen!==open) {
    if(open) await page.keyboard.press('KeyP');
    else await page.locator('#resume').click();
   }
   await page.waitForFunction(open=>galponQA.read().tabletOpen===open,open,{polling:100,timeout:20000});
   if(open && !await page.locator('#page-galpon').isVisible()) await page.locator('#tab-galpon').click();
   if(open) await page.locator('#page-galpon').waitFor({state:'visible'});
  };
  const snap=async name=>{
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   await page.screenshot({path:path.join(output,name+'.png')});
  };
  // Move the mouse in the same pointer-locked canvas as a player. Position and
  // orientation are observed to aim the final review, never written by the test.
  const lookAt=async (x,y,z)=>{
   if(!await page.evaluate(()=>!!document.pointerLockElement))await page.locator('#room').click({position:{x:480,y:320}});
   await page.waitForTimeout(250);
   let px=480,py=320;
   await page.mouse.move(px,py);
   for(let i=0;i<8;i++){
    const {look}=await read(),[cx,cy,cz]=look.camera;
    const yaw=Math.atan2(cx-x,cz-z),pitch=Math.atan2(y-cy,Math.hypot(x-cx,z-cz));
    const ex=Math.atan2(Math.sin(yaw-look.yaw),Math.cos(yaw-look.yaw)),ey=pitch-look.pitch;
    if(Math.abs(ex)<.04&&Math.abs(ey)<.04)break;
    px-=Math.round(ex/.002);py-=Math.round(ey/.002);
    await page.mouse.move(px,py);
    await page.waitForTimeout(80);
   }
  };
  const approachFamily=async f=>{
   for(let i=0;i<48;i++){
    const {look}=await read(),[cx,,cz]=look.position;
    const targetX=f[0]+Math.sin(look.yaw)*2.0,targetZ=f[2]+Math.cos(look.yaw)*2.0;
    const dx=targetX-cx,dz=targetZ-cz;
    if(Math.hypot(dx,dz)<.18)break;
    const fwd=-Math.sin(look.yaw)*dx-Math.cos(look.yaw)*dz;
    const side=Math.cos(look.yaw)*dx-Math.sin(look.yaw)*dz;
    const keys=[];
    if(Math.abs(fwd)>.12)keys.push(fwd>0?'KeyW':'KeyS');
    if(Math.abs(side)>.12)keys.push(side>0?'KeyD':'KeyA');
    for(const key of keys)await page.keyboard.down(key);
    await page.waitForTimeout(180);
    for(const key of keys)await page.keyboard.up(key);
   }
  };
  const initial=await read();
  result.initial=initial;
  await snap('01-entrada');
  await tablet(true);
  await page.locator('#galpon-work').click();
  assert.match(await page.locator('#galpon-stock').innerText(),new RegExp('En turno '+workers));
  await snap('02-extraccion');
  let last=initial,firstCube=initial.cubes>0,firstRaw=initial.extracted>0;
  const event=(name,stamp)=>{result.milestones.push({event:name,seconds:Number(stamp.seconds.toFixed(2))});console.error(name,stamp.seconds);};
  while(last.seconds<limit && last.received<12){
   const state=await page.evaluate(()=>galponQA.advance(12));
   if(!firstRaw&&state.extracted){event('primera extracción',state);firstRaw=true;}
   if(!firstCube&&state.cubes){event('primer cubo producido',state);firstCube=true;}
   if(state.built<8&&await page.locator('#galpon-build').isEnabled()){
    await page.locator('#galpon-build').click();
    const built=await read();assert(built.built>state.built);
    event('tramo '+built.built,built);
    const entries=await page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.startsWith('qbits.')));
    fs.writeFileSync(path.join(output,'checkpoint.json'),JSON.stringify({entries,observed:built,source:'Latest browser autosave'},null,2));
    fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify(result,null,2));
    await page.locator('#galpon-run').click();
    if(built.built===1){
     await tablet(false);
     await lookAt(0,.84,0);
     await snap('03-primer-tramo');
     result.costs.push({built:built.built,...await read(),cost:await page.evaluate(()=>galponQA.measure())});
     await tablet(true);
    }
   }
   if(state.received>last.received)event('recepción '+state.received,state);
   if(Math.floor(state.seconds/45)!==Math.floor(last.seconds/45))console.error('avance',state.seconds,state.built,state.received,JSON.stringify({tableta:state.tabletOpen,extraida:state.extracted,stock:state.stock,linea:state.line}));
   last=state;
  }
  result.final=await read();
  fs.writeFileSync(path.join(output,'browser.json'),JSON.stringify(result,null,2)+'\n');
  if(result.final.received===12) {
   result.costs.push({built:8,...result.final,cost:await page.evaluate(()=>galponQA.measure())});
  }
  await tablet(false);
  await lookAt(.6,.8,0);
  await snap('05-recepcion');
  if((await read()).families.length) {
   const [x,y,z]=(await read()).families[0].position;
   await approachFamily([x,y,z]);
   await lookAt(x,y,z);
   await snap('06-familia');
  }
  result.final=await read();
  fs.writeFileSync(path.join(output,'browser.json'),JSON.stringify(result,null,2)+'\n');
  assert.equal(result.final.received,12);assert.equal(result.final.built,8);
  assert.equal(result.final.ledger.uniqueOrigins,12);assert.equal(result.final.families.reduce((sum,f)=>sum+f.count,0),12);
  assert.deepEqual(result.errors,[]);
 }finally {if(browser)await browser.close();server.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
