// Save-boundary checks for the first playable slice. No browser or visual QA.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Saves = require('../assets/js/save-games.js');
const Supply = require('../assets/js/campaign-supply.js');
const Passage = require('../assets/js/factory-passage.js');

const GUIDE = 11, COMPANION = 27;
const clone = value => JSON.parse(JSON.stringify(value));
const v = (x=0, y=0, z=0) => ({x,y,z});
const q = () => ({x:0,y:0,z:0,w:1});
const piece = (id, energy=.37, restLeft=41) => ({id,shape:'cube',weight:1,p:v(.4,.05,.2),q:q(),
  mood:{name:id===GUIDE?'Guía':'Compañero',energy,restLeft,state:'neutral',blend:[1,0,0],agitation:.2}});
const group = part => ({parts:[part],q:q(),v:v(.1,0,0),w:v()});
const checkpoint = (level=1, completed=false) => ({checkpoint:{scene:'campaign',level,completed},progress:{intro:true}});

function room(parts) {
  return {groups:parts.map(group),cargos:[],settings:{gravity:9.8,mass:1},moodSettings:{enabled:true},
    position:[0,1.7,2.3],yaw:0,pitch:-.2,families:[],disassembly:[],rotors:[],rotorSets:[],robotArms:[],conveyors:[],shelves:[],
    contacts:{sensors:[],rotors:[]},powerNetwork:{version:1,reservoirs:[],cables:[]},
    trajectories:{version:1,serial:0,routes:[]},alphaScene:{coolers:[],blueprints:[]},workshop:null,mechanismDefaults:null,
    runtime:{version:1,time:23,blocked:null,motion:parts.map(part=>({id:part.id,v:[.1,0,0],w:[0,0,0]})),
      trajectoryReceivers:[],conveyors:[],servos:[],marches:[],arms:[],flights:[],routes:[],coolers:[]}};
}

function firstCycle(location='reserve') {
  const ledger = Supply.create([{id:COMPANION,origin:'opening-reserve:A',weight:1,destination:'reserve'}], {maxQueue:1});
  if (location !== 'reserve') assert(Supply.request(ledger,'first-companion',[COMPANION]).ok);
  if (!['reserve','queued'].includes(location)) assert(Supply.beginEmission(ledger,COMPANION).ok);
  if (['room','returning','returned'].includes(location)) assert(Supply.finishEmission(ledger,COMPANION).ok);
  if (['returning','returned'].includes(location)) {
    assert(Supply.noteTaken(ledger,COMPANION).ok);assert(Supply.notePlaced(ledger,COMPANION).ok);
    assert(Supply.beginReturn(ledger,COMPANION).ok);
  }
  if (location === 'returned') assert(Supply.acceptReturn(ledger,COMPANION).ok);
  const physicalInReserve = ['reserve','queued','returned'].includes(location);
  return {...checkpoint(),firstCycle:{version:1,phase:location==='returned'?'closing':location==='returning'?'return':location==='reserve'?'request':'take',
    guideId:GUIDE,ledger:Supply.snapshot(ledger),reserveParts:physicalInReserve?[piece(COMPANION)]:[],
    snapshot:room([piece(GUIDE,.61,9),...physicalInReserve?[]:[piece(COMPANION)]]),alphaSettings:{coolingOn:true},
    stable:0,transferTime:.17,time:23.7,dialogueStep:null,requiresPlacement:false}};
}

function finishedReserve() {
  const data = firstCycle('returned').firstCycle;
  return {version:1,ledger:data.ledger,reserveParts:data.reserveParts};
}

function passage(withReserve=true) {
  return {...checkpoint(1,true),...(withReserve?{openingReserve:finishedReserve()}:{}),passage:{version:1,
    state:Passage.snapshot(Passage.create({guideId:GUIDE})),player:[...Passage.START],yaw:0,pitch:0,
    guide:group(piece(GUIDE,.48,17)),invitationPending:true}};
}

function memory() {
  const data = new Map(), writes = [];
  const storage = {getItem:key=>data.get(key)??null,setItem(key,value){data.set(key,value);writes.push(key);},
    removeItem(){assert.fail('An invalid save must never delete the prior slot.');}};
  return {data,writes,storage};
}
const store = mem => Saves.createStore({storage:()=>mem.storage,now:()=>1000});

function rejectsWithoutOverwrite(valid, mutations) {
  const mem=memory(),saved=store(mem),written=saved.write('campaign',valid);
  assert(written.ok,written.error);
  const original=mem.data.get(Saves.KEYS.campaign),writes=mem.writes.length;
  for (const [label, mutate] of mutations) {
    const corrupt=clone(valid);mutate(corrupt);
    const result=saved.write('campaign',corrupt);
    assert.equal(result.ok,false,label);
    assert.equal(mem.data.get(Saves.KEYS.campaign),original,label+' preserves the old bytes');
    assert.equal(mem.writes.length,writes,label+' performs no storage write');
  }
}

test('old checkpoints stay readable without loading the optional scene modules',()=>{
  const browser={};vm.runInNewContext(fs.readFileSync(require.resolve('../assets/js/save-games.js'),'utf8'),browser);
  const mem=memory(),saved=browser.QBitsSavedGames.createStore({storage:()=>mem.storage,now:()=>19});
  for(const data of [checkpoint(1),checkpoint(20,true),{checkpoint:{scene:'intro',level:0,completed:false},progress:{}}]){
    assert(saved.write('campaign',data).ok);
    assert.deepEqual(store(mem).read('campaign').save.data,data);
  }
  const original=mem.data.get(Saves.KEYS.campaign);
  assert.equal(saved.write('campaign',firstCycle()).ok,false,'new states need their validator, not a silent fallback');
  assert.equal(mem.data.get(Saves.KEYS.campaign),original);
  browser.QBitsCampaignSupply=Supply;browser.QBitsFactoryPassage=Passage;
  const extended=saved.write('campaign',passage());
  assert(extended.ok,extended.error);
  assert.deepEqual(store(mem).read('campaign').save.data,passage(),'the browser resolves the same optional validators');
});

test('each transfer saves one physical identity and restores its claim, charge and fatigue unchanged',()=>{
  for(const location of ['reserve','queued','emitting','room','returning','returned']){
    const mem=memory(),source=firstCycle(location),result=store(mem).write('campaign',source);
    assert(result.ok,location+': '+result.error);
    const restored=store(mem).read('campaign').save.data;
    assert.deepEqual(restored,source,location);
    const state=restored.firstCycle,records=[...state.reserveParts,...state.snapshot.groups.flatMap(g=>g.parts)],part=records.find(p=>p.id===COMPANION);
    assert.equal(records.filter(p=>p.id===COMPANION).length,1);
    assert.equal(part.mood.energy,.37);assert.equal(part.mood.restLeft,41);
    assert.equal(state.ledger.records[0].claimed,!['reserve','returned'].includes(location));
    assert.equal(state.ledger.records[0].origin,'opening-reserve:A');
  }
});

test('joining existing pieces preserves both identities and the placement requirement across a save',()=>{
  const source=firstCycle('room'),state=source.firstCycle,parts=state.snapshot.groups.flatMap(g=>g.parts);
  state.snapshot.groups=[{parts,q:q(),v:v(.1,0,0),w:v()}];
  state.snapshot.runtime.motion=[{id:GUIDE,v:[.1,0,0],w:[0,0,0]}];
  state.requiresPlacement=true;
  const mem=memory(),result=store(mem).write('campaign',source);
  assert(result.ok,result.error);
  const restored=store(mem).read('campaign').save.data.firstCycle;
  assert.equal(restored.snapshot.groups.length,1);
  assert.deepEqual(restored.snapshot.groups[0].parts.map(part=>part.id),[GUIDE,COMPANION]);
  assert.equal(restored.requiresPlacement,true);
  assert.equal(restored.ledger.records[0].claimed,true);
});

test('the save boundary rejects duplicate, absent, misplaced and unbudgeted material before replacing the slot',()=>{
  rejectsWithoutOverwrite(firstCycle('room'),[
    ['same ID in scene and reserve',d=>d.firstCycle.reserveParts.push(piece(COMPANION))],
    ['duplicate live ID',d=>d.firstCycle.snapshot.groups.push(group(piece(COMPANION)))],
    ['missing live piece',d=>d.firstCycle.snapshot.groups.pop()],
    ['piece stored at the wrong endpoint',d=>{d.firstCycle.snapshot.groups.pop();d.firstCycle.reserveParts.push(piece(COMPANION));}],
    ['unbudgeted live ID',d=>d.firstCycle.snapshot.groups.push(group(piece(90)))],
    ['material mismatch',d=>{d.firstCycle.snapshot.groups[1].parts[0].weight=2;}],
    ['guide included in the ledger',d=>{d.firstCycle.guideId=COMPANION;}],
    ['guide missing from room',d=>{d.firstCycle.snapshot.groups.shift();}],
    ['duplicate guide in reserve',d=>d.firstCycle.reserveParts.push(piece(GUIDE))]
  ]);
});

test('a deliberate queued request cannot lose its claim or gain a first-delivery timer while saving',()=>{
  rejectsWithoutOverwrite(firstCycle('queued'),[
    ['claim removed',d=>{d.firstCycle.ledger.records[0].claimed=false;}],
    ['request reclassified as an offer',d=>{
      const ledger=d.firstCycle.ledger;ledger.records[0].claimed=false;ledger.records[0].offered=true;
      ledger.requests[0].offered=true;ledger.facts.requested=[];
    }],
    ['first-delivery timer added',d=>{d.firstCycle.ledger.offerSeconds=10;}],
    ['charge omitted',d=>{delete d.firstCycle.reserveParts[0].mood.energy;}],
    ['fatigue omitted',d=>{delete d.firstCycle.reserveParts[0].mood.restLeft;}],
    ['whole mood omitted',d=>{delete d.firstCycle.reserveParts[0].mood;}],
    ['placement requirement omitted',d=>{delete d.firstCycle.requiresPlacement;}],
    ['placement requirement malformed',d=>{d.firstCycle.requiresPlacement='false';}],
    ['transit clock invalid',d=>{d.firstCycle.transferTime=-1;}],
    ['stability clock invalid',d=>{d.firstCycle.stable=1e8;}]
  ]);
});

test('unsupported hidden inventories and invented runtime actors cannot enter the first-cycle snapshot',()=>{
  rejectsWithoutOverwrite(firstCycle('room'),[
    ['family inventory',d=>d.firstCycle.snapshot.families.push({id:'family',items:[piece(COMPANION)]})],
    ['shelf inventory',d=>d.firstCycle.snapshot.shelves.push({cells:[{items:[piece(COMPANION)]}]})],
    ['wire material',d=>d.firstCycle.snapshot.powerNetwork.cables.push({materials:[piece(COMPANION)]})],
    ['pending disassembly',d=>d.firstCycle.snapshot.disassembly.push({parts:[piece(COMPANION)]})],
    ['external reservoir',d=>d.firstCycle.snapshot.powerNetwork.reservoirs.push({id:90,energy:1})],
    ['untracked runtime motion',d=>d.firstCycle.snapshot.runtime.motion.push({id:90,v:[0,0,0],w:[0,0,0]})],
    ['untracked route',d=>d.firstCycle.snapshot.runtime.routes.push({id:90,goal:[0,0,0]})],
    ['secondary snapshot carrying the same exercise',d=>{d.openingReserve=finishedReserve();}]
  ]);
});

test('closing needs the explicit physical return; a technical recovery cannot become a completed reserve',()=>{
  const recovered=firstCycle('room');assert(Supply.recover(recovered.firstCycle.ledger,COMPANION).ok);
  assert(Saves.validate('campaign',recovered).ok);
  rejectsWithoutOverwrite(recovered,[['recovery labelled closing',d=>{d.firstCycle.phase='closing';}]]);
  const archive={...checkpoint(1,false),openingReserve:finishedReserve()},mem=memory();
  assert(store(mem).write('campaign',archive).ok,'the micro-mission archive may precede the existing level one');
  assert(store(mem).write('campaign',{...checkpoint(2),openingReserve:finishedReserve()}).ok,'archive persists into later checkpoints');
  rejectsWithoutOverwrite(archive,[
    ['return fact missing',d=>{d.openingReserve.ledger.facts.voluntaryReturns=[];}],
    ['placement fact missing',d=>{d.openingReserve.ledger.facts.placed=[];}],
    ['archive missing its material',d=>{d.openingReserve.reserveParts=[];}]
  ]);
});

test('passage saves preserve the original guide and support old campaign checkpoints without inventing a reserve',()=>{
  for(const withReserve of [true,false]){
    const data=passage(withReserve),mem=memory(),result=store(mem).write('campaign',data);
    assert(result.ok,result.error);assert.deepEqual(store(mem).read('campaign').save.data,data);
    assert.equal(Object.hasOwn(result.save.data,'openingReserve'),withReserve);
  }
  rejectsWithoutOverwrite(passage(),[
    ['guide claimed as reserve stock',d=>{d.passage.guide.parts[0].id=COMPANION;d.passage.state.guideId=COMPANION;}],
    ['route points at a different guide',d=>{d.passage.state.guideId=90;}],
    ['route progress outside its length',d=>{d.passage.state.guideDistance=1e6;}],
    ['arrival granted at the start',d=>{d.passage.state.arrived=true;}],
    ['player below the gallery',d=>{d.passage.player[1]=0;}],
    ['player outside the corridor',d=>{d.passage.player[0]=8;}],
    ['guide charge missing',d=>{delete d.passage.guide.parts[0].mood.energy;}],
    ['passage in an unfinished level',d=>{d.checkpoint.completed=false;}],
    ['two active scenes',d=>{d.firstCycle=firstCycle().firstCycle;}]
  ]);
});

test('externally corrupted scene/reserve data is rejected on read and kept intact until explicit replacement',()=>{
  const mem=memory(),saved=store(mem),valid=firstCycle('room');assert(saved.write('campaign',valid).ok);
  const envelope=JSON.parse(mem.data.get(Saves.KEYS.campaign));
  envelope.data.firstCycle.reserveParts.push(piece(COMPANION));
  const corrupt=JSON.stringify(envelope);mem.data.set(Saves.KEYS.campaign,corrupt);
  assert.equal(saved.read('campaign').status,'invalid');
  assert.equal(saved.write('campaign',valid).ok,false);
  assert.equal(mem.data.get(Saves.KEYS.campaign),corrupt);
  assert(saved.write('campaign',valid,{replace:true}).ok);
  assert.equal(store(mem).read('campaign').status,'ready');
});
