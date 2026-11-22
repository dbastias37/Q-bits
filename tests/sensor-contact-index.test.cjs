const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const createGame=require('./game-harness.cjs');

function lab(){
 let source=fs.readFileSync(path.join(__dirname,'../assets/js/game.js'),'utf8');
 source=source.replace('const byBody=new Map();for(const contact of physicsWorld.contacts){','const byBody=new Map();window.__sensorWork.builds++;for(const contact of physicsWorld.contacts){window.__sensorWork.buildCandidates++;');
 const hook=`window.__sensorWork={builds:0,buildCandidates:0,queries:0,candidates:0};
 const sensorContactQuery=sensorContactsForBody;
 sensorContactsForBody=function(body,allowBuild=true){const list=sensorContactQuery(body,allowBuild);window.__sensorWork.queries++;window.__sensorWork.candidates+=list.length;return list;};
 window.__sensorIndexTest={contacts:sensorContactsForBody,weight:sensorWeight,getCache:()=>sensorContactsCache,invalidate:invalidateConveyorContacts};\n`;
 const at=source.lastIndexOf('})();');
 const game=createGame({gameSource:source.slice(0,at)+hook+source.slice(at),graphics:false}),{t,sandbox}=game;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';
 return {...game,index:sandbox.__sensorIndexTest,counts:sandbox.__sensorWork};
}
function distant(t,count=128){for(let i=0;i<count;i++)t.addQubit([4+i%16*.2,.044,-3+Math.floor(i/16)*.2]);}
function reset(counts){for(const key in counts)counts[key]=0;}
function weight(t,g){return t.sensorReading(t.rotorPart(g.parts[0].id),{mode:'weight',weight:1}).value;}

test('sixteen readings share one real 512-contact index and keep ordered body membership',()=>{
 const {t,index,counts}=lab();distant(t);t.world.step(1/120);assert.equal(t.world.contacts.length,512);reset(counts);
 for(const g of t.groups.slice(0,16))assert.equal(weight(t,g),0);
 assert.deepEqual({...counts},{builds:1,buildCandidates:512,queries:16,candidates:64});
 for(const g of t.groups.slice(0,16))assert.equal(t.sensorContactActive(t.rotorPart(g.parts[0].id)),false);
 assert.equal(counts.builds,1);assert.equal(counts.candidates,128);
 for(const body of t.world.bodies){
  const expected=t.world.contacts.filter(c=>c.bi===body||c.bj===body),actual=index.contacts(body);
  assert.equal(actual.length,expected.length);expected.forEach((c,i)=>assert.equal(actual[i],c));
 }
 const cache=index.getCache();assert(cache);assert.equal(cache.byBody.size,129);
 assert.equal([...cache.byBody.values()].reduce((sum,list)=>sum+list.length,0),1024,'two references per real contact, no history');
});

test('a small control scene takes the linear path and allocates no contact index',()=>{
 const {t,index,counts}=lab(),g=t.addQubit([0,.044,0]);t.world.step(1/120);assert.equal(t.world.contacts.length,4);reset(counts);
 assert.equal(weight(t,g),0);assert.equal(t.sensorContactActive(t.rotorPart(g.parts[0].id)),false);
 assert.equal(index.getCache(),null);assert.equal(counts.builds,0);assert.equal(counts.candidates,8);
});

test('contact-only sensors avoid building an index but reuse a conveyor index when it already exists',()=>{
 const {t,index,counts}=lab();distant(t);t.world.step(1/120);reset(counts);
 for(const g of t.groups.slice(0,16))assert.equal(t.sensorContactActive(t.rotorPart(g.parts[0].id)),false);
 assert.equal(counts.builds,0);assert.equal(counts.candidates,8192);assert.equal(index.getCache(),null);
 t.setStepCache({parts:null,components:new Map()});
 try{
  const shared=t.conveyorContactIndex();reset(counts);
  for(const g of t.groups.slice(0,16))assert.equal(t.sensorContactActive(t.rotorPart(g.parts[0].id)),false);
  assert.equal(counts.builds,0);assert.equal(counts.candidates,64);assert.equal(index.getCache().byBody,shared);
 }finally{t.setStepCache(null);}
});

test('weight follows transitive supports, sleeping stacks and live mass/pose changes without caching the reading',()=>{
 const {t,index}=lab();distant(t);
 const base=t.addQubit([0,.045,0]),middle=t.addQubit([0,.135,0]),top=t.addQubit([0,.225,0]);
 for(let i=0;i<8;i++)t.world.step(1/120);
 assert.equal(weight(t,base),2);assert(index.getCache());
 for(const g of [base,middle,top])g.body.sleep();t.world.step(1/120);
 assert.equal(weight(t,base),2,'sleeping support recovery remains live');
 top.body.position.y+=1;top.body.aabbNeedsUpdate=true;top.body.wakeUp();
 assert.equal(weight(t,base),1,'lifting a sleeping top clears its geometric support immediately');
 middle.parts[0].weight=3;assert.equal(weight(t,base),3,'loads are read live, not stored with membership');
 const replacement=t.addQubit([0,middle.body.position.y+.09,0],2);replacement.body.sleep();
 assert.equal(weight(t,base),5,'adding an already sleeping load is visible without a new contact batch');
 const hit=t.rotorPart(base.parts[0].id);
 assert.equal(index.weight(hit,new Set([base.body,middle.body])),0,'the same connected bodies remain excluded');
 t.removeGroup(replacement);assert.equal(weight(t,base),3);
});

test('an indexed compound sensor excludes loads on the neighboring ordinary shape',()=>{
 const {t,sandbox}=lab();distant(t);
 const id=t.allocateUnitId(),mood={energy:1,workshop:{version:1,ownerId:id,sensor:true,battery:1,lightweight:1,movement:1,baseWeight:1,ballast:0}};
 const base=t.makeGroup([{id,shape:'cube',weight:1,p:t.V(0,.045,0),q:t.Q(),mood},{id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(.09,.045,0),q:t.Q()}]);
 base.body.type=sandbox.CANNON.Body.STATIC;base.body.updateMassProperties();
 const load=t.addQubit([.11,.133,0]);t.world.step(1/120);
 assert(t.world.contacts.length>32);assert.equal(weight(t,base),0);
 load.body.position.set(0,.133,0);load.body.velocity.set(0,0,0);load.body.aabbNeedsUpdate=true;load.body.wakeUp();t.world.step(1/120);
 assert.equal(weight(t,base),1);
});

test('contact face, normal and shape selection stay live inside a shared index',()=>{
 const {t,sandbox,index}=lab();distant(t);const g=t.addQubit([.04,.046,0]),hit=t.rotorPart(g.parts[0].id);
 const wall=new sandbox.CANNON.Body({mass:0,shape:new sandbox.CANNON.Box(t.V(.04,.3,.4)),position:t.V(.12,.3,0)});t.world.addBody(wall);t.world.step(1/120);
 assert(t.sensorContactActive(hit));assert.equal(index.getCache(),null);index.contacts(g.body);const cached=index.getCache();assert(cached);
 const matching=t.world.contacts.filter(c=>(c.bi===g.body&&c.bj===wall)||(c.bj===g.body&&c.bi===wall));assert(matching.length);
 for(const c of matching){[c.bi,c.bj]=[c.bj,c.bi];[c.si,c.sj]=[c.sj,c.si];c.ni.negate(c.ni);}
 assert(t.sensorContactActive(hit),'reversed Cannon body order preserves the active face');assert.equal(index.getCache(),cached);
 for(const c of matching)c.ni.negate(c.ni);assert(!t.sensorContactActive(hit),'a cached result cannot hide a changed normal');
 for(const c of matching)c.ni.negate(c.ni);
 for(const c of matching){if(c.bi===g.body)c.si=wall.shapes[0];else c.sj=wall.shapes[0];}
 assert(!t.sensorContactActive(hit),'the exact sensor shape is checked on each read');
});

test('native steps with pooled contacts and explicit batches rebuild once and release scene references',()=>{
 const {t,index,counts}=lab();distant(t);t.world.step(1/120);const first=t.groups[0];weight(t,first);const previous=index.getCache();
 t.world.step(1/120);assert.equal(t.world.contacts.length,512);reset(counts);weight(t,first);assert.notEqual(index.getCache(),previous);assert.equal(counts.builds,1);
 const current=index.getCache();t.world.contacts=t.world.contacts.slice().reverse();reset(counts);weight(t,first);assert.notEqual(index.getCache(),current);assert.equal(counts.builds,1);
 const entries=index.contacts(first.body),expected=t.world.contacts.filter(c=>c.bi===first.body||c.bj===first.body);assert.equal(entries.length,expected.length);expected.forEach((c,i)=>assert.equal(entries[i],c));
 index.invalidate();assert.equal(index.getCache(),null);weight(t,first);assert(index.getCache());
 t.clearNarrativeScene();assert.equal(index.getCache(),null);
 distant(t);t.world.step(1/120);weight(t,t.groups[0]);assert(index.getCache());
 t.clearPuzzleScene();assert.equal(index.getCache(),null);
});
