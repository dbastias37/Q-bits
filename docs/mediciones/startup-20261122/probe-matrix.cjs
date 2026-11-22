// First four real frames, fresh process; diagnostic only, no source mutation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(process.argv[2]),output=process.argv[3];
const createGame=require(path.join(root,'tests/game-harness.cjs'));
const fixtures=require(path.join(root,'tests/cpu-audit-fixtures.cjs'));
const kind=new Function('a','return {dictionary:%HasDictionaryElements(a),fast:%HasFastElements(a),holey:%HasHoleyElements(a)}');
const game=createGame({graphics:false}),{t,sandbox}=game,f=fixtures(t);
t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
t.applyPreferences({physicsHz:120,shadows:'off',music:false,guideVoice:false,footsteps:false,joinSounds:false});
t.setLook({camera:[0,1.7,0],yaw:0,pitch:0});
const setupStart=performance.now();f.scene('independent',2000,false);const sceneMs=performance.now()-setupStart;
const resets=[],frames=[],world=t.world;
for(const [id,m]of [world.collisionMatrix,world.collisionMatrixPrevious].entries()){
 const reset=m.reset;m.reset=function(){const before={length:this.matrix.length,...kind(this.matrix)},cpu=process.cpuUsage(),start=performance.now();
  try{return reset.call(this);}finally{const wallMs=performance.now()-start,used=process.cpuUsage(cpu);resets.push({id,step:world.stepnumber+1,before,after:{length:this.matrix.length,...kind(this.matrix)},wallMs,cpuMs:(used.user+used.system)/1000});}
 };
}
for(let i=0;i<4;i++){
 const row={frame:i+1};for(const [name,op]of [['advance',()=>t.advanceSimulation(1/60)],['liquids',()=>t.updateBatteryLiquids(1/60)],['target',()=>t.updateTarget()],['render',()=>t.renderScene()]]){
  const start=performance.now();op();row[name]=performance.now()-start;
 }row.inventory=f.inventory();row.clock={...t.getTickState()};frames.push(row);
}
fs.writeFileSync(output,JSON.stringify({root,gameSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets/js/game.js'))).digest('hex'),node:process.version,sceneMs,resets,frames},null,2)+'\n');
