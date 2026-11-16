const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function lab(){const game=createGame(),{t,sandbox}=game;Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle',progress:{}});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}
function commandButton(game,label){const found=game.sandbox.document.querySelector('#command-actions').children.find(button=>button.textContent===label);assert(found,`missing command ${label}`);return found;}

test('wall aim resolves all four room planes with inward normals and matching shelf orientation',()=>{
 const {t}=lab();
 for(const [wall,camera,direction,normal]of [
  ['north',[0,1.5,-11],[0,0,-1],[0,0,1]],['south',[0,1.5,11],[0,0,1],[0,0,-1]],
  ['east',[11,1.5,0],[1,0,0],[-1,0,0]],['west',[-11,1.5,0],[-1,0,0],[1,0,0]]
 ]){t.setLook({camera});const hit=t.wallAim(t.V(...direction));assert(hit);assert.equal(hit.wall,wall);near(hit.distance,3);const facing=hit.q.vmult(t.V(0,0,1));for(const [i,axis]of ['x','y','z'].entries()){near(hit.normal[axis],normal[i]);near(facing[axis],normal[i]);}near(hit.p.y,1.5);}
});

test('wall organization cannot target distant walls, floor, ceiling or through solid furniture',()=>{
 const {t}=lab();t.setLook({camera:[0,1.5,-9]});assert.equal(t.wallAim(t.V(0,0,-1)),null);
 t.setLook({camera:[0,1.5,-11]});assert.equal(t.wallAim(t.V(0,1,0)),null);assert.equal(t.wallAim(t.V(0,-1,0)),null);assert.equal(t.wallAim(t.V(0,0,-1),2),null);
 const blocking=t.storyWall(t.V(0,1.5,-12),t.V(.3,.3,.05));assert.equal(t.wallAim(t.V(0,0,-1)),null);
 blocking.furniture='shelf';assert.equal(t.wallAim(t.V(0,0,-1)).wall,'north','existing shelves remain targetable for snapping');
 t.setLook({camera:[0,.01,-11]});assert.equal(t.wallAim(t.V(0,0,-1)),null);t.setLook({camera:[0,13.99,-11]});assert.equal(t.wallAim(t.V(0,0,-1)),null);
 t.setLook({camera:[0,1.5,-11]});t.story.scene='campaign';assert.equal(t.wallAim(t.V(0,0,-1)),null);t.story.scene='lab';t.puzzle.active=true;assert.equal(t.wallAim(t.V(0,0,-1)),null);
});

test('wall context replaces menu contents with organization and supports returning without placing anything',()=>{
 const game=lab(),{t}=game;t.setLook({camera:[0,1.5,-11]});const hit=t.wallAim(t.V(0,0,-1));t.openWallOrganization(hit);
 assert.equal(t.getCommandState().title,'Pared');assert.equal(game.sandbox.document.querySelector('#command-actions').children.length,2);
 commandButton(game,'Organización…').dispatchEvent({type:'click'});assert.equal(t.getCommandState().title,'Organización · elementos');assert.equal(game.sandbox.document.querySelector('#command-actions').children.length,4);
 assert.equal(commandButton(game,'Un tipo por compartimento · hasta 50 elementos').disabled,true);assert.equal(commandButton(game,'Repisa modular · 15 compartimentos').disabled,false);
 commandButton(game,'Volver').dispatchEvent({type:'click'});assert.equal(t.getCommandState().title,'Pared');assert.equal(game.sandbox.document.querySelector('#command-actions').children.length,2);
});

test('wall menu starts a valid blueprint, click confirms once and Escape or right click cancel without furniture',()=>{
 const game=lab(),{t}=game;t.setLook({camera:[0,1.5,-11],yaw:0,pitch:0});const hit=t.wallAim(t.V(0,0,-1));t.openWallOrganization(hit);
 commandButton(game,'Organización…').dispatchEvent({type:'click'});commandButton(game,'Repisa modular · 15 compartimentos').dispatchEvent({type:'click'});
 assert.equal(t.shelves.length,0);assert(t.getShelfPreview()?.valid);assert.equal(t.getCommandState(),null);
 t.onCanvasMouseDown({button:0,preventDefault(){}});assert.equal(t.shelves.length,1);assert.equal(t.getShelfPreview(),null);assert.equal(t.shelves[0].cells.length,15);
 t.setLook({camera:[3,1.5,-11]});assert(t.beginShelfPlacement(t.wallAim(t.V(0,0,-1))));assert(t.getShelfPreview()?.valid);t.handleKey({code:'Escape',preventDefault(){}});assert.equal(t.getShelfPreview(),null);assert.equal(t.shelves.length,1);
 assert(t.beginShelfPlacement(t.wallAim(t.V(0,0,-1))));t.onCanvasMouseDown({button:2,preventDefault(){}});assert.equal(t.getShelfPreview(),null);assert.equal(t.shelves.length,1);
});

test('a neighbouring blueprint snaps beside the first shelf and E commits the snapped position',()=>{
 const game=lab(),{t}=game;t.setLook({camera:[0,1.5,-11],yaw:0,pitch:0});t.beginShelfPlacement(t.wallAim(t.V(0,0,-1)));t.handleKey({code:'KeyE',preventDefault(){}});assert.equal(t.shelves.length,1);
 const first=t.shelves[0],model=t.shelfModel(),width=model.bounds.max[0]-model.bounds.min[0],height=model.bounds.max[1]-model.bounds.min[1],target=first.p.vadd(t.V(width+.015,0,0));
 t.setLook({camera:[target.x+.08,target.y+height/2,-11],yaw:0,pitch:0});t.beginShelfPlacement(t.wallAim(t.V(0,0,-1)));const preview=t.getShelfPreview();assert(preview.valid,preview.reason);assert(preview.snapped);near(preview.placement.p.x,target.x);near(preview.placement.p.y,target.y);
 t.handleKey({code:'KeyE',preventDefault(){}});assert.equal(t.shelves.length,2);assert.equal(t.getShelfPreview(),null);near(t.shelves[1].p.x,target.x);near(t.shelves[1].p.y,target.y);
 // Reopening a blueprint over occupied space remains invalid and never duplicates it.
 t.setLook({camera:[target.x,target.y+height/2,-11],yaw:0,pitch:0});t.beginShelfPlacement(t.wallAim(t.V(0,0,-1)));assert.equal(t.getShelfPreview().valid,false);t.handleKey({code:'KeyE',preventDefault(){}});assert.equal(t.shelves.length,2);assert(t.getShelfPreview());t.cancelShelfPlacement();
});
