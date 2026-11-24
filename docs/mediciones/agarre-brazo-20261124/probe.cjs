// Run from the Q-bits repository root: node docs/mediciones/agarre-brazo-20261124/probe.cjs current 4 240 pitch
// Standalone production/Cannon probe. DOM/GPU are stubbed; rotation errors use degrees.
// Optional historical revision may replace 'current'. GRIP_OWN_INERTIA=1 is a diagnostic ablation only.
const fs=require('node:fs'),cp=require('node:child_process');
const root=process.cwd();
const createGame=require(root+'/tests/game-harness.cjs');
const [revision='current',pickArg='4',hzArg='240',axisArg='pitch']=process.argv.slice(2);
let gameSource=revision==='current'?fs.readFileSync(root+'/assets/js/game.js','utf8'):cp.execFileSync('git',['show',revision+':assets/js/game.js'],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
if(process.env.GRIP_OWN_INERTIA==='1'){
 const original='strength,gripDrivenInertia(item));';
 if(!gameSource.includes(original))throw Error('The own-inertia diagnostic requires the historical explicit-torque controller.');
 gameSource=gameSource.replace(original,'strength,b.inertia);');
}
const {t,sandbox}=createGame({gameSource}),hz=Number(hzArg),pick=Number(pickArg);
t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});
sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
t.applyPreferences({...sandbox.QBitsPreferences.defaults(),physicsHz:hz});
if(!t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V()))throw Error('Arm did not spawn');
const arm=t.robotArms[0],partId=t.groups[pick].parts[0].id;
const startIds=t.groups.flatMap(g=>g.parts.map(p=>p.id)).sort((a,b)=>a-b),mass=t.groups.reduce((n,g)=>n+g.body.mass,0);
let phaseIndex=-1;const phases=['settle','lift','turn','hold','drop','regrab','drop-again'];
const report={revision,pick,hz,axis:axisArg,phaseMetrics:{},peakHeight:0,peakSpeed:0,peakSpin:0,peakJointGap:0,checkpoints:[]};
function observe(){
 report.peakHeight=Math.max(report.peakHeight,...t.groups.map(g=>t.bounds(g).max.y));
 report.peakSpeed=Math.max(report.peakSpeed,...t.groups.map(g=>g.body.velocity.norm()));
 report.peakSpin=Math.max(report.peakSpin,...t.groups.map(g=>g.body.angularVelocity.norm()));
 let gap=0;for(const rotor of t.rotors)gap=Math.max(gap,t.couplerTip(t.rotorPart(rotor.aId)).point.distanceTo(t.couplerTip(t.rotorPart(rotor.bId)).point));
 report.peakJointGap=Math.max(report.peakJointGap,gap);
 const m=report.phaseMetrics[phases[phaseIndex]]||={peakJointGap:0,peakSpeed:0,peakSpin:0};m.peakJointGap=Math.max(m.peakJointGap,gap);m.peakSpeed=Math.max(m.peakSpeed,...t.groups.map(g=>g.body.velocity.norm()));m.peakSpin=Math.max(m.peakSpin,...t.groups.map(g=>g.body.angularVelocity.norm()));
 if(!Number.isFinite(report.peakSpin)||report.peakHeight>20||report.peakSpeed>100){report.diverged=true;return false;}
 return true;
}
function step(seconds){phaseIndex++;for(let i=0;i<Math.round(seconds*hz);i++){t.stepPhysics(1/hz);if(!observe())return false;}return true;}
function error(a,b){return 2*Math.acos(Math.min(1,Math.abs(a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w)))*180/Math.PI;}
function checkpoint(name,initial){
 const hit=t.rotorPart(partId),held=t.getHeld();let rotationError=null;
 if(held&&initial){const target=held.rotation.mult(held.initialRotation.inverse()).mult(initial);rotationError=error(target,hit.g.body.quaternion);}
 report.checkpoints.push({name,height:hit.g.body.position.y,rotationError,spin:hit.g.body.angularVelocity.norm(),speed:hit.g.body.velocity.norm(),handDistance:held?.anchorBody?held.anchorBody.position.distanceTo(held.g.body.position):null});
}
function grab(){
 const hit=t.rotorPart(partId),p=hit.g.body.position.clone();
 t.setLook({camera:[p.x,1.5,p.z+1],yaw:0,pitch:0});
 t.grabQubit({...hit,point:p,distance:1});
 if(!t.getHeld())throw Error('Could not grab selected body');
 return hit.g.body.quaternion.clone();
}
step(.25);let initial=grab();
if(step(2)){
 checkpoint('lifted',initial);t.keys.add('ShiftLeft');
 const held=t.getHeld(),turn=t.Q(),axis=axisArg==='yaw'?t.V(0,1,0):axisArg==='roll'?t.V(0,0,1):t.V(1,0,0);
 turn.setFromAxisAngle(axis,Math.PI);held.rotation=turn.mult(held.initialRotation);
 if(step(4)){
  checkpoint('inverted',initial);t.keys.delete('ShiftLeft');
  if(step(1)){
   checkpoint('held',initial);t.releaseQubit(false);
   if(step(3)){
    checkpoint('released');initial=grab();
    if(step(2)){checkpoint('regrabbed',initial);t.releaseQubit(false);step(1);checkpoint('released-again');}
   }
  }
 }
}
report.finalIds=t.groups.flatMap(g=>g.parts.map(p=>p.id)).sort((a,b)=>a-b);
report.identitiesPreserved=JSON.stringify(startIds)===JSON.stringify(report.finalIds);delete report.finalIds;
report.massDelta=t.groups.reduce((n,g)=>n+g.body.mass,0)-mass;
console.log(JSON.stringify(report));
