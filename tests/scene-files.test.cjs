'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
global.QBitsSavedGames={validate:(mode,data)=>({ok:mode==='lab'&&!!data.snapshot&&!!data.alphaSettings})};
const scenes=require('../assets/js/scene-files.js');
const fixture=()=>({snapshot:{groups:[{parts:[{id:1,shape:'cube',mood:{energy:.5}},{id:2,shape:'coupler',mood:{gripper:true}}]}],conveyors:[{id:8}]},alphaSettings:{}});
test('scene code and inventory survive export/import',()=>{
 const doc=scenes.pack('Galpón inicial',fixture(),'Dos piezas');
 assert.equal(doc.inventory.pieces,2);
 assert.equal(doc.inventory.shapes.cube,1);
 assert.equal(doc.inventory.components[0].id,2);
 assert.match(doc.code,/^QBSC1-[0-9A-F]{16}$/);
 assert.deepEqual(scenes.parse(JSON.stringify(doc)),doc);
});
test('the checksum fails closed when the scene changes',()=>{
 const doc=scenes.pack('Base',fixture());doc.data.snapshot.groups[0].parts[0].shape='pyramid';
 assert.throws(()=>scenes.parse(JSON.stringify(doc)),/código no coincide/);
});
test('malformed and incompatible scenes are refused',()=>{
 assert.throws(()=>scenes.parse('garbage'),/JSON/);
 assert.throws(()=>scenes.parse('{"format":"qbits-scene","version":99}'),/incompatibles/);
});
test('scene saving is independent of bank and campaign slots',()=>{
 const values=new Map([['qbits.save.lab.v1','bank'],['qbits.save.campaign.v1','campaign']]);
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 scenes.save(storage,scenes.pack('Escena',fixture()));
 assert.equal(values.get('qbits.save.lab.v1'),'bank');
 assert.equal(values.get('qbits.save.campaign.v1'),'campaign');
 assert.equal(scenes.read(storage).name,'Escena');
});
test('a corrupted import cannot overwrite a valid saved scene',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const original=scenes.save(storage,scenes.pack('Correcta',fixture()));
 const broken=JSON.parse(JSON.stringify(original));broken.data.snapshot.groups[0].parts[0].id=500;
 assert.throws(()=>scenes.save(storage,broken));
 assert.equal(scenes.read(storage).code,original.code);
});
test('stable checksum ignores JSON key ordering',()=>{
 const a=fixture(),b={alphaSettings:{},snapshot:{conveyors:[{id:8}],groups:[{parts:[{mood:{energy:.5},shape:'cube',id:1},{mood:{gripper:true},shape:'coupler',id:2}]}]}};
 assert.equal(scenes.codeFor(a),scenes.codeFor(b));
});
