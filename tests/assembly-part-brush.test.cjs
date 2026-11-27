const test=require('node:test'),assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

function lab(){
 const game=createGame({graphics:false}),{t,sandbox}=game,doc=sandbox.document;
 t.clearNarrativeScene();
 Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
 doc.body.dataset.booting='false';
 t.canvas.requestPointerLock=()=>{doc.pointerLockElement=t.canvas;doc.dispatchEvent({type:'pointerlockchange'});};
 t.canvas.requestPointerLock();
 return {...game,doc};
}
function assembly(t,count=5){
 return t.makeGroup(Array.from({length:count},(_,i)=>({id:t.allocateUnitId(),weight:i+1,shape:'cube',p:t.V((i-2)*.09,1,0),q:t.Q()})));
}
function aim(t,g,index){
 const p=t.worldParts(g)[index].p;
 t.setLook({camera:[p.x,p.y,p.z+1.4],yaw:0,pitch:0});
 assert.equal(t.aimQubit(4)?.part.id,g.parts[index].id,'aim chooses exactly one welded member');
}
function ctrlMark(t,g,index){
 aim(t,g,index);
 t.onCanvasMouseDown({button:0,ctrlKey:true,metaKey:false,preventDefault(){}});
}
function openBrushMenu(t,game){
 t.onCanvasMouseDown({button:2,clientX:640,clientY:360,preventDefault(){}});
 return game.sandbox.document.querySelector('#command-actions').children;
}
function execute(game,label){
 const buttons=game.sandbox.document.querySelector('#command-actions').children;
 const chosen=buttons.find(button=>button.textContent===label);
 assert(chosen,'context menu includes '+label);
 chosen.click();
}
function ids(groups){return groups.flatMap(g=>g.parts.map(p=>p.id)).sort((a,b)=>a-b);}
test('Ctrl marks individual cubes without removing, duplicating or reassembling the body before command',()=>{
 const game=lab(),{t}=game,g=assembly(t),original=t.worldParts(g),body=g.body,weight=g.body.mass;
 t.setSelected({g,part:g.parts[0]});ctrlMark(t,g,3);ctrlMark(t,g,4);
 assert.equal(t.groups.length,1);assert.equal(g.body,body);assert.equal(g.body.mass,weight);
 assert.deepEqual(ids(t.groups),original.map(p=>p.id).sort((a,b)=>a-b));
 const choices=openBrushMenu(t,game).map(button=>button.textContent);
 assert(choices.includes('Separar piezas seleccionadas'));
 assert(choices.includes('Eliminar piezas seleccionadas'));
 execute(game,'Cerrar');
 assert.equal(t.groups.length,1,'closing a menu never changes the mechanism');
});
test('separating two contiguous selected members creates one selectable rigid subassembly',()=>{
 const game=lab(),{t}=game,g=assembly(t),all=t.worldParts(g),selectedIds=all.slice(3).map(p=>p.id),remainingIds=all.slice(0,3).map(p=>p.id);
 const mass=g.body.mass;
 t.setSelected({g,part:g.parts[0]});ctrlMark(t,g,3);ctrlMark(t,g,4);
 openBrushMenu(t,game);execute(game,'Separar piezas seleccionadas');
 assert.equal(t.groups.length,2);
 assert.deepEqual(ids(t.groups),all.map(p=>p.id).sort((a,b)=>a-b));
 const detached=t.groups.find(group=>group.parts.some(part=>selectedIds.includes(part.id)));
 assert(detached);assert.deepEqual(detached.parts.map(p=>p.id).sort((a,b)=>a-b),selectedIds.sort((a,b)=>a-b));
 const rest=t.groups.find(group=>group!==detached);
 assert.deepEqual(rest.parts.map(p=>p.id).sort((a,b)=>a-b),remainingIds.sort((a,b)=>a-b));
 assert.equal(t.getSelected()?.g,detached,'the removed cluster is selected for moving');
 assert(Math.abs(t.groups.reduce((n,g)=>n+g.body.mass,0)-mass)<1e-9,'physical mass is conserved');
 assert(t.world.bodies.includes(rest.body)&&t.world.bodies.includes(detached.body));
 assert(!t.world.bodies.includes(g.body),'the old compound body is fully retired');
});
test('deleting a middle cube keeps the exact remaining identities and splits disconnected islands',()=>{
 const game=lab(),{t}=game,g=assembly(t),all=t.worldParts(g),deleted=all[2],oldMass=g.body.mass;
 t.setSelected({g,part:g.parts[0]});ctrlMark(t,g,2);
 openBrushMenu(t,game);execute(game,'Eliminar piezas seleccionadas');
 assert.equal(t.groups.length,2);
 assert.deepEqual(ids(t.groups),all.filter(p=>p.id!==deleted.id).map(p=>p.id).sort((a,b)=>a-b));
 assert(Math.abs(t.groups.reduce((n,g)=>n+g.body.mass,0)-(oldMass-deleted.weight*.25))<1e-9);
 assert(!t.groups.some(g=>g.parts.some(p=>p.id===deleted.id)));
});
test('Ctrl pointer sweep adds new pieces without requiring per-cube clicks',async()=>{
 const game=lab(),{t,doc}=game,g=assembly(t);
 t.setSelected({g,part:g.parts[0]});t.keys.add('ControlLeft');
 aim(t,g,3);doc.dispatchEvent({type:'mousemove',movementX:0,movementY:0,timeStamp:0});
 await new Promise(resolve=>setTimeout(resolve,37));
 aim(t,g,4);doc.dispatchEvent({type:'mousemove',movementX:0,movementY:0,timeStamp:40});
 t.keys.delete('ControlLeft');
 openBrushMenu(t,game);execute(game,'Separar piezas seleccionadas');
 assert.equal(t.groups.length,2,'two adjacent swept cubes become a separate compound');
 const detached=t.groups.find(group=>group.parts.length===2);assert(detached);
 assert.deepEqual(detached.parts.map(p=>p.id).sort((a,b)=>a-b),[g.parts[3].id,g.parts[4].id].sort((a,b)=>a-b));
});
