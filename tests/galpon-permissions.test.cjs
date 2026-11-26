const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

function fixture(count=4){
 const game=createGame({graphics:false}),{t,sandbox}=game,doc=sandbox.document;
 t.beginHangarGame({workers:count});t.story.ready=true;t.hideStoryDialogue();
 doc.body.dataset.booting='false';doc.pointerLockElement=t.canvas;
 return {...game,doc,G:sandbox.QBitsGalponProduction,s:t.story.galpon};
}
const ids=t=>Array.from(t.groups).flatMap(g=>Array.from(g.parts,p=>p.id)).sort((a,b)=>a-b);
const tap=(doc,code)=>{doc.dispatchEvent({type:'keydown',code});doc.dispatchEvent({type:'keyup',code});};
test('galpón: crear, duplicar, importar y el catálogo no conceden material ni consumen identidades',()=>{
 const {t,doc,s,G}=fixture(),before=ids(t),serial=t.allocateUnitId(),saved=JSON.stringify(G.snapshot(s));
 t.setSelected({g:t.groups[0],part:t.groups[0].parts[0]});
 for(const key of ['KeyQ','KeyB','KeyN','KeyV'])tap(doc,key);
 assert.equal(t.getCreationPreview(),null);assert.equal(t.radialOpen(),false);
 t.canvas.dispatchEvent({type:'mousedown',button:1});
 assert.equal(doc.querySelector('#panel').hidden,false);
 for(const id of ['create','create-coupler','create-rotor','create-cargo','place-cooler','start-puzzle']){const button=doc.querySelector('#'+id);assert.equal(button.disabled,true,id);button.dispatchEvent({type:'click'});}
 assert.equal(t.story.scene,'galpon');assert.equal(t.puzzle.active,false);
 assert.equal(t.startCreationTool('cube'),false);assert.equal(t.beginCreationPlacement('quick-arm'),false);assert.equal(t.spawnQuickElement('quick-arm'),null);
 assert(!t.spawnQubit());assert(!t.spawnRotor(t.V()));assert(!t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V()));
 assert(!t.addQubit([3,1,3]));assert(!t.newCargo(t.V(2,0,2)));assert(!t.createPowerReservoir(t.V(2,0,2)));assert(!t.createCooler(t.V(2,0,2)));
 const free=t.worldParts(t.groups[0]);assert(!t.makeGroup(free));assert(!t.makeGroup([{...free[0],id:999}]));
 assert.throws(()=>t.importShapesData({version:1,shapes:[]}),/importaciones/);assert.throws(()=>t.importMechanismsData({version:1,mechanisms:[]}),/importaciones/);
 assert.equal(JSON.stringify(G.snapshot(s)),saved);assert.deepEqual(ids(t),before);assert.equal(t.allocateUnitId(),serial+1);
});
test('galpón: una familia traslada las identidades y las plazas sin conceder materia, trabajo o crédito',()=>{
 const {t,s,G}=fixture(),before=ids(t);
 const family=t.groupIntoFamilies([...t.groups],{name:'Turno'})?.[0];assert(family);
 assert.deepEqual(ids(t),[]);assert.equal(G.population(s),4);assert.equal(G.workerUnits(s,before),0);
 assert(s.records.every(r=>r.place==='group'&&r.group==='family:'+family.id));
 const split=t.splitFamily(family,2);assert.equal(split.length,2);
 for(const f of split)for(const id of f.partIds)assert.equal(G.record(s,id).group,'family:'+f.id);
 assert(t.mergeFamilies(split[0],split[1]));const f=split[0];assert.equal(f.count,4);
 assert(!t.makeGroup([{id:before[0],shape:'cube',weight:1,p:t.V(),q:t.Q()}]));
 assert(t.beginFamilyPlacement(f,'withdraw',4));assert(t.confirmFamilyPlacement({point:t.V(2,0,2),normal:t.V(0,1,0)}));
 assert.deepEqual(ids(t),before);assert.equal(G.population(s),4);assert.equal(G.workerUnits(s,before),4);assert.equal(G.stats(s).received,0);assert.equal(G.validate(s),s);
});
test('galpón: división y recomposición en la estación conservan origen, energía, materia y una plaza',()=>{
 const {t,s,G}=fixture(1),g=t.groups[0],root=g.parts[0].id;
 const setInput=(g,i)=>{const p=t.hangarTray('former',i);p.y=t.unitGroundHeight(g.parts[0].shape)+.001;g.body.position.copy(p);g.body.aabbNeedsUpdate=true;};
 assert.equal(t.hangarReconfigure('divide'),false);setInput(g,0);g.parts[0].mood.energy=.37;
 assert(t.hangarReconfigure('divide'));assert.equal(t.groups.length,6);
 assert.equal(G.population(s),1);assert(s.records.every(r=>r.origin===root&&r.kind==='pyramid'&&r.energy===.37&&Math.abs(r.weight-1/6)<1e-8));
 assert(Math.abs(t.groups.reduce((n,g)=>n+t.groupWorkUnits(g),0)-1)<1e-8);
 const pyramids=[...t.groups];setInput(pyramids[0],0);
 // The other five pieces physically obstruct the exit. Clear them before the next transformation.
 assert.equal(t.hangarReconfigure('subdivide'),false);
 for(const [i,p] of pyramids.slice(1).entries())p.body.position.set(2+i*.15,.06,2);
 assert(t.hangarReconfigure('subdivide'));let tetra=t.groups.filter(g=>g.parts[0].shape==='tetra');assert.equal(tetra.length,2);
 tetra.forEach(setInput);assert(t.hangarReconfigure('pyramid'));
 t.groups.forEach(setInput);assert(t.hangarReconfigure('cube'));assert.deepEqual(ids(t),[root]);assert.equal(s.records[0].kind,'worker');assert(Math.abs(s.records[0].energy-.37)<1e-8);
 assert.equal(G.population(s),1);assert.equal(s.extracted,0);assert.equal(s.spent.reconfiguration,4*G.CONFIG.formingJ);G.validate(s);
});
test('galpón: permiso de un trabajo materializa su salida una sola vez; volver al banco restaura creación libre',()=>{
 const {t,s,G}=fixture(1),p=t.groups[0].parts[0],id=p.id;
 G.syncEnergy(s,id,.27);assert(G.start(s,'former',id,'coupler'));t.removeGroup(t.groups[0]);
 const physical={id,shape:'coupler',weight:1,p:t.V(0,.2,0),q:t.Q(),mood:{energy:.27,matter:{root:id,path:'',rootWeight:1}}};
 assert(!t.makeGroup([physical]));G.tick(s,1);
 assert(t.makeGroup([physical]));assert(!t.makeGroup([physical]));assert.equal(G.finish(s,'former').id,id);
 assert.equal(t.groupWorkUnits(t.groups[0]),0);assert.equal(G.population(s),1);
 t.enterLab(false);assert.equal(t.story.scene,'lab');assert(t.addQubit([3,1,3]));assert(t.creationChoiceAllowed('cube'));
});
test('galpón: el acorde Shift + Q/E/R da vuelta la pieza física y conserva el agarre',()=>{
 const {t,doc}=fixture(1),g=t.groups[0],p=g.parts[0];
 t.setLook({camera:[0,1.6,2.5],yaw:0,pitch:0});g.body.position.set(0,1.6,1.5);
 t.grabQubit({g,part:p,point:g.body.position.clone(),distance:1});
 const held=t.getHeld();assert.equal(held.g,g);
 doc.dispatchEvent({type:'keydown',code:'ShiftLeft'});
 for(const key of ['KeyQ','KeyE','KeyR']){
  tap(doc,key);
  for(let i=0;i<96;i++)t.stepSimulation(1/120);
  const vector=g.body.quaternion.vmult(t.V(0,0,1));
  if(key==='KeyQ')assert(vector.x>.98);else if(key==='KeyE')assert(vector.z>.98);else assert(vector.y<-.98);
  assert.equal(t.getHeld(),held);assert.equal(t.radialOpen(),false);assert.equal(doc.querySelector('#panel').hidden,true);
 }
 doc.dispatchEvent({type:'keyup',code:'ShiftLeft'});t.releaseQubit();assert.equal(t.groups[0].parts[0].id,p.id);
});
