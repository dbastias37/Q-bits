'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Runtime=require('../assets/js/trajectory-runtime.js');
const Model=require('../assets/js/trajectory-model.js');
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const point=(x,y=.012,z=0)=>({x,y,z,action:'pass',wait:0});
const cardinal=points=>{for(let i=1;i<points.length;i++)assert(['x','y','z'].filter(axis=>Math.abs(points[i][axis]-points[i-1][axis])>1e-6).length<=1,'compiled segments must follow one world axis');};
function fixture(){
 const poses=new Map(),held=new Set(),awake=new Set(),calls={changed:0,starts:0,stops:[],steps:[],disposed:0};
 const adapter={
  pose:n=>({...poses.get(n.part.id)}),held:n=>held.has(n.part.id),awake:n=>awake.has(n.part.id),
  anchor:(n,mode)=>({x:n.pose.x+(mode==='ground'?(n.pose.nx||0)*.2:0),y:0,z:n.pose.z+(mode==='ground'?(n.pose.nz||0)*.2:0)}),
  changed:()=>calls.changed++,disposeRoute:()=>calls.disposed++,
  start:(node,route)=>{calls.starts++;return {ok:true,drive:{id:node.part.id,routeId:route.id}};},
  stop:(drive,reason)=>calls.stops.push({id:drive.id,reason}),step:(drive,route,dt)=>{calls.steps.push({id:drive.id,route,dt});return {};}
 };
 const runtime=Runtime.create(adapter);
 function add(id,x=0,role='beacon',mode='ground',level=1,routeId=null){
  const events=new Map(),body={addEventListener:(key,fn)=>events.set(key,fn),removeEventListener:(key,fn)=>{if(events.get(key)===fn)events.delete(key);}};
  const g={body},part={id,mood:{trajectory:{version:1,level,face:0,role,routeId}}};
  poses.set(id,{x,y:.075,z:0,nx:mode==='ground'?1:0,ny:mode==='air'?1:0,nz:0,qx:0,qy:0,qz:mode==='air'?Math.SQRT1_2:0,qw:mode==='air'?Math.SQRT1_2:1});
  assert(runtime.register(g,part));return {g,part,events,wake:()=>events.get('wakeup')?.()};
 }
 const tick=(count=6)=>{for(let i=0;i<count;i++)runtime.update(.05);};
 function linked(mode='ground',level=1){const a=add(1,0,'beacon',mode,level),b=add(2,2,'beacon',mode,level),receiver=add(3,0,'receiver');tick();const start=runtime.createStart(1);assert(start.ok);assert(runtime.pair(start.routeId,2).ok);tick();return {a,b,receiver,route:runtime.routes.get(start.routeId)};}
 return {runtime,poses,held,awake,calls,add,tick,linked};
}

test('sleeping linked and unpaired beacons do no work during 1000 idle ticks',()=>{
 const f=fixture(),linked=f.linked();const pending=f.add(4,3);f.tick();assert(f.runtime.createStart(4).ok);f.tick();
 assert.equal(f.runtime.watching,0);assert.equal(linked.route.valid,true);
 const stats={...f.runtime.stats},changed=f.calls.changed;
 for(let i=0;i<1000;i++)f.runtime.update(1/60);
 assert.deepEqual(f.runtime.stats,stats);assert.equal(f.calls.changed,changed);
 for(let i=0;i<100;i++)f.runtime.refresh(linked.route);
 assert.deepEqual(f.runtime.stats,stats);assert.equal(f.calls.changed,changed);
 assert(pending.events.has('wakeup'));
});

test('pairing while cubes settle immediately produces a valid serializable two-point route',()=>{
 const f=fixture();f.add(1);f.add(2,2);
 const start=f.runtime.createStart(1);assert(start.ok);assert(f.runtime.validSnapshot(f.runtime.snapshot()));
 assert(f.runtime.pair(start.routeId,2).ok);
 const route=f.runtime.routes.get(start.routeId);assert.equal(route.points.length,2);assert.equal(route.valid,false);
 assert(f.runtime.validSnapshot(f.runtime.snapshot()));f.tick();assert.equal(route.valid,true);
});

test('nonaligned anchors and clicked supports share one cardinal display and follower path without expanding saved authoring data',()=>{
 const f=fixture(),{a,b,route}=f.linked('ground',2);
 Object.assign(f.poses.get(1),{x:.013,z:.027});Object.assign(f.poses.get(2),{x:1.267,z:.436});a.wake();b.wake();f.tick();
 near(route.points[0].x,.213);near(route.points[0].z,.027);near(route.points[1].x,1.467);near(route.points[1].z,.436);
 assert.equal(route.points.length,2);assert.equal(route.polyline.points.length,3);cardinal(route.polyline.points);
 const middle={...point(.555,.012,1.111),action:'wait',wait:2},end={...route.points[1],action:'drop'};
 assert(f.runtime.edit(1,[route.points[0],middle,end],true).ok);
 assert.equal(route.points.length,3);assert.equal(route.polyline.points.length,5);assert.equal(route.loop,true);
 assert.strictEqual(route.displayPoints,route.polyline.points);cardinal(route.displayPoints);
 assert.deepEqual(route.polyline.points.filter(p=>p.action!=='pass'),[middle,end]);
 near(route.length,Math.abs(.555-.213)+Math.abs(1.111-.027)+Math.abs(1.467-.555)+Math.abs(.436-1.111));
 assert.deepEqual(f.runtime.snapshot().routes[0].points,route.points);assert.equal(f.runtime.snapshot().routes[0].points.length,3);
 assert(f.runtime.assign(3,route.id).ok);assert(f.runtime.start(3).ok);f.tick(1);
 assert.strictEqual(f.calls.steps.at(-1).route.polyline.points,route.displayPoints,'the adapter receives the same geometry that is displayed');
});

test('reach rejects a diagonal shortcut that exceeds the orthogonal budget and accepts the exact boundary',()=>{
 const f=fixture(),{route}=f.linked(),before=JSON.stringify(f.runtime.snapshot());
 const diagonal=[route.points[0],point(.2,.012,1.1),route.points[1]];assert(Model.length(diagonal)<4);
 assert.equal(f.runtime.edit(1,diagonal,false).ok,false);assert.equal(JSON.stringify(f.runtime.snapshot()),before);
 assert(f.runtime.edit(1,[route.points[0],point(.2,.012,1),route.points[1]],false).ok);
 near(route.length,4);assert.equal(route.valid,true);cardinal(route.polyline.points);
});

test('air circuits separate horizontal travel from height changes and keep landing or cargo actions off generated elbows',()=>{
 const f=fixture(),{route}=f.linked('air',2),middle={...point(1,1.5,.5),action:'wait',wait:2},drop={...middle,action:'drop',wait:0};
 const authored=[route.points[0],middle,drop,route.points[1]];
 assert(f.runtime.edit(1,authored,false).ok);cardinal(route.polyline.points);
 assert.equal(route.points.length,4);assert.equal(route.polyline.points.length,8);near(route.length,5);
 assert.deepEqual(route.polyline.points.filter(p=>p.action!=='pass').map(p=>[p.x,p.y,p.z,p.action,p.wait]),[[1,1.5,.5,'wait',2],[1,1.5,.5,'drop',0],[2,.5,0,'land',0]]);
 for(let i=1;i<route.polyline.points.length;i++){
  const a=route.polyline.points[i-1],b=route.polyline.points[i];
  if(Math.abs(b.y-a.y)>1e-6){near(a.x,b.x);near(a.z,b.z);}
 }
 const saved=f.runtime.snapshot();assert(f.runtime.restore(saved));f.tick();
 const restored=f.runtime.routes.get(route.id);assert.deepEqual(restored.points,authored);assert.equal(restored.polyline.points.length,8);assert.strictEqual(restored.displayPoints,restored.polyline.points);
});

test('an older diagonal save restores as a stopped cardinal route and retains editable data when its new length is out of range',()=>{
 const f=fixture(),{b,route}=f.linked(),saved=f.runtime.snapshot();
 Object.assign(f.poses.get(2),{x:2.4,z:2.4});saved.routes[0].points=[point(.2),point(2.6,.012,2.4)];
 assert(Model.length(saved.routes[0].points)<4);assert(f.runtime.restore(saved));f.tick();
 const restored=f.runtime.routes.get(route.id);assert.equal(restored.valid,false);assert.match(restored.reason,/No alcanza/);near(restored.length,4.8);cardinal(restored.displayPoints);
 assert.equal(restored.points.length,2);assert.deepEqual(f.runtime.snapshot().routes[0].points,saved.routes[0].points);assert.equal(f.runtime.followers.size,0);
 Object.assign(f.poses.get(2),{x:1,z:1});b.wake();f.tick();assert.equal(restored.valid,true);near(restored.length,2);assert.equal(f.calls.starts,0);
});

test('one beacon cannot belong to two pairs and route glyphs stay exclusive',()=>{
 const f=fixture(),{route}=f.linked();f.add(4,3);f.add(5,4);f.tick();
 const second=f.runtime.createStart(4);assert(second.ok);
 assert.equal(f.runtime.pair(second.routeId,2).ok,false);assert.equal(f.runtime.createStart(1).ok,false);
 assert.equal(f.runtime.pair(route.id,5).ok,false);assert(f.runtime.pair(second.routeId,5).ok);
 assert.notEqual(f.runtime.routes.get(second.routeId).glyph,route.glyph);
 const firstGlyph=route.glyph;assert(f.runtime.nextGlyph(1).ok);assert.notEqual(route.glyph,firstGlyph);assert.notEqual(route.glyph,f.runtime.routes.get(second.routeId).glyph);
});

test('yaw wakes a sleeping beacon, stops its receiver and updates the ground anchor',()=>{
 const f=fixture(),{a,route}=f.linked();assert(f.runtime.assign(3,route.id).ok);assert(f.runtime.start(3).ok);
 const oldX=route.points[0].x,revision=route.revision;
 Object.assign(f.poses.get(1),{nx:0,nz:-1,qy:Math.SQRT1_2,qw:Math.SQRT1_2});a.wake();f.runtime.update(.05);
 assert.equal(f.runtime.followers.size,0);assert.equal(route.valid,false);assert.match(f.calls.stops.at(-1).reason,/movida/);
 f.tick();assert.equal(route.valid,true);assert.notEqual(route.points[0].x,oldX);near(route.points[0].x,0);near(route.points[0].z,-.2);assert(route.revision>revision);
 assert.equal(f.calls.starts,1,'movement must not restart the mechanism');
});

test('quaternion yaw on an upward face invalidates even when its normal stays identical',()=>{
 const f=fixture(),{a,route}=f.linked('air');assert(f.runtime.assign(3,route.id).ok);assert(f.runtime.start(3).ok);
 Object.assign(f.poses.get(1),{qx:.5,qy:.5,qz:.5,qw:.5});a.wake();f.runtime.update(.05);
 assert.equal(route.valid,false);assert.equal(f.runtime.followers.size,0);f.tick();assert.equal(route.valid,true);
});

test('equivalent quaternion signs and subthreshold rest jitter do not rebuild or stop',()=>{
 const f=fixture(),{a,route}=f.linked();assert(f.runtime.assign(3,route.id).ok);assert(f.runtime.start(3).ok);
 const rebuilds=f.runtime.stats.rebuilds,revision=route.revision;
 Object.assign(f.poses.get(1),{x:.0005,qx:0,qy:0,qz:0,qw:-1});a.wake();f.tick();
 assert.equal(route.valid,true);assert.equal(f.runtime.followers.size,1);assert.equal(f.runtime.stats.rebuilds,rebuilds);assert.equal(route.revision,revision);assert.equal(f.calls.stops.length,0);
});

test('picking up without a pose change stops once and release requires settling',()=>{
 const f=fixture(),{a,route}=f.linked();assert(f.runtime.assign(3,route.id).ok);assert(f.runtime.start(3).ok);
 f.held.add(1);a.wake();f.runtime.update(.05);assert.equal(route.valid,false);assert.equal(f.runtime.followers.size,0);
 const changed=f.calls.changed;f.tick(10);assert.equal(f.calls.stops.length,1);assert.equal(f.calls.changed,changed);
 f.held.delete(1);f.runtime.update(.05);assert.equal(route.valid,false);f.tick();assert.equal(route.valid,true);assert.equal(f.runtime.followers.size,0);
});

test('explicit manipulation invalidation catches a sleeping beacon immediately',()=>{
 const f=fixture(),{route}=f.linked();assert(f.runtime.assign(3,route.id).ok);assert(f.runtime.start(3).ok);
 assert(f.runtime.invalidate(route.id));assert.equal(f.runtime.followers.size,0);assert.equal(route.valid,false);
 f.poses.get(1).x=.4;f.tick();assert.equal(route.valid,true);near(route.points[0].x,.6);
 const changed=f.calls.changed;assert.equal(f.runtime.invalidate('missing-route'),false);assert.equal(f.calls.changed,changed);
});

test('orientation hysteresis retains ground mode but incompatible, hidden and elevated faces stop routes',()=>{
 const f=fixture(),{a,b,route}=f.linked();
 Object.assign(f.poses.get(1),{ny:.45,nx:Math.sqrt(1-.45*.45)});Object.assign(f.poses.get(2),{ny:.45,nx:Math.sqrt(1-.45*.45)});a.wake();b.wake();f.tick();assert.equal(route.mode,'ground');assert.equal(route.valid,true);
 Object.assign(f.poses.get(1),{ny:1,nx:0});a.wake();f.tick();assert.equal(route.valid,false);assert.match(route.reason,/Orienta/);
 Object.assign(f.poses.get(1),{ny:-1});a.wake();f.tick();assert.equal(route.valid,false);assert.match(route.reason,/oculta/);
 Object.assign(f.poses.get(1),{ny:0,nx:1,y:.3});Object.assign(f.poses.get(2),{ny:0,nx:1});a.wake();b.wake();f.tick();assert.equal(route.valid,false);assert.match(route.reason,/piso/);
});

test('air heights survive ground projection and only floor heights are raised on conversion to air',()=>{
 const f=fixture(),{a,b,route}=f.linked('air');assert(f.runtime.edit(1,[point(0,1),point(1,2),point(2,1)],false).ok);
 for(const id of [1,2])Object.assign(f.poses.get(id),{ny:0,nx:1,qz:0,qw:1});a.wake();b.wake();f.tick();
 assert.equal(route.mode,'ground');assert.equal(route.valid,true);assert.deepEqual(route.points.map(p=>p.y),[1,2,1]);assert(route.polyline.points.every(p=>p.y===.012));
 for(const id of [1,2])Object.assign(f.poses.get(id),{ny:1,nx:0,qz:Math.SQRT1_2,qw:Math.SQRT1_2});a.wake();b.wake();f.tick();
 assert.equal(route.mode,'air');assert.equal(route.valid,true);assert.deepEqual(route.points.map(p=>p.y),[1,2,1]);
 const badBefore=JSON.stringify(f.runtime.snapshot());assert.equal(f.runtime.edit(1,[point(0,.14),point(2,.5)],false).ok,false);assert.equal(f.runtime.edit(1,[point(0,3.01),point(2,.5)],false).ok,false);assert.equal(JSON.stringify(f.runtime.snapshot()),badBefore);
 const g=fixture(),linked=g.linked();for(const id of [1,2])Object.assign(g.poses.get(id),{ny:1,nx:0,qz:Math.SQRT1_2,qw:Math.SQRT1_2});linked.a.wake();linked.b.wake();g.tick();
 assert.equal(linked.route.mode,'air');assert(linked.route.points.every(p=>p.y===.5));assert.equal(linked.route.valid,true);
});

test('reach uses actual anchors and the full path, while failed edits do not mutate data',()=>{
 const f=fixture(),{route}=f.linked(),before=JSON.stringify(f.runtime.snapshot());
 assert.equal(f.runtime.edit(1,[point(0),point(1,.012,3),point(2)],false).ok,false);assert.equal(JSON.stringify(f.runtime.snapshot()),before);
 assert(f.runtime.edit(1,[point(0,3),point(2,3)],true).ok,'ground reach projects away stored flight height');near(route.length,2);assert.equal(route.loop,true);assert.equal(route.points.length,2,'return travel is physical, not an appended closing edge');
 f.poses.get(2).x=5;f.runtime.invalidate(route.id);f.tick();assert.equal(route.valid,false);near(route.length,5);
 const moved=JSON.stringify(f.runtime.snapshot());assert.equal(f.runtime.edit(1,[point(0),point(1)],false).ok,false,'forged endpoint positions cannot bypass the anchored distance');assert.equal(JSON.stringify(f.runtime.snapshot()),moved);
});

test('out-of-range routes remain saveable, restore stopped and recover when moved back',()=>{
 const f=fixture(),{b,route}=f.linked('ground',3);assert(f.runtime.edit(1,[point(0),point(8,.012,3),point(2)],false).ok);
 f.poses.get(2).x=-10;b.wake();f.tick();assert(route.length>23);assert.equal(route.valid,false);assert.match(route.reason,/No alcanza/);
 const saved=f.runtime.snapshot();assert(f.runtime.validSnapshot(saved));assert(f.runtime.restore(saved));f.tick();assert.equal(f.runtime.followers.size,0);
 f.poses.get(2).x=2;b.wake();f.tick();assert.equal(f.runtime.routes.get(route.id).valid,true);
});

test('unregistering an endpoint immediately stops followers; re-registering restores the link',()=>{
 const f=fixture(),{a,route}=f.linked();assert(f.runtime.assign(3,route.id).ok);assert(f.runtime.start(3).ok);
 assert(f.runtime.unregister(1));assert.equal(f.runtime.followers.size,0);assert.equal(a.events.has('wakeup'),false);f.tick();assert.equal(route.valid,false);assert.match(route.reason,/inicio/);
 assert(f.runtime.register(a.g,a.part));f.tick();assert.equal(route.valid,true);assert.equal(a.part.mood.trajectory.routeId,route.id);assert.equal(f.runtime.followers.size,0);
 f.runtime.unregisterGroup(a.g);assert.equal(f.runtime.nodes.has(1),false);
});

test('restoring before nodes arrive reconnects endpoints and never starts receivers automatically',()=>{
 const first=fixture(),{route}=first.linked();assert(first.runtime.assign(3,route.id).ok);assert(first.runtime.start(3).ok);const saved=first.runtime.snapshot();
 assert(first.runtime.restore(saved));assert.equal(first.runtime.followers.size,0);assert.match(first.calls.stops.at(-1).reason,/guardado/);assert.match(first.runtime.nodes.get(3).status,/vuelve a iniciarlo/);
 const f=fixture();assert(f.runtime.restore(saved));f.tick();assert.equal(f.runtime.routes.get(route.id).valid,false);
 f.add(1,0);f.add(2,2);f.add(3,0,'receiver','ground',1,route.id);f.tick();assert.equal(f.runtime.routes.get(route.id).valid,true);assert.equal(f.runtime.nodes.get(1).part.mood.trajectory.routeId,route.id);assert.equal(f.runtime.nodes.get(2).part.mood.trajectory.routeId,route.id);assert.equal(f.runtime.followers.size,0);assert.equal(f.calls.starts,0);
});

test('snapshot validation rejects schema tricks and duplicate ownership without stopping current play',()=>{
 const f=fixture(),{route}=f.linked();assert(f.runtime.assign(3,route.id).ok);assert(f.runtime.start(3).ok);const saved=f.runtime.snapshot();let getters=0;
 const clone=()=>JSON.parse(JSON.stringify(saved));
 const invalids=[{...saved,extra:1},{...saved,serial:-1},{...saved,version:2},{...saved,routes:Array(2)},Object.create(saved)];
 const duplicate=clone();duplicate.routes.push({...duplicate.routes[0],id:'route-2',glyph:1});invalids.push(duplicate);
 const glyph=clone();glyph.routes.push({...glyph.routes[0],id:'route-2',startId:4,endId:5});invalids.push(glyph);
 const malformed=clone();malformed.routes[0].endId=null;invalids.push(malformed);
 const accessor={...saved};Object.defineProperty(accessor,'serial',{enumerable:true,get(){getters++;return 1;}});invalids.push(accessor);
 for(const bad of invalids){assert.equal(f.runtime.validSnapshot(bad),null);assert.equal(f.runtime.restore(bad),false);}
 assert.equal(getters,0);assert.equal(f.runtime.followers.size,1);assert.equal(f.calls.stops.length,0);
});

test('serial is reconciled with route suffixes and never rewinds when restoring an older slot',()=>{
 const f=fixture();f.add(1);f.add(2,2);f.tick();
 assert(f.runtime.restore({version:1,serial:0,routes:[{version:1,id:'route-70',startId:1,endId:null,glyph:0,points:[],loop:false}]}));
 assert.equal(f.runtime.snapshot().serial,70);assert(f.runtime.unlink(1).ok);assert.equal(f.runtime.createStart(2).routeId,'route-71');
 assert(f.runtime.restore({version:1,serial:2,routes:[]}));assert.equal(f.runtime.createStart(1).routeId,'route-72');
 assert(f.runtime.restore({version:1,serial:Number.MAX_SAFE_INTEGER,routes:[]}));assert.equal(f.runtime.createStart(2).ok,false);
});

test('zero dt freezes existing guidance and restore deliberately discards the running state',()=>{
 const f=fixture(),{route}=f.linked();assert(f.runtime.assign(3,route.id).ok);assert(f.runtime.start(3).ok);f.runtime.update(.05);
 const steps=f.calls.steps.length,stats={...f.runtime.stats};for(let i=0;i<1000;i++)f.runtime.update(0);
 assert.equal(f.calls.steps.length,steps);assert.deepEqual(f.runtime.stats,stats);assert.equal(f.runtime.followers.size,1);
 f.runtime.update(.05);assert.equal(f.calls.steps.length,steps+1);assert(f.runtime.restore(f.runtime.snapshot()));f.tick();assert.equal(f.runtime.followers.size,0);assert.equal(f.calls.starts,1);
});

test('unchanged edit/assignment and settling after invalidation reuse the compiled geometry',()=>{
 const f=fixture(),{route}=f.linked();assert(f.runtime.assign(3,route.id).ok);
 const compiled=route.polyline,display=route.displayPoints,rebuilds=f.runtime.stats.rebuilds,changed=f.calls.changed;
 assert(f.runtime.assign(3,route.id).ok);assert(f.runtime.edit(1,route.points,route.loop).ok);assert.equal(f.calls.changed,changed);
 f.runtime.invalidate(route.id);f.tick();assert.strictEqual(route.polyline,compiled);assert.strictEqual(route.displayPoints,display);assert.equal(f.runtime.stats.rebuilds,rebuilds);
 f.runtime.clear();assert.equal(f.runtime.nodes.size,0);assert.equal(f.runtime.routes.size,0);assert.equal(f.runtime.watching,0);
 const cleared={...f.runtime.stats},count=f.calls.changed;f.runtime.clear();for(let i=0;i<1000;i++)f.runtime.update(.05);assert.deepEqual(f.runtime.stats,cleared);assert.equal(f.calls.changed,count);
});
