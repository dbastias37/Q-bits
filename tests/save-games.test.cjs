const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const model = require('../assets/js/save-games.js');

const v = (x=0,y=0,z=0) => ({x,y,z});
const q = () => ({x:0,y:0,z:0,w:1});
const copy = value => JSON.parse(JSON.stringify(value));
function lab() {
  return {
    snapshot:{
      groups:[{parts:[{id:1209,shape:'cube',weight:1,p:v(0,.12,0),q:q(),mood:{energy:.6,name:'Ada'}}],q:q(),v:v(),w:v()}],
      cargos:[{id:1209,p:v(1,.18,0),side:4,required:8,color:'#cc3300'}],
      settings:{gravity:9.8,mass:1},moodSettings:{enabled:true},position:[0,1.65,2.3],yaw:0,pitch:-.2,
      rotors:[],rotorSets:[],robotArms:[],conveyors:[],shelves:[],disassembly:[],
      contacts:{sensors:[],rotors:[]},powerNetwork:{reservoirs:[],cables:[]},alphaScene:{coolers:[],blueprints:[]},
      workshop:null,mechanismDefaults:null
    },
    alphaSettings:{coolingOn:true,blueprintRange:2}
  };
}
const campaign = (level=7) => ({checkpoint:{scene:level?'campaign':'intro',level,completed:false},progress:{intro:true,level1:true,'lore.division':true,torqueTier:1}});
function memory() {
  const values = new Map(), writes = [];
  const storage = {
    getItem:key => values.has(key) ? values.get(key) : null,
    setItem(key,value) { writes.push({key,value}); values.set(key,value); },
    removeItem() { throw new Error('A save must not delete its previous slot.'); }
  };
  return {values,writes,storage};
}
function store(mem, now=1000) { return model.createStore({storage:()=>mem.storage,now:typeof now==='function'?now:()=>now}); }

test('saved games expose the same dependency-free API in Node and the browser', () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/js/save-games.js'),'utf8'),sandbox);
  assert.equal(typeof sandbox.QBitsSavedGames.createStore,'function');
  assert(Object.isFrozen(model)); assert(Object.isFrozen(model.KEYS));
  const mem=memory(), browser=sandbox.QBitsSavedGames.createStore({storage:()=>mem.storage,now:()=>22});
  assert(browser.write('campaign',campaign()).ok,'plain data may originate in another realm');
  assert.equal(store(mem).read('campaign').save.savedAt,22);
});

test('a fresh store restores independent lab and campaign slots from one atomic key each', () => {
  const mem=memory(), first=store(mem), bench=lab(), story=campaign();
  assert.equal(first.read('lab').status,'empty'); assert.equal(first.read('campaign').status,'empty');
  assert(first.write('lab',bench).ok); assert(first.write('campaign',story).ok);
  const reloaded=store(mem);
  assert.deepEqual(reloaded.read('lab').save.data,bench);
  assert.deepEqual(reloaded.read('campaign').save.data,story);
  assert.deepEqual([...mem.values.keys()].sort(),Object.values(model.KEYS).sort());
  assert.equal(mem.writes.length,2);
  assert.equal(reloaded.read('lab').save.format,'qbits-save');
  assert.equal(reloaded.read('lab').save.version,1);
  assert.equal(reloaded.read('lab').save.mode,'lab');
});

test('caller and result mutations never change a persisted snapshot or another read', () => {
  const mem=memory(), saved=store(mem), source=lab(), result=saved.write('lab',source);
  assert(result.ok);
  source.snapshot.groups[0].parts[0].mood.energy=0;
  result.save.data.snapshot.groups[0].parts[0].mood.energy=1;
  const read=saved.read('lab');assert.equal(read.save.data.snapshot.groups[0].parts[0].mood.energy,.6);
  read.save.data.snapshot.groups[0].parts[0].p.y=-100;
  assert.equal(saved.read('lab').save.data.snapshot.groups[0].parts[0].p.y,.12);
});

test('creation time survives ordinary updates, clock rollback cannot reverse timestamps, and replacement starts a new save', () => {
  const mem=memory();let clock=100;
  const saved=store(mem,()=>clock), first=saved.write('campaign',campaign());
  assert.equal(first.save.createdAt,100);assert.equal(first.save.savedAt,100);
  clock=200;const second=saved.write('campaign',campaign(8));
  assert.equal(second.save.createdAt,100);assert.equal(second.save.savedAt,200);
  clock=50;const rollback=saved.write('campaign',campaign(9));
  assert.equal(rollback.save.createdAt,100);assert.equal(rollback.save.savedAt,200);
  clock=300;const fresh=saved.write('campaign',campaign(0),{replace:true});
  assert.equal(fresh.save.createdAt,300);assert.equal(fresh.save.savedAt,300);
});

test('invalid JSON and future versions are visible and preserved until an explicit replacement', () => {
  for(const [raw,status] of [['{broken','invalid'],['','invalid'],[JSON.stringify({format:'qbits-save',version:2,mode:'lab',data:{}}),'unsupported']]) {
    const mem=memory();mem.values.set(model.KEYS.lab,raw);const saved=store(mem);
    assert.equal(saved.read('lab').status,status);
    assert.equal(saved.write('lab',lab()).ok,false);
    assert.equal(mem.values.get(model.KEYS.lab),raw);assert.equal(mem.writes.length,0);
    assert(saved.write('lab',lab(),{replace:true}).ok);
    assert.equal(saved.read('lab').status,'ready');assert.equal(mem.writes.length,1);
  }
});

test('cross-mode records and invalid envelope metadata cannot masquerade as another slot', () => {
  const mem=memory(), saved=store(mem);assert(saved.write('campaign',campaign()).ok);
  const original=mem.values.get(model.KEYS.campaign), data=JSON.parse(original);
  for(const patch of [{},{mode:'lab',format:'other-game'},{mode:'lab',version:'1'},{mode:'lab',version:0},{mode:'lab',createdAt:-1},{mode:'lab',createdAt:1001,savedAt:1000}]) {
    mem.values.set(model.KEYS.lab,JSON.stringify({...data,...patch}));
    assert.equal(saved.read('lab').status,'invalid');assert.equal(saved.write('lab',lab()).ok,false);
  }
  assert.equal(mem.values.get(model.KEYS.campaign),original);
  assert.equal(saved.read('__proto__').status,'invalid');
  assert.equal(saved.write('unknown',campaign()).ok,false);
});

test('quota failures preserve the previous bytes and never delete or create backup snapshots', () => {
  const mem=memory(), saved=store(mem);assert(saved.write('lab',lab()).ok);
  const before=mem.values.get(model.KEYS.lab), writes=mem.writes.length;
  mem.storage.setItem=()=>{throw new Error('QuotaExceededError');};
  const changed=lab();changed.snapshot.groups[0].parts[0].mood.energy=.2;
  const result=saved.write('lab',changed);
  assert.equal(result.ok,false);assert.match(result.error,/Quota/);
  assert.equal(mem.values.get(model.KEYS.lab),before);assert.equal(mem.values.size,1);assert.equal(mem.writes.length,writes);
  assert.equal(saved.read('lab').status,'ready');
});

test('unavailable storage, denied reads, and missing methods report failure without crashing', () => {
  for(const storage of [()=>null,()=>{throw new Error('Access denied');},()=>({}),()=>({getItem(){throw new Error('Read denied');},setItem(){assert.fail('must not overwrite an unreadable slot');}})]) {
    const saved=model.createStore({storage,now:()=>100});
    assert.equal(saved.read('lab').status,'unavailable');
    assert.equal(saved.write('lab',lab()).ok,false);
    assert.equal(saved.write('lab',lab(),{replace:true}).ok,false);
  }
  const readOnly=model.createStore({storage:()=>({getItem:()=>null})});
  assert.equal(readOnly.read('lab').status,'empty');assert.equal(readOnly.write('lab',lab()).ok,false);
  assert.equal(model.createStore().read('lab').status,'unavailable');
});

test('invalid clocks cannot overwrite a valid save', () => {
  const mem=memory();assert(store(mem).write('campaign',campaign()).ok);const before=mem.values.get(model.KEYS.campaign);
  for(const clock of [()=>NaN,()=>Infinity,()=>-1,()=>{throw new Error('Clock unavailable');}]) {
    assert.equal(store(mem,clock).write('campaign',campaign(8)).ok,false);
    assert.equal(mem.values.get(model.KEYS.campaign),before);
  }
});

test('circular and non-finite values are rejected before JSON can discard or coerce them', () => {
  const mem=memory(), saved=store(mem);assert(saved.write('lab',lab()).ok);const before=mem.values.get(model.KEYS.lab);
  for(const invalid of [NaN,Infinity,-Infinity,()=>0,Symbol('state'),1n,new Map(),new Set(),new Date()]) {
    const data=lab();data.snapshot.groups[0].parts[0].mood.extra=invalid;
    assert.equal(saved.write('lab',data).ok,false,String(invalid));assert.equal(mem.values.get(model.KEYS.lab),before);
  }
  const circular=lab();circular.snapshot.self=circular;
  assert.equal(saved.write('lab',circular).ok,false);assert.equal(mem.values.get(model.KEYS.lab),before);
  const sparse=lab();sparse.snapshot.extra=Array(2);assert.equal(saved.write('lab',sparse).ok,false);
  const repeated=lab(), shared={note:'same value in two places'};repeated.snapshot.a=shared;repeated.snapshot.b=shared;
  assert(saved.write('lab',repeated).ok,'shared non-circular values are valid JSON data');
});

test('optional undefined object properties are omitted while incomplete array entries remain invalid', () => {
  const mem=memory(), saved=store(mem), data=lab();data.snapshot.groups[0].parts[0].mood.optional=undefined;
  const result=saved.write('lab',data);assert(result.ok,result.error);
  assert.equal(Object.hasOwn(result.save.data.snapshot.groups[0].parts[0].mood,'optional'),false);
  assert.deepEqual(result.save.data,copy(data));
  const broken=lab();broken.snapshot.groups[0].parts[0].mood.blend=[1,undefined,0];
  assert.equal(saved.write('lab',broken).ok,false);assert.equal(saved.write('lab',undefined).ok,false);
});

test('unsafe keys, accessors, and custom JSON hooks cannot silently rewrite a save', () => {
  const mem=memory(), saved=store(mem);assert(saved.write('campaign',campaign()).ok);const before=mem.values.get(model.KEYS.campaign);
  for(const key of ['__proto__','prototype','constructor']) {
    const data=campaign();data.progress.extra=JSON.parse('{"'+key+'":{"polluted":true}}');
    assert.equal(saved.write('campaign',data).ok,false);assert.equal(mem.values.get(model.KEYS.campaign),before);
  }
  let invoked=false;const getter=campaign();Object.defineProperty(getter.progress,'extra',{enumerable:true,get(){invoked=true;return true;}});
  assert.equal(saved.write('campaign',getter).ok,false);assert.equal(invoked,false);
  const hooked=campaign();hooked.toJSON=()=>{invoked=true;return campaign(1);};
  assert.equal(saved.write('campaign',hooked).ok,false);assert.equal(invoked,false);
  assert.equal({}.polluted,undefined);assert.equal(mem.values.get(model.KEYS.campaign),before);
});

test('lab validation rejects missing geometry, duplicate IDs, unknown shapes and malformed physical cargos', () => {
  const changes=[
    d=>{delete d.snapshot.groups;},d=>{d.snapshot.cargos={};},d=>{d.snapshot.settings=null;},d=>{d.snapshot.moodSettings=[];},
    d=>{d.alphaSettings=null;},d=>{d.snapshot.position=[0,1];},d=>{d.snapshot.yaw='0';},
    d=>{d.snapshot.groups[0].parts=[];},d=>{d.snapshot.groups[0].q={x:0,y:0,z:0,w:0};},d=>{delete d.snapshot.groups[0].v.z;},
    d=>{d.snapshot.groups[0].parts[0].id=1.5;},d=>{d.snapshot.groups.push(copy(d.snapshot.groups[0]));},
    d=>{d.snapshot.groups[0].parts[0].shape='rotor';},d=>{d.snapshot.groups[0].parts[0].weight=0;},
    d=>{d.snapshot.groups[0].parts[0].p=[0,.1,0];},d=>{delete d.snapshot.groups[0].parts[0].q.w;},
    d=>{d.snapshot.groups[0].parts[0].mood.energy=1.01;},d=>{d.snapshot.cargos.push(copy(d.snapshot.cargos[0]));},
    d=>{d.snapshot.cargos[0].robotPhysical=true;},d=>{d.snapshot.rotors={};}
  ];
  for(const mutate of changes){const data=lab();mutate(data);assert.equal(model.validate('lab',data).ok,false);}
  for(const shape of ['cube','pyramid','tetra','coupler']){const data=lab();data.snapshot.groups[0].parts[0].shape=shape;assert(model.validate('lab',data).ok);}
  const physical=lab();Object.assign(physical.snapshot.cargos[0],{robotPhysical:true,q:q(),v:v(),w:v()});assert(model.validate('lab',physical).ok);
});

test('campaign validation bounds checkpoints without mistaking them for arbitrary world snapshots', () => {
  for(const level of [0,1,20])assert(model.validate('campaign',campaign(level)).ok);
  for(const patch of [{scene:'lab'},{scene:'intro',level:1},{scene:'campaign',level:0},{level:21},{level:NaN},{level:1.5},{completed:1}]) {
    const data=campaign();Object.assign(data.checkpoint,patch);assert.equal(model.validate('campaign',data).ok,false);
  }
  for(const progress of [null,[],{level1:'true'},{torqueTier:4},{'lore.division':1}]) {
    const data=campaign();data.progress=progress;assert.equal(model.validate('campaign',data).ok,false);
  }
  assert.equal(model.validate('campaign',lab()).ok,false);assert.equal(model.validate('lab',campaign()).ok,false);
});

test('read validates decoded numbers and unsafe nested keys before offering Continue', () => {
  const mem=memory(), saved=store(mem);assert(saved.write('campaign',campaign()).ok);
  const good=mem.values.get(model.KEYS.campaign);
  for(const raw of [good.replace('"savedAt":1000','"savedAt":1e999'),good.replace('"progress":{','"progress":{"__proto__":{"polluted":true},')]) {
    mem.values.set(model.KEYS.campaign,raw);assert.equal(saved.read('campaign').status,'invalid');
    assert.equal(saved.write('campaign',campaign()).ok,false);assert.equal(mem.values.get(model.KEYS.campaign),raw);
  }
});

test('multi-megabyte data uses one slot write and keeps all material metadata', () => {
  const mem=memory(), data=lab();data.snapshot.groups[0].parts[0].mood.note='q'.repeat(2*1024*1024);
  assert(store(mem).write('lab',data).ok);
  assert.equal(mem.writes.length,1);assert.equal(mem.values.size,1);
  assert.equal(store(mem).read('lab').save.data.snapshot.groups[0].parts[0].mood.note.length,2*1024*1024);
});

test('the real saveLab snapshot serializes Cannon coordinates and all current piece shapes without an engine dependency in the store', () => {
  const createGame=require('./game-harness.cjs'),{t}=createGame({graphics:false});
  t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});
  ['cube','pyramid','tetra','coupler'].forEach((shape,i)=>t.addQubit([i*.3,.12,0],1,shape));
  assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight'),t.V(2,0,0)));
  const data={snapshot:t.saveLab(),alphaSettings:{...t.alphaSettings}},mem=memory(),saved=store(mem),result=saved.write('lab',data);
  assert(result.ok,result.error);assert.deepEqual(result.save.data,copy(data));
  assert.equal(Object.getPrototypeOf(result.save.data.snapshot.groups[0].parts[0].p),Object.prototype);
  assert.deepEqual(store(mem).read('lab').save.data,copy(data));
});

test('warm slots observe external replacement, corruption, future versions and deletion immediately', () => {
  const mem=memory(), saved=store(mem);assert(saved.write('lab',lab()).ok);
  const original=mem.values.get(model.KEYS.lab), changed=original.replace('"energy":0.6','"energy":0.2');
  assert.equal(changed.length,original.length,'same-sized external changes still matter');
  mem.values.set(model.KEYS.lab,changed);
  assert.equal(saved.read('lab').save.data.snapshot.groups[0].parts[0].mood.energy,.2);
  for(const [raw,status] of [['{broken','invalid'],[original.replace('"version":1','"version":2'),'unsupported']]) {
    mem.values.set(model.KEYS.lab,raw);
    assert.equal(saved.read('lab').status,status);
    assert.equal(saved.write('lab',lab()).ok,false);
    assert.equal(mem.values.get(model.KEYS.lab),raw);
  }
  mem.values.set(model.KEYS.lab,original);assert.equal(saved.read('lab').status,'ready');
  mem.values.delete(model.KEYS.lab);assert.equal(saved.read('lab').status,'empty');
  assert(saved.write('lab',lab()).ok);assert.deepEqual(saved.read('lab').save.data,lab());
});

test('mutating returned timestamps cannot change later writes and a failed write cannot promote them', () => {
  const mem=memory();let clock=100;
  const saved=store(mem,()=>clock), first=saved.write('campaign',campaign());assert(first.ok);
  first.save.createdAt=1;first.save.savedAt=99999;
  const read=saved.read('campaign');read.save.createdAt=2;read.save.savedAt=88888;
  clock=200;const next=saved.write('campaign',campaign(8));assert(next.ok);
  assert.equal(next.save.createdAt,100);assert.equal(next.save.savedAt,200);
  const retained=mem.values.get(model.KEYS.campaign), set=mem.storage.setItem;
  mem.storage.setItem=()=>{throw new Error('QuotaExceededError');};clock=300;
  assert.equal(saved.write('campaign',campaign(9)).ok,false);
  assert.equal(mem.values.get(model.KEYS.campaign),retained);
  mem.storage.setItem=set;clock=150;
  const retry=saved.write('campaign',campaign(10));assert(retry.ok);
  assert.equal(retry.save.createdAt,100);assert.equal(retry.save.savedAt,200);
  assert.equal(saved.read('campaign').save.data.checkpoint.level,10);
});

test('warm slots still require a readable current storage target before writing or replacing', () => {
  const one=memory(),two=memory();let target=one.storage,clock=100;
  const saved=model.createStore({storage:()=>target,now:()=>clock});
  assert(saved.write('campaign',campaign(7)).ok);const original=one.values.get(model.KEYS.campaign);
  target=two.storage;clock=200;assert.equal(saved.read('campaign').status,'empty');
  const second=saved.write('campaign',campaign(8));assert(second.ok);assert.equal(second.save.createdAt,200);
  target=one.storage;assert.equal(saved.read('campaign').save.data.checkpoint.level,7);
  const get=one.storage.getItem;one.storage.getItem=()=>{throw new Error('Read denied');};
  assert.equal(saved.read('campaign').status,'unavailable');
  assert.equal(saved.write('campaign',campaign(9)).ok,false);
  assert.equal(saved.write('campaign',campaign(9),{replace:true}).ok,false);
  assert.equal(one.values.get(model.KEYS.campaign),original);
  one.storage.getItem=get;assert.equal(saved.read('campaign').save.createdAt,100);
});

test('parsed data retains finite-number, depth and own toJSON checks after a valid read', () => {
  const mem=memory(),saved=store(mem);assert(saved.write('campaign',campaign()).ok);
  const original=mem.values.get(model.KEYS.campaign);
  let nested={};for(let i=0;i<129;i++)nested={child:nested};
  const deep=JSON.parse(original);deep.data.progress.extra=nested;
  for(const raw of [
    original.replace('"savedAt":1000','"savedAt":1e999'),
    original.replace('"progress":{','"progress":{"toJSON":null,'),
    original.replace('"progress":{','"progress":{"__proto__":{},'),
    JSON.stringify(deep)
  ]) {
    mem.values.set(model.KEYS.campaign,raw);assert.equal(saved.read('campaign').status,'invalid');
    assert.equal(saved.write('campaign',campaign(8)).ok,false);assert.equal(mem.values.get(model.KEYS.campaign),raw);
    mem.values.set(model.KEYS.campaign,original);assert.equal(saved.read('campaign').status,'ready');
  }
});

test('adding and removing prototype JSON hooks cannot bypass a warm validation or invalidate unrelated arrays', () => {
  const mem=memory(),writer=store(mem);
  assert(writer.write('campaign',campaign()).ok);assert(writer.write('lab',lab()).ok);
  const context=vm.createContext({storage:mem.storage});
  vm.runInContext(fs.readFileSync(require.resolve('../assets/js/save-games.js'),'utf8'),context);
  const saved=vm.runInContext('QBitsSavedGames.createStore({storage:()=>storage})',context);
  assert.equal(saved.read('campaign').status,'ready');assert.equal(saved.read('lab').status,'ready');
  vm.runInContext('Object.defineProperty(Array.prototype,"toJSON",{value:null,configurable:true})',context);
  assert.equal(saved.read('campaign').status,'ready','this campaign contains no arrays');
  assert.equal(saved.read('lab').status,'invalid');
  vm.runInContext('delete Array.prototype.toJSON',context);
  assert.equal(saved.read('lab').status,'ready');
  vm.runInContext('Object.defineProperty(Object.prototype,"toJSON",{value:null,configurable:true})',context);
  assert.equal(saved.read('campaign').status,'invalid');assert.equal(saved.read('lab').status,'invalid');
  vm.runInContext('delete Object.prototype.toJSON',context);
  assert.equal(saved.read('campaign').status,'ready');assert.equal(saved.read('lab').status,'ready');
});

test('mutation during an injected clock cannot replace the previous save with invalid serialized bytes', () => {
  for(const mutate of [d=>{d.progress.extra=Infinity;d.checkpoint.level=NaN;},d=>{d.progress.toJSON=null;},d=>{d.progress.constructor='changed';}]) {
    const mem=memory();assert(store(mem).write('campaign',campaign()).ok);
    const previous=mem.values.get(model.KEYS.campaign),source=campaign(8);
    const saved=store(mem,()=>{mutate(source);return 2000;});
    assert.equal(saved.write('campaign',source).ok,false);
    assert.equal(mem.values.get(model.KEYS.campaign),previous);
    assert.equal(saved.read('campaign').save.data.checkpoint.level,7);
  }
});
