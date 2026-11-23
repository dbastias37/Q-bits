const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const F=require('../assets/js/families.js');
const copy=value=>JSON.parse(JSON.stringify(value));
function piece(id,shape='cube',weight=1){return {id,shape,weight,p:[0,.045,0],q:[0,0,0,1],mood:{name:'Original '+id,energy:(id%101)/100,blend:[1,0,0],origin:{scene:'lab',serial:id}}};}
function item(id,size=1,shape='cube'){return {version:1,groups:[{q:[0,0,0,1],parts:Array.from({length:size},(_,i)=>piece(id+i,shape,1+(i%5)*.25))}],joints:[],sets:[],contacts:{sensors:[],rotors:[]}};}
function rotor(id){const a=item(id,1,'coupler'),b=item(id+1,1,'coupler');return {version:1,groups:[...a.groups,...b.groups],joints:[{aId:id,bId:id+1,rpm:43,direction:-1,moving:'b',enabled:false,mount:'wheel',maxTorque:.8,capacity:50}],sets:[{name:'Rotores',members:[{aId:id,bId:id+1}]}],contacts:{sensors:[],rotors:[]}};}
function family(items=[item(1)]){return {version:1,id:1,name:'Familia',color:'#000000',items,p:[0,.1,0],q:[0,0,0,1],v:[0,0,0],w:[0,0,0]};}
function material(items){return items.flatMap(i=>i.groups.flatMap(g=>g.parts)).sort((a,b)=>a.id-b.id);}
function freeze(value){if(value&&typeof value==='object'){for(const key of Object.keys(value))freeze(value[key]);Object.freeze(value);}return value;}

test('family name normalization keeps Spanish, emoji and a bounded free name',()=>{
 assert.equal(F.sanitizeName('  Mi\n  dron\t negro  '),'Mi dron negro');assert.equal(F.sanitizeName('Bateri\u0301as'),'Baterías');assert.equal(F.sanitizeName(null),'Familia');assert.equal(F.sanitizeName('\u0000\u202e'),'Familia');assert.equal(F.sanitizeName('', ' Repuestos '),'Repuestos');assert.equal(Array.from(F.sanitizeName('🔋'.repeat(45))).length,40);assert.equal(F.sanitizeName('<Dron 2>'),'<Dron 2>');
});
test('all hexadecimal colors, especially pure black, survive normalization',()=>{
 assert.equal(F.sanitizeColor('#000000'),'#000000');assert.equal(F.sanitizeColor(' #ABC '),'#aabbcc');assert.equal(F.sanitizeColor('#Ff00aA'),'#ff00aa');assert.equal(F.sanitizeColor('transparent'),'#202327');assert.equal(F.sanitizeColor(null,'#000000'),'#000000');assert.equal(F.sanitizeColor(null,'invalid'),'#202327');assert(F.validFamily(family()));
});
test('count means base pieces and weight includes complete mixed mechanisms',()=>{
 const entries=[item(1,3),item(10,2,'pyramid'),rotor(20)];entries[0].groups[0].parts[0].mood.externalBattery={version:1,ownerId:1,packId:1,enabled:false};
 assert.equal(F.count(entries),7);assert.equal(F.weight(entries),8);const stats=F.stats(entries);assert.equal(stats.count,7);assert.equal(stats.weight,8);assert.equal(stats.batteries,1);assert.deepEqual([...stats.ids],[1,2,3,10,11,20,21]);assert(F.validateItems(entries));
});
test('partition of 2000 pieces preserves each identity, energy, origin and module',()=>{
 const entries=freeze(Array.from({length:2000},(_,i)=>item(i+1))),batches=F.partition(entries);assert.equal(batches.length,20);assert(batches.every(batch=>F.count(batch)===100));assert.deepEqual(material(batches.flat()),material(entries));batches[0][0].groups[0].parts[0].mood.energy=1;assert.equal(entries[0].groups[0].parts[0].mood.energy,.01);
 const modules=freeze([item(3000,99),rotor(4000),item(5000,98)]),packed=F.partition(modules);assert.deepEqual(packed.map(F.count),[99,100]);assert.deepEqual(packed[1][0],modules[1]);
});
test('partition rejects oversized indivisible modules before exposing a partial result',()=>{
 const source=freeze([item(1,9),rotor(100)]);assert.throws(()=>F.partition(source,1),{code:'OVERSIZED_FAMILY_ITEM'});assert.equal(F.count(source),11);assert.deepEqual(F.partition([],10),[]);assert.throws(()=>F.partition([item(1,101)]));
 for(const capacity of [0,-1,1.5,101,Infinity,'10'])assert.throws(()=>F.partition([item(1)],capacity),{code:'INVALID_FAMILY_LIMIT'});
});
test('shake split transfers at most ten base pieces without cutting a rotor',()=>{
 const source=freeze([...Array.from({length:9},(_,i)=>item(i+1)),rotor(20),item(30)]),result=F.split(source);assert.equal(F.count(result.taken),9);assert.equal(F.count(result.remaining),3);assert.deepEqual(result.remaining[0],source[9]);assert.deepEqual(material([...result.taken,...result.remaining]),material(source));result.remaining[0].joints[0].rpm=12;assert.equal(source[9].joints[0].rpm,43);
 const ten=F.split(Array.from({length:30},(_,i)=>item(i+1)));assert.equal(F.count(ten.taken),10);assert.equal(F.count(ten.remaining),20);assert.throws(()=>F.split([item(1,11)]),{code:'OVERSIZED_FAMILY_ITEM'});
});
test('merge validates capacity and global ownership before changing any source',()=>{
 const left=freeze([item(1,40)]),right=freeze([item(100,60)]),joined=F.merge(left,right);assert.equal(F.count(joined),100);assert.deepEqual(material(joined),material([...left,...right]));joined[0].groups[0].parts[0].mood.origin.serial=99;assert.equal(left[0].groups[0].parts[0].mood.origin.serial,1);
 assert.throws(()=>F.merge(left,[item(100,61)]),{code:'FAMILY_CAPACITY'});assert.throws(()=>F.merge(left,[item(30)]),{code:'DUPLICATE_FAMILY_ID'});assert.equal(F.count(left),40);
});
test('cloning never aliases saved metadata, batteries, links or joint settings',()=>{
 const a=rotor(1),sensor=piece(10);sensor.mood.workshop={version:1,ownerId:10,sensor:true};sensor.mood.sensorLink={aId:500,bId:501,kind:'set',signature:'500-501'};a.groups[0].parts.push(sensor);a.contacts.sensors.push({id:10,latched:true,clearSeconds:.02});a.contacts.rotors.push({key:'1:2:start',latched:false,clearSeconds:.01});
 const source=freeze([a]),cloned=F.cloneItems(source);assert.deepEqual(cloned,source);cloned[0].groups[0].parts[1].mood.sensorLink.aId=777;assert.equal(source[0].groups[0].parts[1].mood.sensorLink.aId,500);assert(F.validFamily(family(source)));
});
test('validation reserves no external IDs even when a later item is corrupt',()=>{
 const used=new Set([1000]),source=[item(1),item(2)];assert(F.validateItems(source,{usedIds:used}));assert.deepEqual([...used],[1000]);source.push(item(1));assert.equal(F.validateItems(source,{usedIds:used}),false);assert.deepEqual([...used],[1000]);assert.equal(F.validateItems([item(1000)],{usedIds:used}),false);assert.equal(F.validFamily(family([item(1000)]),{usedIds:used}),false);
});
test('duplicate IDs across different items and inside one item are rejected',()=>{
 assert.equal(F.validateItems([item(1),item(1)]),false);const corrupt=item(1,2);corrupt.groups[0].parts[1].id=1;assert.equal(F.validateItems([corrupt]),false);assert.throws(()=>F.cloneItems([item(1),item(1)]),{code:'DUPLICATE_FAMILY_ID'});
});
test('invalid piece states and non-normalized transforms cannot enter a family',()=>{
 for(const change of [p=>p.mood.energy=-.1,p=>p.mood.energy=1.1,p=>p.weight=0,p=>p.weight=NaN,p=>p.q=[0,0,0,0],p=>p.shape='unknown',p=>p.id=0,p=>p.mood.blend=[0,0,NaN],p=>p.mood.sensorLink={aId:0,bId:5},p=>p.mood.externalBattery={version:1,ownerId:88,packId:1,enabled:false},p=>p.mood.workshop={ownerId:88}]){const a=item(1);change(a.groups[0].parts[0]);assert.equal(F.validateItems([a]),false);}
});
test('mandatory internal joint, set and contact references are checked',()=>{
 for(const change of [a=>a.joints[0].bId=80,a=>a.sets[0].members[0].aId=99,a=>a.sets.push(copy(a.sets[0])),a=>a.contacts.sensors.push({id:70,latched:true,clearSeconds:0}),a=>a.contacts.rotors.push({key:'55:56',latched:true,clearSeconds:0})]){const a=rotor(1);change(a);assert.equal(F.validateItems([a]),false);}
 const a=rotor(1);a.contacts.rotors.push({key:'1:2:group:1-2,3-4:stop',latched:true,clearSeconds:.08});assert(F.validateItems([a]));
});
test('set family signatures preserve external members with canonical stable identities',()=>{
 const a=rotor(10);a.sets[0].familySignature='2-3,10-11';assert(F.validateItems([a]));assert(F.validFamily(family([a])));assert.equal(F.cloneItems([a])[0].sets[0].familySignature,'2-3,10-11');
 for(const signature of ['',null,'10-11,2-3','02-3,10-11','10-11,10-11','2-3','2-10,10-11','0-1,10-11','10-11,9007199254740992-9007199254740993']){const invalid=copy(a);invalid.sets[0].familySignature=signature;assert.equal(F.validateItems([invalid]),false,String(signature));}
});
test('family records are nonempty, canonical, bounded and geometrically valid',()=>{
 assert(F.validFamily(family([item(1,100)])));for(const change of [f=>f.version=2,f=>f.id=0,f=>f.name='',f=>f.name='a'.repeat(41),f=>f.color='black',f=>f.p=[0,Infinity,0],f=>f.q=[0,0,0,2],f=>f.v=[0,0],f=>f.w=[0,0,NaN],f=>f.items=[],f=>f.items=[item(1,100),item(101)]]){const record=family();change(record);assert.equal(F.validFamily(record),false);}
});
test('JSON input rejects cycles, deep values, functions and non-JSON instances',()=>{
 for(const mutate of [m=>m.loop=m,m=>m.bad=undefined,m=>m.bad=()=>1,m=>m.bad=new Date(),m=>m.bad=Infinity,m=>{m.bad={};let value=m.bad;for(let i=0;i<F.MAX_JSON_DEPTH;i++){value.next={};value=value.next;}},m=>m.bad=JSON.parse('{"__proto__":{"polluted":true}}')]){const a=item(1);mutate(a.groups[0].parts[0].mood);assert.equal(F.validateItems([a]),false);assert.throws(()=>F.cloneItems([a]));}
 assert.equal({}.polluted,undefined);
});
test('JSON budget is based on serialized UTF-8 bytes and rejects before cloning',()=>{
 const a=item(1);a.groups[0].parts[0].mood.payload='a'.repeat(512001);assert.equal(F.validateItems([a]),false);
 const b=item(1),mood=b.groups[0].parts[0].mood;for(let i=0;i<5;i++)mood['payload'+i]='🔋'.repeat(120000);assert(Buffer.byteLength(JSON.stringify([b]))>F.MAX_JSON_BYTES);assert.equal(F.validateItems([b]),false);assert.equal(F.validFamily(family([b])),false);
});
test('family JSON budget includes metadata and public options cannot skip JSON safety',()=>{
 const a=item(1),mood=a.groups[0].parts[0].mood;
 for(let i=0;i<4;i++)mood['payload'+i]='a'.repeat(512000);
 mood.remainder='';const emptyBytes=Buffer.byteLength(JSON.stringify([a]));
 mood.remainder='a'.repeat(F.MAX_JSON_BYTES-emptyBytes-16);
 assert(F.validateItems([a]));assert.equal(F.validFamily(family([a])),false);
 mood.remainder='a'.repeat(F.MAX_JSON_BYTES-emptyBytes-2047);
 assert(F.validateItems([a]));assert.equal(F.validFamily(family([a])),false,'family reserves metadata before reaching the hard JSON limit');
 mood.remainder=mood.remainder.slice(0,-1);const admitted=family([a]);assert(F.validFamily(admitted));
 admitted.name='🔋'.repeat(40);admitted.p=[-999.9999999999999,1.234567890123456e-21,17.123456789012345];admitted.v=admitted.p.slice();admitted.w=admitted.p.slice();assert(F.validFamily(admitted),'renaming and moving an admitted family cannot exhaust its JSON envelope');
 const invalid=item(2);invalid.groups[0].parts[0].mood.loop=invalid;
 assert.equal(F.validateItems([invalid],{jsonAlreadyChecked:true}),false);
 assert.equal(F.validFamily(family([invalid]),{jsonAlreadyChecked:true}),false);
 const duplicate=family([item(3),item(3)]);assert.equal(F.validFamily(duplicate),false);
 const usedIds=new Set([4]);assert.equal(F.validFamily(family([item(4)]),{usedIds}),false);assert.deepEqual([...usedIds],[4]);
});
test('input getters and sparse arrays are rejected without invoking user code',()=>{
 const a=item(1);let called=0;Object.defineProperty(a.groups[0].parts[0].mood,'danger',{enumerable:true,get(){called++;return 'unsafe';}});assert.equal(F.validateItems([a]),false);assert.equal(called,0);const sparse=[item(1)];sparse.length=3;assert.equal(F.validateItems(sparse),false);
});
test('browser export and cross-realm plain JSON use the shared organizer validator',()=>{
 const sandbox={window:null,QBitsOrganizers:require('../assets/js/organizers.js')};sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js/families.js'),'utf8'),sandbox);assert.equal(sandbox.QBitsFamilies.CAPACITY,100);assert(sandbox.QBitsFamilies.validFamily(family([rotor(1)])));assert.equal(sandbox.QBitsFamilies.sanitizeColor('#000000'),'#000000');
});
test('actual game snapshots retain complete rotors, mixed solids and battery charge',()=>{
 const {t}=require('./game-harness.cjs')();t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});
 const motor=t.spawnRotor(t.V(0,.3,0));t.configureRotor(motor,{rpm:43,direction:-1,maxTorque:.8,capacity:50});t.createRotorSet('Motor guardado',[motor]);const savedRotor=t.shelfSnapshot(t.rotorConnectedGroups(t.rotorGroups(motor)));assert(F.validateItems([savedRotor]));
 const solid=t.makeGroup(Array.from({length:100},(_,i)=>({id:500+i,shape:['cube','pyramid','tetra','coupler'][i%4],weight:1+i/100,p:t.V(2+(i%10)*.18,.5+Math.floor(i/10)*.18,1),q:t.Q(),mood:{energy:.21+i/1000,name:'Original '+i}}))),savedSolid=t.shelfSnapshot([solid]);assert(F.validateItems([savedSolid]));assert.equal(F.count([savedSolid]),100);
 const battery=t.addQubit([3,.3,0]),part=battery.parts[0];part.mood.externalBattery={version:1,ownerId:part.id,packId:part.id,enabled:false};part.mood.energy=.28;const savedBattery=t.shelfSnapshot([battery]),record=family([savedRotor,savedBattery]);assert(F.validFamily(record));assert.equal(F.stats(record.items).batteries,1);assert.deepEqual(F.cloneItems(record.items),copy(record.items));
});
