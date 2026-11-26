// Visual inspection of an actual saved continuous A/B installation. This
// script restores the supplied durable bytes; it does not produce material,
// set milestones, move equipment or advance the factory to claim completion.
// Automatic simulation is stopped so every view shows the same saved instant.
// Native rendering, camera and real DOM tablet controls remain inspectable.
// Optional --measure=true subsequently runs 120 + 600 native 1/120 s steps
// and measures completed WebGL frames separately, without saving that advance.
// QBITS_CHROMIUM=/path/chromium node tests/benchmark-galpon-chain-restored-browser.cjs --checkpoint=/path/final.json --output=/tmp/qbits-chain-restored-browser
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.QBITS_PLAYWRIGHT||'playwright');
const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')));
assert(args.checkpoint,'--checkpoint is required');
const root=path.join(__dirname,'..'),output=path.resolve(args.output||'/tmp/qbits-chain-restored-browser'),checkpoint=path.resolve(args.checkpoint),input=JSON.parse(fs.readFileSync(checkpoint,'utf8'));
assert(Array.isArray(input.entries),'The checkpoint must contain the original localStorage entries.');
const sourceData=JSON.parse(new Map(input.entries).get('qbits.save.galpon.v1')).data;
const hooks=`
const qaRestoredAdvanceSimulation=advanceSimulation;
window.galponRestoredQA={manualClock:true,
 load(){
  if(!continueHangarGame({capture:false}))throw Error(saveSession.message||'Restore failed');
  pause(false);hideStoryDialogue();gameMode('playing');panel.hidden=true;
  if(saveSession.restoreWarnings.length)throw Error(saveSession.restoreWarnings.join(' | '));
  if(hangarChainWorld.arms.some(id=>!robotArms.some(a=>a.gripperId===id)))throw Error('A serialized arm controller is missing');
  updateHangarReadout();renderScene();return this.read();
 },
 view(eye,target){
  position.splice(0,3,eye[0],openingFloorHeight()+posture.height,eye[2]);camera.splice(0,3,...position);
  yaw=Math.atan2(camera[0]-target[0],camera[2]-target[2]);pitch=Math.atan2(target[1]-camera[1],Math.hypot(target[0]-camera[0],target[2]-camera[2]));redraw=true;renderScene();
 },
 render(){updateHangarReadout();renderScene();},
 measure(steps){
  panel.hidden=true;hideStoryDialogue();resumeGame();pause(false);
  const before={simTime,missionSeconds:story.galpon.elapsed,energyJ:story.galpon.energyJ,bodies:world.bodies.length},start=performance.now();
  for(let i=0;i<steps;i++){if(navigationJobs.size)runNavigationJobs();stepSimulation(1/120);}
  const milliseconds=performance.now()-start,simulatedSeconds=simTime-before.simTime;
  const renderTimes=[];for(let i=0;i<14;i++){gl.finish();const t=performance.now();renderScene();gl.finish();if(i>=2)renderTimes.push(performance.now()-t);}
  const sorted=renderTimes.slice().sort((a,b)=>a-b),renderMilliseconds=renderTimes.reduce((a,b)=>a+b,0);
  return {steps,atomicStepHz:120,configuredPhysicsHz:1/FIXED_STEP,simulatedSeconds,simulationMilliseconds:milliseconds,simulationMsPerStep:milliseconds/steps,viewport:[innerWidth,innerHeight],drawSize:[gl.drawingBufferWidth,gl.drawingBufferHeight],renderFrames:renderTimes.length,renderTimesMs:renderTimes,renderMilliseconds,renderMedianMs:sorted[Math.floor(sorted.length/2)],renderP95Ms:sorted[Math.ceil(.95*sorted.length)-1],renderScope:'CPU submission plus completed WebGL/SwiftShader frames after two warmups, excluding simulation; not device FPS.',before,after:{simTime,missionSeconds:story.galpon.elapsed,energyJ:story.galpon.energyJ,bodies:world.bodies.length},glError:gl.getError()};
 },
 read(){
  const s=story.galpon,ext=gl.getExtension('WEBGL_debug_renderer_info');
  return {scene:story.scene,phase:story.phase,seconds:s.elapsed,energyJ:s.energyJ,identities:s.records.map(r=>r.id).sort((a,b)=>a-b),chain:QBitsGalponChain.status(s),warnings:[...saveSession.restoreWarnings],arms:robotArms.map(a=>({id:a.gripperId,running:a.running,state:a.state,cycles:a.cycles,held:robotGrips.get(a.gripperId)?.g.parts.map(p=>p.id)||[]})),followers:[...getTrajectorySystem().followers].map(([id,run])=>({id,routeId:run.routeId,phase:run.drive.flight?.trip?.phase,index:run.drive.flight?.trip?.index,position:run.drive.flight?.component[0]?.body.position})),rotors:rotors.length,belts:conveyors.length,groups:groups.length,bodies:world.bodies.length,tabletOpen:!panel.hidden,automaticPhysicsStopped:this.manualClock,webgl:gl.getParameter(gl.VERSION),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),glError:gl.getError()};
 }
};advanceSimulation=function(dt){return window.galponRestoredQA.manualClock?0:qaRestoredAdvanceSimulation(dt);};`;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.ttf':'font/ttf','.wav':'audio/wav','.mp3':'audio/mpeg','.json':'application/json'};
async function run(){
 fs.mkdirSync(output,{recursive:true});
 const servedGame=fs.readFileSync(path.join(root,'assets/js/game.js'),'utf8');
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
  if(file.endsWith('/assets/js/game.js')){const at=servedGame.lastIndexOf('})();');assert(at>=0);res.end(servedGame.slice(0,at)+hooks+servedGame.slice(at));}
  else fs.createReadStream(file).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,page;
 const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const result={scope:'Real continuous A/B checkpoint, restored in Chromium and frozen at that instant for visual inspection. No material, progress or mechanism poses are staged. Images do not independently certify the preceding journey or the 80-product order.',checkpoint,checkpointSha256:digest(checkpoint),gameSha256:crypto.createHash('sha256').update(servedGame).digest('hex'),documentSha256:digest(path.join(root,'index.html')),expected:{seconds:sourceData.production.elapsed,energyJ:sourceData.production.energyJ,rotors:sourceData.snapshot.rotors.length,followers:sourceData.trajectoryRuntime.length},captures:[],layouts:[],errors:[],consoleErrors:[]};
 const persist=()=>fs.writeFileSync(path.join(output,'browser.json'),JSON.stringify(result,null,2)+'\n');
 try{
  browser=await chromium.launch({executablePath:process.env.QBITS_CHROMIUM||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});result.browser=browser.version();persist();
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.addInitScript(entries=>{for(const [k,v]of entries)localStorage.setItem(k,v);},input.entries);
  page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.consoleErrors.push(m.text());});
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('http://127.0.0.1:'+server.address().port+'/#galpon',{waitUntil:'domcontentloaded'});
  await page.locator('#boot-play').click({timeout:180000});await page.locator('#galpon-continue').waitFor({state:'visible',timeout:180000});
  await page.waitForFunction(()=>document.body.dataset.booting==='false'&&window.galponRestoredQA);
  result.initial=await page.evaluate(()=>galponRestoredQA.load());
  assert.equal(result.initial.seconds,result.expected.seconds);assert.equal(result.initial.energyJ,result.expected.energyJ);assert.equal(result.initial.rotors,result.expected.rotors);assert.equal(result.initial.followers.length,result.expected.followers);
  assert.deepEqual(result.initial.identities,sourceData.production.records.map(r=>r.id).sort((a,b)=>a-b));assert(result.initial.automaticPhysicsStopped);
  const snap=async name=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:path.join(output,name+'.png'),timeout:60000});result.captures.push(name+'.png');persist();};
  await page.evaluate(()=>galponRestoredQA.view([5.1,1.7,3.0],[2.0,.70,-.05]));await snap('01-flota-restaurada');
  await page.evaluate(()=>galponRestoredQA.view([5.65,1.7,1.65],[4.12,.63,-.3]));await snap('02-frio-alimentadores-drones');
  await page.keyboard.press('KeyP');await page.locator('#panel').waitFor({state:'visible'});await page.locator('#tab-galpon').click();
  for(const [width,height]of [[1440,900],[960,640]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>galponRestoredQA.render());await page.locator('#galpon-chain-objective').scrollIntoViewIfNeeded();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const layout=await page.evaluate(()=>{const p=document.querySelector('#panel'),b=p.getBoundingClientRect();return {viewport:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth-innerWidth,panel:{left:b.left,right:b.right,top:b.top,bottom:b.bottom},objective:document.querySelector('#galpon-chain-objective').textContent,help:document.querySelector('#galpon-chain-help').textContent,status:document.querySelector('#galpon-chain-status').textContent,extractionStatus:document.querySelector('#galpon-status').textContent,lineRecipe:document.querySelector('#galpon-recipe').textContent,clipped:[...p.querySelectorAll('button,input,select')].filter(el=>el.getClientRects().length&&!el.closest('[hidden]')).filter(el=>{const r=el.getBoundingClientRect();return r.left<b.left-2||r.right>b.right+2;}).map(el=>el.id)};});
   result.layouts.push(layout);assert.equal(layout.overflow,0);assert.deepEqual(layout.clipped,[]);assert(layout.panel.left>=0&&layout.panel.top>=0&&layout.panel.right<=width&&layout.panel.bottom<=height);await snap('03-objetivos-'+width);
  }
  result.final=await page.evaluate(()=>galponRestoredQA.read());assert.equal(result.final.seconds,result.initial.seconds);assert.equal(result.final.energyJ,result.initial.energyJ);assert.deepEqual(result.final.identities,result.initial.identities);assert.equal(result.final.glError,0);
  if(['1','true'].includes(args.measure)){
   await page.setViewportSize({width:1280,height:800});await page.evaluate(()=>galponRestoredQA.render());
   result.performanceScope='Two consecutive native simulation batches after the frozen visual capture; the original checkpoint is not overwritten.';result.timings=[];
   for(const steps of [120,600]){const timing=await page.evaluate(n=>galponRestoredQA.measure(n),steps);result.timings.push(timing);assert(Math.abs(timing.simulatedSeconds-steps/120)<1e-7);assert.equal(timing.glError,0);persist();}
   result.afterMeasurement=await page.evaluate(()=>galponRestoredQA.read());
  }
  assert.deepEqual(result.errors,[]);assert.deepEqual(result.consoleErrors,[]);
  console.log(JSON.stringify({output,checkpoint,seconds:result.final.seconds,energyJ:result.final.energyJ,followers:result.final.followers,captures:result.captures.length,errors:result.errors.length,consoleErrors:result.consoleErrors.length,glError:result.final.glError}));
 }catch(error){result.failure=error.message;if(page)try{await page.screenshot({path:path.join(output,'failure.png')});}catch{}throw error;}
 finally{persist();if(browser)await browser.close();server.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
