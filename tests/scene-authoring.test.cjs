'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
// The actual bank validator, rather than a test double.
global.QBitsSavedGames=require('../assets/js/save-games.js');
const scenes=require('../assets/js/scene-files.js');
const part=id=>({id,shape:'cube',weight:1,p:{x:0,y:.5,z:0},q:{x:0,y:0,z:0,w:1},mood:{energy:.8}});
const native=()=>({
 snapshot:{groups:[{parts:[part(12)],q:{x:0,y:0,z:0,w:1},v:{x:0,y:0,z:0},w:{x:0,y:0,z:0}}],
 cargos:[],settings:{},moodSettings:{},position:[0,1.7,2],yaw:0,pitch:0,
 rotors:[{id:12}],conveyors:[{id:12}],runtime:{version:1,time:10,blocked:null,flights:[]},
 powerNetwork:{cables:[]},alphaScene:{coolers:[]}},alphaSettings:{}
});
function memory(){const map=new Map();return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};}
test('empty authoring scene clears native matter and runtime without modifying its source',()=>{
 const source=native(),copy=JSON.stringify(source),blank=scenes.emptyData(source);
 assert.equal(global.QBitsSavedGames.validate('lab',blank).ok,true);
 assert.deepEqual(blank.snapshot.groups,[]);
 assert.deepEqual(blank.snapshot.cargos,[]);
 assert.equal(blank.snapshot.rotors,undefined);
 assert.equal(blank.snapshot.runtime,undefined);
 assert.deepEqual(blank.snapshot.position,[0,1.7,2]);
 assert.equal(JSON.stringify(source),copy);
 assert.equal(scenes.inventory(blank).pieces,0);
});
test('semantic markers survive exported scene and contribute to its identity',()=>{
 const start={phase:'authoring',markers:[{id:'m-1',role:'spawn',label:'Aparición',position:[0,1.7,2]}]};
 const blank=scenes.emptyData(native());
 const doc=scenes.pack('Nivel inicial',blank,'Sin maquinaria',start);
 assert.deepEqual(scenes.parse(JSON.stringify(doc)).design,start);
 assert.equal(doc.inventory.pieces,0);
 const moved=JSON.parse(JSON.stringify(doc));moved.design.markers[0].position[0]=6;
 assert.throws(()=>scenes.parse(JSON.stringify(moved)),/código no coincide/);
 const next=scenes.withDesign(doc,{phase:'authoring',markers:[...start.markers,{id:'m-2',role:'receiver',label:'Recepción',position:[2,0,0]}]});
 assert.notEqual(next.code,doc.code);
 assert.equal(next.design.markers.length,2);
});
test('invalid marker geometry, duplicate IDs and inappropriate fields are rejected',()=>{
 const basic={phase:'authoring',markers:[{id:'m-1',role:'source',label:'Fuente',position:[0,0,0]}]};
 assert.throws(()=>scenes.validateDesign({...basic,markers:[basic.markers[0],basic.markers[0]]}),/identidad/);
 assert.throws(()=>scenes.validateDesign({...basic,markers:[{...basic.markers[0],role:'execute-javascript'}]}),/admitido/);
 assert.throws(()=>scenes.validateDesign({...basic,markers:[{...basic.markers[0],position:[Infinity,0,0]}]}),/Coordenadas/);
 assert.throws(()=>scenes.validateDesign({...basic,markers:[{...basic.markers[0],position:[1001,0,0]}]}),/Coordenadas/);
});
test('previous version scenes without design metadata remain importable',()=>{
 const data=native(),doc=scenes.pack('Anterior',data);
 assert.equal(doc.design,undefined);
 assert.equal(scenes.parse(JSON.stringify(doc)).code,doc.code);
});
test('several versions remain available independently of native save slots',()=>{
 const storage=memory(),empty=scenes.pack('Vacía',scenes.emptyData(native()));
 const marked=scenes.withDesign(empty,{phase:'authoring',markers:[{id:'m-1',role:'spawn',label:'Inicio',position:[0,1,0]}]});
 scenes.save(storage,empty);scenes.save(storage,marked);
 assert.equal(scenes.list(storage).length,2);
 assert.deepEqual(scenes.select(storage,empty.code),empty);
 assert.equal(storage.getItem('qbits.save.lab.v1'),null);
 assert.equal(storage.getItem('qbits.save.campaign.v1'),null);
});
