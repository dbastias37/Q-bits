const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const workshop=require('../assets/js/workshop.js');
const createGame=require('./game-harness.cjs');

function metadata(part){return {version:1,ownerId:part.id,sensor:true,battery:1,lightweight:1,movement:1,baseWeight:part.weight,ballast:0};}
function lab(){
 const source=fs.readFileSync(path.join(__dirname,'../assets/js/game.js'),'utf8');
 const at=source.lastIndexOf('})();');
 const hook='window.__sensorBoxes=0;const drawSensorBox=drawBox;drawBox=function(...args){window.__sensorBoxes++;return drawSensorBox(...args);};\n';
 const game=createGame({gameSource:source.slice(0,at)+hook+source.slice(at),graphics:false}),{t,sandbox}=game;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';return game;
}

test('the sensor predicate preserves full metadata validation and reads in-place edits immediately',()=>{
 const part={id:42,weight:1,mood:{}};
 const values=[undefined,null,{},[],false,true,metadata(part)];
 for(const [key,value] of Object.entries({version:2,ownerId:41,sensor:'true',battery:0,lightweight:4,movement:NaN,baseWeight:2,ballast:1}))values.push({...metadata(part),[key]:value});
 for(const raw of values){part.mood.workshop=raw;const before=JSON.stringify(part);assert.equal(workshop.hasSensor(part),workshop.partState(part).sensor);assert.equal(JSON.stringify(part),before);}
 part.mood.workshop=metadata(part);assert(workshop.hasSensor(part));
 part.mood.workshop.sensor=false;assert(!workshop.hasSensor(part));
 part.mood.workshop.sensor=true;part.weight=.9;assert(!workshop.hasSensor(part),'invalid material receipt cannot enable a sensor');
 Object.assign(part.mood.workshop,{lightweight:2,ballast:.1});assert(workshop.hasSensor(part));
 delete part.mood.workshop;assert(!workshop.hasSensor(part));
});

test('an empty sensor scene creates no detached workshop states while scanning 1000 ordinary pieces',()=>{
 const {t,sandbox}=lab();
 for(let g=0;g<100;g++)t.makeGroup(Array.from({length:10},(_,i)=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(4+g*.2,.045,i*.09),q:t.Q()})));
 let reads=0,predicates=0;const model=sandbox.QBitsWorkshop;
 sandbox.QBitsWorkshop={...model,partState(...args){reads++;return model.partState(...args);},hasSensor(...args){predicates++;return model.hasSensor(...args);}};
 const before=t.groups.map(g=>g.parts.map(p=>JSON.stringify(p.mood)));
 t.tickContactSensors(1/120);sandbox.__sensorBoxes=0;t.drawWorkshop();
 assert.equal(reads,0,'predicate checks must not manufacture editor defaults');assert.equal(sandbox.__sensorBoxes,0);
 assert.equal(predicates,0,'ordinary pieces are discarded before workshop calls');
 assert.deepEqual(t.groups.map(g=>g.parts.map(p=>JSON.stringify(p.mood))),before);
 assert.equal(t.contactStates.size,0);
});

test('a new or removed adaptation is visible before the next physics step, including invalid metadata',()=>{
 const {t,sandbox}=lab(),g=t.addQubit([0,.045,0]),part=g.parts[0];
 t.drawWorkshop();part.mood.workshop=metadata(part);sandbox.__sensorBoxes=0;t.drawWorkshop();assert.equal(sandbox.__sensorBoxes,1);
 const rotor=t.spawnRotor(t.V(0,.3,.7));assert(t.linkContactSensor(part.id,rotor));
 t.tickContactSensors(1/120);assert(t.contactStates.has(part.id));
 part.mood.workshop.ownerId++;sandbox.__sensorBoxes=0;t.drawWorkshop();t.tickContactSensors(1/120);
 assert.equal(sandbox.__sensorBoxes,0);assert(!t.contactStates.has(part.id));
 part.mood.workshop=metadata(part);sandbox.__sensorBoxes=0;t.drawWorkshop();t.tickContactSensors(1/120);
 assert.equal(sandbox.__sensorBoxes,1);assert(t.contactStates.has(part.id));
 delete part.mood.workshop;t.tickContactSensors(1/120);assert(!t.contactStates.has(part.id));
 t.removeGroup(g);sandbox.__sensorBoxes=0;t.drawWorkshop();assert.equal(sandbox.__sensorBoxes,0);
});
