const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}
function recipe(t,kind='hinge',degrees=0){
 const reference=kind==='hinge'?[0,0,1,0]:[0,0,0,1],turn=t.Q();turn.setFromAxisAngle(kind==='hinge'?t.V(0,0,1):t.V(0,1,0),degrees*Math.PI/180);
 const base=t.Q();base.set(...reference);const bq=turn.mult(base),tip=t.V(0,.15,0),local=kind==='hinge'?t.V(0,.03375,0):t.V(0,-.045,0),bp=tip.vsub(bq.vmult(local));
 return {version:1,type:'rotor',name:kind==='hinge'?'Servo bisagra':'Servo pivote',groups:[{parts:[{key:0,shape:'pyramid',weight:1/6,p:[0,.11625,0],q:[0,0,0,1]}]},{parts:[{key:1,shape:kind==='hinge'?'pyramid':'cube',weight:kind==='hinge'?1/6:1,p:[bp.x,bp.y,bp.z],q:[bq.x,bq.y,bq.z,bq.w]}]}],joints:[{a:0,b:1,rpm:30,direction:1,moving:'b',mount:'wheel',maxTorque:1,capacity:32,enabled:false,servo:{kind,min:-60,max:60,speed:45,mode:'repeat',target:30,reference,direction:1}}]};
}
for(const kind of ['pivot','hinge'])test(`${kind} mechanism saves a bent pose, clones config and restores stopped`,()=>{
 const {t}=lab(),record=recipe(t,kind,25);assert(t.savedMechanismValid(record));
 const rotor=t.spawnSavedMechanism(record,t.V(0,.1,0));assert(rotor?.servo);assert.equal(rotor.enabled,false);
 rotor.enabled=true;
 const saved=t.saveMechanism(rotor);assert(saved);assert.equal(saved.name,record.name);assert(t.savedMechanismValid(saved));assert.equal(saved.joints[0].enabled,true);
 const copied=t.copySavedMechanism(saved);copied.joints[0].servo.reference[0]=.123;assert.notEqual(saved.joints[0].servo.reference[0],.123);assert.notEqual(rotor.servo.reference[0],.123);
 const next=t.spawnSavedMechanism(saved,t.V(2,.1,0));assert(next);assert.equal(next.enabled,false);assert.deepEqual(plain(next.servo),plain(rotor.servo));
 assert.notEqual(next.aId,rotor.aId);assert.notEqual(next.bId,rotor.bId);
 const a=t.rotorPart(next.aId),b=t.rotorPart(next.bId),rel=a.q.inverse().mult(b.q),original=t.rotorPart(rotor.aId).q.inverse().mult(t.rotorPart(rotor.bId).q);
 assert(Math.abs(rel.x*original.x+rel.y*original.y+rel.z*original.z+rel.w*original.w)>.999999);
});
test('lab restore preserves identities, reserves and servo reference without restarting',()=>{
 const {t}=lab(),r=t.spawnSavedMechanism(recipe(t,'hinge',-35),t.V(0,.2,0));assert(r);
 t.rotorPart(r.aId).part.mood.energy=.27;t.rotorPart(r.bId).part.mood.energy=.61;r.enabled=true;
 const saved=t.saveLab(),ids=t.groups.flatMap(g=>g.parts.map(p=>p.id)).sort(),config=plain(r.servo);
 t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);
 assert.equal(t.rotors.length,1);assert.equal(t.rotors[0].enabled,false);assert.deepEqual(plain(t.rotors[0].servo),config);assert.deepEqual(t.groups.flatMap(g=>g.parts.map(p=>p.id)).sort(),ids);
 assert.equal(t.rotorPart(r.aId).part.mood.energy,.27);assert.equal(t.rotorPart(r.bId).part.mood.energy,.61);
});
test('shelf round trip preserves folded servo, matter and charge',()=>{
 const {t}=lab(),s=t.createShelf({p:t.V(0,.4,-13.996),q:t.Q(),wall:'north'});assert(s);
 const r=t.spawnSavedMechanism(recipe(t,'hinge',30),t.V(0,.2,0));assert(r);const config=plain(r.servo),ids=[r.aId,r.bId];t.rotorPart(r.aId).part.mood.energy=.123;
 t.toggleRotorSelection(r);assert(t.storeShelfSelection(s));assert.equal(s.cells[0].category.label,'Servo bisagra');assert.equal(t.rotors.length,0);
 assert(t.withdrawShelf(s));assert.equal(t.rotors.length,1);assert.deepEqual([t.rotors[0].aId,t.rotors[0].bId],ids);assert.deepEqual(plain(t.rotors[0].servo),config);assert.equal(t.rotorPart(ids[0]).part.mood.energy,.123);
});
test('servo imports reject malformed settings, wrong endpoint shapes and separated tips',()=>{
 const {t}=lab(),valid=recipe(t);assert(t.savedMechanismValid(valid));
 for(const edit of [r=>r.joints[0].servo.speed=Infinity,r=>r.joints[0].servo.min=-100,r=>r.joints[0].servo.reference=[0,0,0,2],r=>r.joints[0].servo.target=80,r=>r.joints[0].moving='a',r=>r.joints[0].mount='fixed',r=>r.groups[1].parts[0].shape='cube',r=>r.groups[1].parts[0].p[0]+=.03]){const record=plain(valid);edit(record);assert.equal(t.savedMechanismValid(record),false);}
});
test('servo blueprint consumes existing pieces and conserves identities, weight and energy',()=>{
 const {t}=lab(),bp=t.placeMechanismBlueprint(recipe(t,'hinge',20),t.V());assert(bp);
 for(const [index,target]of t.blueprintTargets(bp).entries()){
  const g=t.makeGroup([{id:t.allocateUnitId(),shape:target.shape,weight:1/6,p:target.p.clone(),q:target.q.clone()}]);g.parts[0].mood.energy=.2+index*.3;
  const slot={g,bp,index,state:'placed'};g.blueprintJob=slot;bp.slots.push(slot);
 }
 const inventory=()=>plain(t.groups.flatMap(g=>g.parts.map(p=>({id:p.id,weight:p.weight,shape:p.shape,energy:p.mood.energy}))).sort((a,b)=>a.id-b.id)),before=inventory();
 bp.active=true;t.updateBlueprints(0);assert.equal(t.blueprints.length,0);assert.equal(t.rotors.length,1);assert.equal(t.rotors[0].servo.kind,'hinge');assert.equal(t.rotors[0].enabled,false);assert.deepEqual(inventory(),before);
 assert(t.mechanismSnapshot(t.rotors[0]));
});
