// Real, connected production recipes with four unobstructed propellers.
// The ordinary game harness still stubs DOM/GPU; these are Cannon scenarios.
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
function lab(options={}){
 const game=createGame(options),{t,sandbox}=game;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle',progress:{}});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 return game;
}
function tick(t,seconds,hz=120){for(let i=0;i<Math.round(seconds*hz);i++)t.stepPhysics(1/hz);}
function machine(kind='arm',options={},geometry={}){
 const spanX=geometry.spanX??7,spanZ=geometry.spanZ??7;
 const game=lab(options),{t}=game,record=kind==='arm'?t.robotArmBlueprintTemplate():t.conveyorBlueprintTemplate('straight');
 const parts=record.groups[0].parts,origin=(kind==='arm'?parts[4]:parts.find(p=>p.shape==='cube'&&p.p[1]===.045)).p;
 let key=Math.max(...record.groups.flatMap(g=>g.parts.map(p=>p.key)))+1;
 const cube=(x,z)=>{const p=[origin[0]+x*.09,.045,origin[2]+z*.09];if(parts.some(a=>a.p.every((v,i)=>Math.abs(v-p[i])<1e-7)))return;parts.push({key:key++,shape:'cube',weight:1,p,q:[0,0,0,1]});};
 for(let x=-spanX;x<=spanX;x++)cube(x,0);
 for(const x of [-spanX,spanX])for(let z=-spanZ;z<=spanZ;z++)cube(x,z);
 for(const x of [-spanX,spanX])for(const z of [-spanZ,spanZ])for(const p of t.propellerBlueprintTemplate().groups[0].parts)parts.push({...p,key:key++,p:[p.p[0]+origin[0]+x*.09,p.p[1]+.09,p.p[2]+origin[2]+z*.09]});
 for(const p of parts.filter(p=>p.shape==='cube').slice(0,4))p.battery={pack:p.key,enabled:false};
 assert(t.savedMechanismValid(record));assert(t.spawnSavedMechanism(record,t.V()));
 const mechanism=kind==='arm'?t.robotArms[0]:t.conveyors[0],base=t.rotorPart(mechanism.baseId).g;
 for(const p of base.parts.filter(t.isExternalBattery)){p.mood.energy=1;p.mood.externalBattery.enabled=true;}
 const flight=t.flightForGroup(base);t.configureFlight(flight,{height:.65});
 return {...game,mechanism,base,flight};
}
module.exports={lab,tick,machine};
