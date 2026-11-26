'use strict';
// Chromium QA of native drone teaching in a real restored A/B checkpoint.
// Only the observer camera and automatic clock are instrumented. Selection,
// stopping, teaching, wheel adjustments, confirmation and cancellation use
// native DOM/mouse/keyboard controls. No material or body pose is staged.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.QBITS_PLAYWRIGHT||'playwright');
const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')));
assert(args.checkpoint,'--checkpoint is required');
const root=path.join(__dirname,'..'),output=path.resolve(args.output||'/tmp/qbits-drone-teaching-browser'),checkpoint=path.resolve(args.checkpoint),input=JSON.parse(fs.readFileSync(checkpoint,'utf8'));
const receiver=Number(args.receiver||295),sample=Number(args.sample||521),original=JSON.parse(new Map(input.entries).get('qbits.save.galpon.v1')).data;
const hooks=`
const qaDroneTeachingAdvance=advanceSimulation;
window.droneTeachingQA={manualClock:true,
 load(){
  if(!continueHangarGame({capture:false}))throw Error(saveSession.message||'Restore failed');
  pause(false);hideStoryDialogue();gameMode('playing');panel.hidden=true;
  if(saveSession.restoreWarnings.length)throw Error(saveSession.restoreWarnings.join(' | '));
  updateHangarReadout();renderScene();return this.read();
 },
 view(eye,target){
  position.splice(0,3,eye[0],openingFloorHeight()+posture.height,eye[2]);camera.splice(0,3,...position);
  yaw=Math.atan2(camera[0]-target[0],camera[2]-target[2]);pitch=Math.atan2(target[1]-camera[1],Math.hypot(target[0]-camera[0],target[2]-camera[2]));
  redraw=true;if(logisticsPoseDraft)updateLogisticsPoseDraft(performance.now(),true);updateTarget();renderScene();
  return {eye:[...camera],target,rayPart:aimQubit(4,direction())?.part.id||null,preview:this.preview()};
 },
 part(id){const h=rotorPart(id);if(!h)return null;const b=bounds(h.g);return {id,p:[h.p.x,h.p.y,h.p.z],min:[b.min.x,b.min.y,b.min.z],max:[b.max.x,b.max.y,b.max.z],center:[b.center.x,b.center.y,b.center.z]};},
 preview(){const d=logisticsPoseDraft,p=d?.preview;if(!d)return null;return {name:d.name,valid:!!p?.valid,reason:d.reason,clearance:d.clearance??null,ghostParts:p?.ghostPoses?.length||0,loadPoses:p?.loadPoses?.length||0,target:p?.target,surface:p?.surface,candidateId:p?.candidate?.part?.id||null,height:p?.height,suspended:simulationSuspended(),notice:document.querySelector('#notice').textContent,targetText:targetLabel.textContent};},
 physical(){
  const v=p=>[p.x,p.y,p.z],q=p=>[p.x,p.y,p.z,p.w];
  return {seconds:story.galpon.elapsed,energyJ:story.galpon.energyJ,records:JSON.parse(JSON.stringify(story.galpon.records)),
   bodies:world.bodies.map(b=>({id:b.id,p:v(b.position),q:q(b.quaternion),mass:b.mass})),
   parts:groups.flatMap(g=>g.parts.map(p=>({id:p.id,shape:p.shape,weight:p.weight,energy:p.mood.energy,matter:p.mood.matter,offset:v(p.offset),q:q(p.q)}))),
   families:serializeFamilies(),cargos:cargos.map(c=>({id:c.id,rawId:c.rawId,p:v(c.body.position),q:q(c.body.quaternion)}))};
 },
 read(){const s=story.galpon,ext=gl.getExtension('WEBGL_debug_renderer_info');return {seconds:s.elapsed,energyJ:s.energyJ,chain:QBitsGalponChain.status(s),warnings:[...saveSession.restoreWarnings],bodies:world.bodies.length,groups:groups.length,rotors:rotors.length,followers:[...getTrajectorySystem().followers].map(([id,r])=>({id,phase:r.drive.flight?.trip?.phase})),webgl:gl.getParameter(gl.VERSION),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),glError:gl.getError()};},
 render(){if(logisticsPoseDraft)updateLogisticsPoseDraft(performance.now(),true);updateHangarReadout();updateTarget();renderScene();},
 program(id){const n=getTrajectorySystem().nodes.get(id),route=getTrajectorySystem().routeFor(id);return {routeId:route?.id,points:route?.points,loop:route?.loop,logistics:trajectoryLogisticsConfig(n),status:trajectoryPanelSnapshot(id)};}
};advanceSimulation=function(dt){return droneTeachingQA.manualClock?0:qaDroneTeachingAdvance(dt);};`;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.ttf':'font/ttf','.wav':'audio/wav','.mp3':'audio/mpeg','.json':'application/json'};
async function run(){
 fs.mkdirSync(output,{recursive:true});const served=fs.readFileSync(path.join(root,'assets/js/game.js'),'utf8');
 const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
  if(file.endsWith('/assets/js/game.js')){const at=served.lastIndexOf('})();');res.end(served.slice(0,at)+hooks+served.slice(at));}else fs.createReadStream(file).pipe(res);
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
 const result={scope:'Native drone pickup/drop teaching in a real restored checkpoint, automatic physics frozen. Camera instrumented; no construction, cargo movement, physical flight or full manual session is claimed.',checkpoint,checkpointSha256:hash(fs.readFileSync(checkpoint)),gameSha256:hash(served),documentSha256:hash(fs.readFileSync(path.join(root,'index.html'))),receiver,sample,captures:[],states:[],checks:[],layouts:[],errors:[],consoleErrors:[]};
 const persist=()=>fs.writeFileSync(path.join(output,'browser.json'),JSON.stringify(result,null,2)+'\n');let browser,page,baseline;
 try{
  browser=await chromium.launch({executablePath:process.env.QBITS_CHROMIUM||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});result.browser=browser.version();persist();
  const context=await browser.newContext({viewport:{width:1440,height:900}});await context.addInitScript(entries=>{for(const [k,v]of entries)localStorage.setItem(k,v);},input.entries);
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.consoleErrors.push(m.text());});await page.emulateMedia({reducedMotion:'reduce'});
  const snap=async name=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:path.join(output,name+'.png'),timeout:60000});result.captures.push(name+'.png');persist();};
  const unchanged=async label=>{const value=await page.evaluate(()=>droneTeachingQA.physical()),same=JSON.stringify(value)===JSON.stringify(baseline);result.checks.push({label,identicalPhysicalState:same,sha256:hash(JSON.stringify(value)),bodies:value.bodies.length,parts:value.parts.length,energyJ:value.energyJ,seconds:value.seconds});persist();assert(same,label+' changed physical state');};
  const preview=async label=>{await page.evaluate(()=>droneTeachingQA.render());const p=await page.evaluate(()=>droneTeachingQA.preview());result.states.push({label,...p});persist();return p;};
  const view=async(eye,target)=>page.evaluate(({eye,target})=>droneTeachingQA.view(eye,target),{eye,target});
  await page.goto('http://127.0.0.1:'+server.address().port+'/#galpon',{waitUntil:'domcontentloaded'});await page.locator('#boot-play').click({timeout:180000});await page.locator('#galpon-continue').waitFor({state:'visible',timeout:180000});await page.waitForFunction(()=>document.body.dataset.booting==='false'&&window.droneTeachingQA);
  result.initial=await page.evaluate(()=>droneTeachingQA.load());assert.equal(result.initial.seconds,original.production.elapsed);assert.equal(result.initial.energyJ,original.production.energyJ);baseline=await page.evaluate(()=>droneTeachingQA.physical());result.initialPhysicalSha256=hash(JSON.stringify(baseline));
  const target=await page.evaluate(id=>droneTeachingQA.part(id),receiver);assert(target);await page.mouse.move(720,450);
  let aimed=null;for(const [dx,dz]of [[1,0],[1,.5],[0,1],[-1,0],[0,-1]]){const eye=[target.p[0]+dx,1.7,target.p[2]+dz];aimed=await view(eye,target.p);if(aimed.rayPart===receiver)break;}
  assert.equal(aimed.rayPart,receiver,'native ray must select the actual receiver');result.receiverView=aimed;
  await page.mouse.click(720,450,{button:'right'});await page.locator('#command-menu').waitFor({state:'visible'});assert.match(await page.locator('#command-title').textContent(),/Receptor de trayectoria/);await page.locator('#command-actions button').filter({hasText:'Configurar recorrido'}).click();await page.locator('#trajectory-screen').waitFor({state:'visible'});
  await page.locator('#trajectory-stop').click();await page.locator('#trajectory-teach-pick').waitFor({state:'visible'});assert(await page.locator('#trajectory-teach-pick').isEnabled());await unchanged('native route stop on the ground');await snap('01-controles-ensenanza');
  result.beforeProgram=await page.evaluate(id=>droneTeachingQA.program(id),receiver);
  await page.locator('#trajectory-teach-pick').click();await page.waitForFunction(()=>!!droneTeachingQA.preview());
  const load=await page.evaluate(id=>droneTeachingQA.part(id),sample);assert(load);const pick=[load.center[0],load.max[1],load.center[2]],eye=[pick[0]+.62,1.7,pick[2]+.9];await view(eye,pick);
  let p=await preview('valid pickup');assert(p.valid,p.reason);assert.equal(p.candidateId,sample);assert(p.suspended);assert(p.ghostParts>0);assert.match(p.targetText,/Recogida.*Clic para guardar/);assert.doesNotMatch(p.targetText,/tomar selección/);
  result.nativeTeachingPause=await page.evaluate(async()=>{
   const qa=droneTeachingQA,before=JSON.stringify(qa.physical()),start=performance.now();let frames=0,suspended=true;qa.manualClock=false;
   try{await new Promise(resolve=>{const next=()=>{suspended=suspended&&!!qa.preview()?.suspended;if(++frames===8)resolve();else requestAnimationFrame(next);};requestAnimationFrame(next);});}
   finally{qa.manualClock=true;}
   return {frames,milliseconds:performance.now()-start,instrumentedClockReleased:true,nativePauseObserved:suspended,identicalPhysicalState:JSON.stringify(qa.physical())===before};
  });assert(result.nativeTeachingPause.nativePauseObserved&&result.nativeTeachingPause.identicalPhysicalState);persist();await snap('02-recogida-azul');await unchanged('blue preview');
  for(let i=0;i<12;i++)await page.mouse.wheel(0,-100);
  p=await preview('invalid pickup height');assert.equal(p.valid,false);assert(p.ghostParts>0);assert.match(p.reason,/Alcance|alcance|fuera|cm|Colisión/);assert(p.targetText.includes(p.reason));assert.doesNotMatch(p.reason,/ajusta el brazo/);await snap('03-recogida-roja');
  await page.keyboard.press('Enter');assert(await page.evaluate(()=>!!droneTeachingQA.preview()),'invalid confirmation must leave preview open');await unchanged('rejected confirmation');
  await page.mouse.click(720,450,{button:'right'});await page.locator('#trajectory-screen').waitFor({state:'visible'});await unchanged('cancel invalid pickup');assert.deepEqual(await page.evaluate(id=>droneTeachingQA.program(id),receiver),result.beforeProgram);
  await page.locator('#trajectory-teach-pick').click();await view(eye,pick);p=await preview('pickup before confirmation');assert(p.valid,p.reason);await page.keyboard.press('Enter');await page.locator('#trajectory-screen').waitFor({state:'visible'});await unchanged('confirm pickup');
  result.pickProgram=await page.evaluate(id=>droneTeachingQA.program(id),receiver);assert.equal(result.pickProgram.logistics.pick.sampleId,sample);
  await page.locator('#trajectory-teach-place').click();await page.waitForFunction(()=>!!droneTeachingQA.preview());
  const drop=[4.04,.575,.45];await view([4.04,1.7,1.0],drop);p=await preview('valid drop');assert(p.valid,p.reason);assert(p.loadPoses>0);assert(p.suspended);assert.match(p.targetText,/Caída estimada.*Clic para guardar/);await snap('04-entrega-azul');await unchanged('drop preview');
  await page.keyboard.press('Enter');result.dropConfirmation=await page.locator('#notice').textContent();persist();await page.locator('#trajectory-screen').waitFor({state:'visible'});await unchanged('confirm drop');result.afterProgram=await page.evaluate(id=>droneTeachingQA.program(id),receiver);assert(result.afterProgram.logistics.pick&&result.afterProgram.logistics.place);
  await page.locator('#trajectory-close').click();await page.keyboard.press('KeyP');await page.locator('#panel').waitFor({state:'visible'});await page.locator('#tab-galpon').click();
  await page.setViewportSize({width:960,height:640});await page.locator('#galpon-recipe').scrollIntoViewIfNeeded();await page.evaluate(()=>droneTeachingQA.render());
  result.help=await page.evaluate(()=>({recipe:document.querySelector('#galpon-recipe').textContent,status:document.querySelector('#galpon-status').textContent,objective:document.querySelector('#galpon-chain-objective').textContent,help:document.querySelector('#galpon-chain-help').textContent}));
  assert.match(result.help.recipe,/Primera línea.*8\s*\/\s*8/);assert.match(result.help.recipe,/cada|propio material/);assert.match(result.help.status,/Primera línea recuperada|alimentando|completada|recepción del brazo/);
  const layout=await page.evaluate(()=>{const p=document.querySelector('#panel'),b=p.getBoundingClientRect();return {viewport:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth-innerWidth,panel:{left:b.left,right:b.right,top:b.top,bottom:b.bottom},clipped:[...p.querySelectorAll('button,input,select')].filter(el=>el.getClientRects().length&&!el.closest('[hidden]')).filter(el=>{const r=el.getBoundingClientRect();return r.left<b.left-2||r.right>b.right+2;}).map(el=>el.id)};});result.layouts.push(layout);assert.equal(layout.overflow,0);assert.deepEqual(layout.clipped,[]);assert(layout.panel.left>=0&&layout.panel.top>=0&&layout.panel.right<=960&&layout.panel.bottom<=640);await snap('05-ayuda-b-960');await unchanged('tablet and help review');
  result.final=await page.evaluate(()=>droneTeachingQA.read());assert.equal(result.final.glError,0);assert.deepEqual(result.errors,[]);assert.deepEqual(result.consoleErrors,[]);persist();console.log(JSON.stringify({output,captures:result.captures.length,checks:result.checks.length,seconds:result.final.seconds,energyJ:result.final.energyJ,errors:result.errors,glError:result.final.glError}));
 }catch(error){result.failure=error.message;if(page)try{result.lastPreview=await page.evaluate(()=>droneTeachingQA.preview());result.lastUI=await page.evaluate(()=>({notice:document.querySelector('#notice')?.textContent,mode:document.body.dataset.gameMode,command:document.querySelector('#command-title')?.textContent,trajectory:document.querySelector('#trajectory-status')?.textContent}));await page.screenshot({path:path.join(output,'failure.png'),timeout:60000});}catch{}throw error;}
 finally{persist();if(browser)await browser.close();server.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
