const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const preferences=require('../assets/js/preferences.js');
const controls=require('../assets/js/controls.js');

// Real input dispatch and Cannon bodies. The harness substitutes DOM/GPU;
// these checks do not certify visual animation or audible sound in a browser.
const angle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w)));
const plain=value=>JSON.parse(JSON.stringify(value));
function setup(hz=120){
 const game=createGame({graphics:false}),{t,sandbox}=game,doc=sandbox.document;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
 doc.body.dataset.booting='false';doc.pointerLockElement=t.canvas;doc.querySelector('#panel').hidden=true;
 t.applyPreferences({...preferences.defaults(),physicsHz:hz});t.setLook({camera:[0,1.6,1],yaw:0,pitch:0});
 return {...game,doc,hz};
}
function key(game,type,code,extra={}){game.doc.dispatchEvent({type,code,repeat:false,...extra});}
function tap(game,code){key(game,'keydown',code);key(game,'keyup',code);}
function tick(game,seconds=.5,observe=()=>{}){for(let i=0;i<Math.round(seconds*game.hz);i++){game.t.stepPhysics(1/game.hz);observe();}}
function settle(game,expected,limit=4,observe=()=>{},tolerance=.02){
 const held=game.t.getHeld();let elapsed=0;
 do{tick(game,1/game.hz,observe);elapsed+=1/game.hz;
  if(angle(held.rotation,expected)<.00001&&angle(held.g.body.quaternion,expected)<tolerance)return elapsed;
 }while(elapsed<limit);
 assert.fail(`face did not settle within ${limit}s: target error ${angle(held.rotation,expected)}, body error ${angle(held.g.body.quaternion,expected)}`);
}
function rotation(t,axis,radians){const q=t.Q();q.setFromAxisAngle(t.V(...axis),radians);return q;}
function yawFrame(t,yaw){return rotation(t,[0,1,0],yaw);}
function cube(game,q=game.t.Q()){
 const {t}=game,g=t.addQubit([0,1.6,0]);g.body.quaternion.copy(q);g.body.aabbNeedsUpdate=true;return g;
}
function take(game,g,part=g.parts[0],point=g.body.position.clone()){
 const {t}=game;t.grabQubit({g,part,point,distance:1});const held=t.getHeld();assert.equal(held?.g,g);
 const eye=t.V(...t.getLook().camera),dir=t.screenRay(640,360);
 held.rootOffset=(held.stable?g.body.position:point).vsub(eye.vadd(dir.scale(held.distance)));
 return held;
}
function assertQ(actual,expected,message,tolerance=.00001){assert(angle(actual,expected)<tolerance,`${message}: error ${angle(actual,expected)} rad`);}
function assertRectilinear(t,q,yaw,message){
 const local=yawFrame(t,yaw).inverse().mult(q);
 for(const axis of [[1,0,0],[0,1,0],[0,0,1]]){
  const v=local.vmult(t.V(...axis)),values=[Math.abs(v.x),Math.abs(v.y),Math.abs(v.z)].sort((a,b)=>a-b);
  assert(values[0]<1e-6&&values[1]<1e-6&&Math.abs(values[2]-1)<1e-6,message);
 }
}
function faceAtFront(t,q,yaw=0){
 const front=t.V(Math.sin(yaw),0,Math.cos(yaw));
 return [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].findIndex(axis=>q.vmult(t.V(...axis)).dot(front)>.999999);
}

test('a tilted cube switches to the next upright face relative to horizontal camera heading',()=>{
 for(const [yaw,pitch]of [[.63,.48],[-1.07,-.65]]){
  const game=setup(),{t,doc}=game,frame=yawFrame(t,yaw),tilt=t.Q();tilt.setFromEuler(.21,.17,-.24);
  t.setLook({yaw,pitch});const g=cube(game,frame.mult(tilt)),held=take(game,g),start=g.body.quaternion.clone();
  key(game,'keydown','ShiftLeft');tap(game,'KeyQ');
  assertQ(g.body.quaternion,start,'the key does not teleport the physical body');
  tick(game,1.1);const expected=rotation(t,[0,1,0],Math.PI/2).mult(frame);
  assertQ(held.rotation,expected,'Q brings the left face forward');
  assertRectilinear(t,held.rotation,yaw,'pitch and initial roll cannot leave a tilted face');
  assertQ(g.body.quaternion,expected,'the real cube reaches the face',.025);
  assert.equal(t.getHeld(),held);assert(g.body.position.y>1.4,'the piece remains suspended');
  assert.equal(doc.querySelector('#panel').hidden,true,'Shift Q must not open the catalogue');assert.equal(t.radialOpen(),false);
 }
});

test('four lateral steps return to the same face and opposite keys undo one another',()=>{
 const game=setup(),{t}=game,yaw=.37,frame=yawFrame(t,yaw);t.setLook({yaw});const g=cube(game,frame),held=take(game,g);
 key(game,'keydown','ShiftLeft');const fronts=new Set([faceAtFront(t,frame,yaw)]);
 for(let i=1;i<=4;i++){const expected=rotation(t,[0,1,0],i*Math.PI/2).mult(frame);tap(game,'KeyQ');settle(game,expected);assertQ(held.rotation,expected,'one face per Q');fronts.add(faceAtFront(t,held.rotation,yaw));}
 assert.equal(fronts.size,4);assertQ(held.rotation,frame,'four Q steps complete the cycle');
 const right=rotation(t,[0,1,0],-Math.PI/2).mult(frame);tap(game,'KeyE');settle(game,right);assertQ(held.rotation,right,'E goes right');
 tap(game,'KeyQ');settle(game,frame);assertQ(held.rotation,frame,'Q reverses E');
});

test('vertical face turns expose top and bottom, invert after two presses, and make all six faces reachable',()=>{
 const game=setup(),{t}=game,g=cube(game),held=take(game,g),fronts=new Set([faceAtFront(t,held.rotation)]);
 key(game,'keydown','ShiftLeft');
 for(let i=1;i<=4;i++){tap(game,'KeyQ');settle(game,rotation(t,[0,1,0],i*Math.PI/2));fronts.add(faceAtFront(t,held.rotation));}
 for(let i=1;i<=4;i++){
  const expected=rotation(t,[1,0,0],i*Math.PI/2);tap(game,'KeyR');settle(game,expected);assertQ(held.rotation,expected,'R advances one vertical face');
  fronts.add(faceAtFront(t,held.rotation));assertRectilinear(t,held.rotation,0,'vertical steps stay square to the player');
  if(i===1)assert.equal(faceAtFront(t,held.rotation),2,'the top face is presented first');
  if(i===2)assert(held.rotation.vmult(t.V(0,1,0)).y<-.999999,'the object is upside down after two R presses');
 }
 assert.equal(fronts.size,6);assert(!fronts.has(-1));assertQ(held.rotation,t.Q(),'four R steps complete the vertical cycle');
 assert.equal(t.getHeld(),held,'R does not release or restart the mechanism');
});

test('keyboard auto-repeat does not add turns and rapid separate presses are all counted',()=>{
 const game=setup(),{t}=game,g=cube(game),held=take(game,g);key(game,'keydown','ShiftLeft');
 key(game,'keydown','KeyQ');for(let i=0;i<15;i++)key(game,'keydown','KeyQ',{repeat:true});key(game,'keyup','KeyQ');settle(game,rotation(t,[0,1,0],Math.PI/2));
 assertQ(held.rotation,rotation(t,[0,1,0],Math.PI/2),'held Q produces one step');
 for(let i=0;i<3;i++){tap(game,'KeyQ');tick(game,1/120);}
 settle(game,t.Q());assertQ(held.rotation,t.Q(),'three rapid taps finish the four-face cycle');
});

test('a face switch completes and holds its straight orientation when Shift is released immediately',()=>{
 const game=setup(),{t}=game,g=cube(game),held=take(game,g),body=g.body,mass=body.mass,ids=g.parts.map(p=>p.id),before=body.position.clone();
 key(game,'keydown','ShiftLeft');tap(game,'KeyE');key(game,'keyup','ShiftLeft');tick(game,1.2);
 const expected=rotation(t,[0,1,0],-Math.PI/2);assertQ(held.rotation,expected,'the requested switch completes after Shift keyup');
 assertQ(body.quaternion,expected,'the physical body retains the straight face',.025);
 assert.equal(t.getHeld(),held);assert.equal(g.body,body);assert.equal(body.mass,mass);assert.deepEqual(g.parts.map(p=>p.id),ids);
 assert(body.position.distanceTo(before)<.03,'switching faces preserves the hand position');
});

test('taking a cube with Shift already held still recentres its face anchor before the switch',()=>{
 const game=setup(),{t}=game,g=cube(game),before=g.body.position.clone();
 key(game,'keydown','ShiftLeft');t.canvas.dispatchEvent({type:'mousedown',button:0,clientX:640,clientY:360});
 const held=t.getHeld();assert.equal(held?.g,g);tap(game,'KeyQ');tick(game,1.2);
 assert(held.items[0].anchor.norm()<1e-8,'rotation uses the cube centre even when Shift preceded pickup');
 assertQ(g.body.quaternion,rotation(t,[0,1,0],Math.PI/2),'the grabbed cube reaches the requested face',.025);
 assert(g.body.position.distanceTo(before)<.03,'the old surface anchor cannot swing the cube around the hand');
});

test('free Shift WASD rotation resumes after a face step and a later step squares the result again',()=>{
 const game=setup(),{t}=game,g=cube(game),held=take(game,g);key(game,'keydown','ShiftLeft');tap(game,'KeyQ');settle(game,rotation(t,[0,1,0],Math.PI/2));
 const snapped=held.rotation.clone();key(game,'keydown','KeyW');tick(game,.21);key(game,'keyup','KeyW');
 assert(angle(snapped,held.rotation)>.45,'free rotation continues to turn continuously');
 assert(Math.abs(held.rotation.vmult(t.V(0,1,0)).y)<.95,'W leaves a freely tilted orientation');
 tick(game,.8);tap(game,'KeyE');settle(game,t.Q());assertRectilinear(t,held.rotation,0,'a face command recovers a straight frame after free rotation');
});

test('remapped rotate, catalogue, interact, and restart actions keep the same contextual face controls',()=>{
 const game=setup(),{t,doc}=game,d=preferences.defaults();
 for(const [action,code]of [['rotate','KeyH'],['radial','KeyU'],['interact','KeyI'],['stop','KeyO']])controls.assignBinding(d.controls,'keyboard',action,code);
 t.applyPreferences(d);const g=cube(game),held=take(game,g);key(game,'keydown','KeyH');
 tap(game,'KeyU');settle(game,rotation(t,[0,1,0],Math.PI/2));assertQ(held.rotation,rotation(t,[0,1,0],Math.PI/2),'remapped catalogue key turns left');
 tap(game,'KeyI');settle(game,t.Q());assertQ(held.rotation,t.Q(),'remapped interact key turns right');
 tap(game,'KeyO');settle(game,rotation(t,[1,0,0],Math.PI/2));assertQ(held.rotation,rotation(t,[1,0,0],Math.PI/2),'remapped restart key presents the top');
 assert.equal(doc.querySelector('#panel').hidden,true);assert.equal(t.radialOpen(),false);assert.equal(t.getHeld(),held);
});

test('face shortcuts do not consume catalogue input with empty hands or manipulate a paused or typing hold',()=>{
 const empty=setup();key(empty,'keydown','ShiftLeft');tap(empty,'KeyQ');assert.equal(empty.doc.querySelector('#panel').hidden,false,'Q still opens its normal catalogue with empty hands');
 for(const mode of ['pause','typing']){
  const game=setup(),{t,doc}=game,g=cube(game),held=take(game,g);key(game,'keydown','ShiftLeft');const initial=held.rotation.clone();
  if(mode==='pause')t.openPauseMenu();else doc.activeElement={tagName:'INPUT',isContentEditable:false};
  for(const code of ['KeyQ','KeyE','KeyR'])tap(game,code);
  assertQ(held.rotation,initial,mode+' does not accept a face command');assert.equal(t.getHeld(),held);
 }
});

test('a welded group aligns the selected part rather than an arbitrary chassis coordinate frame',()=>{
 const game=setup(),{t}=game,local=rotation(t,[0,1,0],Math.PI/4),g=t.makeGroup([
  {id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(0,1.6,0),q:local},
  {id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(.2,1.6,0),q:t.Q()}
 ]),part=g.parts[0],held=take(game,g,part),bodies=t.world.bodies.length,ids=g.parts.map(p=>p.id);
 key(game,'keydown','ShiftLeft');tap(game,'KeyQ');tick(game,1.2);
 assertRectilinear(t,held.rotation.mult(part.q),0,'the selected cube face is straight even if welded at another local angle');
 assertQ(g.body.quaternion,held.rotation,'the physical selected face settles square',.025);
 assert.equal(t.world.bodies.length,bodies);assert.deepEqual(g.parts.map(p=>p.id),ids);assert.equal(t.getHeld(),held);
});

test('stored families use the same face switches without opening or changing their inventory',()=>{
 const game=setup(),{t}=game,members=Array.from({length:10},(_,i)=>t.addQubit([3+i*.12,.06,-3]));
 const [family]=t.groupIntoFamilies(members,{name:'Prueba',color:'#dcb62d'});assert(family);family.body.position.set(0,1.6,0);family.body.aabbNeedsUpdate=true;
 const inventory=plain(family.items),mass=family.body.mass,body=family.body;t.grabFamily({family,point:body.position.clone(),distance:1});const held=t.getHeld();assert.equal(held?.family,family);
 key(game,'keydown','ShiftLeft');tap(game,'KeyQ');tick(game,.05);tap(game,'KeyR');key(game,'keyup','ShiftLeft');
 const expected=rotation(t,[1,0,0],Math.PI/2).mult(rotation(t,[0,1,0],Math.PI/2));
 settle(game,expected);
 assertQ(held.rotation,expected,'families accept both face controls');assertQ(body.quaternion,expected,'the shell follows the face switch',.03);
 assert.equal(family.body,body);assert.equal(body.mass,mass);assert.deepEqual(plain(family.items),inventory);assert.equal(t.familyInventoryCount(),10);assert.equal(t.groups.length,0);assert.equal(t.getFamilyPlacement(),null);
});

for(const hz of [60,240])test(`an articulated arm can switch faces from the gripper at ${hz} Hz without separating or launching`,()=>{
 const game=setup(hz),{t}=game;assert(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V(0,1.2,0)));
 const arm=t.robotArms[0],hit=t.rotorPart(arm.gripperId),inventory=t.groups.map(g=>({body:g.body,mass:g.body.mass,ids:g.parts.map(p=>p.id)})),constraints=t.world.constraints.length;
 t.setLook({camera:[hit.p.x,hit.p.y,hit.p.z+1],yaw:0,pitch:0});const held=take(game,hit.g,hit.part,hit.p.clone());assert.equal(held.items.length,5);
 key(game,'keydown','ShiftLeft');tap(game,'KeyQ');tick(game,.05);tap(game,'KeyR');key(game,'keyup','ShiftLeft');
 tick(game,3.5,()=>{
  for(const g of t.groups){assert(g.body.velocity.norm()<10,'bounded translation');assert(g.body.angularVelocity.norm()<20,'bounded spin');assert(t.physicalGroupBounds(g).min.y>0,'arm stays above the floor');assert(t.physicalGroupBounds(g).max.y<4,'arm stays below the ceiling');}
  for(const r of t.rotors)assert(t.couplerTip(t.rotorPart(r.aId)).point.distanceTo(t.couplerTip(t.rotorPart(r.bId)).point)<.025,'hinges remain joined during the switch');
  assert.equal(t.world.solver.iterations,24);
 });
 const expected=rotation(t,[1,0,0],Math.PI/2).mult(rotation(t,[0,1,0],Math.PI/2));
 assertQ(held.rotation,expected,'the arm receives both requested face steps');
 assertRectilinear(t,held.rotation.mult(hit.part.q),0,'the selected arm face target is straight');assertQ(hit.g.body.quaternion,held.rotation,'arm reaches the face command',.03);
 assert.deepEqual(t.groups.map(g=>({body:g.body,mass:g.body.mass,ids:g.parts.map(p=>p.id)})),inventory);
 t.releaseQubit();assert.equal(t.world.constraints.length,constraints);assert(t.groups.every(g=>g.body.velocity.norm()===0&&g.body.angularVelocity.norm()===0),'release clears stored hand motion');
});

for(const hz of [60,120,240])test(`four rapid Q taps physically visit every arm face and complete a full turn at ${hz} Hz`,()=>{
 const game=setup(hz),{t}=game;assert(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V(0,1.2,0)));
 const hit=t.rotorPart(t.robotArms[0].gripperId);t.setLook({camera:[hit.p.x,hit.p.y,hit.p.z+1],yaw:0,pitch:0});
 const held=take(game,hit.g,hit.part,hit.p.clone()),initial=hit.g.body.quaternion.clone();assertQ(initial,t.Q(),'fixture starts with a front-facing gripper');
 const destinations=[1,2,3,4].map(i=>rotation(t,[0,1,0],i*Math.PI/2));
 key(game,'keydown','ShiftLeft');for(let i=0;i<4;i++)tap(game,'KeyQ');key(game,'keyup','ShiftLeft');
 let previous=initial,travel=0,visits=0,elapsed=0;
 for(let i=0;i<hz*6;i++){
  tick(game,1/hz);elapsed+=1/hz;const current=hit.g.body.quaternion;
  travel+=angle(previous,current);previous=current.clone();
  if(visits<4&&angle(current,destinations[visits])<.1)visits++;
  for(const g of t.groups){assert(g.body.velocity.norm()<10,'rapid taps retain bounded translation');assert(g.body.angularVelocity.norm()<20,'rapid taps retain bounded angular motion');}
  for(const r of t.rotors)assert(t.couplerTip(t.rotorPart(r.aId)).point.distanceTo(t.couplerTip(t.rotorPart(r.bId)).point)<.025,'the arm remains articulated through the full turn');
  if(visits===4&&angle(current,initial)<.02&&angle(held.rotation,initial)<.00001)break;
 }
 assert.equal(visits,4,`all four physical faces must be visited in order, got ${visits} in ${elapsed}s`);
 assert(travel>2*Math.PI-.12,`four presses must rotate the physical arm through a full revolution, observed ${travel} rad`);
 assertQ(held.rotation,initial,'the target finishes the complete cycle');assertQ(hit.g.body.quaternion,initial,'the arm finishes facing forward',.02);assert.equal(t.getHeld(),held);
});

test('Shift E turns the held piece without advancing the guide dialogue',()=>{
 const game=setup(),{t}=game,g=cube(game),held=take(game,g);t.story.scene='campaign';let continued=0;
 t.story.dialogue={text:'Sigue probando.',timing:{duration:1},time:1,after(){continued++;},modal:false};
 key(game,'keydown','ShiftLeft');tap(game,'KeyE');tick(game,.3);
 assert.equal(continued,0,'the modifier reserves E for manipulation');assertQ(held.rotation,rotation(t,[0,1,0],-Math.PI/2),'E turns the face during nonmodal speech');
 key(game,'keyup','ShiftLeft');tap(game,'KeyE');assert.equal(continued,1,'ordinary E retains dialogue interaction');
});

test('a face switch on a long assembly respects the whole swept arc against a thin wall',()=>{
 const game=setup(),{t}=game;t.settings.gravity=0;t.world.gravity.set(0,0,0);
 const wall=t.storyWall(t.V(0,1.6,.15),t.V(.5,.4,.012)),g=t.makeGroup(Array.from({length:5},(_,i)=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V((i-2)*.09,1.6,0),q:t.Q()}))),held=take(game,g);
 key(game,'keydown','ShiftLeft');tap(game,'KeyQ');key(game,'keyup','ShiftLeft');let turned=false;
 tick(game,2,()=>{
  turned||=Math.abs(g.body.quaternion.y)>.1;
  assert(!t.poses(g).some(p=>t.obbOverlap(p,{p:wall.p,q:wall.q,half:wall.half},.003)),'the intermediate arc cannot cut through the panel');
  assert(g.body.velocity.norm()<2&&g.body.angularVelocity.norm()<15,'the blocked switch cannot wind up an unsafe impulse');
 });
 assert(turned,'the hand permits the available turn before contact');assertQ(held.rotation,rotation(t,[0,1,0],Math.PI/2),'the requested face is retained while the wall blocks it');
 t.releaseQubit();assert.equal(g.body.velocity.norm(),0);assert.equal(g.body.angularVelocity.norm(),0);
});

test('magnetic joining waits for the face switch and becomes available again after the body settles',()=>{
 const game=setup(),{t}=game,g=cube(game),other=t.addQubit([.091,1.6,0]),held=take(game,g),ids=[g.parts[0].id,other.parts[0].id];
 key(game,'keydown','ShiftLeft');assert.equal(t.findSnap()?.target,other,'fixture offers a compatible adjacent face');
 tap(game,'KeyQ');assert.equal(t.findSnap(),null,'a neighbouring magnet cannot replace a deliberate face turn');
 // Move only the fixture obstacle out of the rotation arc, then offer the same
 // intact piece again after the real held body has reached its destination.
 other.body.position.set(3,1.6,-3);other.body.aabbNeedsUpdate=true;
 settle(game,rotation(t,[0,1,0],Math.PI/2),4,()=>{},.005);tick(game,1/game.hz);
 other.body.position.copy(g.body.position.vadd(t.V(.091,0,0)));other.body.quaternion.set(0,0,0,1);other.body.velocity.set(0,0,0);other.body.angularVelocity.set(0,0,0);other.body.aabbNeedsUpdate=true;
 assert.equal(t.findSnap()?.target,other,'joining is available after the completed physical turn');
 assert.equal(t.getHeld(),held);assert.equal(t.groups.length,2);assert.deepEqual([g.parts[0].id,other.parts[0].id],ids,'checking alignment does not weld or recreate the pieces');
});
