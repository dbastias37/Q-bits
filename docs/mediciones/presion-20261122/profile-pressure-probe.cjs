// Separate cold-start diagnosis: ONE new game per Node process, no warmup.
// Run each invocation serially, outside the principal benchmark.
// --mode=blocks measures inclusive nested functions. --mode=cpu or heap samples
// the unwrapped source through the in-process Inspector (no listening port).
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),os=require('node:os');
const inspector=require('node:inspector'),{PerformanceObserver}=require('node:perf_hooks'),{execFileSync}=require('node:child_process');
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
assert(args.root,'pass --root explicitly');
const root=path.resolve(args.root),expected=args['expected-commit'];assert(/^[a-f0-9]{40}$/.test(expected||''),'pass --expected-commit explicitly');
const mode=args.mode||'blocks',pieces=Number(args.pieces||2000),hz=Number(args.hz||120),frames=Number(args.frames||4),scenario=args.scenario||'independent';
const budget=Number(args['budget-ms']||30000),out=path.resolve(args.output||'/tmp/startup-probe.json');
assert(['blocks','cpu','heap','off'].includes(mode));assert([60,120,240].includes(hz));
assert(Number.isInteger(pieces)&&pieces>0&&pieces<=2000);assert(Number.isInteger(frames)&&frames>0&&frames<=30);
assert(Number.isFinite(budget)&&budget>0&&budget<=60000);assert(['independent','welded','factory','many-mechanisms','few-articulated'].includes(scenario));
const sha=v=>crypto.createHash('sha256').update(v).digest('hex'),copy=v=>JSON.parse(JSON.stringify(v));
const git=(...a)=>execFileSync('git',['-C',root,...a],{encoding:'utf8'}).trim();
const source=fs.readFileSync(path.join(root,'assets/js/game.js'),'utf8');
const identity={root,commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),status:git('status','--porcelain'),gameSha256:sha(source),harnessSha256:sha(fs.readFileSync(path.join(root,'tests/game-harness.cjs'))),fixturesSha256:sha(fs.readFileSync(path.join(root,'tests/cpu-audit-fixtures.cjs')))};
assert.equal(identity.commit,expected,'wrong source commit');
const phases=[
 'makeGroup','addQubit','addRigidCollisionShapes','rigidColliderLayout','analyzeBlock','registerSpeechGroup',
 'collisionIndex','partQueryIndex','rigidCollisionParts','physicalCollisionParts','mechanicalTopologyIndex','mechanicalComponentGroups','rotorConnectedGroups','powerElectricalGraph',
 'advanceSimulation','stepPhysics','stepSimulation','stepLogic','refreshRotors','updatePowerNetwork','updateConveyors','updateRobotGrips','updateRobotArms','updateGrab','updateRoutes','updateHauling',
 'prepareRotorPower','updateRotorMotors','driveRobotArms','driveConveyors','driveServos','updateFlights','wakeMechanicalRest','prepareMechanicalRest','settleSupportedGroups','walkingFootFriction','productionContactFriction','conveyorImpactConstraints','stabilizeRotors','correctMechanismFloor','finishMechanicalRest','updateRotorPower',
 'onCampaignPad','activePressureButtons','bounds','rotatedGroupBounds','collisionPoseBounds','rigidQueryPoses','tickContactSensors','tickFlightSensors','updateCooling','updateMoods','externallyPoweredInternalIds','rechargeExternalBatteries','updateBlueprints','tickProduction','updateSpeechLogic','onSpeechCollision',
 'updateBatteryLiquids','updateTarget','aimQubit','rayGroupCandidates','renderScene','drawQubits','drawStructureOutlines','drawOutline','drawGroupSolid','rigidCubeBatch','drawWorkshop','drawStoryWorld','drawStoryGlass'
];
function instrument(original){
 const pre=`
 const startupProbe={enabled:true,phase:'moduleInitialization',frame:0,blocks:{},steps:[],resets:[],matrixSets:{},stepMatrixSets:{}};window.__startupProfile=startupProbe;
 function startupWrap(name,fn){return function(...a){if(!startupProbe.enabled)return fn.apply(this,a);const start=performance.now();try{return fn.apply(this,a);}finally{const elapsed=performance.now()-start,b=startupProbe.blocks[name]||(startupProbe.blocks[name]={calls:0,inclusiveMs:0,maxMs:0});b.calls++;b.inclusiveMs+=elapsed;b.maxMs=Math.max(b.maxMs,elapsed);
 if(name==='makeGroup'){b.inputParts=(b.inputParts||0)+(a[0]?.length||0);}if(name==='collisionIndex'){b.inputEntries=(b.inputEntries||0)+(a[0]?.length||0);}
 }};}
 ${phases.map(n=>`if(typeof ${n}==='function')${n}=startupWrap('${n}',${n});`).join('\n')}
 for(const [owner,key,label]of [[CANNON.ArrayCollisionMatrix?.prototype,'reset','Cannon.ArrayCollisionMatrix.reset.native'],[CANNON.GSSolver?.prototype,'solve','Cannon.GSSolver.solve.native'],[CANNON.Body?.prototype,'addShape','Cannon.Body.addShape'],[CANNON.Body?.prototype,'updateMassProperties','Cannon.Body.updateMassProperties'],[CANNON.Body?.prototype,'updateBoundingRadius','Cannon.Body.updateBoundingRadius'],[CANNON.World?.prototype,'addBody','Cannon.World.addBody']])if(owner&&typeof owner[key]==='function')owner[key]=startupWrap(label,owner[key]);
 `;
 const post=`
 CANNON.Body.prototype.computeAABB=startupWrap('Cannon.Body.computeAABB',CANNON.Body.prototype.computeAABB);
 world.broadphase.collisionPairs=startupWrap('world.broadphase.collisionPairs',world.broadphase.collisionPairs);
 world.broadphase.sortList=startupWrap('world.broadphase.sortList',world.broadphase.sortList);
 world.narrowphase.getContacts=startupWrap('world.narrowphase.getContacts',world.narrowphase.getContacts);
 world.solver.solve=startupWrap('world.solver.solve.includingGame',world.solver.solve);
 world.collisionMatrixTick=startupWrap('world.collisionMatrixTick',world.collisionMatrixTick);
 for(const [id,matrix]of [world.collisionMatrix,world.collisionMatrixPrevious].entries()){
  const reset=matrix.reset,set=matrix.set;let writes=0,truthy=0;
  matrix.set=function(...a){if(!startupProbe.enabled)return set.apply(this,a);writes++;if(a[2])truthy++;const before=this.matrix.length,start=performance.now();try{return set.apply(this,a);}finally{const elapsed=performance.now()-start,after=this.matrix.length;for(const table of [startupProbe.matrixSets,startupProbe.stepMatrixSets]){const r=table[id]||(table[id]={calls:0,truthyCalls:0,inclusiveMs:0,maxSingleSetMs:0,growthCalls:0,grownEntries:0,maxLength:0});r.calls++;if(a[2])r.truthyCalls++;r.inclusiveMs+=elapsed;r.maxSingleSetMs=Math.max(r.maxSingleSetMs,elapsed);r.maxLength=Math.max(r.maxLength,after);if(after>before){r.growthCalls++;r.grownEntries+=after-before;}}}};
  matrix.reset=function(...a){if(!startupProbe.enabled)return reset.apply(this,a);const before=this.matrix.length,start=performance.now();try{return reset.apply(this,a);}finally{if(startupProbe.resets.length<256)startupProbe.resets.push({matrixId:id,phase:startupProbe.phase,frame:startupProbe.frame,beforeLength:before,afterLength:this.matrix.length,writesSinceReset:writes,truthyWritesSinceReset:truthy,wallMs:performance.now()-start});writes=truthy=0;}};
 }
 {const native=world.step;world.step=function(...a){if(!startupProbe.enabled)return native.apply(this,a);startupProbe.stepMatrixSets={};const before=this.stepnumber,start=performance.now();try{return native.apply(this,a);}finally{if(startupProbe.steps.length<128)startupProbe.steps.push({step:this.stepnumber,executed:this.stepnumber-before,frame:startupProbe.frame,dt:a[0],wallMs:performance.now()-start,nativePhases:{...this.profile},matrixSets:startupProbe.stepMatrixSets,bodies:this.bodies.length,contacts:this.contacts.length,frictionEquations:this.frictionEquations.length,solverIterations:this.solver.iterations});}};}
 `;
 let transformed=original.slice(0,original.indexOf('\n')+1)+pre+original.slice(original.indexOf('\n')+1);
 const at=transformed.lastIndexOf('})();');assert(at>=0);return transformed.slice(0,at)+post+transformed.slice(at);
}
function topCpu(profile){
 const times=new Map();for(let i=0;i<(profile.samples||[]).length;i++)times.set(profile.samples[i],(times.get(profile.samples[i])||0)+(profile.timeDeltas?.[i]||0));
 return profile.nodes.map(n=>({name:n.callFrame.functionName||'(anonymous)',url:n.callFrame.url,line:n.callFrame.lineNumber+1,selfMs:(times.get(n.id)||0)/1000})).sort((a,b)=>b.selfMs-a.selfMs).slice(0,60);
}
function topHeap(profile){const rows=[];function visit(n){if(n.selfSize)rows.push({name:n.callFrame.functionName||'(anonymous)',url:n.callFrame.url,line:n.callFrame.lineNumber+1,sampledBytes:n.selfSize});for(const c of n.children||[])visit(c);}visit(profile.head);return rows.sort((a,b)=>b.sampledBytes-a.sampledBytes).slice(0,60);}
function cpuDelta(before){const used=process.cpuUsage(before);return {processCpuMs:(used.user+used.system)/1000,processUserMs:used.user/1000,processSystemMs:used.system/1000};}
function memoryDelta(a,b){return Object.fromEntries(Object.keys(a).map(k=>[k,b[k]-a[k]]));}
function clock(t){return {...t.getTickState(),cannonSteps:t.world.stepnumber};}
function clockDelta(a,b){return {physicsSteps:b.physics-a.physics,cannonSteps:b.cannonSteps-a.cannonSteps,logicSteps:b.logic-a.logic,simulatedSeconds:b.simTime-a.simTime,droppedSeconds:b.droppedSeconds-a.droppedSeconds,physicsAccumulator:b.physicsAccumulator,logicAccumulator:b.logicAccumulator};}
function startGc(){
 const samples=[],window={start:Infinity,end:-Infinity};let extraEvents=0;
 const record=entries=>{for(const e of entries)if(e.startTime>=window.start&&e.startTime<=window.end){if(samples.length<4096)samples.push({startTime:e.startTime,duration:e.duration,kind:e.detail?.kind??null});else extraEvents++;}};
 const observer=new PerformanceObserver(list=>record(list.getEntries()));observer.observe({entryTypes:['gc']});
 return {window,async finish(){await new Promise(setImmediate);await new Promise(setImmediate);record(observer.takeRecords());observer.disconnect();return {samples,extraEvents,totalMs:samples.reduce((n,e)=>n+e.duration,0),observedEvents:samples.length+extraEvents};},close:()=>observer.disconnect()};
}
(async()=>{
 fs.mkdirSync(path.dirname(out),{recursive:true});const gc=startGc();let session=null,send=null,profile=null;
 if(mode==='cpu'||mode==='heap'){
  session=new inspector.Session();session.connect();send=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(error,result)=>error?reject(error):resolve(result)));
  if(mode==='cpu'){await send('Profiler.enable');await send('Profiler.setSamplingInterval',{interval:200});await send('Profiler.start');}
  else{await send('HeapProfiler.enable');await send('HeapProfiler.startSampling',{samplingInterval:4096,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});}
 }
 const report={schema:1,method:'Separate startup diagnostic; one new world in one new Node process; zero warmup. Block timings are inclusive and nested, not additive. CPU/heap modes use original unwrapped sources. No forced GC; full-state capture only AFTER profile and measured cold frames. DOM/GPU stubs, not browser Main/FPS/GPU.',identity,probeSha256:sha(fs.readFileSync(__filename)),runtime:{node:process.version,platform:process.platform,cpuModel:os.cpus()[0]?.model,availableParallelism:os.availableParallelism()},configuration:{mode,pieces,hz,frames,scenario,budgetMs:budget,viewport:'1280x720',camera:[0,1.7,0],yaw:0,pitch:0,preferencesBeforeScene:true,physicalWarmup:0,freshProcess:true},stages:[],frames:[]};
 const started=performance.now();gc.window.start=started;let game,f;
 function stage(name,operation,frame=0){
  const p=game?.sandbox.__startupProfile;if(p){p.phase=name;p.frame=frame;p.blocks={};p.steps=[];p.resets=[];p.matrixSets={};}
  const memory=process.memoryUsage(),cpu=process.cpuUsage(),start=performance.now();let value;
  try{value=operation();}finally{
   const wallMs=performance.now()-start,record={name,frame,startOffsetMs:start-started,wallMs,...cpuDelta(cpu),memoryDelta:memoryDelta(memory,process.memoryUsage())};
   const profileState=game?.sandbox.__startupProfile;
   if(profileState){record.blocks=copy(profileState.blocks);record.steps=copy(profileState.steps);record.matrixResets=copy(profileState.resets);record.matrixSets=copy(profileState.matrixSets);}
   report.stages.push(record);
  }
  if(performance.now()-started>budget)throw new Error('bounded startup probe exceeded budget after '+name);
  return value;
 }
 let failure=null;
 try{
  stage('moduleInitialization',()=>{game=require(path.join(root,'tests/game-harness.cjs'))({graphics:false,gameSource:mode==='blocks'?instrument(source):source});});
  const {t,sandbox}=game;f=require(path.join(root,'tests/cpu-audit-fixtures.cjs'))(t);
  stage('labConfiguration',()=>{
   t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
   t.applyPreferences({physicsHz:hz,shadows:'off',music:false,guideVoice:false,footsteps:false,joinSounds:false});assert.equal(t.getPhysicsStep(),1/hz);t.setLook({camera:[0,1.7,0],yaw:0,pitch:0});
   t.world.doProfiling=mode==='blocks';
  });
  stage('sceneConstruction',()=>f.scene(scenario,pieces,scenario==='factory'||scenario==='many-mechanisms'));
  report.initialInventory=copy(f.inventory());report.clockBefore=clock(t);
  for(let frame=1;frame<=frames;frame++){
   const before=clock(t),firstStage=report.stages.length;
   stage('advanceSimulation',()=>t.advanceSimulation(1/60),frame);
   stage('updateBatteryLiquids',()=>t.updateBatteryLiquids(1/60),frame);
   stage('updateTarget',()=>t.updateTarget(),frame);
   stage('renderScene',()=>t.renderScene(),frame);
   const after=clock(t),delta=clockDelta(before,after);
   assert.equal(delta.physicsSteps,hz/60);assert.equal(delta.cannonSteps,delta.physicsSteps);assert(Math.abs(delta.simulatedSeconds-1/60)<1e-8);assert.equal(delta.droppedSeconds,0);
   report.frames.push({frame,stages:report.stages.slice(firstStage).map(s=>s.name),clockBefore:before,clockAfter:after,clockDelta:delta,inventory:copy(f.inventory())});
  }
  report.clockAfter=clock(t);report.finalInventory=copy(f.inventory());report.clockDelta=clockDelta(report.clockBefore,report.clockAfter);report.complete=true;
 }catch(error){failure={message:error.message,stack:error.stack};report.failure=failure;report.complete=false;}
 finally{
  gc.window.end=performance.now();report.measuredWindowWallMs=gc.window.end-started;
  if(game?.sandbox.__startupProfile)game.sandbox.__startupProfile.enabled=false;
  if(game)game.t.world.doProfiling=false;
  if(session){try{profile=(await send(mode==='cpu'?'Profiler.stop':'HeapProfiler.stopSampling')).profile;}finally{session.disconnect();}}
  report.gc=await gc.finish();gc.close();
 }
 if(profile){
  const profilePath=out.replace(/\.json$/,'')+(mode==='cpu'?'.cpuprofile':'.heapprofile');fs.writeFileSync(profilePath,JSON.stringify(profile));report.profileFile=profilePath;report.profileTop=mode==='cpu'?topCpu(profile):topHeap(profile);report.profileSamples=profile.samples?.length??null;
 }
 if(game&&f){const cpu=process.cpuUsage(),start=performance.now();report.finalStateSha256=sha(f.state());report.finalStateCapture={wallMs:performance.now()-start,...cpuDelta(cpu),outsideProfile:true};}
 fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
 process.stdout.write(JSON.stringify({output:out,mode,complete:report.complete,frames:report.frames.length,wallMs:report.measuredWindowWallMs,failure})+'\n');if(failure)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
