// Replays the same source snapshot with/without the conveyor world-geometry
// cache. Real Cannon contacts, motors, payloads and energy; DOM/GPU stubs.
// Reports CPU per physics substep, NOT frame rate or browser performance.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),harnessPath=path.join(root,'tests/game-harness.cjs'),gamePath=path.join(root,'assets/js/game.js');
const files=new Map(fs.readdirSync(path.join(root,'assets/js')).filter(n=>n.endsWith('.js')).map(n=>{const p=path.join(root,'assets/js',n);return[p,fs.readFileSync(p,'utf8')];}));
const source=files.get(gamePath),needle='if(cached&&cached.body===hit.g.body&&cached.part===hit.part&&cached.sourceSurfaces===';assert.equal(source.split(needle).length,2);
const harness=fs.readFileSync(harnessPath,'utf8');
function setup(cached){
 const mod=new Module(harnessPath,module);mod.filename=harnessPath;mod.paths=Module._nodeModulePaths(path.dirname(harnessPath));const nativeRequire=mod.require.bind(mod);
 mod.require=name=>name==='node:fs'?{...fs,readFileSync(file,...args){const p=String(file);return p===gamePath?(cached?source:source.replace(needle,needle.replace('if(cached','if(false&&cached'))):files.has(p)?files.get(p):fs.readFileSync(file,...args);}}:nativeRequire(name);mod._compile(harness,harnessPath);
 const game=mod.exports(),{t}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:false,scene:'lab',mode:'playing',phase:'idle'});
 for(let i=0;i<4;i++){
  const kind=i%2?'left':'straight';assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate(kind),t.V(-3+i*2,0,0)));const c=t.conveyors.at(-1),base=t.rotorPart(c.baseId),p=base.p.clone();p.y+=.09;
  const battery=t.makeGroup([{id:t.allocateUnitId(),shape:'cube',weight:1,p,q:base.q.clone()}]),cell=battery.parts[0];cell.mood.energy=1;cell.mood.externalBattery={version:1,ownerId:cell.id,packId:cell.id,enabled:true};assert(t.weld({source:battery,target:base.g,position:battery.body.position.clone(),quaternion:battery.body.quaternion.clone()}));assert(t.conveyorEnsureSurfaces(c));
  const surface=t.conveyorSurfacePoses(c)[0],point=surface.p.vadd(surface.q.vmult(t.V(-surface.size.x*.2,surface.half.y+.05,0)));t.addQubit([point.x,point.y,point.z]);assert(t.startConveyor(c),c.status);
 }
 return game;
}
function snapshot(t){const vector=v=>[v.x,v.y,v.z,...('w'in v?[v.w]:[])];return JSON.stringify({groups:t.groups.map(g=>({parts:g.parts.map(p=>[p.id,p.mood.energy]),p:vector(g.body.position),q:vector(g.body.quaternion),v:vector(g.body.velocity),w:vector(g.body.angularVelocity)})),rotors:t.rotors.map(r=>[r.actualRpm,r.actualTorque,r.enabled]),conveyors:t.conveyors.map(c=>[c.phase,c.speed,c.load,c.running,c.status])});}
const warmup=90,steps=90,repetitions=3,runs={baseline:[],cached:[]},states={baseline:[],cached:[]};let meta;
for(let repetition=0;repetition<repetitions;repetition++)for(const cached of repetition%2?[true,false]:[false,true]){
 const {t}=setup(cached);for(let i=0;i<warmup;i++)t.stepPhysics(1/240);const start=process.cpuUsage();for(let i=0;i<steps;i++)t.stepPhysics(1/240);const used=process.cpuUsage(start),name=cached?'cached':'baseline';runs[name].push((used.user+used.system)/1000/steps);states[name].push(snapshot(t));
 assert(t.conveyors.every(c=>c.running),'all conveyors must remain active');meta={pieces:t.groups.reduce((n,g)=>n+g.parts.length,0),bodies:t.groups.length,rotors:t.rotors.length,contacts:t.world.contacts.length};
}
for(let i=0;i<repetitions;i++)assert.equal(states.baseline[i],states.cached[i],'cache must produce identical physics and energy');
const median=a=>[...a].sort((a,b)=>a-b)[1],before=median(runs.baseline),after=median(runs.cached);
console.log(JSON.stringify({scenario:'2 straight and 2 corner conveyors, real battery and cube loads',...meta,warmup,steps,repetitions,runs,baselineCpuMsPerSubstep:before,cachedCpuMsPerSubstep:after,cpuReductionPercent:100*(1-after/before),identicalPhysicsAndEnergy:true,measures:'CPU per real Cannon substep; DOM/GPU stubs, not FPS'},null,2));
