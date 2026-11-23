// Real workshop, route bridge and Cannon. The DOM is simulated; no browser QA.
const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));

function lab(){
 const game=createGame({graphics:false}),{t,sandbox}=game;t.clearNarrativeScene();
 Object.assign(t.story,{ready:true,started:true,mode:'playing',scene:'lab',phase:'idle',progress:{}});
 sandbox.document.body.dataset.booting='false';
 t.canvas.requestPointerLock=()=>{sandbox.document.pointerLockElement=t.canvas;sandbox.document.dispatchEvent({type:'pointerlockchange'});};
 t.canvas.requestPointerLock();t.setupWorkshop();return game;
}
function benchCube(t){
 const p=t.getWorkshopBench().p,g=t.addQubit([p.x,p.y+.055,p.z]);t.setSelected({g,part:g.parts[0]});return g;
}
function adaptedCube(t,index,role='beacon'){
 return t.makeGroup([{id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(-5+(index%12)*.8,.045,-5+Math.floor(index/12)*.8),q:t.Q(),mood:{trajectory:{version:1,level:1,face:0,role,routeId:null}}}]);
}
function node(game,id){return game.sandbox.document.querySelector('#'+id);}
const apply=game=>node(game,'workshop-apply').dispatchEvent({type:'click'});
function clickBeacon(t,g){
 const p=g.body.position,camera=[p.x,p.y+.8,p.z+.35],dy=p.y-camera[1],dz=p.z-camera[2];
 t.setLook({camera,yaw:0,pitch:Math.asin(dy/Math.hypot(dy,dz))});
 assert(t.trajectoryWorldClick({button:0,clientX:640,clientY:360,preventDefault(){}}));
}
function uniqueCatalogue(system,expected){
 const routes=[...system.routes.values()];assert.equal(routes.length,expected);
 assert.equal(new Set(routes.map(route=>route.id)).size,expected);assert.equal(new Set(routes.map(route=>route.glyph)).size,expected);
}

test('the fourth and fifth workshop beacons retain independent creation and never pair automatically',()=>{
 const game=lab(),{t}=game,system=t.getTrajectorySystem(),beacons=[];
 for(let i=0;i<5;i++){
  const g=benchCube(t),id=g.parts[0].id;assert(t.applyWorkshopUpgrade(id,{trajectory:{role:'beacon',level:1}}));
  const s=t.trajectoryPanelSnapshot(id);assert.equal(s.role,'beacon');assert.equal(s.routeId,null);assert.equal(s.glyph,null);assert.equal(s.canCreate,true);
  assert.equal(system.routes.size,0,'adapting a cube does not allocate or join a route');beacons.push(g);g.body.position.set(-3+i*.8,.045,-3);
 }
 for(let i=0;i<beacons.length;i++){
  const g=beacons[i],id=g.parts[0].id;assert(t.openTrajectoryPanel(id));
  assert.equal(node(game,'trajectory-start-route').textContent,'Generar cara nueva');assert.equal(node(game,'trajectory-start-route').hidden,false);assert.equal(node(game,'trajectory-start-route').disabled,false);
  assert.equal(node(game,'trajectory-link-route').hidden,false);assert.equal(node(game,'trajectory-glyph-next').hidden,true);
  assert.equal(t.trajectoryPanelSnapshot(id).availableGlyphs,144-i);
  const created=t.trajectoryPanelAction(id,'start-route');assert(created.ok,created.message);t.getTrajectoryPanel().refresh();
  assert.equal(node(game,'trajectory-start-route').hidden,true);assert.equal(node(game,'trajectory-pair').hidden,false);assert.equal(node(game,'trajectory-glyph-next').textContent,'Cambiar cara');
  assert.equal(system.routeFor(id).endId,null);t.closeTrajectoryPanel(false);
 }
 uniqueCatalogue(system,5);assert([...system.routes.values()].every(route=>route.endId===null));
});

test('the real bridge allocates all 144 faces, can link at capacity, and reuses only released faces through saves',()=>{
 const game=lab(),{t}=game,system=t.getTrajectorySystem(),beacons=[];
 for(let i=0;i<145;i++){
  const g=adaptedCube(t,i),id=g.parts[0].id;beacons.push(g);
  const before=t.trajectoryPanelSnapshot(id);assert.equal(before.availableGlyphs,Math.max(0,144-i));assert.equal(before.glyphCapacity,144);assert.equal(before.canCreate,i<144);
  const result=t.trajectoryPanelAction(id,'start-route');assert.equal(result.ok,i<144,result.message);
  if(i<144)assert.equal(system.routeFor(id).glyph,i);else assert.match(result.message,/caras libres/);
 }
 uniqueCatalogue(system,144);const original=plain(system.snapshot()),firstId=beacons[0].parts[0].id,extraId=beacons[144].parts[0].id,firstRoute=system.routeFor(firstId);
 assert.equal(t.trajectoryPanelAction(firstId,'glyph-next').ok,false);assert.deepEqual(plain(system.snapshot()),original);
 // Pairing reuses the start's reserved face, even when no new faces remain.
 beacons[144].body.position.set(-4.6,.045,-5);beacons[144].body.wakeUp();
 assert(t.openTrajectoryPanel(extraId));assert.equal(node(game,'trajectory-start-route').disabled,true);assert.equal(node(game,'trajectory-link-route').disabled,false);
 assert(t.trajectoryPanelAction(extraId,'link-route').ok);assert.equal(t.getTrajectoryDraft().type,'link-route');
 clickBeacon(t,beacons[0]);assert.equal(t.getTrajectoryDraft(),null);assert.equal(firstRoute.endId,extraId);assert.equal(system.routeFor(extraId),firstRoute);uniqueCatalogue(system,144);
 const releasedGlyph=firstRoute.glyph,oldRouteId=firstRoute.id;
 assert(t.trajectoryPanelAction(firstId,'unlink').ok);assert.equal(t.trajectoryPanelSnapshot(extraId).availableGlyphs,1);assert.equal(system.routeFor(extraId),null);
 const replacement=t.trajectoryPanelAction(extraId,'start-route');assert(replacement.ok);assert.notEqual(replacement.routeId,oldRouteId);assert.equal(system.routeFor(extraId).glyph,releasedGlyph);uniqueCatalogue(system,144);
 const saved=t.hydrateLabSnapshot(plain(t.saveLab()));t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);
 uniqueCatalogue(system,144);assert.equal(system.routeFor(extraId).glyph,releasedGlyph);assert.equal(system.routes.has(oldRouteId),false);
 assert.equal(t.trajectoryPanelSnapshot(firstId).availableGlyphs,0);assert.equal(t.trajectoryPanelAction(firstId,'start-route').ok,false);
 const anotherId=beacons[1].parts[0].id,anotherRoute=system.routeFor(anotherId),anotherGlyph=anotherRoute.glyph;
 assert(t.trajectoryPanelAction(anotherId,'unlink').ok);const afterLoad=t.trajectoryPanelAction(firstId,'start-route');assert(afterLoad.ok);
 assert.notEqual(afterLoad.routeId,anotherRoute.id);assert.notEqual(afterLoad.routeId,oldRouteId);assert(Number(afterLoad.routeId.split('-').at(-1))>Number(replacement.routeId.split('-').at(-1)));
 assert.equal(system.routeFor(firstId).glyph,anotherGlyph);uniqueCatalogue(system,144);assert(system.validSnapshot(system.snapshot()));
});

test('linking a free end requires choosing an existing unpaired start and never steals another pair',()=>{
 const game=lab(),{t}=game,system=t.getTrajectorySystem(),a=adaptedCube(t,0),b=adaptedCube(t,1),c=adaptedCube(t,2),free=adaptedCube(t,3);
 const start=t.trajectoryPanelAction(a.parts[0].id,'start-route');assert(start.ok);assert(system.pair(start.routeId,b.parts[0].id).ok);
 assert(t.trajectoryPanelAction(free.parts[0].id,'link-route').ok);clickBeacon(t,c);assert(t.getTrajectoryDraft());assert.equal(system.routeFor(free.parts[0].id),null);
 clickBeacon(t,a);assert(t.getTrajectoryDraft());assert.equal(system.routeFor(a.parts[0].id).endId,b.parts[0].id);assert.equal(system.routeFor(free.parts[0].id),null);
 const next=t.trajectoryPanelAction(c.parts[0].id,'start-route');assert(next.ok);clickBeacon(t,c);assert.equal(t.getTrajectoryDraft(),null);assert.equal(system.routeFor(c.parts[0].id).endId,free.parts[0].id);uniqueCatalogue(system,2);
 const snapshot=plain(system.snapshot());assert.equal(t.trajectoryPanelAction(b.parts[0].id,'link-route').ok,false);assert.deepEqual(plain(system.snapshot()),snapshot);
});

test('the receiver follows an existing face and cannot generate or become an endpoint through panel commands',()=>{
 const game=lab(),{t}=game,g=benchCube(t),id=g.parts[0].id;assert(t.applyWorkshopUpgrade(id,{trajectory:{role:'receiver',level:1}}));
 assert(t.openTrajectoryPanel(id));const s=t.trajectoryPanelSnapshot(id);assert.equal(s.role,'receiver');assert.equal(s.canCreate,false);
 assert.equal(node(game,'trajectory-start-route').hidden,true);assert.equal(node(game,'trajectory-link-route').hidden,true);assert.equal(node(game,'trajectory-glyph-next').hidden,true);assert.equal(node(game,'trajectory-assign').hidden,false);
 assert.match(node(game,'trajectory-guide').textContent,/cara existente.*taller/);assert.equal(t.trajectoryPanelAction(id,'start-route').ok,false);assert.equal(t.trajectoryPanelAction(id,'link-route').ok,false);assert.equal(t.getTrajectorySystem().routes.size,0);
});

for(const [choice,refresh]of [['upgrade:receiver',true],['upgrade:trajectory',false]])test('changing the workshop target clears '+choice+' before '+(refresh?'refresh':'apply'),()=>{
 const game=lab(),{t}=game,original=benchCube(t);assert(t.openWorkshopPanel('upgrades'));const panel=t.getWorkshopPanel();panel.choose(choice);assert.equal(panel.model.allowed,true);
 const replacement=benchCube(t);original.body.position.x+=4;
 if(refresh)panel.refresh();else apply(game);
 assert.equal(panel.draft.choice,'');assert.equal(panel.model.targetId,replacement.parts[0].id);assert.equal(panel.model.allowed,false);assert.equal(node(game,'workshop-apply').disabled,true);
 assert.match(node(game,'workshop-reason').textContent,/pieza.*cambió.*Elige/);
 apply(game);apply(game);assert.equal(original.parts[0].mood.trajectory,undefined);assert.equal(replacement.parts[0].mood.trajectory,undefined);
 panel.choose('upgrade:trajectory');assert.equal(panel.model.allowed,true);apply(game);assert.equal(replacement.parts[0].mood.trajectory.role,'beacon');assert.equal(replacement.parts[0].mood.trajectory.routeId,null);
 assert.equal(t.getTrajectorySystem().routes.size,0);assert.equal(original.parts[0].mood.trajectory,undefined);
});

test('leaving and returning to an empty workshop target requires a fresh trajectory choice without blocking other modes',()=>{
 const game=lab(),{t}=game,g=benchCube(t);assert(t.openWorkshopPanel('upgrades'));const panel=t.getWorkshopPanel();panel.choose('upgrade:receiver');
 const oldPosition=g.body.position.clone();g.body.position.x+=4;panel.refresh();assert.equal(panel.draft.choice,'');assert.equal(panel.model.allowed,false);
 g.body.position.copy(oldPosition);panel.refresh();assert.equal(panel.model.allowed,false);assert.equal(g.parts[0].mood.trajectory,undefined);
 panel.setMode('research');assert.equal(panel.draft.choice,'research:sensor');assert.equal(panel.model.action.kind,'research');panel.setMode('adapt');assert.equal(panel.draft.choice,'upgrade:sensor');assert.equal(panel.model.action.kind,'upgrade');
 panel.choose('upgrade:receiver');assert.equal(panel.model.allowed,true);apply(game);assert.equal(g.parts[0].mood.trajectory.role,'receiver');
});
