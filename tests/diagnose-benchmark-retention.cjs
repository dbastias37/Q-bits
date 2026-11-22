// Bounded liveness diagnostic, not a timing benchmark or a GC pass/fail test.
// Run: node --expose-gc tests/diagnose-benchmark-retention.cjs --mode=all
// Report records must not keep an entire game VM alive between benchmark cases.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const root=path.resolve(__dirname,'..',args.root||'.'),mode=args.mode||'all';
const modes=['none','clock','clock-copy','blocks','blocks-copy'];
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
assert(mode==='all'||modes.includes(mode),'unknown diagnostic mode');
assert.equal(typeof global.gc,'function','run Node with --expose-gc');

async function observe(selected){
 const createGame=require(path.join(root,'tests/game-harness.cjs'));
 const source=fs.readFileSync(path.join(root,'assets/js/game.js'),'utf8'),at=source.lastIndexOf('})();');
 assert(at>=0,'game instrumentation hook not found');
 // Same nested VM-owned report structure as profile-cpu-architecture.cjs.
 // Count one real operation, but intentionally do not collect elapsed time.
 const hooks=`window.__phaseProfile={enabled:false,blocks:{}};
 {const original=updateTarget;updateTarget=function(...a){
  if(!window.__phaseProfile.enabled)return original.apply(this,a);
  try{return original.apply(this,a);}finally{
   const blocks=window.__phaseProfile.blocks,entry=blocks.updateTarget||(blocks.updateTarget={calls:0,inclusiveMs:0});entry.calls++;
  }
 };}
 `;
 const instrumented=source.slice(0,at)+hooks+source.slice(at),reports=[],worlds=[];
 let payloadBytes=null,valuesUnchanged=true;
 function makeOne(){
  const game=createGame({gameSource:instrumented}),{t,sandbox}=game;
  t.clearNarrativeScene();t.story.ready=false;
  for(let i=0;i<4;i++)t.addQubit([i*.3,1,0]);
  sandbox.__phaseProfile.enabled=true;t.updateTarget();sandbox.__phaseProfile.enabled=false;
  worlds.push(new WeakRef(t.world));
  if(selected==='none')return;
  const payload=selected.startsWith('clock')?t.getTickState():sandbox.__phaseProfile.blocks;
  if(selected.startsWith('clock'))assert(Object.values(payload).every(value=>value===null||typeof value!=='object'&&typeof value!=='function'),'clock must be a flat primitive record');
  const value=selected==='clock-copy'?{...payload}:selected==='blocks-copy'?JSON.parse(JSON.stringify(payload)):payload;
  const encoded=JSON.stringify(payload);payloadBytes=Buffer.byteLength(encoded);
  valuesUnchanged&&=JSON.stringify(value)===encoded;
  reports.push({value});
 }
 for(let i=0;i<4;i++)makeOne();
 const turn=()=>new Promise(resolve=>setImmediate(resolve));
 async function collectAndObserve(){
  const live=[];
  for(let cycle=0;cycle<5;cycle++){
   // deref() keeps its target alive through the current job. Yield native
   // turns before collections, and never dereference before GC in that job.
   await turn();global.gc();await turn();global.gc();await turn();
   live.push(worlds.reduce((n,ref)=>n+(ref.deref()!==undefined?1:0),0));
  }
  return live;
 }
 const whileReportsRetained=await collectAndObserve();
 reports.length=0;
 const afterReportsReleased=await collectAndObserve();
 return {mode:selected,createdWorlds:worlds.length,whileReportsRetained,afterReportsReleased,payloadBytes,valuesUnchanged};
}

(async()=>{
 // A fresh process per mode avoids retention from a preceding variant. No
 // liveness expectation is asserted: GC and WeakRef observations can vary.
 const observations=mode==='all'?modes.map(selected=>JSON.parse(execFileSync(process.execPath,['--expose-gc',__filename,'--mode='+selected,'--root='+root],{encoding:'utf8',timeout:30000})).observations[0]):[await observe(mode)];
 const result={method:'WeakRef world liveness after five cycles of explicit GC separated by native event-loop turns; four small fresh games per variant, separate processes for mode=all. Observational diagnostic only, without elapsed-time/CPU claims or guaranteed-GC assertions.',node:process.version,root,gameSha256:sha(fs.readFileSync(path.join(root,'assets/js/game.js'))),harnessSha256:sha(fs.readFileSync(path.join(root,'tests/game-harness.cjs'))),scriptSha256:sha(fs.readFileSync(__filename)),observations,limitations:['The exact V8 internal retaining chain is not inspected.','This diagnostic does not establish the cause of any prior frame-time regime.']};
 const json=JSON.stringify(result,null,2)+'\n';
 if(args.output){fs.mkdirSync(path.dirname(path.resolve(args.output)),{recursive:true});fs.writeFileSync(args.output,json);}
 process.stdout.write(json);
})().catch(error=>{console.error(error);process.exitCode=1;});
