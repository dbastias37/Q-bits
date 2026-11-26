// Native Chromium + WebGL visual QA of B, using an explicitly isolated paid
// material fixture. This is not a four-worker end-to-end campaign completion.
// QBITS_CHROMIUM=/path/chromium node tests/benchmark-galpon-chain-browser.cjs --output=/tmp/qbits-chain-browser
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.QBITS_PLAYWRIGHT||'playwright');
const args=Object.fromEntries(process.argv.slice(2).map(value=>value.replace(/^--/,'').split('=')));
const root=path.join(__dirname,'..'),output=path.resolve(args.output||'/tmp/qbits-chain-browser');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.ttf':'font/ttf','.wav':'audio/wav','.mp3':'audio/mpeg','.json':'application/json'};
const hooks=`
window.galponChainQA={slot:0,workpieces:[],
 make(shape='cube',credited=false){
  const s=story.galpon,G=QBitsGalponProduction,id=allocateUnitId(),worker=s.initialIds[0],must=value=>{if(!value)throw Error('Paid fixture production failed');};
  G.tick(s,1);must(G.extract(s,id));must(G.take(s,id,worker));must(G.store(s,id,worker));must(G.start(s,'converter',id,'cube'));G.tick(s,1);G.finish(s,'converter');G.tick(s,12);
  if(shape==='coupler'){must(G.start(s,'former',id,'coupler'));G.tick(s,1);G.finish(s,'former');G.tick(s,12);}
  if(credited){G.tick(s,.5,{activeCoolingIds:[id]});must(G.receive(s,[id],'family:1'));must(G.markReleased(s,[id],'family:1'));}
  const slot=this.slot++,g=hangarMakePart(G.record(s,id),V(-5.2+(slot%8)*.17,.07,2.2+Math.floor(slot/8)*.17));must(g);return g;
 },
 prepare(){
  hideStoryDialogue();for(let i=0;i<18;i++)this.make();for(let i=0;i<8;i++)this.make('coupler');
  this.workpieces=Array.from({length:12},()=>this.make('cube',true).parts[0].id);
  QBitsGalponChain.ensure(story.galpon);initHangarChainWorld();story.phase='cadena';updateHangarReadout();return this.read();
 },
 stage(){const arm=robotArms[0],model=robotKinematics(arm),g=rotorPart(this.workpieces[0]).g;
  g.body.position.set(model.point.x,.625,model.point.z);g.body.velocity.set(0,0,0);g.body.angularVelocity.set(0,0,0);g.body.quaternion.set(0,0,0,1);g.body.aabbNeedsUpdate=true;g.body.wakeUp();
  if(poses(robotGripperHit(arm.gripperId).g).some(a=>poses(g).some(b=>obbOverlap(a,b,.0005))))throw Error('Fixture input overlaps the gripper');
  QBitsGalponChain.reintroduce(story.galpon,[g.parts[0].id]);return {pick:[model.point.x,.67,model.point.z],place:[hangarChainLayout().table.x,.575,hangarChainLayout().table.z]};
 },
 aim(point){const [x,y,z]=point,eye=openingFloorHeight()+posture.height;position.splice(0,3,x,eye,z+.7);camera.splice(0,3,...position);yaw=0;pitch=Math.atan2(y-eye,.7);if(robotPoseDraft)updateRobotPoseDraft(performance.now(),true);redraw=true;return robotPoseDraft?{valid:!!robotPoseDraft.solution?.pose,reason:robotPoseDraft.reason,target:robotPoseDraft.target}:null;},
 view(eye,target){eye=[eye[0],openingFloorHeight()+posture.height,eye[2]];position.splice(0,3,...eye);camera.splice(0,3,...eye);yaw=Math.atan2(eye[0]-target[0],eye[2]-target[2]);pitch=Math.atan2(target[1]-eye[1],Math.hypot(target[0]-eye[0],target[2]-eye[2]));redraw=true;renderScene();},
 advance(seconds=12){
  hideStoryDialogue();resumeGame();const start=simTime,clock=performance.now();let calls=0;
  for(let i=0;i<seconds*120;i++){if(navigationJobs.size)runNavigationJobs();stepSimulation(1/120);calls++;if(QBitsGalponChain.status(story.galpon).armDemo)break;}
  const milliseconds=performance.now()-clock;
  return {...this.read(),advanced:simTime-start,timing:{milliseconds,stepCalls:calls,atomicStepHz:120,configuredPhysicsHz:1/FIXED_STEP,msPerCall:milliseconds/calls}};
 },
 sourceReady(){finishHangarSourcePresentation();hideStoryDialogue();resumeGame();return this.read();},
 supplies(kind){const recipe=hangarChainRecipe(kind),count={};for(const g of recipe.groups)for(const p of g.parts)count[p.shape]=(count[p.shape]||0)+1;for(const [shape,n]of Object.entries(count))for(let i=0;i<n;i++)this.make(shape);updateHangarReadout();return count;},
 station(){if(!hangarChainPlaceAssembler())throw Error(hangarChainWorld.message);updateHangarReadout();return this.read();},
 save(){const result=saveCurrentGame();if(!result.ok)throw Error(result.error);return {energyJ:story.galpon.energyJ,spent:{...story.galpon.spent},identities:story.galpon.records.map(r=>r.id),snapshot:result.save.data};},
 read(){const s=story.galpon,ext=gl.getExtension('WEBGL_debug_renderer_info'),arm=robotArms[0];return {scene:story.scene,mode:story.mode,phase:story.phase,seconds:s?.elapsed,energyJ:s?.energyJ,spent:s&&{...s.spent},extracted:s?.extracted,records:s?.records.length,received:s?.received,chain:s?.chain&&QBitsGalponChain.status(s),arm:arm&&{running:arm.running,state:arm.state,status:arm.status,cycles:arm.cycles,repeat:arm.repeat,joints:robotArmRotors(arm).map(r=>({rpm:r.rpm,maxTorque:r.maxTorque,capacity:r.capacity}))},source:powerReservoirs.map(r=>({id:r.id,enabled:r.enabled,maxWatts:r.maxWatts,storedJ:r.cell.mood.energy*r.capacity})),payload:this.workpieces[0]&&rotorPart(this.workpieces[0])&&{position:rotorPart(this.workpieces[0]).g.body.position,zone:hangarChainZone(rotorPart(this.workpieces[0]).g)},belts:conveyors.length,groups:groups.length,bodies:world.bodies.length,tabletOpen:!panel.hidden,webgl:gl.getParameter(gl.VERSION),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),glError:gl.getError(),drawSize:[gl.drawingBufferWidth,gl.drawingBufferHeight]};}
};`;

async function run(){
 fs.mkdirSync(output,{recursive:true});
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
  if(file.endsWith('/assets/js/game.js')){const source=fs.readFileSync(file,'utf8'),at=source.lastIndexOf('})();');assert(at>=0);res.end(source.slice(0,at)+hooks+source.slice(at));}
  else fs.createReadStream(file).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,page;
 const result={scope:'Isolated B fixture: legal paid production for 18 cubes, 8 couplers and twelve model-credited A workpieces; real UI blueprint and pose teaching; actual Cannon arm-to-table delivery. This does not certify the full A-to-80-rotor production loop.',errors:[],consoleErrors:[],captures:[],states:[],layouts:[]};
 const persist=()=>fs.writeFileSync(path.join(output,'browser.json'),JSON.stringify(result,null,2)+'\n');
 try{
  browser=await chromium.launch({executablePath:process.env.QBITS_CHROMIUM||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  result.browser=browser.version();const context=await browser.newContext({viewport:{width:1280,height:800}});page=await context.newPage();page.setDefaultTimeout(12000);
  persist();console.error('Chromium launched',result.browser);
  page.on('pageerror',error=>{result.errors.push(error.message);console.error('pageerror',error.message);});
  page.on('console',message=>{if(message.type()==='error')result.consoleErrors.push(message.text());});
  const state=async label=>{const value=await page.evaluate(()=>galponChainQA.read());result.states.push({label,...value});console.error(label,JSON.stringify(value));persist();return value;};
  const snap=async name=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:path.join(output,name+'.png')});result.captures.push(name+'.png');persist();};
  const openTablet=async()=>{if(!await page.evaluate(()=>galponChainQA.read().tabletOpen))await page.keyboard.press('KeyP');await page.locator('#panel').waitFor({state:'visible'});};
  const galpon=async()=>{await openTablet();await page.locator('#tab-galpon').click();await page.locator('#galpon-chain-panel').scrollIntoViewIfNeeded();};
  const closeTablet=async()=>{if(await page.evaluate(()=>galponChainQA.read().tabletOpen))await page.locator('#resume').click();};
  const layout=async label=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const data=await page.evaluate(()=>{const panel=document.querySelector('#panel'),box=panel.getBoundingClientRect(),elements=[...panel.querySelectorAll('button,input,select')].filter(el=>el.getClientRects().length&&!el.closest('[hidden]'));return {viewport:[innerWidth,innerHeight],documentOverflow:document.documentElement.scrollWidth-innerWidth,panel:{x:box.x,y:box.y,width:box.width,height:box.height,right:box.right,bottom:box.bottom,scrollWidth:panel.scrollWidth,clientWidth:panel.clientWidth},clippedHorizontally:elements.filter(el=>{const b=el.getBoundingClientRect();return b.left<box.left-2||b.right>box.right+2;}).map(el=>({id:el.id,text:el.textContent.trim().slice(0,80),width:el.getBoundingClientRect().width}))};});result.layouts.push({label,...data});persist();assert.equal(data.documentOverflow,0);assert.deepEqual(data.clippedHorizontally,[]);assert(data.panel.x>=0&&data.panel.y>=0&&data.panel.right<=data.viewport[0]&&data.panel.bottom<=data.viewport[1],JSON.stringify(data));};
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});console.error('Boot document loaded');
  await page.locator('#boot-play').click({timeout:90000});console.error('Boot play clicked');await page.locator('#main-galpon').click({timeout:180000});console.error('Galpon menu opened');
  await page.locator('#galpon-workers').selectOption('4');await page.locator('#galpon-start').click();
  await page.waitForFunction(()=>document.body.dataset.gameScene==='galpon'&&window.galponChainQA);
  await page.evaluate(()=>galponChainQA.prepare());await page.evaluate(()=>galponChainQA.view([4.65,1.9,2.7],[2.8,.8,-.35]));
  await snap('01-plano-b-pagado');await galpon();await layout('B panel 1280x800');await snap('02-controles-b');
  await page.locator('#galpon-chain-build').click();await page.locator('#galpon-chain-arm').click();
  const targets=await page.evaluate(()=>galponChainQA.stage());
  for(const [name,height]of [['pick','3'],['place','25']]){
   await page.locator('#arm-'+name+'-height').fill(height);await page.locator('#arm-pose-'+name).click();
   const aim=await page.evaluate(point=>galponChainQA.aim(point),targets[name]);assert(aim.valid,aim.reason);
   await snap('03-postura-'+name);await page.mouse.down({button:'left'});await page.mouse.up({button:'left'});await page.waitForFunction(()=>!document.querySelector('#panel').hidden);
  }
  await page.locator('#arm-motors').evaluate(el=>{el.open=true;});
  for(let joint=0;joint<4;joint++){
   await page.locator('#arm-motor-axis').selectOption(String(joint));await page.locator('#arm-motor-rpm').fill('12');await page.locator('#arm-motor-torque').fill(String([2,4,3,2][joint]));await page.locator('#arm-motor-capacity').fill('64');await page.locator('#arm-apply-motor').click();
  }
  await page.locator('#arm-repeat').check();await layout('Arm controls 1280x800');await snap('04-brazo-configurado');
  await page.locator('#arm-start').click();await closeTablet();const activeRun=await page.evaluate(()=>galponChainQA.advance(25));result.armActiveTiming={...activeRun.timing,simulatedSeconds:activeRun.advanced};
  const delivery=await state('arm delivered');assert.equal(delivery.chain.armDemo,1);assert.equal(delivery.payload.zone,'table');assert.equal(delivery.source.length,1);
  await page.evaluate(()=>galponChainQA.sourceReady());await page.evaluate(()=>galponChainQA.view([4.65,1.9,2.7],[2.8,.8,-.35]));await snap('05-brazo-mesa-real');
  await page.evaluate(()=>galponChainQA.view([1.5,1.5,4.8],[.65,.85,2.65]));await snap('06-fuente-misma-reserva');
  await galpon();await page.locator('#galpon-chain-arm').click();await page.locator('#arm-stop').click();
  for(const kind of ['feedA','feedB']){await page.evaluate(kind=>galponChainQA.supplies(kind),kind);await galpon();await page.locator('#galpon-chain-plan').selectOption(kind);await page.locator('#galpon-chain-build').click();}
  await page.evaluate(()=>galponChainQA.station());await state('stations assembled');
  await closeTablet();await page.evaluate(()=>galponChainQA.view([4.65,1.9,2.7],[3.6,.65,-.85]));await snap('07-estaciones-cadena');
  await galpon();await page.setViewportSize({width:960,height:640});await layout('B panel 960x640');await snap('08-controles-b-960');
  const saved=await page.evaluate(()=>galponChainQA.save());result.saved={energyJ:saved.energyJ,spent:saved.spent,identities:saved.identities.length};
  fs.writeFileSync(path.join(output,'fixture-snapshot.json'),JSON.stringify({scope:result.scope,data:saved.snapshot},null,2)+'\n');
  result.final=await state('saved visual fixture');persist();assert.equal(result.final.glError,0);assert.deepEqual(result.errors,[]);
 }catch(error){
  result.failure=error.message;
  if(page){try{await page.screenshot({path:path.join(output,'failure.png')});result.lastUI=await page.evaluate(()=>({arm:document.querySelector('#arm-status')?.textContent,chain:document.querySelector('#galpon-chain-status')?.textContent,armControlsHidden:document.querySelector('#arm-controls')?.hidden,tab:document.querySelector('#panel')?.dataset.group}));}catch{}}
  throw error;
 }finally{persist();if(browser)await browser.close();server.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
