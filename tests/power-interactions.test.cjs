const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const Preferences=require('../assets/js/preferences.js');
const Controls=require('../assets/js/controls.js');
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}
function click(t,button=0){t.onCanvasMouseDown({button,preventDefault(){}});t.onCanvasMouseUp({button,preventDefault(){}});}
function lookAt(t,p,from=[1.4,1.25,3.2]){const dx=p.x-from[0],dy=p.y-from[1],dz=p.z-from[2];t.setLook({camera:from,yaw:Math.atan2(-dx,-dz),pitch:Math.atan2(dy,Math.hypot(dx,dz))});}
function choose(game,id){const{t}=game;assert(t.openUnitRadial());game.radial.switchTab('quick');for(let i=0;i<200&&game.radial.hovered!==id;i++)game.radial.chooseNext(1);assert.equal(game.radial.hovered,id);assert(t.closeUnitRadial(true));}
function materials(t,count=2){return Array.from({length:count},(_,i)=>{const g=t.addQubit([-2+i*.2,.05,2],1);g.parts[0].mood.energy=.23+i*.07;g.parts[0].mood.name='Conductor '+i;return g;});}
function setupCable(game,count=2){const{t}=game,r=t.createPowerReservoir(t.V(),{enabled:true,energy:.61}),m=t.spawnRotor(t.V(0,0,2),{capacity:256}),source=materials(t,count);assert(r&&m);return {r,m,source,from:{kind:'reservoir',id:r.id},to:{kind:'part',id:m.aId}};}
function draftFromReservoir(t,source,r){assert(t.beginPowerCable(source));lookAt(t,t.V(r.p.x,r.p.y+.9,r.p.z));assert.equal(t.powerAimPort()?.endpoint.kind,'reservoir');click(t);assert.equal(t.getPowerDraft().from.id,r.id);}
function deploy(game,count=2){const{t}=game,fixture=setupCable(game,count);draftFromReservoir(t,fixture.source,fixture.r);assert(t.finishPowerCable(fixture.to));return {...fixture,c:t.powerCables[0]};}

test('Q exposes large reservoir and 1/4/8 cube, small and large cable choices; only confirmation creates',()=>{
 const game=lab(),{t}=game;choose(game,'quick-power-reservoir');assert.equal(t.powerReservoirs.length,0);click(t);assert.equal(t.powerReservoirs.length,1);assert.equal(t.powerReservoirs[0].enabled,false);assert.equal(t.powerReservoirs[0].cell.mood.energy,1);click(t);assert.equal(t.powerReservoirs.length,1);
 for(const [id,count,length]of [['quick-cable-1',1,2],['quick-cable-4',4,8],['quick-cable-8',8,16],['quick-cable-small',1,1],['quick-cable-large',1,4]]){
  choose(game,id);assert.equal(t.getPowerDraft(),null);click(t);const draft=t.getPowerDraft();assert(draft,id);assert.equal(draft.materials.length,count);assert.equal(t.powerCableLimit(t.powerDraftMaterials()),length);assert.equal(t.powerCables.length,0);t.handleKey({code:'Escape',preventDefault(){}});assert.equal(t.getPowerDraft(),null);assert(draft.groups.every(g=>t.groups.includes(g)));
 }
});

test('draft cancellation, right-click undo and insufficient length preserve source identities and energy',()=>{
 const game=lab(),{t}=game,{r,m,source,to}=setupCable(game,1),before=source.flatMap(g=>t.worldParts(g));draftFromReservoir(t,source,r);lookAt(t,t.V(-1,.008,1));click(t);assert.equal(t.getPowerDraft().bends.length,1);click(t,2);assert.equal(t.getPowerDraft().bends.length,0);
 assert.equal(t.finishPowerCable(to),false,'one cube cannot cover floor drops plus this route');assert.equal(t.powerCables.length,0);assert(t.getPowerDraft());click(t,2);assert.equal(t.getPowerDraft(),null);
 for(const part of before){const current=t.rotorPart(part.id)?.part;assert(current);assert.equal(current.mood.energy,part.mood.energy);assert.equal(current.mood.name,part.mood.name);}
 assert.equal(t.rotors.length,1);assert.equal(m.enabled,false);
});

test('two real endpoint clicks deploy a floor cable and recovery returns all original cube data',()=>{
 const game=lab(),{t}=game,{r,source,to}=setupCable(game),before=source.flatMap(g=>t.worldParts(g));draftFromReservoir(t,source,r);lookAt(t,t.rotorPart(to.id).p,[1,1,3]);assert.equal(t.powerAimPort()?.endpoint.id,to.id);click(t);
 assert.equal(t.getPowerDraft(),null);assert.equal(t.powerCables.length,1);const cable=t.powerCables[0];assert(cable.active);assert(source.every(g=>!t.groups.includes(g)));assert(cable.points.length>=2);assert(cable.points.every(p=>p.y===.008));
 t.position.splice(0,3,3,t.EYE_HEIGHT,3);t.setLook({yaw:0});assert(t.recoverPowerCable(cable));assert.equal(t.powerCables.length,0);
 for(const original of before){const restored=t.rotorPart(original.id)?.part;assert(restored);assert.equal(restored.weight,original.weight);assert.equal(restored.mood.energy,original.mood.energy);assert.equal(restored.mood.name,original.mood.name);}
});

test('cube changes during drafting invalidate atomically without consuming surviving material',()=>{
 const game=lab(),{t}=game,{r,source,to}=setupCable(game);draftFromReservoir(t,source,r);t.removeGroup(source[0]);assert.equal(t.finishPowerCable(to),false);assert.equal(t.getPowerDraft(),null);assert.equal(t.powerCables.length,0);assert(t.groups.includes(source[1]));
});

test('nearby normal cubes extend the cable once and the eighth-cube limit preserves extras',()=>{
 const game=lab(),{t}=game,{c}=deploy(game,2),originalIds=Array.from(c.materials,p=>p.id),extra=materials(t,6);for(const g of extra)g.body.position.set(0,.05,2.4);
 for(let i=0;i<6;i++)assert(t.addPowerCableMaterial(c));assert.equal(c.materials.length,8);assert.equal(c.maxLength,16);assert(extra.every(g=>!t.groups.includes(g)));assert(originalIds.every(id=>c.materials.some(p=>p.id===id)));
 const ninth=t.addQubit([0,.05,2.5]);assert.equal(t.addPowerCableMaterial(c),false);assert(t.groups.includes(ninth));assert.equal(c.materials.length,8);
});

test('cancelling a cable reroute preserves the original live connection and material',()=>{
 const game=lab(),{t}=game,{c}=deploy(game),old=JSON.stringify(t.serializePowerNetwork());t.openPowerCableMenu(c,c.points[0]);const action=t.getCommandState().items.find(item=>/Prolongar/.test(item.label));assert(action);action.run();assert.equal(t.getPowerDraft().existing,c);t.handleKey({code:'Escape',preventDefault(){}});assert.equal(t.getPowerDraft(),null);assert.equal(JSON.stringify(t.serializePowerNetwork()),old);assert(c.active);
});

test('save, scene clear and lab restore retain graph, reservoir charge and committed matter',()=>{
 const game=lab(),{t}=game,{c,r,m}=deploy(game),ids=Array.from(c.materials,p=>p.id);r.cell.mood.energy=.427;for(const id of [m.aId,m.bId])t.rotorPart(id).part.mood.energy=0;assert(t.configureRotor(m,{enabled:true}));const pending=materials(t,1);assert(t.beginPowerCable(pending));const saved=t.saveLab();assert.equal(t.getPowerDraft(),null);assert(saved.powerNetwork);assert(saved.groups.some(g=>g.parts.some(p=>p.id===pending[0].parts[0].id)));
 t.clearNarrativeScene();assert.equal(t.powerReservoirs.length,0);assert.equal(t.powerCables.length,0);assert(!t.world.bodies.includes(r.wall.body));t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);
 assert.equal(t.powerReservoirs.length,1);assert.equal(t.powerReservoirs[0].cell.mood.energy,.427);assert.equal(t.powerCables.length,1);assert.deepEqual(Array.from(t.powerCables[0].materials,p=>p.id),ids);assert(t.powerCables[0].active);assert(ids.every(id=>!t.rotorPart(id)));assert.equal(t.rotors[0].enabled,true,'saved running rotor restores from external source even with empty internal cells');
});

test('Alt inspection and a remapped inspect action do not open detach UI or mutate a mechanism',()=>{
 const game=lab(),{t,sandbox}=game,{m}=deploy(game);const hit=t.rotorPart(m.aId),before=t.groups.flatMap(g=>g.parts.map(p=>p.id));lookAt(t,hit.p);t.setSelected(hit);assert(t.powerInspectionAvailable());t.handleKey({code:'AltLeft',repeat:false,preventDefault(){}});assert(t.keys.has('AltLeft'));assert.equal(sandbox.document.querySelector('#menu').hidden,true);t.handleKeyUp({code:'AltLeft'});assert(!t.keys.has('AltLeft'));
 const preferences=Preferences.defaults();Controls.assignBinding(preferences.controls,'keyboard','inspect','KeyI');t.applyPreferences(preferences);t.onPhysicalKeyDown({code:'KeyI',repeat:false,preventDefault(){}});assert(t.keys.has('AltLeft'));t.onPhysicalKeyUp({code:'KeyI',preventDefault(){}});assert(!t.keys.has('AltLeft'));assert.deepEqual(t.groups.flatMap(g=>g.parts.map(p=>p.id)),before);
});

test('reservoir menu exposes explicit output and sandbox recharge without charging an enabled source',()=>{
 const game=lab(),{t}=game,r=t.createPowerReservoir(t.V(),{energy:.2});t.openPowerReservoirMenu(r);t.getCommandState().items.find(item=>/Encender salida/.test(item.label)).run();assert(r.enabled);assert(t.getCommandState().items.find(item=>/Recargar/.test(item.label)).disabled);t.getCommandState().items.find(item=>/Recargar/.test(item.label)).run();assert.equal(r.cell.mood.energy,.2);t.getCommandState().items.find(item=>/Apagar salida/.test(item.label)).run();assert(!r.enabled);t.getCommandState().items.find(item=>/Recargar/.test(item.label)).run();assert.equal(r.cell.mood.energy,1);
});

test('power tools remain unavailable during campaign, puzzle and a held assembly',()=>{
 const {t}=lab(),source=materials(t,2);t.initUnitRadial();t.story.scene='campaign';assert.equal(t.beginPowerCable(source),false);assert.equal(t.spawnQuickElement('quick-power-reservoir'),null);t.story.scene='lab';t.puzzle.active=true;assert.equal(t.beginPowerCable(source),false);assert.equal(t.spawnQuickElement('quick-cable-4'),null);t.puzzle.active=false;t.setHeld({g:source[0],items:[{g:source[0]}]});assert.equal(t.beginPowerCable(source),false);t.setHeld(null);assert.equal(t.powerCables.length,0);
});

test('blocked recovery rolls back tentative bodies and keeps the live cable and its material',()=>{
 const game=lab(),{t}=game,{c}=deploy(game),before=t.groups.length,ids=Array.from(c.materials,p=>p.id);t.position.splice(0,3,3,t.EYE_HEIGHT,3);t.setLook({yaw:0});t.storyWall(t.V(3,.4,1.6),t.V(1,.4,1));assert.equal(t.recoverPowerCable(c),false);assert.equal(t.groups.length,before);assert(t.powerCables.includes(c));assert.deepEqual(Array.from(c.materials,p=>p.id),ids);assert(ids.every(id=>!t.rotorPart(id)));
});

test('wall waypoints use floor-to-wall corners and endpoint descriptions identify input and output',()=>{
 const game=lab(),{t}=game,r=t.createPowerReservoir(t.V(-1,0,-12),{enabled:true}),m=t.spawnRotor(t.V(1,0,-12),{capacity:256}),source=materials(t,8),from={kind:'reservoir',id:r.id},to={kind:'part',id:m.aId};assert(t.beginPowerCable(source));t.getPowerDraft().from=from;t.getPowerDraft().bends.push(t.V(-1,1,-13.992),t.V(1,1,-13.992));assert(t.finishPowerCable(to));const path=t.powerCablePath(t.powerCables[0]);assert(path.some(p=>p.y===1&&p.z===-13.992));for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i];if(a.y!==b.y)assert(Math.abs(a.x-b.x)<1e-9&&Math.abs(a.z-b.z)<1e-9,'vertical runs must not cut diagonally across the room');}
 lookAt(t,t.V(-1,.9,-12),[0,1,-10]);assert.match(t.powerTargetText(),/^Salida/);lookAt(t,t.powerPort(to),[2,1,-10]);assert.match(t.powerTargetText(),/^Entrada/);
});

test('reservoir geometry is shared and a completed ribbon reuses one buffer, including path edits, then disposes it',()=>{
 const game=lab(),{t,sandbox,buffers}=game,{c,m}=deploy(game);assert(sandbox.QBitsReservoirModel);assert(t.createPowerReservoir(t.V(3,0,0)));const bodies=t.world.bodies.length,constraints=t.world.constraints.length;
 t.drawPowerReservoirs();const beforeRibbon=new Set(buffers);t.updatePowerNetwork(1);assert.equal(c.progress,1);t.drawPowerCables();const allocated=new Set(buffers),ribbonBuffers=[...buffers].filter(id=>!beforeRibbon.has(id));assert.equal(ribbonBuffers.length,1,'one static GPU buffer per completed wire');
 for(let i=0;i<12;i++){t.updatePowerNetwork(.05);t.drawPowerReservoirs();t.drawPowerCables();}assert.deepEqual(buffers,allocated,'unchanged draws reuse the same buffer identities');assert.equal(t.world.bodies.length,bodies);assert.equal(t.world.constraints.length,constraints);
 const previous=t.powerCablePath(c).at(-1).clone();for(const g of t.rotorGroups(m))g.body.position.x+=.15;t.updatePowerNetwork(0);assert(t.powerCablePath(c).at(-1).distanceTo(previous)>.1);t.drawPowerCables();assert.deepEqual(buffers,allocated,'moving the endpoint rebuilds geometry in the existing buffer');
 const returned=t.removePowerCable(c);assert.equal(returned.length,2);assert(!buffers.has(ribbonBuffers[0]));assert.deepEqual(buffers,beforeRibbon,'removal disposes only the wire buffer');
 const replacement=t.connectPowerCable(c.from,c.to,c.points,returned);assert(replacement.ok);t.updatePowerNetwork(1);t.drawPowerCables();assert.equal(buffers.size,beforeRibbon.size+1);t.clearPowerNetwork();assert.deepEqual(buffers,beforeRibbon,'scene cleanup also releases every ribbon buffer');
});

test('a large wired reservoir supplies propeller power above one portable cell without adding payload mass',()=>{
 const game=lab(),{t}=game,record=t.propellerBlueprintTemplate();const drone=t.spawnSavedMechanism(record,t.V(0,0,2)),r=t.createPowerReservoir(t.V(-2,0,0),{energy:.7,enabled:true});assert(drone&&r);const hub=drone.parts.find(p=>p.shape==='coupler'),source=materials(t,4);hub.weight=5;drone.body.mass=(5+1/6)*.25;drone.body.updateMassProperties();assert(t.beginPowerCable(source));t.getPowerDraft().from={kind:'reservoir',id:r.id};assert(t.finishPowerCable({kind:'part',id:hub.id}));
 const supply=t.externalBatterySummary(drone);assert.equal(supply.cells.length,1,'one shared energy store');assert.equal(supply.powerCells,100,'large reservoir output is not limited to one portable cell');const flight=t.flightForGroup(drone);assert(t.startFlight(flight),flight.status);flight.spool=1;const snapshot=t.flightSnapshot(flight,.05);assert(snapshot.inputWatts>10,'full-size source supports more than a single portable cell output');assert(Math.abs(snapshot.load-(5+1/6))<1e-9,'reservoir is electrically connected, not payload');
 const before=r.cell.mood.energy*r.capacity;t.updateFlights(.05);assert(Math.abs(before-r.cell.mood.energy*r.capacity-flight.power.spentJoules)<1e-8);assert(flight.power.maxForce<=14.7,'battery output never increases the propeller thrust ceiling');
});

function assertCardinal(path){for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i];assert.equal(['x','y','z'].filter(axis=>Math.abs(a[axis]-b[axis])>1e-6).length,1,'every segment must follow a single axis');}}
test('circuit preview and confirmed path share cardinal elbows on floor and walls, counting every metre',()=>{
 const {t}=lab(),start=t.V(-2,.4,0),end=t.V(1,.3,2),bends=[t.V(-1,.008,.5)];
 const route=t.powerCircuitRoute(start,end,bends);assertCardinal([start,...route,end]);assert(Math.abs(t.powerCableLength([start,...route,end])-5.684)<1e-8);
 const wall=[t.V(-1,1,-13.992),t.V(1,2,-13.992)],path=t.powerCircuitRoute(start,end,wall);assertCardinal([start,...path,end]);assert(path.some(p=>p.distanceTo(wall[0])<1e-8));assert(path.some(p=>p.distanceTo(wall[1])<1e-8));
 const preview=t.powerCircuitRoute(start,wall[1],wall.slice(0,1),true);assertCardinal([start,...preview]);assert(preview.at(-1).distanceTo(wall[1])<1e-8);
});
test('orthogonal distance can reject a diagonal shortcut without consuming the cubes',()=>{
 const game=lab(),{t}=game,{r,source,to}=setupCable(game,1);const g=t.rotorPart(to.id).g;g.body.position.set(1.2,.05,1.2);assert(t.beginPowerCable(source));t.getPowerDraft().from={kind:'reservoir',id:r.id};
 const a=t.powerPort(t.getPowerDraft().from),b=t.powerPort(to);assert(t.powerCableLength([a,t.V(a.x,.008,a.z),t.V(b.x,.008,b.z),b])<2);
 assert.equal(t.finishPowerCable(to),false);assert.equal(t.powerCables.length,0);assert(source.every(g=>t.groups.includes(g)));
});
test('changing shared width rebuilds the existing buffer; changing color does not rebuild geometry or alter energy',()=>{
 const game=lab(),{t}=game,{c,r}=deploy(game);t.updatePowerNetwork(1);const gl=t.canvas.getContext('webgl'),uploads=[];gl.bufferData=(target,data)=>uploads.push(data);t.drawPowerCables();const mesh=t.powerRibbonCaches.get(c),first=uploads.at(-1),buffer=mesh.buffer,before=JSON.stringify(t.serializePowerNetwork());
 const settings=Preferences.defaults();settings.profiles.clean.cableColor='#2266ff';t.applyPreferences(settings);t.drawPowerCables();assert.equal(uploads.length,1,'color is a uniform, not a new mesh');
 settings.profiles.clean.pathWidth=5;t.applyPreferences(settings);t.drawPowerCables();assert.equal(uploads.length,2);assert.equal(mesh.buffer,buffer);const width=data=>Math.hypot(...[0,1,2].map(i=>data[i]-data[6+i]));assert(Math.abs(width(uploads[1])/width(first)-2)<1e-5);assert.equal(JSON.stringify(t.serializePowerNetwork()),before);assert.equal(r.cell.mood.energy,.61);
});

test('twelve alternating wall/floor supports can save all generated elbows and restore them exactly',()=>{
 const {t}=lab(),r=t.createPowerReservoir(t.V(-1,0,-12),{enabled:true}),m=t.spawnRotor(t.V(1,0,-12),{capacity:256}),source=materials(t,8);assert(t.beginPowerCable(source));const draft=t.getPowerDraft();draft.from={kind:'reservoir',id:r.id};
 for(let i=0;i<12;i++)draft.bends.push(t.V(i*.03,i%2?.008:.15,i%2?-13.8:-13.992));assert(t.finishPowerCable({kind:'part',id:m.aId}));const cable=t.powerCables[0];assert(cable.points.length>32);assert(cable.points.length<=64);assertCardinal(t.powerCablePath(cable));
 const snapshot=JSON.parse(JSON.stringify(t.serializePowerNetwork())),before=JSON.stringify(snapshot.cables[0].points);t.clearPowerNetwork();assert(t.restorePowerNetwork(snapshot));assert.equal(JSON.stringify(t.serializePowerNetwork().cables[0].points),before);
});
