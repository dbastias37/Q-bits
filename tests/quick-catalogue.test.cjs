const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}
function choose(game,id){const{t}=game;assert(t.openUnitRadial());const menu=game.radial;menu.switchTab('quick');for(let i=0;i<160&&menu.hovered!==id;i++)menu.chooseNext(1);assert.equal(menu.hovered,id);assert(t.closeUnitRadial(true));}
let placeSerial=0;
function click(t){const x=(placeSerial++%6)*1.6-4;t.setLook({camera:[x,2,1],yaw:0,pitch:-Math.atan2(2,2)});t.onCanvasMouseDown({button:0,preventDefault(){}});}
test('Q then Tab opens paged glass cards with matching pointer regions at desktop and compact sizes',()=>{
 const game=lab(),{t,sandbox}=game;assert(t.openUnitRadial());t.onPhysicalKeyDown({code:'Tab',preventDefault(){}});assert.equal(game.radial.getState().tab,'quick');
 for(const [w,h]of [[1280,720],[375,667],[600,420]]){sandbox.innerWidth=w;sandbox.innerHeight=h;sandbox.dispatchEvent({type:'resize'});const menu=game.radial;menu.switchTab('quick');for(let page=0;page<3;page++){for(const panel of menu.getGlassPanels()){assert(panel.points.every(([x,y])=>x>=0&&x<=w&&y>=50&&y<h-80));const x=panel.points.reduce((n,p)=>n+p[0],0)/panel.points.length,y=panel.points.reduce((n,p)=>n+p[1],0)/panel.points.length;menu.moveTo(x,y);assert(menu.hovered?.startsWith('quick-'));}menu.changePage(1);}}
 t.closeUnitRadial(false);
});
test('quick selection creates one complete arm only on the next click and preserves the regular creation type',()=>{
 const game=lab(),{t}=game;t.settings.unitShape='tetra';choose(game,'quick-arm');assert.equal(t.groups.length,0);assert.equal(t.settings.unitShape,'tetra');click(t);assert.equal(t.robotArms.length,1);assert.equal(t.groups.flatMap(g=>g.parts).length,26);assert.equal(t.rotors.length,4);assert(t.rotors.every(r=>!r.enabled));assert.equal(t.blueprints.length,0);t.pause();click(t);assert.equal(t.robotArms.length,1);
});
test('one of each conveyor and each battery can be spawned quickly with real controllers and charged switched-off cells',()=>{
 const game=lab(),{t}=game;for(const kind of ['straight','left','right']){choose(game,'quick-conveyor-'+kind);click(t);}assert.equal(t.conveyors.length,3);assert.equal(t.groups.flatMap(g=>g.parts).length,112);assert.equal(t.rotors.length,9);assert(t.conveyors.every(c=>!c.running&&c.surfaces.length));
 for(const n of [1,2,3]){choose(game,'quick-battery-'+n);click(t);}const cells=t.groups.flatMap(g=>g.parts).filter(t.isExternalBattery);assert.equal(cells.length,6);assert(cells.every(p=>p.mood.energy===1&&!p.mood.externalBattery.enabled));assert.equal(t.groups.flatMap(g=>g.parts).length,118);
});
test('agarre, sensor, cooler and shelf shortcuts use the existing functional tools',()=>{
 const game=lab(),{t}=game;choose(game,'quick-gripper');click(t);assert(t.groups.some(g=>g.parts.some(p=>p.mood.gripper)));choose(game,'quick-sensor');click(t);assert(t.groups.some(g=>g.parts.some(p=>p.mood.workshop?.sensor)));choose(game,'quick-cooler');click(t);assert.equal(t.alphaSceneSnapshot().coolers.length,1);choose(game,'quick-shelf');click(t);assert(t.getShelfPreview());assert.equal(t.shelves.length,0,'wall placement remains explicit');
});
test('the quick page refreshes saved records and creates a real shape copy without consuming its source or blueprint',()=>{
 const game=lab(),{t}=game;t.initUnitRadial();const g=t.addQubit([4,.05,4]);t.saveShape(g);choose(game,'quick-saved-shape-0');click(t);assert.equal(t.groups.length,2);assert(t.groups.includes(g));assert.equal(t.savedShapes.length,1);assert.equal(t.blueprints.length,0);
 t.savedShapes.length=0;t.openUnitRadial();assert(!game.radial.getState().figures.some(f=>f.id==='quick-saved-shape-0'));t.closeUnitRadial(false);
});
test('quick creation never bypasses campaign or puzzle restrictions and cancellation creates nothing',()=>{
 const game=lab(),{t}=game;choose(game,'quick-arm');t.onCanvasMouseDown({button:2,preventDefault(){}});assert.equal(t.groups.length,0);t.story.scene='campaign';assert.equal(t.spawnQuickElement('quick-arm'),null);t.initUnitRadial();assert(!game.radial.getState().figures.some(f=>f.section==='quick'));t.story.scene='lab';t.puzzle.active=true;assert.equal(t.spawnQuickElement('quick-arm'),null);
});
test('material limit is atomic and the pending quick choice can retry after making room',()=>{
 const game=lab(),{t}=game;for(let i=0;i<1984;i++)t.addQubit([5+(i%40)*.1,.05,5+Math.floor(i/40)*.1]);choose(game,'quick-arm');click(t);assert.equal(t.robotArms.length,0);assert.equal(t.groups.length,1984);for(const g of [...t.groups].slice(0,30))t.removeGroup(g);click(t);assert.equal(t.robotArms.length,1);assert.equal(t.groups.flatMap(g=>g.parts).length,1980);
});
