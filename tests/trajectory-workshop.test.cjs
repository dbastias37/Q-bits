const test=require('node:test');
const assert=require('node:assert/strict');
const Workshop=require('../assets/js/workshop.js');
const createGame=require('./game-harness.cjs');
const all=()=>Workshop.normalizeProfile({claimed:Array.from({length:20},(_,i)=>i+1),research:Workshop.RESEARCH.map(item=>item.id)});
const piece=()=>({id:51,shape:'cube',weight:1,mood:{name:'Baliza del taller',energy:.63,state:'neutral',blend:[1,0,0]}});
const adapt=(role='beacon',level=1)=>({trajectory:{role,level}});
const restore={sensor:false,battery:1,lightweight:1,movement:1,trajectory:null};

test('[model] trajectory and receiver preserve identity, material and stored energy without changing the research economy',()=>{
 for(const role of ['beacon','receiver']){const original=piece(),before=JSON.stringify(original),plan=Workshop.planPartUpgrade(original,adapt(role),null);assert.equal(plan.error,undefined);assert.equal(plan.part.id,original.id);assert.equal(plan.part.shape,original.shape);assert.equal(plan.part.mood.name,original.mood.name);assert.equal(plan.part.weight,original.weight);assert.equal(plan.part.mood.energy,original.mood.energy);assert.equal(plan.materialDelta,0);assert.equal(plan.material.total,original.weight);assert.equal(plan.storedJ,.63*20);assert.deepEqual(plan.part.mood.trajectory,{version:1,level:1,face:0,role,routeId:null});assert.equal(Workshop.hasAdaptation(plan.part),true);assert.equal(JSON.stringify(original),before);}
 assert.equal(Workshop.RESEARCH.reduce((n,item)=>n+item.cost,0),236);assert.equal(all().credits,4);
});

test('[model] beacon tiers require the existing bench levels and expose the requested ranges',()=>{
 assert.deepEqual(Workshop.SPEC.trajectoryRange,{1:4,2:12,3:23});assert.match(Workshop.planPartUpgrade(piece(),adapt('beacon',2),null).error,/mesa de trabajo 2/);
 const bench2=Workshop.normalizeProfile({claimed:Array.from({length:8},(_,i)=>i+1),research:['bench2']});assert.equal(Workshop.planPartUpgrade(piece(),adapt('beacon',2),bench2).error,undefined);assert.match(Workshop.planPartUpgrade(piece(),adapt('beacon',3),bench2).error,/mesa de trabajo 3/);assert.equal(Workshop.planPartUpgrade(piece(),adapt('beacon',3),all()).error,undefined);
 for(const level of [0,4,NaN,'2'])assert(Workshop.planPartUpgrade(piece(),adapt('beacon',level),all()).error);assert(Workshop.planPartUpgrade(piece(),adapt('receiver',2),all()).error);
});

test('[model] changing tier preserves the face and pairing but changing a linked role is rejected',()=>{
 const initial=Workshop.planPartUpgrade(piece(),adapt('beacon',1),all()).part;initial.mood.trajectory.routeId='route-7';initial.mood.trajectory.face=4;
 const before=JSON.stringify(initial),upgraded=Workshop.planPartUpgrade(initial,adapt('beacon',3),all());assert.equal(upgraded.error,undefined);assert.equal(upgraded.part.mood.trajectory.routeId,'route-7');assert.equal(upgraded.part.mood.trajectory.face,4);assert.equal(upgraded.part.mood.trajectory.level,3);assert.notEqual(upgraded.part.mood.trajectory,initial.mood.trajectory);assert.equal(JSON.stringify(initial),before);
 assert.match(Workshop.planPartUpgrade(initial,adapt('receiver'),all()).error,/Desvincula/);initial.mood.trajectory.routeId=null;assert.equal(Workshop.planPartUpgrade(initial,adapt('receiver'),all()).part.mood.trajectory.role,'receiver');
});

test('[model] incompatible modules and divided or non-cube material cannot acquire a trajectory adaptation',()=>{
 for(const key of ['gripper','externalBattery','production','matter','flight']){const part=piece();part.mood[key]={};assert(Workshop.planPartUpgrade(part,adapt(),all()).error,key);}
 for(const shape of ['coupler','pyramid','tetra'])assert(Workshop.planPartUpgrade({...piece(),shape},adapt(),all()).error);
 for(const patch of [{sensor:true},{battery:2},{lightweight:2},{movement:2}]){const fitted=Workshop.planPartUpgrade(piece(),patch,all()).part;assert(Workshop.planPartUpgrade(fitted,adapt(),all()).error);const beacon=Workshop.planPartUpgrade(piece(),adapt(),all()).part;assert(Workshop.planPartUpgrade(beacon,patch,all()).error);}
 assert(Workshop.planPartUpgrade(piece(),{trajectory:{role:'beacon',level:1,routeId:'forged'}},all()).error);
});

test('[model] restoring returns a plain cube without dropping energy or mutating the source metadata',()=>{
 const adapted=Workshop.planPartUpgrade(piece(),adapt(),all()).part;adapted.mood.trajectory.routeId='route-9';const before=JSON.stringify(adapted),plan=Workshop.planPartUpgrade(adapted,restore,all());assert.equal(plan.error,undefined);assert.equal(plan.part.mood.trajectory,undefined);assert.equal(Workshop.hasAdaptation(plan.part),false);assert.equal(plan.part.weight,adapted.weight);assert.equal(plan.part.mood.energy,adapted.mood.energy);assert.equal(JSON.stringify(adapted),before);
 const bad=piece();bad.mood.trajectory={version:99};assert.equal(Workshop.hasAdaptation(bad),true);assert(Workshop.planPartUpgrade(bad,adapt(),all()).error);assert.equal(Workshop.planPartUpgrade(bad,restore,all()).part.mood.trajectory,undefined);
});

function lab(){
 const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle',progress:{}});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.setWorkshopProfile(Workshop.normalizeProfile());t.setupWorkshop();const p=t.getWorkshopBench().p,g=t.addQubit([p.x,p.y+.055,p.z]);t.setSelected({g,part:g.parts[0]});return {...game,g,id:g.parts[0].id};
}
test('[game] applying a trajectory keeps the same physical body and clones mood metadata into snapshots',()=>{
 const {t,g,id}=lab(),part=g.parts[0],body=g.body,mass=body.mass,energy=part.mood.energy,weight=part.weight;assert(t.applyWorkshopUpgrade(id,adapt()));const hit=t.rotorPart(id);assert.equal(hit.g,g);assert.equal(hit.g.body,body);assert.equal(hit.g.body.mass,mass);assert.equal(hit.part.weight,weight);assert.equal(hit.part.mood.energy,energy);assert.equal(hit.part.mood.trajectory.role,'beacon');
 const copied=t.worldParts(g)[0];assert.notEqual(copied.mood.trajectory,hit.part.mood.trajectory);copied.mood.trajectory.level=3;assert.equal(hit.part.mood.trajectory.level,1);
 const stored={version:1,level:1,face:0,role:'receiver',routeId:null},p=t.getWorkshopBench().p,other=t.makeGroup([{id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(p.x+.2,p.y+.055,p.z),q:t.Q(),mood:{...part.mood,trajectory:stored}}]);assert.notEqual(other.parts[0].mood.trajectory,stored);stored.level=2;assert.equal(other.parts[0].mood.trajectory.level,1);
});

test('[game] workshop choices prepare a level-one beacon and receiver only after explicit apply',()=>{
 const {t,sandbox,g,id}=lab();assert(t.openWorkshopPanel('upgrades'));const panel=t.getWorkshopPanel();panel.choose('upgrade:trajectory');assert.equal(panel.model.allowed,true);assert.equal(panel.model.fields[0].value,1);assert.equal(panel.model.facts[0][1],'4 m');assert.equal(g.parts[0].mood.trajectory,undefined);
 sandbox.document.querySelector('#workshop-apply').dispatchEvent({type:'click'});assert.equal(t.rotorPart(id).part.mood.trajectory.role,'beacon');panel.choose('upgrade:receiver');sandbox.document.querySelector('#workshop-apply').dispatchEvent({type:'click'});assert.equal(t.rotorPart(id).part.mood.trajectory.role,'receiver');
 panel.choose('upgrade:restore');assert.equal(panel.model.action.patch.trajectory,null);sandbox.document.querySelector('#workshop-apply').dispatchEvent({type:'click'});assert.equal(t.rotorPart(id).part.mood.trajectory,undefined);
});

test('[game] a tier change keeps a real pair while restoration explicitly unlinks both endpoints',()=>{
 const {t,g,id}=lab();t.setWorkshopProfile(all());assert(t.applyWorkshopUpgrade(id,adapt()));const p=t.getWorkshopBench().p,end=t.addQubit([p.x+.18,p.y+.055,p.z]),endId=end.parts[0].id;assert(t.applyWorkshopUpgrade(endId,adapt()));
 const system=t.getTrajectorySystem(),start=system.createStart(id);assert(start.ok);assert(system.pair(start.routeId,endId).ok);const routeId=g.parts[0].mood.trajectory.routeId;assert.equal(end.parts[0].mood.trajectory.routeId,routeId);
 assert(t.applyWorkshopUpgrade(id,adapt('beacon',3)));assert.equal(g.parts[0].mood.trajectory.routeId,routeId);assert(system.routes.has(routeId));assert.equal(t.applyWorkshopUpgrade(id,adapt('receiver')),false);assert.equal(end.parts[0].mood.trajectory.routeId,routeId);
 assert(t.applyWorkshopUpgrade(id,restore));assert.equal(g.parts[0].mood.trajectory,undefined);assert.equal(end.parts[0].mood.trajectory.routeId,null);assert.equal(system.routes.has(routeId),false);assert.equal(t.rotorPart(id).g,g);
});
