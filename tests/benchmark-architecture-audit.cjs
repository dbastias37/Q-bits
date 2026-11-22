// Exact work counters over production functions and real Cannon, with DOM/GPU
// stubs. This is not an FPS or wall-time benchmark. No files are written.
// Usage: node tests/benchmark-architecture-audit.cjs
// Optional: QBITS_GAME_SOURCE=/path/to/game.js node tests/benchmark-architecture-audit.cjs
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const referenceRoot=process.env.QBITS_REFERENCE_ROOT?path.resolve(process.env.QBITS_REFERENCE_ROOT):path.resolve(__dirname,'..');
const createGame=require(path.join(referenceRoot,'tests/game-harness.cjs'));
const sourceFile=process.env.QBITS_GAME_SOURCE?path.resolve(process.env.QBITS_GAME_SOURCE):path.join(referenceRoot,'assets/js/game.js');
const originalSource=fs.readFileSync(sourceFile,'utf8');
const names=['rayPart','poses','partPose','corners','bounds','touchingUnitFaces','batteryVisualPacks','externalBatteryPackComponents','sensorReading','sensorContactActive','sensorMotion','sensorWeight','refreshRotors','virtualConveyorCandidates','propellerLayout','worldParts','copyMood','submitDraw','drawSharpShadow','rayGroupCandidates','rayBoundsOverlap','partQueryIndex','externalBatteryGeometry','buildExternalBatteryComponents','buildBatteryVisualGeometry','sensorContactsForBody'];
const hooks=`window.__arch={counts:{},reset(){this.counts={};},api:{coolers,sensorMotion:(...a)=>sensorMotion(...a),sensorContactActive:(...a)=>sensorContactActive(...a),updateFlights,drawWorkshop,drawBatteriesTransparent}};\n`+
 names.map(name=>`if(typeof ${name}==='function'){const original=${name};${name}=function(...args){const c=window.__arch.counts;c['${name}']=(c['${name}']||0)+1;${name==='partQueryIndex'?`if(args[0].partQueryCache?.parts!==args[0].parts)c['partQueryIndex.builds']=(c['partQueryIndex.builds']||0)+1;`:''}${name==='sensorMotion'?`c['${name}.bodyCandidates']=(c['${name}.bodyCandidates']||0)+world.bodies.length;`:''}return original.apply(this,args);};}`).join('\n');
let source=originalSource.replaceAll('QBitsWorkshop.partState(part)','(window.__arch&&(window.__arch.counts["partState.scan"]=(window.__arch.counts["partState.scan"]||0)+1),QBitsWorkshop.partState(part))');
// Count executed loop iterations, not the global list size. The optimized
// query reads per-body lists; index construction is a separate charged cost.
for(const [name,next]of [['sensorWeight','sensorMotion'],['sensorContactActive','sensorConfig']]){
 const start=source.indexOf('function '+name+'('),end=source.indexOf('function '+next+'(',start);
 const section=source.slice(start,end).replace(/for\(const (c|contact) of (world\.contacts|sensorContactsForBody\([^)]*\))\)\{/g,match=>match+`{const c=window.__arch.counts;c['${name}.contactCandidates']=(c['${name}.contactCandidates']||0)+1;}`);
 source=source.slice(0,start)+section+source.slice(end);
}
source=source.replace('const byBody=new Map();for(const contact of physicsWorld.contacts){','const byBody=new Map();for(const contact of physicsWorld.contacts){if(window.__arch){const c=window.__arch.counts;c["contactIndex.buildCandidates"]=(c["contactIndex.buildCandidates"]||0)+1;}');
const end=source.lastIndexOf('})();');if(end<0)throw new Error('Game closure not found');
source=source.slice(0,end)+hooks+source.slice(end);
function lab(){
 const values=new Map(),writes=[];
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,String(value));writes.push({key,bytes:Buffer.byteLength(value)});}};
 const game=createGame({gameSource:source,graphics:false,storage}),{t,sandbox}=game;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 t.setLook({camera:[0,1.7,0],yaw:0,pitch:0});
 return {...game,arch:sandbox.__arch,values,writes};
}
function grid(t,nx,ny,nz,center=t.V(0,.045,0),shape='cube'){
 const parts=[];
 for(let y=0;y<ny;y++)for(let z=0;z<nz;z++)for(let x=0;x<nx;x++)parts.push({id:t.allocateUnitId(),shape,weight:1,p:center.vadd(t.V((x-(nx-1)/2)*.09,(y-(ny-1)/2)*.09,(z-(nz-1)/2)*.09)),q:t.Q()});
 return t.makeGroup(parts);
}
function distant(t,count=100,per=10){for(let i=0;i<count;i++)grid(t,per,1,1,t.V(4+(i%5)*1.5,.045,Math.floor(i/5)*.4-4));}
function measure(game,label,fn,extra={}){game.arch.reset();const result=fn();return {label,...extra,counts:{...game.arch.counts},result};}
const reports=[];
{
 const game=lab(),{t}=game;distant(t);
 reports.push(measure(game,'pick-empty-space',()=>!!t.aimQubit(),{pieces:1000,withinReach:0}));
 reports.push(measure(game,'target-ui-empty-space',()=>{t.updateTarget();return null;},{pieces:1000,withinReach:0}));
 reports.push(measure(game,'no-sensors-tick',()=>t.tickContactSensors(1/120),{pieces:1000,sensors:0}));
 reports.push(measure(game,'no-sensors-render',()=>game.arch.api.drawWorkshop(),{pieces:1000,sensors:0}));
 reports.push(measure(game,'no-drones-tick',()=>game.arch.api.updateFlights(1/120),{pieces:1000,groups:100,drones:0}));
}
{
 const game=lab(),{t}=game;distant(t,94,10);const lifted=grid(t,4,4,4,t.V(0,1,0));
 t.setHeld({g:lifted,items:[{g:lifted}]});
 reports.push(measure(game,'landing-preview-far-obstacles',()=>t.landingProjection(lifted).delta,{heldPieces:64,otherPieces:940,underneath:0}));
}
{
 const game=lab(),{t,arch}=game;distant(t);
 for(let i=0;i<8;i++)if(!t.createCooler(t.V(-7+(i%4)*1.2,0,-2+Math.floor(i/4)*1.2)))throw new Error('Cooler fixture creation failed');
 // Warm exact bounds so the count represents repeated steady-state work.
 for(const g of t.groups)t.bounds(g);
 reports.push(measure(game,'coolers-far-pieces',()=>{t.updateCooling(1/120);return arch.api.coolers.map(c=>c.occupants);},{coolers:8,pieces:1000,withinCoolers:0}));
}
{
 const game=lab(),{t}=game;
 for(let i=0;i<32;i++){
  const g=grid(t,3,1,1,t.V((i%8)*.4,.045,Math.floor(i/8)*.2));
  for(const p of g.parts){p.mood.externalBattery={version:1,ownerId:p.id,packId:g.parts[0].id,enabled:false};p.mood.energy=1;}
 }
 reports.push(measure(game,'full-battery-recharge-tick',()=>t.rechargeExternalBatteries(1/120),{packs:32,cells:96,charge:1}));
 reports.push(measure(game,'battery-liquid-frame',()=>t.updateBatteryLiquids(1/60),{packs:32,cells:96}));
 reports.push(measure(game,'battery-opaque-render',()=>{for(const g of t.groups)t.drawGroupSolid(g);},{packs:32,cells:96}));
 reports.push(measure(game,'battery-transparent-render',()=>game.arch.api.drawBatteriesTransparent(),{packs:32,cells:96}));
 reports.push(measure(game,'battery-warm-complete-frame',()=>{t.updateBatteryLiquids(1/60);for(const g of t.groups)t.drawGroupSolid(g);game.arch.api.drawBatteriesTransparent();},{packs:32,cells:96}));
}
{
 const game=lab(),{t}=game;
 for(let i=0;i<128;i++)t.addQubit([4+(i%16)*.2,.044,-3+Math.floor(i/16)*.2]);
 // Measure the reading routines separately from sensor discovery/commands.
 // Real floor contacts from one native step; no synthetic contact list.
 t.world.step(1/120);
 const hits=t.groups.slice(0,16).map(g=>({g,part:g.parts[0],...t.poses(g)[0]}));
 reports.push(measure(game,'weight-sensors-same-contact-step',()=>hits.map(hit=>t.sensorReading(hit,{mode:'weight',weight:1}).value),{readings:16,bodies:t.world.bodies.length,contacts:t.world.contacts.length}));
 reports.push(measure(game,'contact-sensors-same-contact-step',()=>hits.map(hit=>game.arch.api.sensorContactActive(hit)),{readings:16,bodies:t.world.bodies.length,contacts:t.world.contacts.length}));
 for(const g of t.groups)g.body.velocity.x=.1;
 reports.push(measure(game,'motion-sensors-same-sample',()=>hits.map(hit=>game.arch.api.sensorMotion(hit,50,new Set([hit.g.body]))),{readings:16,bodies:t.world.bodies.length}));
}
{
 const game=lab(),{t}=game;grid(t,10,10,10,t.V(0,.45,0));
 t.getVisuals().shadows='off';t.drawQubits();
 reports.push(measure(game,'solid-no-shadow',()=>t.drawQubits(),{pieces:1000,groups:1}));
 t.getVisuals().shadows='soft';reports.push(measure(game,'solid-soft-shadow',()=>t.drawQubits(),{pieces:1000,groups:1}));
 t.getVisuals().shadows='sharp';reports.push(measure(game,'solid-sharp-shadow',()=>t.drawQubits(),{pieces:1000,groups:1}));
}
{
 const game=lab(),{t,sandbox,writes}=game;distant(t);const nativeJSON=sandbox.JSON;
 // Replace this sandbox's JSON binding, never the process-wide JSON object.
 sandbox.JSON={
  parse(...args){const c=game.arch.counts;c['JSON.parse']=(c['JSON.parse']||0)+1;c['JSON.parse.bytes']=(c['JSON.parse.bytes']||0)+Buffer.byteLength(args[0]);return nativeJSON.parse(...args);},
  stringify(...args){const result=nativeJSON.stringify(...args),c=game.arch.counts;c['JSON.stringify']=(c['JSON.stringify']||0)+1;c['JSON.stringify.bytes']=(c['JSON.stringify.bytes']||0)+Buffer.byteLength(result||'');return result;}
 };
 reports.push(measure(game,'save-first',()=>t.saveCurrentGame().ok,{pieces:1000}));
 const initial=writes.length;
 reports.push(measure(game,'save-identical-state-again',()=>t.saveCurrentGame().ok,{pieces:1000}));
 reports.push({label:'save-storage',secondWriteCount:writes.length-initial,latest:writes.at(-1)});
}
console.log(JSON.stringify({sourceSha256:crypto.createHash('sha256').update(originalSource).digest('hex'),node:process.version,method:'Production functions and real Cannon with injected work counters. DOM/GPU stubs; not browser FPS or timing. Contact counters record executed iterations and charge index builds separately; motion bodyCandidates retains global list-size count.',reports},null,2));
