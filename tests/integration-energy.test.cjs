const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);

function coolerGame(tiers=[1,2,3],seconds=1){
 const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();
 Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 const workshop=sandbox.QBitsWorkshop,profile=workshop.normalizeProfile({claimed:Array.from({length:20},(_,i)=>i+1),research:workshop.RESEARCH.map(item=>item.id)});
 const cooler=t.createCooler(t.V(0,0,0));assert(cooler);cooler.coolSeconds=seconds;
 const parts=tiers.map((tier,i)=>{
  const g=t.addQubit([(i-(tiers.length-1)/2)*.14,.064,0]),part=g.parts[0];
  part.mood.energy=.1;const plan=workshop.planPartUpgrade(part,{battery:tier},profile);assert(!plan.error,plan.error);Object.assign(part,plan.part);
  Object.assign(part.mood,{state:'restless',reason:'agotado',restLeft:20});return part;
 });
 return {...game,cooler,parts};
}

test('cooling keeps the configured exit percentage but takes longer for larger battery capacities',()=>{
 const {t,sandbox,cooler,parts}=coolerGame(),workshop=sandbox.QBitsWorkshop;
 const joules=part=>part.mood.energy*t.gameBatteryCapacity(part);
 for(const part of parts)near(joules(part),12);
 t.updateCooling(2);assert.equal(cooler.occupants,3);
 near(parts[0].mood.coolProgress,1);near(joules(parts[0]),60);assert.equal(parts[0].mood.state,'neutral');
 near(parts[1].mood.coolProgress,2/3);near(joules(parts[1]),12);assert.equal(parts[1].mood.state,'restless');
 near(parts[2].mood.coolProgress,.5);near(joules(parts[2]),12);assert.equal(parts[2].mood.state,'restless');
 t.updateCooling(1);near(joules(parts[1]),90);near(parts[2].mood.coolProgress,.75);near(joules(parts[2]),12);
 t.updateCooling(1);near(joules(parts[2]),120);
 for(const part of parts){near(part.mood.energy,.5);near(part.mood.coolProgress,1);assert.equal(part.mood.state,'neutral');}
});

function lookAt(game,p){
 const {t,sandbox}=game,doc=sandbox.document;
 t.canvas.requestPointerLock=()=>{doc.pointerLockElement=t.canvas;doc.dispatchEvent({type:'pointerlockchange'});};
 t.position.splice(0,3,p.x,t.EYE_HEIGHT,p.z+1.2);t.frame(0);t.canvas.requestPointerLock();
 const look=t.getLook(),dx=p.x-look.camera[0],dy=p.y-look.camera[1],dz=p.z-look.camera[2];
 const pitch=Math.atan2(dy,Math.hypot(dx,dz)),yaw=Math.atan2(-dx,-dz);
 doc.dispatchEvent({type:'mousemove',movementX:(look.yaw-yaw)/.002,movementY:(look.pitch-pitch)/.002});
}

test('a cooler with mixed batteries reports time remaining for the last actual occupant',()=>{
 const game=coolerGame([1,3],5),{t,sandbox}=game;lookAt(game,t.V(0,.08,0));
 t.updateCooling(10);t.updateAlphaHUD();
 assert.match(sandbox.document.querySelector('#target').textContent,/Enfriador.* · 10 s$/);
 t.updateCooling(10);t.updateAlphaHUD();
 assert.match(sandbox.document.querySelector('#target').textContent,/listos · energía 50 %$/);
});
