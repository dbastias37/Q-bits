'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const saves=require('../assets/js/save-games.js');
async function prepared(){
 const game=createGame({graphics:false}),doc=game.sandbox.document;
 let ready=false;
 const promise=game.api.prepare().then(()=>{ready=true;});
 for(let i=0;i<30&&!ready;i++){game.frame();await Promise.resolve();await Promise.resolve();}
 assert(ready,'game should complete its native boot');
 await promise;doc.body.dataset.booting='false';game.api.menu();
 return game;
}
test('native editor opens with zero objects, no desk, and no bank/campaign writes',async()=>{
 const game=await prepared(),{api,t,sandbox}=game;
 const bankBefore=sandbox.localStorage.getItem(saves.KEYS.lab),campaignBefore=sandbox.localStorage.getItem(saves.KEYS.campaign);
 const opened=api.sceneEditor.open();
 assert.equal(opened.ok,true,opened.error);
 assert.equal(api.sceneEditor.isActive(),true);
 assert.equal(t.story.scene,'lab');
 assert.equal(t.groups.length,0);
 assert.equal(sandbox.localStorage.getItem(saves.KEYS.lab),bankBefore);
 assert.equal(sandbox.localStorage.getItem(saves.KEYS.campaign),campaignBefore);
 assert.equal(t.saveCurrentGame({manual:true}).ok,false,'ordinary bank saves are forbidden in authoring mode');
 const cub=t.addQubit([1,.5,0]);
 assert(cub);
 const captured=api.sceneEditor.capture();
 assert.equal(captured.ok,true,captured.error);
 assert.equal(captured.data.snapshot.groups.length,1);
 assert.equal(captured.data.snapshot.groups[0].parts[0].id,cub.parts[0].id);
 assert.equal(sandbox.localStorage.getItem(saves.KEYS.lab),bankBefore);
 assert.equal(api.sceneEditor.exit(),true);
 assert.equal(api.sceneEditor.isActive(),false);
 assert.equal(t.story.mode,'menu');
 assert.equal(sandbox.localStorage.getItem(saves.KEYS.lab),bankBefore);
});
test('native editor restores supplied snapshot without material duplication',async()=>{
 const game=await prepared(),{api,t}=game;
 assert(api.sceneEditor.open().ok);
 const cub=t.addQubit([1,.5,0]);
 cub.parts[0].mood.energy=.3;
 const capture=api.sceneEditor.capture();
 assert(capture.ok,capture.error);
 assert(api.sceneEditor.open(capture.data).ok);
 assert.equal(t.groups.length,1);
 assert.equal(t.groups[0].parts[0].id,cub.parts[0].id);
 assert.equal(t.groups[0].parts[0].mood.energy,.3);
 const restored=api.sceneEditor.capture();
 assert.equal(restored.ok,true,restored.error);
 assert.equal(restored.data.snapshot.groups.length,1);
 assert(api.sceneEditor.exit());
});
test('invalid imported snapshot fails before mutating current authoring scene',async()=>{
 const game=await prepared(),{api,t}=game;
 assert(api.sceneEditor.open().ok);
 t.addQubit([0,.5,1]);
 const previous=t.groups[0],saved=api.sceneEditor.capture().data;
 const corrupt=JSON.parse(JSON.stringify(saved));
 corrupt.snapshot.groups[0].parts[0].weight=-1;
 const result=api.sceneEditor.open(corrupt);
 assert.equal(result.ok,false);
 assert.equal(t.groups[0],previous);
 assert.equal(api.sceneEditor.isActive(),true);
});

test('authoring catalog spawns real pieces, rejects occupied placement and keeps native conservation outside editor',async()=>{
 const game=await prepared(),{api,t,sandbox}=game;
 assert(api.sceneEditor.open().ok);
 const ids=api.sceneEditor.catalog().map(item=>item.id);
 for(const id of ['cube','tetra','pyramid','coupler','arm','servo-pivot','servo-hinge','propeller','drone','belt-straight','belt-left','belt-right'])assert(ids.includes(id),id);
 const first=api.sceneEditor.spawn('cube',[0,0,0],0);
 assert(first.ok,first.error);
 assert.equal(t.groups.length,1);
 assert.equal(t.groups[0].parts[0].shape,'cube');
 const occupied=api.sceneEditor.spawn('cube',[0,0,0],0);
 assert.equal(occupied.ok,false);
 assert.equal(t.groups.length,1,'a failed placement must not materialize another cube');
 const invalid=api.sceneEditor.spawn('belt-straight',[100,0,0],0);
 assert.equal(invalid.ok,false);
 assert.equal(t.groups.length,1);
 const capture=api.sceneEditor.capture();
 assert.equal(capture.ok,true,capture.error);
 assert.equal(capture.data.snapshot.groups.length,1);
 assert.equal(sandbox.localStorage.getItem(saves.KEYS.lab),null);
});

test('3D authoring uses the native ghost: walk/look, wheel rotation, click place repeatedly and right-click cancel',async()=>{
 const game=await prepared(),{api,t,sandbox}=game;
 assert.equal(api.sceneEditor.open().ok,true);
 sandbox.document.pointerLockElement=t.canvas;
 t.setLook({camera:[0,1.7,2],yaw:0,pitch:-.65});
 const chosen=api.sceneEditor.beginPlacement('cube');
 assert.equal(chosen.ok,true,chosen.error);
 assert.equal(t.groups.length,0,'the preview must not create actual matter');
 let ghost=t.getCreationPreview();
 assert(ghost&&ghost.authoring&&ghost.valid,ghost?.reason);
 const previousTurns=ghost.turns;
 t.handleWheel({deltaY:120,deltaMode:0,shiftKey:false,preventDefault(){}});
 ghost=t.getCreationPreview();
 assert.notEqual(ghost.turns,previousTurns,'wheel rotates the ghost without creating matter');
 t.onCanvasMouseDown({button:0,preventDefault(){}});
 assert.equal(t.groups.length,1,'click places one real cube at the aimed surface');
 assert.equal(t.groups[0].parts[0].shape,'cube');
 assert(t.getCreationPreview()?.authoring,'the brush stays active for repeated placement');
 t.setLook({camera:[0,1.7,2],yaw:0,pitch:.4});
 t.updateCreationPlacement();
 assert.equal(t.getCreationPreview().valid,false,'aiming above the room gives an invalid ghost');
 t.onCanvasMouseDown({button:0,preventDefault(){}});
 assert.equal(t.groups.length,1,'invalid placement cannot create additional matter');
 t.onCanvasMouseDown({button:2,preventDefault(){}});
 assert.equal(api.sceneEditor.placement(),null);
 assert.equal(t.getCreationPreview(),null);
 assert.equal(t.groups.length,1);
});
test('in-world blueprint previews are physical recipes and cancel without spending resources',async()=>{
 const game=await prepared(),{api,t,sandbox}=game;
 assert(api.sceneEditor.open().ok);
 sandbox.document.pointerLockElement=t.canvas;
 t.setLook({camera:[0,1.7,2],yaw:0,pitch:-.6});
 const brush=api.sceneEditor.beginPlacement('belt-straight');
 assert.equal(brush.ok,true,brush.error);
 const preview=t.getCreationPreview();
 assert(preview.authoring);
 assert(preview.record?.conveyors?.length,'conveyor preview uses the native roller blueprint');
 assert.equal(preview.plan,null,'editor constructs complete native objects rather than leaving an empty plan');
 assert.equal(t.groups.length,0);
 assert.equal(api.sceneEditor.cancelPlacement(),true);
 assert.equal(t.groups.length,0);
});
test('world marker placement targets the scene, not numeric coordinates',async()=>{
 const game=await prepared(),{api,t,sandbox}=game;
 assert(api.sceneEditor.open().ok);
 sandbox.document.pointerLockElement=t.canvas;
 t.setLook({camera:[0,1.7,2],yaw:0,pitch:-.7});
 const received=[];
 sandbox.QBitsSceneEditor={onWorldMarkerPlaced:mark=>(received.push(mark),true)};
 assert.equal(api.sceneEditor.beginMarker('source','Materia A').ok,true);
 t.onCanvasMouseDown({button:0,preventDefault(){}});
 assert.equal(received.length,1);
 assert.equal(received[0].role,'source');
 assert.equal(received[0].label,'Materia A');
 assert.equal(received[0].position.length,3);
 assert(received[0].position.every(Number.isFinite));
 assert.equal(t.groups.length,0,'placing a marker cannot invent physical matter');
 assert.equal(api.sceneEditor.setMarkers([{id:'m-3',role:'source',label:'Materia A',position:received[0].position}]),true);
});

test('opening F8 catalogue releases pointer lock intentionally without pausing live simulation',async()=>{
 const game=await prepared(),{api,t,sandbox}=game;
 assert(api.sceneEditor.open().ok);
 sandbox.document.pointerLockElement=t.canvas;
 sandbox.document.dispatchEvent({type:'pointerlockchange'});
 assert.equal(t.story.mode,'playing');
 assert.equal(api.sceneEditor.suspendInput(),true);
 assert.equal(sandbox.document.pointerLockElement,null);
 assert.equal(t.story.mode,'playing','editor catalog must not trigger the engine pause menu');
 assert.equal(api.sceneEditor.isActive(),true);
});

test('clicking a valid conveyor ghost builds a physical native belt instead of decorative geometry',async()=>{
 const game=await prepared(),{api,t,sandbox}=game;
 assert.equal(api.sceneEditor.open().ok,true);
 sandbox.document.pointerLockElement=t.canvas;
 assert.equal(api.sceneEditor.beginPlacement('belt-straight').ok,true);
 const poses=[
  {camera:[0,1.7,2],yaw:0,pitch:-.7},
  {camera:[0,1.7,3],yaw:0,pitch:-.9},
  {camera:[1,1.7,1],yaw:0,pitch:-.8}
 ];
 let preview;
 for(const pose of poses){t.setLook(pose);t.updateCreationPlacement();preview=t.getCreationPreview();if(preview.valid)break;}
 assert(preview?.valid,preview?.reason||'No valid 3D build site');
 const count=t.groups.length;
 t.onCanvasMouseDown({button:0,preventDefault(){}});
 assert(t.groups.length>count,'click must instantiate the blueprint into real groups');
 const saved=api.sceneEditor.capture();
 assert.equal(saved.ok,true,saved.error);
 assert(saved.data.snapshot.conveyors.length>=1,'the real conveyor controller must be serializable');
 assert(saved.data.snapshot.groups.some(g=>g.parts.some(p=>p.shape==='coupler')),'the native belt owns real couplers');
 assert(api.sceneEditor.placement(),'repeated placement remains ready after confirming a belt');
});
