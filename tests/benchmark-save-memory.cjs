// Structural inventory of the save store's retained cache, not heap bytes.
// No timing, forced GC, process-memory delta, browser FPS or storage-I/O claim.
// node tests/benchmark-save-memory.cjs --output=/tmp/qbits-save-memory.json
// --optimized-root=/absolute/checkout loads every game module from that root.
// This tooling-only probe exposes checked on an in-memory copy of the store;
// no getter is added to the shipped game and no production file is rewritten.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict'),Module=require('node:module'),vm=require('node:vm');
const cp=require('node:child_process');
const args=Object.fromEntries(process.argv.slice(2).map(value=>{
 const at=value.indexOf('=');return at<0?[value.replace(/^--/,''),'true']:[value.slice(0,at).replace(/^--/,''),value.slice(at+1)];
}));
const scriptRoot=path.resolve(__dirname,'..'),root=path.resolve(scriptRoot,args['optimized-root']||'.');
const scales=(args.scales||'16,1000,2000').split(',').map(Number),iterations=Number(args.iterations||6);
assert(scales.every(n=>Number.isInteger(n)&&n>0&&n<=2000),'Respect the current 2000-piece limit');
assert(Number.isInteger(iterations)&&iterations>=4&&iterations<=8,'Use four to eight bounded updates');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const plain=value=>JSON.parse(JSON.stringify(value));
function sources(){
 const files=[...fs.readdirSync(path.join(root,'assets/js')).filter(name=>name.endsWith('.js')).sort().map(name=>'assets/js/'+name),'tests/game-harness.cjs','tests/cpu-audit-fixtures.cjs'];
 return Object.fromEntries(files.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
}
const sourceHashes=sources();let commit=null;
try{commit=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{}
function createInstrumentedGame(storage){
 const moduleFile=path.join(root,'assets/js/save-games.js'),moduleSource=fs.readFileSync(moduleFile,'utf8');
 const exportNeedle='return Object.freeze({read, write});';
 assert.equal(moduleSource.split(exportNeedle).length,2,'The store export insertion must be unique');
 const saveGamesSource=moduleSource.replace(exportNeedle,'return Object.freeze({read, write, __memoryChecked:()=>checked});');
 const harnessFile=path.join(root,'tests/game-harness.cjs'),harnessSource=fs.readFileSync(harnessFile,'utf8');
 const readNeedle="fs.readFileSync(path.join(root,'assets/js/save-games.js'),'utf8')";
 assert.equal(harnessSource.split(readNeedle).length,2,'The diagnostic harness insertion must be unique');
 const compiled=new Module(harnessFile,module);compiled.filename=harnessFile;compiled.paths=Module._nodeModulePaths(path.dirname(harnessFile));
 compiled._compile(harnessSource.replace(readNeedle,`(options.saveGamesSource||${readNeedle})`),harnessFile);
 return compiled.exports({graphics:false,storage,saveGamesSource});
}
function ownedGraph(rootObject){
 const objects=new Set(),pending=[rootObject];
 while(pending.length){
  const object=pending.pop();if(!object||typeof object!=='object'||objects.has(object))continue;
  objects.add(object);
  for(const key of Reflect.ownKeys(object)){
   const descriptor=Object.getOwnPropertyDescriptor(object,key);
   assert(Object.hasOwn(descriptor,'value'),'The probe only traverses data properties');
   if(descriptor.value&&typeof descriptor.value==='object')pending.push(descriptor.value);
  }
 }
 return objects;
}
function inventory(checked,storageValues,keys,observedGraphs=[]){
 const slotNames=Object.keys(keys),rootKeys=Reflect.ownKeys(checked);
 assert.deepEqual(rootKeys,slotNames,'The retained root contains only the bounded save slots');
 const cacheObjects=ownedGraph(checked),records=[],primitiveTypes={string:0,number:0,boolean:0,null:0,undefined:0};
 let referenceSlots=0,codeUnits=0,utf8Bytes=0,primitiveSlots=0;
 for(const mode of slotNames){
  const entry=checked[mode];if(entry===null)continue;
  assert(entry&&typeof entry==='object'&&!Array.isArray(entry),'Each live slot owns a metadata record');
  referenceSlots++;
  const fields=Reflect.ownKeys(entry),types={};
  for(const field of fields){
   const value=entry[field],kind=value===null?'null':typeof value;
   assert(Object.hasOwn(primitiveTypes,kind),'No decoded graph, function or symbol is retained inside a metadata record');
   primitiveTypes[kind]++;primitiveSlots++;types[String(field)]=kind;
  }
  assert.equal(typeof entry.raw,'string');
  assert.equal(entry.raw,storageValues.get(keys[mode]),'The record refers to the current persisted bytes');
  const rawCodeUnits=entry.raw.length,rawUtf8Bytes=Buffer.byteLength(entry.raw);
  codeUnits+=rawCodeUnits;utf8Bytes+=rawUtf8Bytes;
  records.push({mode,fields:fields.map(String),fieldCount:fields.length,fieldTypes:types,rawCodeUnits,rawUtf8Bytes,rawSha256:sha(entry.raw),createdAt:entry.createdAt,savedAt:entry.savedAt});
 }
 assert(records.length<=slotNames.length,'Old revisions never add another owned record');
 assert.equal(cacheObjects.size,1+records.length,'Only the root and its live records are retained');
 let borrowedGraphObjects=0;
 for(const value of observedGraphs)for(const object of ownedGraph(value))if(cacheObjects.has(object))borrowedGraphObjects++;
 assert.equal(borrowedGraphObjects,0,'Neither input data nor caller-visible decoded results belong to the cache');
 return {rootObjects:1,rootSlotProperties:rootKeys.length,activeSlotOwners:records.length,cacheRecords:records.length,totalOwnedObjects:cacheObjects.size,ownedObjectReferenceSlots:referenceSlots,primitiveRecordSlots:primitiveSlots,primitiveTypes,rawCodeUnits:codeUnits,rawUtf8Bytes:utf8Bytes,decodedGraphReferences:0,borrowedInputOrResultObjects:borrowedGraphObjects,records};
}
function run(pieces){
 const values=new Map(),control={quota:false,clock:1800000000000};
 const storage={getItem:key=>values.get(key)??null,setItem(key,value){if(control.quota)throw new Error('QuotaExceededError');values.set(key,String(value));},removeItem(){throw new Error('Production saving must not delete slots');}};
 const game=createInstrumentedGame(storage),{t,sandbox}=game;
 sandbox.__memoryClock=control;vm.runInContext('Date.now=()=>globalThis.__memoryClock.clock;',sandbox);
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 t.applyPreferences({physicsHz:120,shadows:'off',music:false,guideVoice:false,footsteps:false,joinSounds:false});
 const fixtures=require(path.join(root,'tests/cpu-audit-fixtures.cjs'))(t);fixtures.distant(pieces);
 assert.equal(fixtures.count(),pieces);assert.equal(t.getPhysicsStep(),1/120);
 const store=t.saveStore,keys=sandbox.QBitsSavedGames.KEYS,checked=()=>store.__memoryChecked();
 const inspect=(graphs=[])=>inventory(checked(),values,keys,graphs);
 const input=()=>({snapshot:t.saveLab({passive:true}),alphaSettings:{...t.alphaSettings}});
 const campaign=level=>({checkpoint:{scene:'campaign',level,completed:false},progress:{intro:true,level1:true,torqueTier:1}});
 const checkpoints=[{stage:'empty',inventory:inspect()}];
 let lastInput,lastLab,lastCampaign;
 const writePair=ordinal=>{
  control.clock=1800000000000+ordinal*1000;
  t.groups[0].parts[0].mood.energy=.9-ordinal*.03;
  lastInput=input();lastLab=store.write('lab',lastInput);lastCampaign=store.write('campaign',campaign(ordinal+1));
  assert(lastLab.ok,lastLab.error);assert(lastCampaign.ok,lastCampaign.error);
  assert.equal(lastLab.save.data.snapshot.groups[0].parts[0].mood.energy,t.groups[0].parts[0].mood.energy);
  assert.equal(lastLab.save.savedAt,control.clock);assert.equal(lastCampaign.save.savedAt,control.clock);
  return inspect([lastInput,lastLab,lastCampaign]);
 };
 const populated=writePair(0);checkpoints.push({stage:'both-populated',inventory:populated});
 let maximumRecords=populated.cacheRecords,maximumObjects=populated.totalOwnedObjects;
 const versions=[];
 for(let i=1;i<=iterations;i++){
  const current=writePair(i);maximumRecords=Math.max(maximumRecords,current.cacheRecords);maximumObjects=Math.max(maximumObjects,current.totalOwnedObjects);
  versions.push({update:i,activeSlotOwners:current.activeSlotOwners,totalOwnedObjects:current.totalOwnedObjects,labRawSha256:current.records.find(record=>record.mode==='lab').rawSha256,campaignRawSha256:current.records.find(record=>record.mode==='campaign').rawSha256});
 }
 assert.equal(new Set(versions.map(version=>version.labRawSha256)).size,iterations,'Every measured revision has different live data and time');
 const afterUpdates=inspect([lastInput,lastLab,lastCampaign]);checkpoints.push({stage:'after-bounded-updates',inventory:afterUpdates});

 // Keep references to results deliberately: observing their mutation must not
 // modify a cached decoded graph, because that graph must not exist there.
 const savedEnergy=t.groups[0].parts[0].mood.energy,savedRaw=values.get(keys.lab);
 lastInput.snapshot.groups[0].parts[0].mood.energy=-10;
 lastLab.save.data.snapshot.groups[0].parts[0].mood.energy=-20;
 const readOne=store.read('lab');assert.equal(readOne.status,'ready');
 assert.equal(readOne.save.data.snapshot.groups[0].parts[0].mood.energy,savedEnergy);
 readOne.save.data.snapshot.groups[0].parts[0].mood.energy=-30;
 const readTwo=store.read('lab');assert.equal(readTwo.status,'ready');
 assert.equal(readTwo.save.data.snapshot.groups[0].parts[0].mood.energy,savedEnergy);
 assert.equal(values.get(keys.lab),savedRaw);
 checkpoints.push({stage:'after-caller-mutations',inventory:inspect([lastInput,lastLab,lastCampaign,readOne,readTwo])});

 const previousRecord=plain(checked().lab),previousRaw=values.get(keys.lab);
 control.clock+=1000;t.groups[0].parts[0].mood.energy=.01;control.quota=true;
 const failed=store.write('lab',input());control.quota=false;
 assert.equal(failed.ok,false);assert.equal(values.get(keys.lab),previousRaw);
 assert.deepEqual(plain(checked().lab),previousRecord,'Quota failure must not promote the failed revision');
 checkpoints.push({stage:'after-quota-failure',inventory:inspect([failed])});

 values.set(keys.lab,'{"broken":');
 const corrupted=store.read('lab');assert.equal(corrupted.status,'invalid');assert.equal(checked().lab,null);
 checkpoints.push({stage:'after-external-malformed-lab',inventory:inspect([corrupted])});
 values.set(keys.lab,previousRaw);assert.equal(store.read('lab').status,'ready');
 checkpoints.push({stage:'after-external-valid-lab',inventory:inspect()});
 for(const mode of ['lab','campaign']){
  values.delete(keys[mode]);assert.equal(store.read(mode).status,'empty');assert.equal(checked()[mode],null);
  checkpoints.push({stage:'after-external-delete-'+mode,inventory:inspect()});
 }
 assert.equal(inspect().activeSlotOwners,0);
 control.quota=true;const failedEmpty=store.write('lab',input());control.quota=false;
 assert.equal(failedEmpty.ok,false);assert.equal(values.has(keys.lab),false);assert.equal(inspect().activeSlotOwners,0);
 checkpoints.push({stage:'after-empty-slot-quota-failure',inventory:inspect([failedEmpty])});
 return {pieces,inventory:fixtures.inventory(),iterations,maximumCacheRecords:maximumRecords,maximumOwnedObjects:maximumObjects,versions,checkpoints,assertions:{boundedSlots:true,noHistoricalDecodedGraphs:true,noInputOrResultGraphOwnership:true,callerMutationIsolation:true,quotaPreservesPriorRecord:true,emptyQuotaCreatesNoRecord:true,malformedExternalBytesClearSlot:true,externalDeletionClearsBothSlots:true}};
}
const reports=scales.map(run);
assert.deepEqual(sources(),sourceHashes,'Production sources changed during the inventory');
const result={schema:1,source:{commit,files:sourceHashes},benchmarkSha256:sha(fs.readFileSync(__filename)),runtime:{node:process.version,platform:process.platform,arch:process.arch},configuration:{scales,iterations,physicsHz:120,storage:'Map implementing getItem/setItem; no Web Storage I/O'},method:{scope:'Exact objects and own-property slots reachable from the private checked root. The store API object, function closures, existing scene, test hooks and temporary probe Sets are outside this cache inventory.',strings:'UTF-16 code units and UTF-8 encoded lengths describe retained raw values, not V8 heap bytes. Map and the cache can share the same immutable string; distinct physical string allocations or engine representation are not inferred.',instrumentation:'Only an in-memory copy of save-games.js exposes the private root. All game modules and the real snapshot fixture load from the selected checkout. No production getter, file mutation, timer, forced GC or heap delta.',boundedness:'Four to eight changed revisions per mode, then caller mutation, quota failure, external corruption, valid external replacement, deletion and empty-slot quota failure. After deletion the checked root remains, but zero records and zero raw values are retained.'},reports};
const output=JSON.stringify(result,null,2)+'\n';
if(args.output){fs.mkdirSync(path.dirname(path.resolve(args.output)),{recursive:true});fs.writeFileSync(args.output,output);}else process.stdout.write(output);
