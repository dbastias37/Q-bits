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
 assert.deepEqual(opened,{ok:true});
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
