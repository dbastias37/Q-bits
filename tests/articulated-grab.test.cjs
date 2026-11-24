// Actual keyboard/mouse handlers, the original four-axis recipe and Cannon.
// The harness supplies a DOM/GPU stub, not a visual browser session.
const test=require('node:test'),assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const angle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w)));
const inventory=t=>t.groups.map(g=>({body:g.body,mass:g.body.mass,parts:g.parts.map(p=>[p.id,p.shape,p.weight])}));
function lab(hz=240,options={}){
 const game=createGame(options),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;sandbox.document.querySelector('#panel').hidden=true;
 t.applyPreferences({...sandbox.QBitsPreferences.defaults(),physicsHz:hz});return game;
}
function key(game,type,code){game.sandbox.document.dispatchEvent({type,code,repeat:false});}
function tick(t,hz,seconds,observe=()=>{}){for(let i=0;i<Math.round(hz*seconds);i++){t.stepPhysics(1/hz);observe();}}
function metrics(t){return {speed:Math.max(...t.groups.map(g=>g.body.velocity.norm())),spin:Math.max(...t.groups.map(g=>g.body.angularVelocity.norm())),gap:Math.max(...t.rotors.map(r=>t.couplerTip(t.rotorPart(r.aId)).point.distanceTo(t.couplerTip(t.rotorPart(r.bId)).point))),low:Math.min(...t.groups.map(g=>t.bounds(g).min.y)),high:Math.max(...t.groups.map(g=>t.bounds(g).max.y))};}
function observeBounded(t,peaks,limits={gap:.02}){const m=metrics(t);for(const name of ['speed','spin','gap','high'])peaks[name]=Math.max(peaks[name]||0,m[name]);assert(m.speed<10&&m.spin<20&&m.high<4,JSON.stringify(m));assert(m.gap<limits.gap,JSON.stringify(m));assert(m.low>-.002);assert.equal(t.world.solver.iterations,24,'temporary solver refinement is restored');}
function aimAndGrab(game,partId){
 const {t,sandbox}=game,hit=t.rotorPart(partId);t.setSelected(null);t.setMultiSelection([]);t.clearRotorSelection();
 // Find an unobstructed cardinal view of the requested physical part.
 let visible=false;
 for(const [x,z]of [[0,1],[0,-1],[1,0],[-1,0]]){
  t.setLook({camera:[hit.p.x+x,hit.p.y,hit.p.z+z],yaw:Math.atan2(x,z),pitch:0});
  if(t.aimQubit()?.part.id===partId){visible=true;break;}
 }
 assert(visible,'requested link has an unobstructed face');
 t.canvas.dispatchEvent({type:'mousedown',button:0,clientX:640,clientY:360});
 assert(t.getHeld(),'real primary input picks the mechanism');assert.equal(t.getHeld().pickedPartId,partId);assert.equal(t.getHeld().items.length,5);assert.equal(t.getHeld().items.filter(item=>item.anchorBody).length,1);
 return hit;
}
function release(game){game.sandbox.document.dispatchEvent({type:'mouseup',button:0});assert.equal(game.t.getHeld(),null);}
function lift(t,height){const camera=t.getLook().camera;t.setLook({camera:[camera[0],camera[1]+height,camera[2]]});}
function armAt(game,height=0){const {t}=game;assert(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V(0,height,0)));return t.robotArms[0];}
function halfTurn(game,hz,observe){
 const {t}=game;key(game,'keydown','ShiftLeft');key(game,'keydown','KeyW');
 tick(t,hz,Math.PI/t.settings.rotationSpeed,observe);
 key(game,'keyup','KeyW');key(game,'keyup','ShiftLeft');
 const desired=t.getHeld().rotation.clone();tick(t,hz,2.5,observe);assert(angle(t.getHeld().g.body.quaternion,desired)<.02,'held body reaches and holds the requested half turn');return desired;
}

for(const hz of [60,120,240])for(const pick of ['base','shoulder','gripper'])test(`original arm can be lifted and inverted from ${pick} at ${hz} Hz without exploding or changing its material`,()=>{
 const game=lab(hz),{t}=game,arm=armAt(game),partId=pick==='base'?arm.baseId:pick==='gripper'?arm.gripperId:arm.joints[0].bId,before=inventory(t),originalConstraints=t.world.constraints.length;
 aimAndGrab(game,partId);const original=t.getHeld().g.body.quaternion.clone(),peaks={},observe=()=>observeBounded(t,peaks);
 lift(t,1.5);tick(t,hz,2,observe);
 assert(angle(t.getHeld().g.body.quaternion,original)<.02,'lifting without rotation preserves the original posture');
 const desired=halfTurn(game,hz,observe);assert(angle(original,desired)>3.1,'the input actually asks for 180 degrees');
 assert.equal(t.world.constraints.length,originalConstraints+1,'orientation shares the original hand constraint');
 assert(t.rotors.every(r=>!r.enabled&&r.constraint.stopBrake.equation.enabled));assert.deepEqual(inventory(t),before);
 release(game);assert.equal(t.world.constraints.length,originalConstraints);assert(t.groups.every(g=>!g.body.fixedRotation));
});

test('a wrist grip turns above a solid tabletop, releases, and can be taken again without leftover hand equations',()=>{
 const hz=120,game=lab(hz),{t}=game,table=t.storyWall(t.V(0,.77,0),t.V(.9,.03,.9)),arm=armAt(game,.8),before=inventory(t),constraints=t.world.constraints.length,peaks={};
 aimAndGrab(game,arm.gripperId);lift(t,.9);
 const aboveTable=()=>{observeBounded(t,peaks);assert(!t.groups.some(g=>t.poses(g).some(p=>t.obbOverlap(p,{p:table.p,q:table.q,half:table.half},.003))),'the held arm cannot cross the tabletop');};
 tick(t,hz,2,aboveTable);halfTurn(game,hz,aboveTable);
 release(game);assert.equal(t.world.constraints.length,constraints);tick(t,hz,3);
 assert(Math.max(...t.groups.map(g=>t.bounds(g).max.y))<1.6,'release drops the mechanism onto its support');
 aimAndGrab(game,arm.gripperId);lift(t,.7);tick(t,hz,2,aboveTable);assert.equal(t.world.constraints.length,constraints+1);release(game);
 assert.equal(t.world.constraints.length,constraints);assert.deepEqual(inventory(t),before);
});

test('an exact half-turn target has a directed bounded path and mouse-wheel translation remains physical',()=>{
 const hz=120,game=lab(hz),{t}=game,arm=armAt(game,1);aimAndGrab(game,arm.gripperId);tick(t,hz,.5);
 const hand=t.getHeld(),turn=t.Q();turn.setFromAxisAngle(t.V(0,1,0),Math.PI);
 key(game,'keydown','ShiftLeft');hand.rotation=turn.mult(hand.rotation);const desired=hand.rotation.clone(),distance=hand.distance;
 t.canvas.dispatchEvent({type:'wheel',deltaY:-1});assert.equal(hand.distance,distance+.07);
 let moved=0;const before=hand.g.body.position.clone(),peaks={};tick(t,hz,4,()=>{observeBounded(t,peaks);moved=Math.max(moved,hand.g.body.position.distanceTo(before));});
 key(game,'keyup','ShiftLeft');assert(angle(hand.g.body.quaternion,desired)<.02);assert(moved>.03);release(game);
});

test('a crowded contact scene keeps its ordinary solve budget and still permits a bounded wrist half turn',()=>{
 const hz=60,game=lab(hz),{t}=game,arm=armAt(game,1);
 // Unrelated cubes provide real floor contacts, exceeding the refinement cap.
 for(let i=0;i<24;i++){const g=t.addQubit([4+(i%6)*.2,.046,-3+Math.floor(i/6)*.2]);g.body.allowSleep=false;}tick(t,hz,1);
 aimAndGrab(game,arm.gripperId);const peaks={};let crowdedSteps=0;
 const observe=()=>{observeBounded(t,peaks,{gap:.025});if(t.world.contacts.length>64)crowdedSteps++;};
 tick(t,hz,.5,observe);halfTurn(game,hz,observe);assert(crowdedSteps>30,'the fallback is exercised with actual unrelated contacts');assert.equal(t.world.solver.iterations,24);release(game);
});

test('grab speed and physics changes keep angular impulse limits separate from linear hand force',()=>{
 const game=lab(120),{t,sandbox}=game,arm=armAt(game,1);aimAndGrab(game,arm.gripperId);release(game);
 // A programmatic pickup has no pressed input to cancel when applying settings.
 const hit=t.rotorPart(arm.gripperId);t.grabQubit({...hit,point:hit.p.clone(),distance:1});tick(t,120,.2);
 const item=t.getHeld().items[0],orientation=item.orientationGrip;assert(orientation);const equations=orientation.equations;
 for(const hz of [60,240,120])for(const grabSpeed of [1,3.5,1]){
  t.applyPreferences({...sandbox.QBitsPreferences.defaults(),physicsHz:hz,grabSpeed});t.updateGrab(1/hz);
  assert.equal(item.orientationGrip,orientation,'presets reuse the same equations');
  for(const equation of equations){assert.equal(equation.maxForce,orientation.torque/hz);assert.equal(equation.minForce,-orientation.torque/hz);assert(equation.qbitsSpook);}
  const expected=new sandbox.CANNON.RotationalEquation(item.g.body,item.anchorBody);expected.setSpookParams(1e7,4,1/hz);
  for(const equation of equations){assert.equal(equation.a,expected.a);assert.equal(equation.b,expected.b);assert.equal(equation.eps,expected.eps);}
 }
 release(game);assert(equations.every(eq=>!t.world.solver.equations.includes(eq)),'hand angular equations are not retained after removal');
});

test('simultaneous wrist translation and rotation stop at a thin wall and release without a stored impulse',()=>{
 const fs=require('node:fs'),path=require('node:path'),source=fs.readFileSync(path.join(__dirname,'../assets/js/game.js'),'utf8'),at=source.lastIndexOf('})();');
 // Observe the final combined hand pose immediately before physics integrates
 // it. Checking position and orientation separately misses the corner overlap.
 const hook=`
 window.gripAudit={frames:0,unsafe:0,maxLag:0};
 const auditUpdateGrab=updateGrab;
 updateGrab=function(dt){
  auditUpdateGrab(dt);
  for(const item of held?.items||[]){
   if(!item.orientationGrip)continue;
   const body=item.g.body,anchor=item.anchorBody,center=sub(anchor.position,anchor.quaternion.vmult(item.anchor));
   if(!gripPoseClear(gripCollisionContext(item),center,anchor.quaternion))window.gripAudit.unsafe++;
   const dot=Math.min(1,Math.abs(body.quaternion.x*anchor.quaternion.x+body.quaternion.y*anchor.quaternion.y+body.quaternion.z*anchor.quaternion.z+body.quaternion.w*anchor.quaternion.w));
   window.gripAudit.maxLag=Math.max(window.gripAudit.maxLag,2*Math.acos(dot));window.gripAudit.frames++;
  }
 };`;
 for(const grabSpeed of [1,3.5]){
  const hz=120,game=lab(hz,{graphics:false,gameSource:source.slice(0,at)+hook+source.slice(at)}),{t,sandbox}=game;
  t.applyPreferences({...sandbox.QBitsPreferences.defaults(),physicsHz:hz,grabSpeed});t.settings.gravity=0;t.world.gravity.set(0,0,0);
  const arm=armAt(game,2),g=t.rotorPart(arm.gripperId).g,before=inventory(t),wall=t.storyWall(t.V(.31,2.4,0),t.V(.006,1,1));
  t.grabQubit({g,part:g.parts[0],point:g.body.position.clone(),distance:1});
  const hand=t.getHeld(),item=hand.items.find(item=>item.joint),joint=item.joint,target=g.body.position.vadd(t.V(1,0,0));
  hand.rootOffset=target.vsub(t.V(...t.getLook().camera).vadd(t.screenRay(640,360).scale(hand.distance)));
  const turn=t.Q();turn.setFromAxisAngle(t.V(0,1,0),-1.5);hand.rotation=turn.mult(hand.initialRotation);t.keys.add('ShiftLeft');
  tick(t,hz,4,()=>{
   assert(t.groups.every(group=>t.physicalGroupBounds(group).max.x<wall.max.x),'no material crosses the far face of the 12 mm panel');
   assert(metrics(t).gap<.005,'hinges remain together against the obstacle');
  });
  assert.equal(sandbox.gripAudit.frames,480);assert.equal(sandbox.gripAudit.unsafe,0,'every complete anchor pose is clear before integration');assert(sandbox.gripAudit.maxLag<=.180001);
  const positions=t.groups.map(group=>group.body.position.clone());t.keys.clear();t.releaseQubit();
  assert(!t.world.constraints.includes(joint));assert.equal(t.world.constraints.length,4);assert.equal(t.rotors.length,4);
  assert(t.groups.every(group=>group.body.velocity.norm()===0&&group.body.angularVelocity.norm()===0));
  tick(t,hz,1,()=>assert(t.groups.every(group=>group.body.velocity.norm()<.03),'release does not launch the blocked arm'));
  assert(t.groups.every((group,i)=>group.body.position.distanceTo(positions[i])<.01));assert.deepEqual(inventory(t),before);
 }
});
