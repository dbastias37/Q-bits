const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');

function lab(){
 const {t,sandbox}=createGame(),doc=sandbox.document;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
 doc.body.dataset.booting='false';doc.pointerLockElement=t.canvas;
 const key=(type,code)=>doc.dispatchEvent({type,code,repeat:false});
 const mouse=(type,button)=>(type==='mousedown'?t.canvas:doc).dispatchEvent({type,button,clientX:640,clientY:360});
 const aim=(p,eye=t.V(0,.5,.8))=>{
  const d=p.vsub(eye);t.setLook({camera:[eye.x,eye.y,eye.z],yaw:Math.atan2(-d.x,-d.z),pitch:Math.atan2(d.y,Math.hypot(d.x,d.z))});t.updateCreationPlacement();
 };
 const press=code=>{key('keydown',code);key('keyup',code);},click=button=>{mouse('mousedown',button);mouse('mouseup',button);};
 return {t,doc,key,mouse,aim,press,click,preview:()=>t.getCreationPreview()};
}
const near=(a,b)=>assert(a.distanceTo(b)<1e-6,`${a} != ${b}`);
function row(t,count=1){
 return t.makeGroup(Array.from({length:count},(_,i)=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(i*.09,.046,0),q:t.Q()})));
}
function begin(game,p,eye){
 game.aim(p,eye);game.press('KeyN');game.key('keydown','ControlLeft');game.t.updateCreationPlacement();
 const preview=game.preview();assert(preview?.valid,preview?.reason);return preview;
}
test('N, Ctrl and a held click paint adjacent face cells; a released Ctrl and right click weld exactly the blue cells',()=>{
 const game=lab(),{t}=game,base=row(t,5),original=t.worldParts(base),last=original.at(-1).p,eye=t.V(.18,.16,.8);
 begin(game,original[0].p,eye);const bodies=t.world.bodies.length;
 game.mouse('mousedown',0);game.aim(t.V(last.x,last.y,.045),eye);
 for(let n=0;n<15;n++)t.updateCreationPlacement();game.mouse('mouseup',0);
 assert.equal(game.preview().faceBuild.parts.length,5);assert.equal(t.world.bodies.length,bodies);
 game.key('keyup','ControlLeft');game.aim(t.V(2,0,0),eye);assert(game.preview().drawPoses.length);
 game.click(2);assert.equal(game.preview(),null);
 assert.equal(t.groups.length,1);const made=t.worldParts(t.groups[0]);assert.equal(made.length,10);
 for(const part of original){near(made.find(p=>p.id===part.id).p,part.p);assert(made.some(p=>p.p.distanceTo(part.p.vadd(t.V(0,0,.09)))<1e-6));}
 assert.equal(t.groups[0].body.mass,2.5);assert.equal(t.getCommandState(),null);
});
test('the stroke can grow past a single support; another click can extend a hologram on its own exposed face',()=>{
 const game=lab(),{t}=game,base=row(t),center=base.body.position.clone(),eye=t.V(0,.046,.8);
 begin(game,center,eye);game.mouse('mousedown',0);game.aim(t.V(.27,.046,.045),eye);game.mouse('mouseup',0);
 assert.equal(game.preview().faceBuild.parts.length,4);
 game.aim(t.V(.27,.046,.135),eye);game.click(0);assert.equal(game.preview().faceBuild.parts.length,5);
 game.key('keyup','ControlLeft');game.click(2);assert.equal(t.groups.length,1);
 assert(t.worldParts(t.groups[0]).some(p=>p.p.distanceTo(t.V(.27,.046,.18))<1e-6));
});
test('a rotated and moving host carries its draft; a bottom face can be built in open space',()=>{
 const game=lab(),{t}=game,base=row(t);base.body.position.set(0,1,0);base.body.quaternion.setFromEuler(.43,.75,-.22);
 const c=base.body.position.clone(),n=base.body.quaternion.vmult(t.V(0,-1,0)),eye=c.vadd(n.scale(.68));
 begin(game,c,eye);near(game.preview().poses[0].p,c.vadd(n.scale(.09)));game.click(0);
 game.key('keyup','ControlLeft');base.body.position.set(.18,1.2,-.2);base.body.quaternion.setFromEuler(-.35,.15,.66);
 t.updateCreationPlacement();const expected=base.body.position.vadd(base.body.quaternion.vmult(t.V(0,-.09,0)));
 near(game.preview().drawPoses[0].p,expected);game.click(2);assert.equal(t.groups.length,1);assert(t.worldParts(t.groups[0]).some(p=>p.p.distanceTo(expected)<1e-6));
});
test('a new obstruction blocks the entire fill and the unchanged draft can be retried',()=>{
 const game=lab(),{t}=game,base=row(t),c=base.body.position.clone(),eye=t.V(0,.046,.75);
 begin(game,c,eye);game.mouse('mousedown',0);game.aim(t.V(.18,.046,.045),eye);game.mouse('mouseup',0);
 game.key('keyup','ControlLeft');const blocked=t.addQubit([.09,.046,.09]);
 game.click(2);assert.equal(t.groups.length,2);assert.equal(game.preview().faceBuild.parts.length,3);assert(game.preview().faceBuild.error);
 t.removeGroup(blocked);game.click(2);assert.equal(t.groups.length,1);assert.equal(t.groups[0].parts.length,4);
});
test('a wall occludes a face, a retired support cannot receive cubes, and Escape discards without creating bodies',()=>{
 const game=lab(),{t}=game,base=row(t),c=base.body.position.clone(),eye=t.V(0,.046,.8);
 const wall=t.storyWall(t.V(0,.2,.37),t.V(.15,.20,.02));game.aim(c,eye);game.press('KeyN');game.key('keydown','ControlLeft');assert.equal(t.updateCreationPlacement(),false);
 game.click(0);assert.equal(game.preview().faceBuild.parts.length,0);
 t.storyWorld.walls.splice(t.storyWorld.walls.indexOf(wall),1);game.aim(c,eye);game.click(0);assert.equal(game.preview().faceBuild.parts.length,1);
 t.removeGroup(base);t.addQubit([0,.046,0]);game.click(2);assert.equal(t.groups.length,1);assert.equal(t.groups[0].parts.length,1);
 game.press('Escape');assert.equal(game.preview(),null);
});
test('Ctrl belongs to the cube tool only during construction; N alone keeps its normal floor placement',()=>{
 const game=lab(),{t}=game,base=row(t,2),p=t.poses(base)[0].p;
 game.aim(p);game.click(0);game.press('KeyN');game.key('keydown','ControlLeft');t.updateTarget();assert.equal(t.livePartSelection(),null);
 game.key('keyup','ControlLeft');game.aim(t.V(-.5,0,0));assert.equal(game.preview().faceBuild,undefined);assert(game.preview().valid);
 game.click(0);assert.equal(t.groups.length,2);assert.equal(base.parts.length,2);
 game.aim(p);game.click(0);game.key('keydown','ControlLeft');t.updateTarget();assert.equal(t.livePartSelection().ids.size,1);
});
test('a restricted scene cannot materialize a draft from the bank',()=>{
 const game=lab(),{t}=game,base=row(t);begin(game,base.body.position);game.click(0);game.key('keyup','ControlLeft');
 t.story.scene='campaign';t.story.firstCycle={};game.click(2);assert.equal(t.groups.length,1);assert.equal(base.parts.length,1);
});
test('N then Ctrl draws cubes even when the last floor shape was a T-bit, without changing that preference',()=>{
 const game=lab(),{t}=game,base=row(t);t.settings.unitShape='tetra';begin(game,base.body.position);
 assert.equal(game.preview().id,'tetra');game.click(0);game.key('keyup','ControlLeft');game.click(2);
 assert.equal(t.groups[0].parts.length,2);assert(t.groups[0].parts.every(p=>p.shape==='cube'));assert.equal(t.settings.unitShape,'tetra');
 game.aim(t.V(-1,0,0));game.press('KeyN');assert.equal(game.preview().id,'tetra');game.click(0);assert.equal(t.groups.at(-1).parts[0].shape,'tetra');
});
test('a stopped articulated mount keeps its original joints, IDs and settings after a face fill',()=>{
 const game=lab(),{t}=game;
 const record=t.servoBlueprintTemplate('pivot');assert(t.spawnSavedMechanism(record,t.V(0,.4,0)));
 const joint=t.rotors[0],before=t.groups.flatMap(g=>Array.from(g.parts,p=>p.id)),settings=JSON.stringify(joint.servo);
 const socket=t.rotorPart(joint.aId),base=t.poses(socket.g).find(p=>p.part.shape==='cube');
 begin(game,base.p,base.p.vadd(t.V(0,0,.75)));game.click(0);game.key('keyup','ControlLeft');game.click(2);
 assert.equal(t.rotors.length,1);assert.equal(t.rotors[0],joint);assert(joint.constraint);
 assert.equal(JSON.stringify(joint.servo),settings);assert(t.rotorPart(joint.aId).g!==t.rotorPart(joint.bId).g);
 assert(before.every(id=>t.rotorPart(id)));assert.equal(t.groups.reduce((n,g)=>n+g.parts.length,0),before.length+1);
});
test('painting a diagonal stays connected by faces and never bridges a hidden cell',()=>{
 const game=lab(),{t}=game,base=row(t),eye=t.V(0,.046,.75);
 begin(game,base.body.position,eye);game.mouse('mousedown',0);game.aim(t.V(.18,.226,.045),eye);game.mouse('mouseup',0);
 assert.equal(game.preview().faceBuild.parts.length,5);game.key('keyup','ControlLeft');game.click(2);
 assert.equal(t.groups[0].parts.length,6);assert(t.assemblyValid(t.worldParts(t.groups[0])));
 const next=lab(),base2=row(next.t),eye2=next.t.V(0,.046,.75);
 begin(next,base2.body.position,eye2);next.mouse('mousedown',0);
 next.t.storyWall(next.t.V(.067,.046,.40),next.t.V(.022,.035,.012));
 next.aim(next.t.V(.27,.046,.045),eye2);next.mouse('mouseup',0);
 assert(next.preview().faceBuild.parts.length<4);
});
test('population is checked again on fill and no partial row appears at the limit',()=>{
 const game=lab(),{t}=game,base=row(t),eye=t.V(0,.046,.7);
 begin(game,base.body.position,eye);game.mouse('mousedown',0);game.aim(t.V(.09,.046,.045),eye);game.mouse('mouseup',0);
 game.key('keyup','ControlLeft');
 const reserve=t.makeGroup(Array.from({length:1998},(_,i)=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(1+(i%15)*.09,.046+Math.floor(i/225)*.09,1+Math.floor(i/15)%15*.09),q:t.Q()})));
 game.click(2);assert.equal(t.groups.length,2);assert.equal(base.parts.length,1);assert.equal(game.preview().faceBuild.parts.length,2);
 t.removeGroup(reserve);game.click(2);assert.equal(t.groups.length,1);assert.equal(t.groups[0].parts.length,3);
});
