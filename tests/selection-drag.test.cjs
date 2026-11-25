const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const preferences=require('../assets/js/preferences.js');
const controls=require('../assets/js/controls.js');

// Production input handlers and Cannon constraints; DOM, pointer capture and
// GPU calls are simulated. These are not browser interaction or visual tests.
function setup(){
 const game=createGame({graphics:false}),{t,sandbox}=game,doc=sandbox.document;
 t.clearNarrativeScene();
 Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
 doc.body.dataset.booting='false';doc.pointerLockElement=t.canvas;
 doc.dispatchEvent({type:'pointerlockchange'});
 t.position.splice(0,3,0,1,1);t.setLook({camera:[0,1,1],yaw:0,pitch:0});
 t.canvas.requestPointerLock=()=>{doc.pointerLockElement=t.canvas;doc.dispatchEvent({type:'pointerlockchange'});};
 return {...game,doc};
}
function mouse(game,type,extra={}){
 const target=type==='mousedown'?game.t.canvas:game.doc;
 target.dispatchEvent({type,button:0,clientX:640,clientY:360,...extra});
}
function click(game){mouse(game,'mousedown');mouse(game,'mouseup');}
function key(game,type,code){game.doc.dispatchEvent({type,code,repeat:false});}
function tap(game,code){key(game,'keydown',code);key(game,'keyup',code);}
function aim(t,g){
 const eye=t.V(...t.getLook().camera),delta=g.body.position.vsub(eye);
 t.setLook({yaw:Math.atan2(-delta.x,-delta.z),pitch:Math.atan2(delta.y,Math.hypot(delta.x,delta.z))});
 assert.equal(t.aimQubit()?.g,g,'fixture must point at its intended live body');
}
function steps(t,count=90){for(let i=0;i<count;i++)t.stepSimulation(1/120);}
function selected(t){return Array.from(t.selectionGroups());}
function assertReleased(t,held,bodies,constraints){
 assert.equal(t.getHeld(),null,'button release must end the physical hold');
 assert.equal(t.world.bodies.length,bodies);assert.equal(t.world.constraints.length,constraints);
 for(const item of held.items){assert(!t.world.bodies.includes(item.anchorBody));assert(!t.world.constraints.includes(item.joint));}
}

for(const count of [1,3])test(`click then hold drags the same ${count}-piece selection and releases without losing it`,()=>{
 const game=setup(),{t,doc}=game;
 const g=t.makeGroup(Array.from({length:count},(_,i)=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(i*.09,1,0),q:t.Q()})));
 aim(t,g);click(game);
 assert.equal(t.getSelected()?.g,g);assert.equal(t.getHeld(),null);
 const bodies=t.world.bodies.length,constraints=t.world.constraints.length,body=g.body,ids=g.parts.map(p=>p.id),before=body.position.clone();
 mouse(game,'mousedown');const held=t.getHeld();
 assert.equal(held?.g,g,'a second press on the selection must take it, not clear it');
 doc.dispatchEvent({type:'mousemove',movementX:130,movementY:-25});steps(t);
 assert(body.position.distanceTo(before)>.15,'real Cannon body follows the new hand direction');
 mouse(game,'mouseup',{target:doc.body});
 assertReleased(t,held,bodies,constraints);assert.equal(t.getSelected()?.g,g);assert.deepEqual(selected(t),[g]);
 assert.equal(g.body,body);assert.deepEqual(g.parts.map(p=>p.id),ids,'moving preserves identities and compound structure');
});

test('repeated short clicks and a delayed new press all retain the selection',()=>{
 const game=setup(),{t}=game,g=t.addQubit([0,1,0]);
 for(let i=0;i<4;i++){
  mouse(game,'mousedown');assert.equal(t.getHeld()?.g,g,'every press can take the same selected piece');
  mouse(game,'mouseup');assert.equal(t.getSelected()?.g,g);assert.equal(t.getHeld(),null);
 }
 game.advanceTimers(9000);mouse(game,'mousedown');assert.equal(t.getHeld()?.g,g,'pickup does not depend on a double-click interval');mouse(game,'mouseup');
});

test('an initial sustained press still moves a previously unselected cube',()=>{
 const game=setup(),{t,doc}=game,g=t.addQubit([0,1,0]),before=g.body.position.clone();
 mouse(game,'mousedown');assert.equal(t.getHeld()?.g,g);
 doc.dispatchEvent({type:'mousemove',movementX:-110,movementY:0});steps(t);
 assert(g.body.position.distanceTo(before)>.12);mouse(game,'mouseup');assert.equal(t.getHeld(),null);assert.equal(t.getSelected()?.g,g);
});

test('pressing a member of a multiple selection takes and releases the entire team',()=>{
 const game=setup(),{t}=game,a=t.addQubit([-.18,1,0]),b=t.addQubit([.18,1,0]);
 aim(t,a);tap(game,'KeyT');aim(t,b);tap(game,'KeyT');assert.deepEqual(selected(t),[a,b]);
 const bodies=t.world.bodies.length,constraints=t.world.constraints.length;
 mouse(game,'mousedown');const held=t.getHeld();
 assert.equal(held?.g,b);assert.deepEqual(new Set(Array.from(held.items,item=>item.g)),new Set([a,b]));
 mouse(game,'mouseup');assertReleased(t,held,bodies,constraints);assert.deepEqual(selected(t),[a,b]);
});

test('pressing another piece replaces the old team and takes only the new piece',()=>{
 const game=setup(),{t}=game,a=t.addQubit([-.3,1,0]),b=t.addQubit([0,1,0]),c=t.addQubit([.3,1,0]);
 aim(t,a);tap(game,'KeyT');aim(t,b);tap(game,'KeyT');assert.deepEqual(selected(t),[a,b]);
 const oldPoses=[a.body.position.clone(),b.body.position.clone()];aim(t,c);mouse(game,'mousedown');
 assert.equal(t.getHeld()?.g,c);assert.deepEqual(Array.from(t.getHeld().items,item=>item.g),[c]);assert.deepEqual(selected(t),[c]);
 assert(a.body.position.almostEquals(oldPoses[0]));assert(b.body.position.almostEquals(oldPoses[1]));
 mouse(game,'mouseup');assert.equal(t.getSelected()?.g,c);
});

test('an empty primary press clears the selection and retains rectangle selection controls',()=>{
 const game=setup(),{t,doc}=game,g=t.addQubit([0,1,0]);click(game);assert.equal(t.getSelected()?.g,g);
 t.setLook({yaw:Math.PI/2,pitch:.2});assert.equal(t.aimQubit(),null);mouse(game,'mousedown');
 assert.deepEqual(selected(t),[]);assert.equal(t.getHeld(),null);assert.equal(doc.querySelector('#selection-rect').hidden,false);
 mouse(game,'mouseup');assert.equal(doc.querySelector('#selection-rect').hidden,true);assert.deepEqual(selected(t),[]);
});

test('the explicit clear action releases a repeated pickup and removes the selection',()=>{
 const game=setup(),{t}=game,g=t.addQubit([0,1,0]);click(game);mouse(game,'mousedown');
 const held=t.getHeld();assert.equal(held?.g,g);tap(game,'KeyG');
 assert.equal(t.getHeld(),null);assert.deepEqual(selected(t),[]);assert(!t.world.constraints.includes(held.joint));
 mouse(game,'mouseup');assert.equal(t.keyboardInput.held,0);
});

test('Ctrl plus primary keeps rotor add/remove selection and never starts a physical hold',()=>{
 const game=setup(),{t}=game,p=t.V(0,1,0),flip=t.Q();flip.setFromAxisAngle(t.V(0,0,1),Math.PI);
 const a=t.makeGroup([{id:t.allocateUnitId(),shape:'coupler',weight:1,p,q:t.Q()}]);
 const b=t.makeGroup([{id:t.allocateUnitId(),shape:'coupler',weight:1,p:p.vadd(t.V(0,2*.09*51/56,0)),q:flip}]);
 const rotor=t.connectRotorTips(a.parts[0].id,b.parts[0].id);assert(rotor);aim(t,a);
 key(game,'keydown','ControlLeft');click(game);assert.deepEqual(Array.from(t.selectedRotors()),[rotor]);assert.equal(t.getHeld(),null);
 click(game);assert.equal(t.selectedRotors().length,0);assert.equal(t.getHeld(),null);key(game,'keyup','ControlLeft');
});

test('rebinding the primary action preserves select, repeat pickup and keyup release',()=>{
 const game=setup(),{t}=game,d=preferences.defaults();controls.assignBinding(d.controls,'keyboard','primary','KeyH');t.applyPreferences(d);
 const g=t.addQubit([0,1,0]);tap(game,'KeyH');assert.equal(t.getSelected()?.g,g);assert.equal(t.getHeld(),null);
 key(game,'keydown','KeyH');assert.equal(t.getHeld()?.g,g);key(game,'keyup','KeyH');assert.equal(t.getHeld(),null);assert.equal(t.getSelected()?.g,g);
});

test('window blur cancels a repeated mouse hold with no orphan hand or stale input',()=>{
 const game=setup(),{t,sandbox}=game,g=t.addQubit([0,1,0]);click(game);
 const bodies=t.world.bodies.length,constraints=t.world.constraints.length;mouse(game,'mousedown');const held=t.getHeld();assert.equal(held?.g,g);
 sandbox.dispatchEvent({type:'blur'});assertReleased(t,held,bodies,constraints);assert.equal(t.story.mode,'pause');assert.equal(t.keyboardInput.held,0);
 mouse(game,'mouseup');assert.equal(t.getHeld(),null);assert.equal(t.getSelected()?.g,g);
});

test('a selected team exceeding the carrying limit remains selected without creating a hand',()=>{
 const game=setup(),{t}=game,a=t.addQubit([-.18,1,0]),b=t.addQubit([.18,1,0]);
 aim(t,a);tap(game,'KeyT');aim(t,b);tap(game,'KeyT');t.settings.maxCarry=1;
 const bodies=t.world.bodies.length,constraints=t.world.constraints.length;mouse(game,'mousedown');
 assert.equal(t.getHeld(),null);assert.deepEqual(selected(t),[a,b]);assert.equal(t.world.bodies.length,bodies);assert.equal(t.world.constraints.length,constraints);mouse(game,'mouseup');
});

test('campaign pickup keeps its existing click-to-release control',()=>{
 const game=setup(),{t}=game,g=t.addQubit([0,1,0]);t.story.scene='campaign';
 click(game);assert.equal(t.getHeld()?.g,g);assert.equal(t.getHeld().latched,true);
 click(game);assert.equal(t.getHeld(),null);
});
