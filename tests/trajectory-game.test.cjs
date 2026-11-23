// Real game bridge and Cannon; DOM/GPU are instrumented stubs, not browser QA.
const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const Preferences=require('../assets/js/preferences.js');
const Controls=require('../assets/js/controls.js');
const Model=require('../assets/js/trajectory-model.js');
const {wheeledCar}=require('./trajectory-fixtures.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));

function lab(options={}){
 const game=createGame({graphics:false,...options}),{t,sandbox}=game;
 t.clearNarrativeScene();
 Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';
 for(const id of ['panel','command-menu','menu'])sandbox.document.querySelector('#'+id).hidden=true;
 t.canvas.requestPointerLock=()=>{sandbox.document.pointerLockElement=t.canvas;sandbox.document.dispatchEvent({type:'pointerlockchange'});};
 t.canvas.requestPointerLock();t.setRunning(true);t.applyPreferences({physicsHz:120});
 return game;
}
function adapt(t,g,role='beacon',level=1){
 const part=g.parts.find(p=>p.shape==='cube');assert(part);
 part.mood.trajectory={version:1,level,face:0,role,routeId:null};
 assert(t.onTrajectoryPartChanged(g,part));return {g,part,id:part.id};
}
function beacon(t,x,z,{level=1,air=false,y=.045}={}){
 const g=t.addQubit([x,y,z]);
 if(air)g.body.quaternion.setFromAxisAngle(t.V(0,0,1),Math.PI/2);
 return adapt(t,g,'beacon',level);
}
function settle(system,count=4){for(let i=0;i<count;i++)system.update(.05);}
function pair(t,a,b){
 const system=t.getTrajectorySystem(),created=t.trajectoryPanelAction(a.id,'start-route');assert(created.ok,created.message);
 const paired=system.pair(created.routeId,b.id);assert(paired.ok,paired.message);
 settle(system);return system.routes.get(created.routeId);
}
function pairFixture(options={}){
 const game=lab(),{t}=game,a=beacon(t,-1,-1,options),b=beacon(t,1,-1,options),route=pair(t,a,b);
 return {...game,a,b,route,system:t.getTrajectorySystem()};
}
function lookAt(t,point){
 const camera=[point.x,point.y+.8,point.z+1.2],dx=point.x-camera[0],dy=point.y-camera[1],dz=point.z-camera[2];
 t.setLook({camera,yaw:Math.atan2(-dx,-dz),pitch:Math.asin(dy/Math.hypot(dx,dy,dz))});
}
function click(t,point,button=0){lookAt(t,point);return t.trajectoryWorldClick({button,clientX:640,clientY:360,preventDefault(){}});}
function keyboard(game,code){game.sandbox.document.dispatchEvent({type:'keydown',code,repeat:false});game.sandbox.document.dispatchEvent({type:'keyup',code});}
function tracePoint(t,route,point){
 assert(t.trajectoryPanelAction(route.startId,'trace').ok);
 assert(click(t,t.V(point.x,.012,point.z)));
 assert.equal(t.getTrajectoryDraft().points.length,1);
}

test('the game selects a unique partner and assigns a receiver through world clicks',()=>{
 const game=lab(),{t}=game,a=beacon(t,-1,-1),b=beacon(t,1,-1),c=beacon(t,2,-1);
 const receiver=adapt(t,t.addQubit([0,.045,1]),'receiver'),system=t.getTrajectorySystem();
 assert(t.trajectoryPanelAction(a.id,'start-route').ok);
 assert(t.trajectoryPanelAction(a.id,'pair').ok);assert.equal(t.getTrajectoryDraft().type,'pair');
 assert(click(t,b.g.body.position));assert.equal(t.getTrajectoryDraft(),null);settle(system);
 const route=system.routeFor(a.id);assert(route.valid,route.reason);assert.equal(route.endId,b.id);
 assert.equal(system.routeFor(b.id),route);assert.equal(system.routeFor(c.id),null);
 assert.equal(system.pair(route.id,c.id).ok,false,'a third beacon cannot join the pair');
 assert(t.trajectoryPanelAction(receiver.id,'assign').ok);assert(click(t,a.g.body.position));
 assert.equal(t.getTrajectoryDraft(),null);assert.equal(system.routeFor(receiver.id),route);
 const start=t.trajectoryPanelSnapshot(a.id),end=t.trajectoryPanelSnapshot(b.id),view=t.trajectoryPanelSnapshot(receiver.id);
 assert.deepEqual(plain(start.glyph),plain(end.glyph));assert.deepEqual(plain(view.glyph),plain(start.glyph));
 assert.equal(view.role,'receiver');assert.equal(view.canStart,true);assert.equal(view.paired,true);
 assert(t.trajectoryPanelAction(receiver.id,'unlink').ok);assert.equal(system.routeFor(receiver.id),null);
 assert.equal(system.routeFor(a.id),route,'unlinking a receiver keeps the paired beacons');
});

test('the bridge edits waypoint actions, rejects inappropriate height and keeps anchored endpoints',()=>{
 const {t,a,route,system}=pairFixture(),points=[route.points[0],{x:0,y:.012,z:-.6,action:'pass',wait:0},route.points[1]];
 assert(system.edit(a.id,points,false).ok);
 assert(t.trajectoryPanelAction(a.id,'point-update',{index:1,patch:{action:'wait',wait:.4}}).ok);
 assert.equal(route.points[1].action,'wait');assert.equal(route.points[1].wait,.4);
 assert(t.trajectoryPanelAction(a.id,'point-update',{index:1,patch:{action:'drop',wait:0}}).ok);
 const before=plain(system.snapshot());
 for(const patch of [{y:1},{action:'land'},{x:9},{wait:61}])assert.equal(t.trajectoryPanelAction(a.id,'point-update',{index:1,patch}).ok,false);
 for(const index of [-1,0,2,99])assert.equal(t.trajectoryPanelAction(a.id,'point-remove',{index}).ok,false);
 assert.deepEqual(plain(system.snapshot()),before);
 assert(t.trajectoryPanelAction(a.id,'loop',{value:true}).ok);assert.equal(route.loop,true);
 assert(t.trajectoryPanelAction(a.id,'point-remove',{index:1}).ok);assert.equal(route.points.length,2);
 assert.deepEqual(plain(route.points.map(p=>[p.x,p.z])),plain([points[0],points[2]].map(p=>[p.x,p.z])));
});

test('range follows the traced length and the weaker endpoint without silently losing the trace',()=>{
 const {t,a,b,route,system}=pairFixture(),curved=[route.points[0],{x:0,y:.012,z:2,action:'pass',wait:0},route.points[1]];
 const before=plain(route.points);assert(Model.length(curved)>4);
 assert.equal(system.edit(a.id,curved,false).ok,false);assert.deepEqual(plain(route.points),before);
 a.part.mood.trajectory.level=2;t.onTrajectoryPartChanged(a.g,a.part);settle(system);assert.equal(route.range,4);
 b.part.mood.trajectory.level=2;t.onTrajectoryPartChanged(b.g,b.part);settle(system);assert.equal(route.range,12);
 assert(system.edit(a.id,curved,false).ok);assert(route.length>4&&route.length<12);
 const authored=plain(route.points);
 b.part.mood.trajectory.level=1;t.onTrajectoryPartChanged(b.g,b.part);settle(system);
 assert.equal(route.valid,false);assert.match(route.reason,/alcanza/i);assert.equal(route.range,4);
 assert.deepEqual(plain(route.points),authored,'lowering a range preserves the editable route');
 assert(t.hydrateLabSnapshot(plain(t.saveLab())),'an over-range disabled route must remain saveable');
});

test('beacons wait for stability and reject a mixed floor/air pair until orientation agrees',()=>{
 const {t}=lab(),a=beacon(t,-1,-1),b=beacon(t,1,-1),system=t.getTrajectorySystem();
 const created=system.createStart(a.id);assert(system.pair(created.routeId,b.id).ok);const route=system.routes.get(created.routeId);
 assert.equal(route.valid,false);settle(system,2);assert.equal(route.valid,false);settle(system,1);assert(route.valid,route.reason);
 b.g.body.quaternion.setFromAxisAngle(t.V(0,0,1),Math.PI/2);b.g.body.wakeUp();settle(system,1);assert.equal(route.valid,false);
 settle(system,3);assert.equal(route.valid,false);assert.match(route.reason,/orienta|lateral|arriba/i);
 b.g.body.quaternion.set(0,0,0,1);b.g.body.wakeUp();settle(system,4);assert(route.valid,route.reason);assert.equal(route.mode,'ground');
});

test('yaw-only rotation moves the anchored endpoint and requires a new stable pose',()=>{
 const {t,a,b,route,system}=pairFixture(),before=plain(route.points[0]);
 a.g.body.sleep();b.g.body.sleep();settle(system);const reads=system.stats.poseReads;settle(system,20);assert.equal(system.stats.poseReads,reads,'settled sleeping beacons are not scanned');
 a.g.body.quaternion.setFromAxisAngle(t.V(0,1,0),Math.PI/2);a.g.body.wakeUp();settle(system,1);
 assert.equal(route.valid,false);settle(system,3);assert(route.valid,route.reason);
 assert(Math.hypot(route.points[0].x-before.x,route.points[0].z-before.z)>.3);
 assert.equal(route.mode,'ground');assert(Math.abs(route.points[0].x-a.g.body.position.x)<1e-9);
});

test('air point heights survive a ground orientation and snapshot roundtrip',()=>{
 const {t,a,b,route,system}=pairFixture({air:true});assert(route.valid,route.reason);assert.equal(route.mode,'air');
 assert(t.trajectoryPanelAction(a.id,'point-update',{index:1,patch:{y:1.4,action:'wait',wait:.2}}).ok);
 const authored=plain(route.points.map(p=>p.y));
 for(const marker of [a,b]){marker.g.body.quaternion.set(0,0,0,1);marker.g.body.wakeUp();}settle(system,4);
 assert(route.valid,route.reason);assert.equal(route.mode,'ground');assert.deepEqual(plain(route.points.map(p=>p.y)),authored);
 assert(route.polyline.points.every(p=>p.y===.012));
 const saved=t.hydrateLabSnapshot(plain(t.saveLab()));t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);settle(system);
 const loaded=system.routes.get(route.id);assert.deepEqual(plain(loaded.points.map(p=>p.y)),authored);
 for(const id of [a.id,b.id]){const g=system.nodes.get(id).g;g.body.quaternion.setFromAxisAngle(t.V(0,0,1),Math.PI/2);g.body.wakeUp();}settle(system,4);
 assert(loaded.valid,loaded.reason);assert.equal(loaded.mode,'air');assert.deepEqual(plain(loaded.points.map(p=>p.y)),authored);
 assert.deepEqual(plain(loaded.polyline.points.map(p=>p.y)),[authored[0],authored[0],authored[1]],'travel at the departure height, then rise at the destination');
});

test('a real wheeled receiver keeps dynamic Cannon bodies and moving a beacon stops its motors',()=>{
 const {t,sandbox}=lab(),car=wheeledCar(t);for(let i=0;i<36;i++)t.stepPhysics(1/120);
 const a=beacon(t,-.5,-.5),b=beacon(t,1,-.5),route=pair(t,a,b),receiver=adapt(t,car.trunk,'receiver'),system=t.getTrajectorySystem();
 assert(system.assign(receiver.id,route.id).ok);
 const bodies=car.component.map(g=>g.body),poses=bodies.map(body=>plain(body.position)),masses=bodies.map(body=>body.mass),constraints=t.world.constraints.length;
 const started=t.trajectoryPanelAction(receiver.id,'run');assert(started.ok,started.message);
 assert(system.followers.has(receiver.id));assert(car.motors.every(motor=>motor.enabled));
 assert.deepEqual(bodies.map(body=>plain(body.position)),poses,'starting guidance cannot teleport the assembly');
 assert(bodies.every(body=>body.type===sandbox.CANNON.Body.DYNAMIC));assert.deepEqual(bodies.map(body=>body.mass),masses);
 assert.equal(t.world.constraints.length,constraints,'guidance reuses the mechanical joints');
 b.g.body.position.x+=.2;b.g.body.wakeUp();settle(system,1);
 assert.equal(system.followers.size,0);assert(car.motors.every(motor=>!motor.enabled&&!motor.trajectoryDrive));
 assert.match(system.nodes.get(receiver.id).status,/baliza|movida/i);
 assert(bodies.every(body=>body.type===sandbox.CANNON.Body.DYNAMIC));settle(system,4);
 assert.equal(system.followers.size,0,'a stable route does not restart the vehicle automatically');
});

test('a bare receiver and a cargo action without a gripper are rejected without taking over physics',()=>{
 const {t,sandbox,a,route,system}=pairFixture(),receiver=adapt(t,t.addQubit([-.65,.045,-1]),'receiver'),body=receiver.g.body;
 assert(system.assign(receiver.id,route.id).ok);const before=plain(body.position),mass=body.mass;
 assert.equal(t.trajectoryPanelAction(receiver.id,'run').ok,false);assert.equal(system.followers.size,0);
 assert.equal(body.type,sandbox.CANNON.Body.DYNAMIC);assert.equal(body.mass,mass);assert.deepEqual(plain(body.position),before);
 assert(t.trajectoryPanelAction(a.id,'point-update',{index:1,patch:{action:'drop'}}).ok);
 const result=t.trajectoryPanelAction(receiver.id,'run');assert.equal(result.ok,false);assert.match(result.message,/pinza/i);
});

test('cancelling a world draft or removing its newest point preserves the committed route',()=>{
 const game=pairFixture(),{t,a,route,system}=game,old=[route.points[0],{x:0,y:.012,z:-1.2,action:'wait',wait:.5},route.points[1]];
 assert(system.edit(a.id,old,false).ok);const before=plain(system.snapshot());
 tracePoint(t,route,{x:0,z:-.6});assert.deepEqual(plain(system.snapshot()),before);
 t.trajectoryWorldClick({button:2,preventDefault(){}});assert.equal(t.getTrajectoryDraft().points.length,0);assert.deepEqual(plain(system.snapshot()),before);
 assert(click(t,t.V(0,.012,-.6)));keyboard(game,'Escape');assert.equal(t.getTrajectoryDraft(),null);assert.deepEqual(plain(system.snapshot()),before);
 assert.equal(t.story.mode,'playing','cancelling a draft consumes Escape before opening pause');
});

for(const remapped of [false,true])test('physical Enter commits the draft with '+(remapped?'remapped':'classic')+' controls',()=>{
 const game=pairFixture(),{t,route}=game;
 if(remapped){const prefs=Preferences.defaults();Controls.assignBinding(prefs.controls,'keyboard','interact','Enter');Controls.assignBinding(prefs.controls,'keyboard','pause','KeyZ');t.applyPreferences(prefs);}
 tracePoint(t,route,{x:0,z:-.6});keyboard(game,'Enter');assert.equal(t.getTrajectoryDraft(),null);assert.equal(route.points.length,3);
 assert(Math.abs(route.points[1].z+.6)<1e-6);assert.equal(t.story.mode,'playing');
});

test('the remapped pause action cancels a draft without pausing or changing the old route',()=>{
 const game=pairFixture(),{t,route,system}=game,prefs=Preferences.defaults();Controls.assignBinding(prefs.controls,'keyboard','pause','KeyZ');t.applyPreferences(prefs);
 const before=plain(system.snapshot());tracePoint(t,route,{x:0,z:-.6});keyboard(game,'KeyZ');
 assert.equal(t.getTrajectoryDraft(),null);assert.equal(t.story.mode,'playing');assert.deepEqual(plain(system.snapshot()),before);
});

test('unexpected pointer-lock loss pauses without committing the draft and Escape still cancels it',()=>{
 const game=pairFixture(),{t,sandbox,route,system}=game,before=plain(system.snapshot());tracePoint(t,route,{x:0,z:-.6});
 sandbox.document.exitPointerLock();assert.equal(t.story.mode,'pause');assert(t.getTrajectoryDraft());assert.deepEqual(plain(system.snapshot()),before);
 keyboard(game,'Escape');assert.equal(t.getTrajectoryDraft(),null);assert.deepEqual(plain(system.snapshot()),before);
 assert.equal(t.story.mode,'pause');
});

test('a changed beacon cannot commit an old draft over a newly anchored route',()=>{
 const game=pairFixture(),{t,b,route,system}=game;tracePoint(t,route,{x:0,z:-.6});
 b.g.body.position.x+=.2;b.g.body.wakeUp();settle(system,4);assert(route.valid,route.reason);
 const before=plain(system.snapshot());assert.equal(t.finishTrajectoryDraft(),false);assert(t.getTrajectoryDraft());
 assert.deepEqual(plain(system.snapshot()),before);t.cancelTrajectoryDraft();
});

test('storing one paired beacon in a family reserves its identity through save and withdrawal',()=>{
 const {t,a,b,route,system}=pairFixture({level:2}),receiver=adapt(t,t.addQubit([0,.045,1]),'receiver');assert(system.assign(receiver.id,route.id).ok);
 const original={id:a.id,meta:plain(a.part.mood.trajectory),energy:a.part.mood.energy,weight:a.part.weight},glyph=route.glyph;
 const [family]=t.groupIntoFamilies([a.g],{name:'Baliza guardada',color:'#223344'});assert(family);for(let i=0;i<30;i++)t.updateFamilies(1/30);
 assert.equal(system.nodes.has(a.id),false);assert.equal(system.routes.has(route.id),true);assert.equal(route.valid,false);
 const extra=beacon(t,4,-1),created=system.createStart(extra.id);assert(created.ok);assert.notEqual(system.routeFor(extra.id).glyph,glyph);
 const saved=t.hydrateLabSnapshot(plain(t.saveLab()));t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);settle(system);
 assert.equal(t.families.length,1);assert.equal(system.nodes.has(a.id),false);assert.equal(system.routeFor(b.id).glyph,glyph);assert.equal(system.routeFor(receiver.id).id,route.id);
 const stored=t.families[0].items.flatMap(item=>item.groups.flatMap(group=>group.parts)).find(part=>part.id===a.id);
 assert.deepEqual(plain(stored.mood.trajectory),original.meta);assert.equal(stored.mood.energy,original.energy);assert.equal(stored.weight,original.weight);
 const target={point:t.V(3,0,-3),normal:t.V(0,1,0)};
 assert(t.beginFamilyPlacement(t.families[0],'withdraw',1));assert(t.updateFamilyPlacement(target));assert(t.confirmFamilyPlacement(target));
 for(let i=0;i<30;i++)t.updateFamilies(1/30);settle(system);
 assert(system.nodes.has(a.id));assert.equal(system.routeFor(a.id).id,route.id);assert.equal(system.routeFor(a.id).glyph,glyph);
 assert.equal(system.followers.size,0);assert.equal(t.groups.flatMap(g=>g.parts).filter(part=>part.id===a.id).length,1);
});

test('invalid route or adaptation data is rejected before clearing live bodies and identities',()=>{
 const {t,a,system}=pairFixture(),source=plain(t.saveLab()),bodies=[...t.world.bodies],ids=t.groups.flatMap(g=>g.parts.map(p=>p.id)),catalog=plain(system.snapshot());
 const corruptions=[
  data=>{data.trajectories.routes[0].glyph=Model.GLYPHS.length;},
  data=>{data.trajectories.routes[0].endId=data.trajectories.routes[0].startId;},
  data=>{data.trajectories.routes[0].points[0].wait=61;},
  data=>{data.groups.flatMap(g=>g.parts).find(p=>p.id===a.id).mood.trajectory.level=4;}
 ];
 for(const corrupt of corruptions){const saved=plain(source);corrupt(saved);assert.throws(()=>t.hydrateLabSnapshot(saved),/inválid/i);
  assert.deepEqual([...t.world.bodies],bodies);assert.deepEqual(t.groups.flatMap(g=>g.parts.map(p=>p.id)),ids);assert.deepEqual(plain(system.snapshot()),catalog);}
});

test('duplicating adapted beacons or receivers cannot clone a reserved route identity',()=>{
 const {t,a,route,system}=pairFixture(),receiver=adapt(t,t.addQubit([0,.045,1]),'receiver');assert(system.assign(receiver.id,route.id).ok);
 const before=plain(t.saveLab().groups),catalog=plain(system.snapshot());
 for(const item of [a,receiver]){t.setSelected({g:item.g,part:item.part});t.setMultiSelection([]);t.duplicateSelection();assert.deepEqual(plain(t.saveLab().groups),before);assert.deepEqual(plain(system.snapshot()),catalog);}
});

function instrumentGL(){
 const atlas=[],glyphs=[],sources=[],buffers=new Map(),uploads=[];let next=0,bound=null;
 const gl=new Proxy({
  getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,getUniformLocation:(_program,name)=>name,
  createShader:()=>({}),createProgram:()=>({}),createTexture:()=>({}),isContextLost:()=>false,
  createBuffer:()=>{const id=++next;buffers.set(id,null);return id;},deleteBuffer:id=>buffers.delete(id),bindBuffer:(_target,id)=>{bound=id;},
  bufferData:(_target,data)=>{buffers.set(bound,Array.from(data));uploads.push(bound);},
  texImage2D:(...args)=>{if(args[3]===256&&args[4]===256&&args[8] instanceof Uint8Array)atlas.push(new Uint8Array(args[8]));},
  shaderSource:(_shader,source)=>sources.push(source),uniform1f:(name,value)=>{if(name==='uTrajectoryGlyph')glyphs.push(value);}
 },{get:(object,key)=>key in object?object[key]:/^[A-Z_]+$/.test(key)?0:()=>{}});
 return {gl,atlas,glyphs,sources,buffers,uploads};
}

test('render uploads exact 10 by 10 source faces once and uses a blank unpaired placeholder',()=>{
 const capture=instrumentGL(),{t}=lab({gl:capture.gl}),a=beacon(t,-1,-1),b=beacon(t,1,-1),empty=beacon(t,2,-1),route=pair(t,a,b);
 t.renderVisibility.active=false;t.renderVisibility.enabled=false;t.drawTrajectories();
 assert.equal(capture.atlas.length,1);assert.deepEqual(capture.glyphs.slice(-3),[route.glyph,route.glyph,-1]);
 const pixels=capture.atlas[0];
 for(let index=0;index<Model.GLYPHS.length;index++){
  let cells=0;for(let y=0;y<10;y++)for(let x=0;x<10;x++){
   const offset=(((index>>4)*16+y+3)*256+(index%16)*16+x+3)*4,expected=Model.GLYPHS[index][y][x]==='1'?255:0;
   assert.deepEqual(Array.from(pixels.slice(offset,offset+4)),[expected,expected,expected,255]);cells++;
  }assert.equal(cells,100);
 }
 const fragment=capture.sources.find(source=>source.includes('uniform sampler2D uTrajectoryAtlas'));assert(fragment);
 assert.match(fragment,/floor\(vec2\(\.5-vLocal\.z,\.5-vLocal\.y\)\*10\.\)/);
 assert.match(fragment,/uTrajectoryGlyph < -\.5 \? 0\./,'unpaired faces never borrow the first reserved identity');
 const cache=t.powerRibbonCaches.get(route);assert(cache);const uploads=capture.uploads.length;
 for(let i=0;i<5;i++)t.drawTrajectories();assert.equal(capture.atlas.length,1);assert.equal(capture.uploads.length,uploads,'unchanged paths reuse their ribbon');assert.equal(t.powerRibbonCaches.get(route),cache);
 assert.equal(t.trajectoryPanelSnapshot(empty.id).glyph,null);
 const points=[route.points[0],{x:0,y:.012,z:-.7,action:'pass',wait:0},route.points[1]];assert(t.getTrajectorySystem().edit(a.id,points,false).ok);
 t.drawTrajectories();assert.equal(t.powerRibbonCaches.get(route).buffer,cache.buffer);assert.equal(capture.uploads.length,uploads+1);
 assert(t.trajectoryPanelAction(a.id,'unlink').ok);assert.equal(t.powerRibbonCaches.has(route),false);assert.equal(capture.buffers.has(cache.buffer),false);
});

test('paired trajectories share cable elbows and count the complete floor circuit for reach',()=>{
 const {t}=lab(),a=beacon(t,-1,-1),b=beacon(t,1,1),route=pair(t,a,b);
 assert(route.valid,route.reason);assert.equal(route.points.length,2,'automatic elbows are not extra editable commands');
 const points=route.polyline.points;assert.equal(points.length,3);
 assert.deepEqual(plain(points.map(p=>[p.x,p.z])),[[-.65,-1],[1.35,-1],[1.35,1]]);
 assert(Math.abs(route.length-4)<1e-9,'4 m along the two axes, rather than the 2.83 m diagonal');
 const cable=t.powerCircuitRoute(t.V(-.65,.012,-1),t.V(1.35,.012,1));
 assert.deepEqual(plain(cable.map(p=>[p.x,p.z])),plain(points.map(p=>[p.x,p.z])),'the cable and trajectory use the same ordered bends');
 const snapshot=t.trajectoryPanelSnapshot(a.id);assert.deepEqual(plain(snapshot.displayPoints),plain(points));assert.equal(snapshot.points.length,2);
 const before=plain(t.getTrajectorySystem().snapshot());assert(t.trajectoryPanelAction(a.id,'trace').ok);
 assert(click(t,t.V(-.75,.012,0)));assert.equal(t.getTrajectoryDraft().points.length,0,'a 4.2 m circuit is rejected even though its diagonal shortcut would fit');
 t.cancelTrajectoryDraft();assert.deepEqual(plain(t.getTrajectorySystem().snapshot()),before);
});

test('floor drawing previews, saves and reuses the same orthogonal circuit without changing the clicked points',()=>{
 const capture=instrumentGL(),{t}=lab({gl:capture.gl}),a=beacon(t,-1,-1,{level:2}),b=beacon(t,1,1,{level:2}),route=pair(t,a,b);
 t.renderVisibility.active=false;t.renderVisibility.enabled=false;
 const authoredBefore=plain(route.points);assert(t.trajectoryPanelAction(a.id,'trace').ok);
 assert(click(t,t.V(-.4,.012,-.2)));assert(click(t,t.V(.5,.012,.6)));
 const draft=t.getTrajectoryDraft(),clicked=plain(draft.points);assert.equal(clicked.length,2);
 t.drawTrajectories();const preview=plain(draft.drawPoints),cache=t.powerRibbonCaches.get(draft),uploads=capture.uploads.length;
 assert(preview.length>clicked.length+2);assert(cache);
 for(let i=1;i<preview.length;i++)assert(['x','y','z'].filter(k=>Math.abs(preview[i][k]-preview[i-1][k])>1e-6).length<=1,'no diagonal preview segment');
 for(let i=0;i<4;i++)t.drawTrajectories();assert.equal(capture.uploads.length,uploads,'unchanged drafts reuse their compiled geometry and GPU buffer');
 assert.deepEqual(plain(route.points),authoredBefore,'a preview has not changed the saved route');
 assert(t.finishTrajectoryDraft());assert.equal(t.getTrajectoryDraft(),null);assert.equal(t.powerRibbonCaches.has(draft),false);
 assert.deepEqual(plain(route.points.slice(1,-1)),clicked,'keep exact player supports and action slots');
 assert.deepEqual(plain(route.polyline.points.map(({x,y,z})=>({x,y,z}))),preview,'guidance follows exactly the circuit previewed');
 const saved=t.hydrateLabSnapshot(plain(t.saveLab()));assert.equal(saved.trajectories.routes[0].points.length,4,'save authored points, not synthetic elbows');
});

test('moving a paired beacon recompiles cardinal endpoints while preserving the authored support and actions',()=>{
 const {t}=lab(),a=beacon(t,-1,-1,{level:2}),b=beacon(t,1,1,{level:2}),route=pair(t,a,b),system=t.getTrajectorySystem();
 const support={x:0,y:.012,z:-.4,action:'wait',wait:.2};assert(system.edit(a.id,[route.points[0],support,route.points[1]],true).ok);
 const before=route.polyline;b.g.body.position.z+=.3;b.g.body.wakeUp();settle(system,4);
 assert(route.valid,route.reason);assert.notEqual(route.polyline,before);assert.deepEqual(plain(route.points[1]),support);
 assert.equal(route.polyline.points.filter(p=>p.action==='wait').length,1,'the support action is never copied to a bend');
 for(let i=1;i<route.polyline.points.length;i++)assert(['x','y','z'].filter(k=>Math.abs(route.polyline.points[i][k]-route.polyline.points[i-1][k])>1e-6).length<=1);
 assert.equal(route.loop,true);
});
