// Real game/Cannon CPU benchmark. DOM and GPU calls are stubs: NOT browser FPS.
// node tests/benchmark-selection-conveyors.cjs [baseline-ref] [output.json]
// QBITS_BENCH_VARIANTS=baseline and QBITS_BENCH_TIERS=80,500 allow focused runs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),createGame=require('./game-harness.cjs');
const {createHash}=require('node:crypto');
const preferences=require('../assets/js/preferences.js');
const root=path.resolve(__dirname,'..'),ref=process.argv[2]||'21825fb7dea5cd47a8f5453454d891a40110c97f';
// Regression tests import only the fixture; they must not require Git history
// (for example when CI uses a shallow checkout).
let sources;
const variants=(process.env.QBITS_BENCH_VARIANTS||'baseline,optimized').split(','),tiers=(process.env.QBITS_BENCH_TIERS||'80,500,2000').split(',').map(Number);
const sampleSteps=3,repetitions=3,physicsHz=60,warmupSteps=60;
function pieceCount(t){return t.groups.reduce((n,g)=>n+g.parts.length,0);}
function material(t){return t.groups.flatMap(g=>g.parts.map(p=>[p.id,p.weight,p.shape])).sort((a,b)=>a[0]-b[0]);}
function finiteState(t){for(const g of t.groups)for(const v of [g.body.position,g.body.velocity,g.body.quaternion,g.body.angularVelocity])for(const key of Object.keys(v))if(typeof v[key]==='number')assert(Number.isFinite(v[key]),'Non-finite body state');}
function physicalMetrics(t){return {maximumHingeGapMeters:Math.max(0,...t.rotors.map(r=>t.couplerTip(t.rotorPart(r.aId)).point.distanceTo(t.couplerTip(t.rotorPart(r.bId)).point))),minimumMaterialHeightMeters:Math.min(...t.groups.map(g=>t.bounds(g).min.y)),maximumLinearSpeedMetersPerSecond:Math.max(0,...t.groups.map(g=>g.body.velocity.norm()))};}
function fixture(source,count){
 const game=createGame({gameSource:source,graphics:false}),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});t.applyPreferences({...preferences.defaults(),physicsHz});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.settings.maxCarry=2000;
 let last=null,index=0;const joinsCpuMs=[];
 while(true){
  const row=Math.floor(index/12),part=index%12,kind=part===10||part===11?(row%2?'left':'right'):'straight',record=t.conveyorBlueprintTemplate(kind);
  if(pieceCount(t)+t.mechanismPartCount(record)>count)break;
  let point=t.V(-4,0,-4),q=t.Q();
  if(last){const placement=t.conveyorBlueprintPlacement(record,last);assert(placement);point=placement.point.clone();point.y-=.003;q.setFromAxisAngle(t.V(0,1,0),placement.quarterTurns*Math.PI/2);}
  const before=new Set(t.groups);assert(t.spawnSavedMechanism(record,point,q),'Port-aligned conveyor must fit');const next=t.conveyors.at(-1);
  if(last){const start=process.cpuUsage();assert(t.joinCompletedConveyorBlueprint({conveyorLink:last.baseId},t.groups.filter(g=>!before.has(g))),'Real adjoining frames must weld');const cpu=process.cpuUsage(start);joinsCpuMs.push((cpu.user+cpu.system)/1000);}
  last=next;index++;
 }
 const remainder=count-pieceCount(t);for(let i=0;i<remainder;i++)t.addQubit([5+(i%8)*.18,.045,5+Math.floor(i/8)*.18],1,i%3===0?'pyramid':'cube');
 assert.equal(pieceCount(t),count);assert(t.conveyors.every(c=>t.rotorPart(c.baseId).g===t.rotorPart(last.baseId).g),'Every section shares one rigid frame');
 const original=material(t);for(let i=0;i<warmupSteps;i++)t.stepPhysics(1/physicsHz);
 const base=t.rotorPart(last.baseId),center=base.g.body.position;t.setLook({camera:[center.x,center.y+.12,center.z+1],yaw:0,pitch:0});
 return {t,original,base,joinsCpuMs};
}
function measure(fn){const start=process.cpuUsage();for(let i=0;i<sampleSteps;i++)fn();const cpu=process.cpuUsage(start);return (cpu.user+cpu.system)/1000/sampleSteps;}
function samples(fn){fn();return Array.from({length:repetitions},()=>measure(fn));}
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
function run(variant,count){
 const {t,original,base,joinsCpuMs}=fixture(sources[variant],count),measurements={},physicalStates={};
 measurements.idlePhysics=samples(()=>t.stepPhysics(1/physicsHz));
 t.setSelected({g:base.g,part:base.part});measurements.selectedPhysics=samples(()=>t.stepPhysics(1/physicsHz));measurements.selectedRender=samples(()=>t.renderScene());physicalStates.selected=physicalMetrics(t);
 t.grabQubit({g:base.g,part:base.part,point:base.g.body.position.clone(),distance:1});assert(t.getHeld(),'Stopped conveyor must be movable');
 // Measure the controller alone, then undo its hand/force integration before
 // advancing real physics. Artificial accumulated torque must not bias it.
 const held=t.getHeld(),age=held.age,controllerState=held.items.map(item=>({item,force:item.g.body.force.clone(),torque:item.g.body.torque.clone(),anchor:item.anchorBody?.position.clone(),restQ:item.restQ?.clone(),fixedRotation:item.g.body.fixedRotation,angularDamping:item.g.body.angularDamping,floorLocked:item.floorLocked}));
 measurements.heldUpdate=samples(()=>t.updateGrab(1/physicsHz));held.age=age;
 for(const state of controllerState){const {item}=state,b=item.g.body;b.force.copy(state.force);b.torque.copy(state.torque);if(state.anchor)item.anchorBody.position.copy(state.anchor);item.restQ=state.restQ;item.floorLocked=state.floorLocked;b.angularDamping=state.angularDamping;if(b.fixedRotation!==state.fixedRotation){b.fixedRotation=state.fixedRotation;b.updateMassProperties();}}
 measurements.heldPhysics=samples(()=>t.stepPhysics(1/physicsHz));physicalStates.held=physicalMetrics(t);
 t.keys.add('ShiftLeft');t.keys.add('KeyA');measurements.turningPhysics=samples(()=>t.stepPhysics(1/physicsHz));t.keys.clear();physicalStates.turning=physicalMetrics(t);
 finiteState(t);assert.deepEqual(material(t),original,'Selecting/moving cannot change material');assert.equal(t.conveyors.length,t.rotors.length/3,'Controllers and original rotor identities preserved');
 const physical=t.groups.filter(g=>t.world.bodies.includes(g.body));
 assert(Math.abs(physical.reduce((n,g)=>n+g.body.mass,0)-original.reduce((n,p)=>n+p[1]*.25,0))<1e-7,'Original matter contributes its physical mass exactly once');
 const result={variant,scenePieces:count,conveyors:t.conveyors.length,rigidGroups:t.groups.length,physicalGroups:physical.length,virtualRollers:t.rotors.filter(r=>r.virtualConveyor).length,liveHinges:t.rotors.filter(r=>r.constraint&&t.world.constraints.includes(r.constraint)).length,heldGroups:t.getHeld().items.length,handAnchors:t.getHeld().items.filter(item=>item.anchorBody).length,heldPieces:t.getHeld().items.reduce((n,i)=>n+i.g.parts.length,0),worldBodies:t.world.bodies.length,worldConstraints:t.world.constraints.length,compoundShapes:t.groups.reduce((n,g)=>n+g.body.shapes.length,0),physicalCompoundShapes:physical.reduce((n,g)=>n+g.body.shapes.length,0),physicalMass:physical.reduce((n,g)=>n+g.body.mass,0),materialMass:original.reduce((n,p)=>n+p[1]*.25,0),lastJoinCpuMs:joinsCpuMs.at(-1),maximumJoinCpuMs:Math.max(0,...joinsCpuMs),joinsCpuMs,medianCpuMs:Object.fromEntries(Object.entries(measurements).map(([key,value])=>[key,median(value)])),samplesCpuMs:measurements,physicalStates,finiteStates:true,materialConserved:true};
 t.releaseQubit(false);return result;
}
if(require.main===module){
 sources={baseline:execFileSync('git',['show',ref+':assets/js/game.js'],{cwd:root,encoding:'utf8',maxBuffer:4e6}),optimized:fs.readFileSync(path.join(root,'assets/js/game.js'),'utf8')};
 const results=[];
 for(const tier of tiers)for(const variant of variants){const result=run(variant,tier);results.push(result);console.log(JSON.stringify(result));}
 const report={baseline:ref,node:process.version,sourceSha256:Object.fromEntries(variants.map(variant=>[variant,createHash('sha256').update(sources[variant]).digest('hex')])),physicsHz,sampleSteps,repetitions,warmupSteps,scope:'Process CPU milliseconds per actual physics step, updateGrab call, or renderScene call. Real game and Cannon; DOM/GPU stubs. Warmup 60 steps, three samples per batch, three batches; sequential operation stages. Pure controller force/anchor integration is restored before measuring full simulation. Not browser FPS, GPU timing, or a capacity guarantee.',fixture:'Port-aligned welded serpentine: ten straight modules followed by two alternating corners per row. Exact total 80/500/2000 pieces; remaining material is separate cubes/pyramids on the floor. Selection, stopped grab, and held rotation use production entry points.',results};
 if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');
}
module.exports={fixture};
