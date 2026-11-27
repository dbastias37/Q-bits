const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

function lab(){
 const {t,sandbox}=createGame({graphics:false}),doc=sandbox.document;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
 doc.body.dataset.booting='false';
 t.canvas.requestPointerLock=()=>{doc.pointerLockElement=t.canvas;doc.dispatchEvent({type:'pointerlockchange'});};
 t.canvas.requestPointerLock();t.setLook({camera:[0,.32,1],yaw:0,pitch:0});
 const game={t,doc};
 game.aim=id=>{
  const hit=t.rotorPart(id),delta=hit.p.vsub(t.V(...t.getLook().camera));
  t.setLook({yaw:Math.atan2(-delta.x,-delta.z),pitch:Math.atan2(delta.y,Math.hypot(delta.x,delta.z))});
  assert.equal(t.aimQubit(4)?.part.id,id,'fixture ray hits its visible piece');t.updateTarget();
 };
 game.key=(type,code)=>doc.dispatchEvent({type,code,repeat:false});
 game.mouse=(type,button)=>(type==='mousedown'?t.canvas:doc).dispatchEvent({type,button,clientX:640,clientY:360});
 game.click=button=>{game.mouse('mousedown',button);game.mouse('mouseup',button);};
 game.menu=()=>doc.querySelector('#command-actions').children;
 game.act=label=>{const b=game.menu().find(button=>button.textContent===label);assert(b&&!b.disabled,label);b.click();};
 game.row=(n,z=0)=>t.makeGroup(Array.from({length:n},(_,i)=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(i*.09,.046,z),q:t.Q()})));
 return game;
}
const partIds=g=>Array.from(g.parts,p=>p.id);
const allIds=t=>Array.from(t.groups).flatMap(partIds).sort((a,b)=>a-b);
function mark(game,ids){game.aim(ids[0]);game.key('keydown','ControlLeft');for(const id of ids)game.aim(id);game.key('keyup','ControlLeft');}

test('Ctrl brushes visible cubes once, persists after release and ignores a nearer unrelated assembly',()=>{
 const game=lab(),{t}=game,g=game.row(5),ids=partIds(g);
 game.aim(ids[0]);game.click(0);assert(!t.getHeld());const bodies=t.world.bodies.slice();
 mark(game,[ids[1],ids[2],ids[1]]);
 assert.deepEqual(Array.from(t.livePartSelection().ids),ids.slice(1,3));assert.deepEqual(t.world.bodies,bodies);
 game.aim(ids[4]);assert.equal(t.livePartSelection().ids.size,2);
 const blocker=game.row(1,.45);game.aim(blocker.parts[0].id);game.key('keydown','ControlRight');t.updateTarget();game.key('keyup','ControlRight');
 assert.equal(t.livePartSelection().ids.size,2);game.click(2);
 assert.equal(t.storySuspended(),false);assert.equal(game.doc.querySelector('#command-title').textContent,'2 piezas marcadas');
 assert(!game.menu().some(b=>/familia/.test(b.textContent)),'whole-assembly actions never leak into a partial selection');
 game.act('Limpiar marcas');assert.equal(t.livePartSelection(),null);assert.equal(t.getSelected().g,g);
});
test('separate lifts only the marked connected piece, with names, energy, mass and the floor pose intact',()=>{
 const game=lab(),{t}=game,g=game.row(5),ids=partIds(g);g.parts[3].mood.name='Pieza azul';g.parts[3].mood.energy=.38;
 const before=t.worldParts(g),untouched=t.addQubit([1,.046,0]);game.aim(ids[0]);game.click(0);
 mark(game,ids.slice(3));game.click(2);game.act('Separar piezas marcadas');
 const picked=t.getSelected().g,base=t.rotorPart(ids[0]).g;
 assert.deepEqual(partIds(picked).sort((a,b)=>a-b),ids.slice(3));assert.deepEqual(partIds(base).sort((a,b)=>a-b),ids.slice(0,3));
 assert.deepEqual(Array.from(t.selectionGroups()),[picked]);assert(!t.livePartSelection());
 assert.equal(t.getHeld().g,picked);assert.equal(t.getHeld().items.length,1);assert(t.getHeld().latched);
 for(const p of before){const live=t.rotorPart(p.id);assert(live.p.distanceTo(p.p)<1e-9);assert.equal(live.part.mood.energy,p.mood.energy);assert.equal(live.part.weight,p.weight);assert.equal(live.part.mood.name,p.mood.name);}
 assert(t.groups.includes(untouched));assert.equal(base.body.mass+picked.body.mass,g.body.mass);
 game.click(0);assert.equal(t.getHeld(),null);assert.deepEqual(Array.from(t.selectionGroups()),[picked]);assert.equal(t.rotorPart(ids[0]).g,base);
 const save=t.saveLab();t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=save;t.enterLab(false);
 assert.deepEqual(partIds(t.rotorPart(ids[3]).g).sort((a,b)=>a-b),ids.slice(3));
 assert.equal(t.rotorPart(ids[3]).part.mood.name,'Pieza azul');
});
test('deleting noncontiguous marks removes exactly those IDs and splits unsupported remnants',()=>{
 const game=lab(),{t}=game,g=game.row(5),ids=partIds(g);game.aim(ids[0]);game.click(0);
 mark(game,[ids[1]]);mark(game,[ids[3]]);game.click(2);game.act('Eliminar piezas marcadas');
 assert.deepEqual(allIds(t),[ids[0],ids[2],ids[4]]);
 assert(t.groups.every(g=>g.parts.length===1));assert(!t.getHeld());assert(!t.getSelected());
});
test('separate keeps disjoint islands in one carry selection without an invisible weld',()=>{
 const game=lab(),{t}=game,g=game.row(5),ids=partIds(g);game.aim(ids[0]);game.click(0);
 mark(game,[ids[0]]);mark(game,[ids[4]]);game.click(2);game.act('Separar piezas marcadas');
 assert.deepEqual(Array.from(t.getHeld().items,i=>i.g.parts[0].id).sort((a,b)=>a-b),[ids[0],ids[4]]);
 assert.equal(t.rotorPart(ids[1]).g.parts.length,3);
 assert.deepEqual(allIds(t),ids);
});
test('full selection allows explicit deletion, and clearing, changing target or stale menus cannot delete a replacement',()=>{
 const game=lab(),{t}=game,g=game.row(2),ids=partIds(g);game.aim(ids[0]);game.click(0);
 mark(game,ids);game.click(2);assert(game.menu().find(b=>b.textContent==='Separar piezas marcadas').disabled);
 game.act('Cerrar');assert.equal(t.livePartSelection().ids.size,2);game.key('keydown','KeyG');game.key('keyup','KeyG');
 assert(!t.livePartSelection());game.click(0);mark(game,ids);game.click(2);
 t.removeGroup(g);const replacement=game.row(2);game.act('Eliminar piezas marcadas');assert.deepEqual(allIds(t),partIds(replacement));
 game.aim(replacement.parts[0].id);game.click(0);mark(game,partIds(replacement));game.click(2);game.act('Eliminar piezas marcadas');assert.deepEqual(allIds(t),[]);
});
test('campaign deletion restrictions, running belts and carry limits are checked at execution',()=>{
 const game=lab(),{t}=game,g=game.row(3),ids=partIds(g);t.setSelected({g,part:g.parts[0]});
 mark(game,ids.slice(0,2));t.story.scene='campaign';game.click(2);game.act('Eliminar piezas marcadas');assert.deepEqual(allIds(t),ids);
 t.story.scene='lab';t.settings.maxCarry=1;game.click(2);game.act('Separar piezas marcadas');assert(!t.getHeld());assert.equal(t.getSelected().g.parts.length,2);
 const belt=t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight'),t.V(1,0,0));assert(belt);
 const c=t.conveyors[0],base=t.rotorPart(c.baseId);t.setSelected(base);assert(t.markAssemblyPart(base));
 const state=t.livePartSelection(),original=allIds(t);c.running=true;
 assert.equal(t.editMarkedParts(state,'separate'),false);assert.equal(t.editMarkedParts(state,'delete'),false);
 assert.deepEqual(allIds(t),original);assert(c.running);assert(t.livePartSelection());
});
for(const remove of [false,true])test('partial edit preserves a servo inside either side and cuts a joint only across the boundary · '+remove,()=>{
 const {t}=lab(),r=t.spawnSavedMechanism(t.servoBlueprintTemplate('pivot'),t.V(0,.3,0)),a=t.rotorPart(r.aId),b=t.rotorPart(r.bId);assert(a&&b);
 const extra=a.g.parts.find(p=>p.id!==r.aId),ids=allIds(t);t.setSelected(a);
 assert(t.markAssemblyPart(t.rotorPart(extra.id)));assert(t.editMarkedParts(t.livePartSelection(),'separate'));t.releaseQubit();
 assert(t.rotors.includes(r)&&t.world.constraints.includes(r.constraint));assert.deepEqual(allIds(t),ids);
 const picked=t.rotorPart(r.bId);t.setSelected(picked);
 for(const p of picked.g.parts)assert(t.markAssemblyPart(t.rotorPart(p.id)));
 assert(t.editMarkedParts(t.livePartSelection(),remove?'delete':'separate'));
 assert(!t.rotors.includes(r));assert(t.rotorPart(r.aId));assert.equal(!!t.rotorPart(r.bId),!remove);
 const liveBodies=new Set(t.world.bodies);assert(t.world.constraints.every(c=>liveBodies.has(c.bodyA)&&liveBodies.has(c.bodyB)));
 if(!remove)assert(t.getHeld().items.every(i=>i.g!==t.rotorPart(r.aId).g));
});
test('a fast sweep paints intermediate visible cells and releasing Ctrl bridges no gap',()=>{
 const game=lab(),{t}=game,g=game.row(6),ids=partIds(g);game.aim(ids[0]);game.click(0);
 mark(game,[ids[0],ids[3]]);assert.deepEqual(Array.from(t.livePartSelection().ids),ids.slice(0,4));
 mark(game,[ids[5]]);assert(!t.livePartSelection().ids.has(ids[4]));
});
test('separating the gripper from a stopped arm retires its controller while preserving the four real hinges',()=>{
 const {t}=lab();assert(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V(0,0,0)));
 const arm=t.robotArms[0],joints=Array.from(t.rotors),ids=allIds(t),gripper=t.rotorPart(arm.gripperId);
 t.setSelected(gripper);assert(t.markAssemblyPart(gripper));assert(t.editMarkedParts(t.livePartSelection(),'separate'));
 assert.equal(t.robotArms.length,0);assert.deepEqual(Array.from(t.rotors),joints);
 assert.deepEqual(allIds(t),ids);assert.equal(t.getSelected().g.parts.length,1);
 assert(t.getSelected().part.mood.gripper);assert(t.rotors.every(r=>t.world.constraints.includes(r.constraint)));
});
test('removing an optional conveyor foot leaves the virtual rollers, energy and saved module intact',()=>{
 const {t}=lab();assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight',true),t.V()));
 const c=t.conveyors[0],foot=c.moduleParts.find(id=>!c.required.includes(id)),base=t.rotorPart(c.baseId);
 const ids=allIds(t),joints=Array.from(t.rotors),energy=t.rotorPart(c.baseId).part.mood.energy;
 t.setSelected(base);assert(t.markAssemblyPart(t.rotorPart(foot)));assert(t.editMarkedParts(t.livePartSelection(),'delete'));
 assert.deepEqual(allIds(t),ids.filter(id=>id!==foot));assert.deepEqual(Array.from(t.rotors),joints);
 assert(c.virtual);assert.equal(t.rotorPart(c.baseId).part.mood.energy,energy);
 const saved=t.saveLab();assert.equal(saved.conveyors.length,1);assert(!saved.conveyors[0].moduleParts.includes(foot));
});
