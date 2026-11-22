// A separate hypothesis from sensor discovery: ordinary energy recovery asks
// for a default workshop state on every piece. Count actual constructions.
// QBITS_WORKSHOP_SOURCE=/path/to/workshop.js node tests/benchmark-mood-defaults.cjs
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const createGame=require('./game-harness.cjs');
const file=process.env.QBITS_WORKSHOP_SOURCE||path.join(__dirname,'../assets/js/workshop.js');
const original=fs.readFileSync(file,'utf8');
const source=original.replace('function defaults(part){return','function defaults(part){window.__moodDefaultAudit.defaults++;return')
 .replace('function batteryCapacity(part){return','function batteryCapacity(part){window.__moodDefaultAudit.capacity++;return');
if(source===original)throw new Error('Workshop hooks need review for this source');
const {t,sandbox}=createGame({graphics:false});t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});
sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
for(let i=0;i<100;i++)t.makeGroup(Array.from({length:10},(_,j)=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(4+(i%5)*1.5+j*.09,.045,-4+Math.floor(i/5)*.4),q:t.Q()})));
sandbox.__moodDefaultAudit={defaults:0,capacity:0};vm.runInContext(source,sandbox);
t.updateMoods(1/120);
console.log(JSON.stringify({workshopSha256:crypto.createHash('sha256').update(original).digest('hex'),node:process.version,scope:'Exact default-object constructions during one production updateMoods call; not timing, allocations in bytes, or measured GC.',fixture:{pieces:1000,groups:100,adaptations:0,sensors:0,dt:1/120},counts:sandbox.__moodDefaultAudit,derivedAt240CallsPerSecond:sandbox.__moodDefaultAudit.defaults*240},null,2));
