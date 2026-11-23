'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const model=require('../assets/js/trajectory-model.js');
const xyz=(x,y=0,z=0)=>({x,y,z});
const route=patch=>({version:1,id:'trayecto-1',startId:10,endId:11,glyph:0,points:[xyz(0,.012),xyz(4,.012)],loop:false,...patch});
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
const rotate=rows=>rows.map((_,y)=>rows.map((_,x)=>rows[9-x][y]).join(''));
function canonical(rows){const keys=[];for(let i=0;i<4;i++){keys.push(rows.join(''));rows=rotate(rows);}return keys.sort()[0];}

test('trajectory data loads in the browser without DOM, physics or timers',()=>{
 const sandbox={};
 for(const name of ['route-geometry','trajectory-model'])vm.runInNewContext(fs.readFileSync(require.resolve('../assets/js/'+name+'.js'),'utf8'),sandbox);
 const browser=sandbox.QBitsTrajectoryModel;
 assert.equal(browser.VERSION,1);assert.equal(typeof browser.follow,'function');
 assert(Object.isFrozen(browser));assert(Object.isFrozen(browser.LIMITS));
 assert(Object.isFrozen(browser.LIMITS.ranges));assert(Object.isFrozen(browser.LIMITS.heights));
 assert.deepEqual(JSON.parse(JSON.stringify(browser.GLYPHS)),model.GLYPHS);
 assert.deepEqual(JSON.parse(JSON.stringify(browser.geometry([xyz(.013,.5,.027),xyz(.267,1,.436)],'air'))),model.geometry([xyz(.013,.5,.027),xyz(.267,1,.436)],'air'));
});

test('the original reference faces retain their exact 10 by 10 user artwork',()=>{
 // Top left panels in 125512 and 130423, sampled by cell centre; the dark
 // perimeter is part of each ten-cell row, not an added or cropped border.
 assert.deepEqual(model.GLYPHS[8],[
  '0000000000','0100000010','0111100000','0000110110','0010010000',
  '0000000100','0000000000','0100000110','0011111100','0000000000'
 ]);
 assert.deepEqual(model.GLYPHS[20],[
  '0000000000','0100000010','0011111110','0000000000','0010000100',
  '0010010000','0000000100','0011000100','0001111010','0000000000'
 ]);
});

test('144 immutable faces preserve a black frame and cannot duplicate another rotation',()=>{
 assert.equal(model.GLYPHS.length,144);assert(Object.isFrozen(model.GLYPHS));
 const unique=new Set();
 for(const rows of model.GLYPHS){
  assert(Object.isFrozen(rows));assert.equal(rows.length,10);
  assert(rows.every(row=>/^[01]{10}$/.test(row)));
  assert.equal(rows[0],'0000000000');assert.equal(rows[9],'0000000000');
  assert(rows.every(row=>row[0]==='0'&&row[9]==='0'));
  unique.add(canonical(rows));
 }
 assert.equal(unique.size,144);
 assert.throws(()=>{model.GLYPHS[0][0]='1111111111';},TypeError);
 assert.strictEqual(model.glyph(143),model.GLYPHS[143]);
 for(const bad of [-1,144,NaN,Infinity,1.1,'1',null])assert.strictEqual(model.glyph(bad),model.GLYPHS[0]);
});

test('five feature variants per original retain most of the face and vary visibly',()=>{
 for(let family=0;family<24;family++)for(let variation=0;variation<5;variation++){
  const original=model.GLYPHS[family].join(''),variant=model.GLYPHS[24+family*5+variation].join('');
  const changed=Array.from(original).filter((cell,i)=>cell!==variant[i]).length;
  assert(changed>=3&&changed<=12,`family ${family}, variant ${variation}: ${changed}`);
  const whites=Array.from(variant).filter(cell=>cell==='1').length;
  assert(whites>=16&&whites<=32);
 }
});

test('level ranges reject invalid levels instead of granting extra reach',()=>{
 assert.deepEqual([1,2,3].map(model.range),[4,12,23]);
 for(const level of [0,4,-1,2.1,'3',null,undefined,Infinity,NaN])assert.equal(model.range(level),0);
});

test('face orientation has hysteresis, a downward hidden mode and a tilted gap',()=>{
 assert.equal(model.classify(0),'ground');assert.equal(model.classify(1),'air');assert.equal(model.classify(-1),'hidden');
 assert.equal(model.classify(.6),'tilted');assert.equal(model.classify(-.6),'tilted');
 assert.equal(model.classify(.45,'ground'),'ground');assert.equal(model.classify(.51,'ground'),'tilted');
 assert.equal(model.classify(.8,'air'),'air');assert.equal(model.classify(.8,'ground'),'tilted');
 assert.equal(model.classify(.74,'air'),'tilted');assert.equal(model.classify(-.8,'hidden'),'hidden');
 for(const y of [NaN,Infinity,-Infinity,2,'1',null])assert.equal(model.classify(y),'tilted');
});

test('route import makes a clean copy and preserves actions and zero ground height',()=>{
 const input=route({points:[xyz(0,0),{...xyz(1,2),action:'wait',wait:3},{...xyz(2,.15),action:'land',wait:0},{...xyz(3,.15),action:'drop',wait:0}]});
 const parsed=model.validateRoute(input);assert(parsed);
 assert.deepEqual(parsed.points[0],{x:0,y:0,z:0,action:'pass',wait:0});
 assert.equal(parsed.points[1].action,'wait');assert.equal(parsed.points[1].wait,3);
 assert.equal(parsed.points[2].action,'land');assert.equal(parsed.points[3].action,'drop');
 assert.notStrictEqual(parsed,input);assert.notStrictEqual(parsed.points,input.points);
 parsed.points[0].x=7;assert.equal(input.points[0].x,0);
 assert(model.validateRoute(route({endId:null,points:[]})));
 assert.equal(model.validateRoute(route({endId:null,points:[xyz(0)]})),null);
});

test('route import refuses invalid identity, incompatible schema and endpoint collisions',()=>{
 for(const patch of [
  {version:0},{version:2},{id:''},{id:'a'.repeat(65)},{id:'<script>'},{id:2},
  {startId:0},{startId:-1},{startId:1.2},{startId:Number.MAX_SAFE_INTEGER+1},
  {endId:10},{endId:0},{endId:'11'},{endId:Infinity},
  {glyph:144},{glyph:-1},{glyph:1.2},{glyph:'0'},{loop:1},{unexpected:true},
  {points:[]},{points:[xyz(0)]},{points:Array.from({length:49},()=>xyz(0))}
 ])assert.equal(model.validateRoute(route(patch)),null,JSON.stringify(patch));
 for(const malformed of [null,undefined,[],12,'route',new Date(),Object.create(route())])assert.equal(model.validateRoute(malformed),null);
});

test('route import bounds positions and durations while preserving repairable out-of-range paths',()=>{
 assert(model.validateRoute(route({points:[xyz(27,0),xyz(28,0)]})));
 assert(model.validateRoute(route({points:[xyz(0),{...xyz(1),action:'wait',wait:60}]})));
 for(const bad of [
  xyz(28.001),xyz(0,-29),xyz(0,0,Infinity),xyz(NaN),xyz('2'),
  {...xyz(1),action:'teleport'},{...xyz(1),action:null},{...xyz(1),wait:-1},
  {...xyz(1),wait:60.01},{...xyz(1),wait:Infinity},{...xyz(1),wait:'1'},{...xyz(1),extra:'data'}
 ])assert.equal(model.validateRoute(route({points:[xyz(0),bad]})),null);
 const bent=[xyz(0),xyz(2),xyz(2,0,2)];near(model.length(bent),4);
 assert(model.validateRoute(route({points:bent})));
 // Ends are only 12m apart; three traversals use 36m. Runtime must stop this
 // route, but importing it must retain the player's editable path.
 const outside=[xyz(0),xyz(12),xyz(0),xyz(12)];near(model.length(outside),36);
 assert(model.validateRoute(route({points:outside})));
 assert(model.validateRoute(route({points:[xyz(0),xyz(23)]})));
 assert(model.validateRoute(route({points:[xyz(0),xyz(23.01)]})));
});

test('malformed imports cannot execute getters, inherit fields or pollute prototypes',()=>{
 let reads=0;
 const accessor=route();Object.defineProperty(accessor,'id',{enumerable:true,get(){reads++;return 'evil';}});
 assert.equal(model.validateRoute(accessor),null);
 const inherited=Object.create({x:0,y:0,z:0});assert.equal(model.validateRoute(route({points:[xyz(0),inherited]})),null);
 const pointGetter=xyz(1);Object.defineProperty(pointGetter,'x',{enumerable:true,get(){reads++;return 1;}});
 assert.equal(model.validateRoute(route({points:[xyz(0),pointGetter]})),null);
 const hidden=route();Object.defineProperty(hidden,'other',{value:1});assert.equal(model.validateRoute(hidden),null);
 const sparse=Array(2);sparse[1]=xyz(1);assert.equal(model.validateRoute(route({points:sparse})),null);
 const indexed=[xyz(0),xyz(1)];Object.defineProperty(indexed,'1',{enumerable:true,get(){reads++;return xyz(1);}});
 assert.equal(model.validateRoute(route({points:indexed})),null);
 const polluted=JSON.parse('{"__proto__":{"polluted":true}}');assert.equal(model.validateRoute({...route(),...polluted}),null);
 const symbolic=route();symbolic[Symbol('extra')]=1;assert.equal(model.validateRoute(symbolic),null);
 assert.equal(reads,0);assert.equal({}.polluted,undefined);
 const plain=Object.assign(Object.create(null),route());assert(model.validateRoute(plain));
});

test('trajectory part data accepts both roles without ownerId and rejects forged capabilities',()=>{
 for(const role of ['beacon','receiver']){
  const value={version:1,level:1,role};
  assert.deepEqual(model.validatePart(value),{...value,face:0,routeId:null});
  assert.deepEqual(model.validatePart({...value,level:3,face:5,routeId:'trayecto-4'}),{version:1,level:3,face:5,role,routeId:'trayecto-4'});
 }
 const valid={version:1,level:2,role:'receiver',routeId:null};
 for(const patch of [{version:0},{level:0},{level:4},{level:1.5},{role:'drone'},{face:-1},{face:6},{face:1.1},{routeId:''},{routeId:5},{ownerId:4}])assert.equal(model.validatePart({...valid,...patch}),null);
 assert.equal(model.validatePart(null),null);
});

test('ground and air compile the same authored supports into cardinal circuits with destination actions',()=>{
 const input=[{...xyz(.013,.5,.027),action:'pass',wait:0},{...xyz(.267,1.2,.436),action:'drop',wait:2}],before=JSON.stringify(input);
 const ground=model.geometry(input,'ground'),air=model.geometry(input,'air');
 assert.deepEqual(ground,[{...xyz(.013,.012,.027),action:'pass',wait:0},{...xyz(.267,.012,.027),action:'pass',wait:0},{...xyz(.267,.012,.436),action:'drop',wait:2}]);
 assert.deepEqual(air,[input[0],{...xyz(.267,.5,.027),action:'pass',wait:0},{...xyz(.267,.5,.436),action:'pass',wait:0},input[1]]);
 near(model.length(ground),.254+.409);near(model.length(air),.254+.409+.7);
 assert.equal(JSON.stringify(input),before);assert.deepEqual(model.geometry(input,'hidden'),[]);
});

test('48 authored points can compile to 142 vertices without raising the save or editor limit',()=>{
 const authored=Array.from({length:48},(_,i)=>({...xyz((i%2)*.01,.5+(i%2)*.01,(i%2)*.02),action:'pass',wait:0}));
 const geometry=model.geometry(authored,'air'),polyline=model.makePolyline(geometry);
 assert.equal(model.LIMITS.points,48);assert.equal(model.LIMITS.compiledPoints,142);assert.equal(geometry.length,142);assert.equal(polyline.points.length,142);
 near(polyline.length,47*.04);near(model.length(geometry),polyline.length);
 assert(model.validateRoute(route({points:authored})));
 assert.equal(model.validateRoute(route({points:geometry})),null,'derived elbows must not masquerade as saved authoring points');
 assert.deepEqual(model.geometry([...authored,authored[0]],'air'),[]);
 assert.equal(model.makePolyline([...geometry,geometry[0]]).points.length,0);
 assert.equal(model.length([...geometry,geometry[0]]),0);
 assert(model.follow(polyline,geometry.at(-1),{index:140,arrival:.001}).arrived);
});

test('compiled previews retain out-of-room endpoints for invalid feedback while imports remain bounded',()=>{
 const input=[xyz(.013,.5,.027),xyz(29,.5,.436)],geometry=model.geometry(input,'air');
 assert.equal(geometry.at(-1).x,29);assert.equal(geometry.length,3);
 assert.equal(model.validateRoute(route({points:input})),null);
 let reads=0;const point=xyz(1);Object.defineProperty(point,'x',{enumerable:true,get(){reads++;return 1;}});
 assert.deepEqual(model.geometry([xyz(0),point]),[]);assert.equal(reads,0);
 assert.deepEqual(model.geometry(Array(2)),[]);
});

test('polyline compilation preserves duplicate action nodes and caches immutable lengths',()=>{
 const input=[xyz(0),xyz(3),{...xyz(3),action:'wait',wait:2},xyz(3,0,4)];
 const poly=model.makePolyline(input);
 assert.equal(poly.points.length,4);assert.deepEqual(poly.cumulative,[0,3,3,7]);near(poly.length,7);
 assert.equal(poly.points[2].action,'wait');assert.equal(poly.points[2].wait,2);
 assert(Object.isFrozen(poly));assert(Object.isFrozen(poly.points));assert(Object.isFrozen(poly.cumulative));assert(Object.isFrozen(poly.points[0]));
 input[0].x=9;assert.equal(poly.points[0].x,0);
 assert.equal(model.makePolyline([xyz(0),xyz(Infinity)]).points.length,0);
 assert.equal(model.makePolyline(Array(2)).points.length,0);
});

test('follower projects to the active segment and includes cross-track distance in remaining travel',()=>{
 const poly=model.makePolyline([xyz(0),xyz(10)]);
 const result=model.follow(poly,xyz(2,0,.5),{index:0,lookahead:1,arrival:.1});
 assert.deepEqual(result.target,xyz(3));assert.equal(result.index,0);near(result.distance,.5);near(result.remaining,8.5);assert.equal(result.arrived,false);
 const beyond=model.follow(poly,xyz(11),{index:0});assert.deepEqual(beyond.target,xyz(10));near(beyond.remaining,1);assert.equal(beyond.arrived,false);
 assert.equal(model.follow(poly,xyz(9.95),{index:0,arrival:.1}).arrived,true);
});

test('follower advances around a bend without sticking just before the corner',()=>{
 const poly=model.makePolyline([xyz(0),xyz(2),xyz(2,0,2)]);
 const before=model.follow(poly,xyz(1.9),{index:0,lookahead:.35,arrival:.05});
 assert.equal(before.index,0);near(before.target.x,2);near(before.target.z,.25);
 const turning=model.follow(poly,xyz(1.98,0,.25),{index:0,lookahead:.35});
 assert.equal(turning.index,1);near(turning.target.x,2);near(turning.target.z,.6);
});

test('crossings and a closed path do not jump to the last branch or arrive at the start',()=>{
 const poly=model.makePolyline([xyz(0),xyz(2,0,2),xyz(-2,0,2),xyz(2,0,-2),xyz(-2,0,-2),xyz(0)]);
 const start=model.follow(poly,xyz(0),{index:0,lookahead:.2});assert.equal(start.index,0);assert.equal(start.arrived,false);
 const crossing=model.follow(poly,xyz(0),{index:2,lookahead:.2});assert.equal(crossing.index,2);assert.equal(crossing.arrived,false);
 const end=model.follow(poly,xyz(0),{index:4,lookahead:.2});assert.equal(end.index,4);assert.equal(end.arrived,true);
});

test('duplicate segments advance with a bounded local budget and a finite target',()=>{
 const poly=model.makePolyline([...Array.from({length:47},()=>xyz(0)),xyz(1)]);
 let result=model.follow(poly,xyz(0),{index:0,lookahead:.25});
 assert.equal(result.index,8);near(result.target.x,.25);assert.equal(result.arrived,false);
 result=model.follow(poly,xyz(0),{index:result.index,lookahead:.25});assert.equal(result.index,16);near(result.target.x,.25);
 const collapsed=model.follow(model.makePolyline([xyz(1),xyz(1),xyz(1)]),xyz(0));
 assert.deepEqual(collapsed.target,xyz(1));near(collapsed.remaining,1);assert.equal(collapsed.arrived,false);
 assert.equal(model.follow(model.makePolyline([xyz(1),xyz(1)]),xyz(1)).arrived,true);
});

test('following one segment never scans distant path geometry',()=>{
 const compiled=model.makePolyline(Array.from({length:48},(_,i)=>xyz(i*.5)));
 const inspected=new Set();
 const points=new Proxy(compiled.points,{get(target,key){
  if(/^\d+$/.test(String(key))){inspected.add(Number(key));assert([0,1,47].includes(Number(key)),`unexpected nonlocal point ${key}`);}
  return Reflect.get(target,key);
 }});
 const result=model.follow({...compiled,points},xyz(.05),{index:0,lookahead:.1});
 near(result.target.x,.15);assert.equal(result.index,0);assert(inspected.size<=3);
});

test('invalid, empty and one-point paths return stable stopping information',()=>{
 const position=xyz(2,1,1);
 for(const poly of [null,{},model.makePolyline([]),{points:[xyz(0)],length:NaN,cumulative:[0]}]){
  const result=model.follow(poly,position);assert.deepEqual(result.target,position);assert.equal(result.arrived,false);assert.equal(result.remaining,Infinity);
 }
 const one=model.follow(model.makePolyline([xyz(2,1,2)]),position);assert.deepEqual(one.target,xyz(2,1,2));near(one.remaining,1);assert.equal(one.arrived,false);
 assert.equal(model.follow(model.makePolyline([xyz(0),xyz(1)]),xyz(NaN)).arrived,false);
});

test('allocator reserves one unique glyph per route and stops at the finite catalogue limit',()=>{
 const allocator=model.createAllocator(),allocated=[];
 for(let i=0;i<144;i++){const entry=allocator.allocate();assert(entry);allocated.push(entry);}
 assert.equal(allocator.size(),144);assert.equal(allocator.allocate(),null);
 assert.equal(new Set(allocated.map(item=>item.id)).size,144);assert.equal(new Set(allocated.map(item=>item.glyph)).size,144);
 assert.equal(allocator.reserve({id:'external',glyph:0}),false);
 assert.equal(allocator.release(allocated[30].id),true);assert.equal(allocator.release(allocated[30].id),false);
 const replacement=allocator.allocate();assert.equal(replacement.glyph,allocated[30].glyph);assert.equal(replacement.id,'trayecto-145');
});

test('allocator serial survives deletion, save/load and externally reserved identities',()=>{
 const original=model.createAllocator([{id:'trayecto-15',glyph:8}]);
 assert.deepEqual(original.allocate(),{id:'trayecto-16',glyph:0});
 assert.equal(original.reserve({id:'trayecto-16',glyph:1}),false);assert.equal(original.reserve({id:'another',glyph:0}),false);
 assert.equal(original.release('trayecto-16'),true);
 const restored=model.createAllocator([{id:'trayecto-15',glyph:8}],original.snapshot().nextSerial);
 assert.deepEqual(restored.allocate(),{id:'trayecto-17',glyph:0});
 assert.equal(restored.reserve({id:'imported-route',glyph:3}),true);
 assert.equal(restored.reserve({id:'trayecto-100',glyph:4}),true);assert.equal(restored.allocate().id,'trayecto-101');
});

test('allocator rejects malformed metadata and handles exhausted safe-integer IDs without a loop',()=>{
 const allocator=model.createAllocator();let reads=0;
 for(const entry of [null,{},[],{id:'',glyph:0},{id:'r',glyph:144},{id:'r',glyph:-1},{id:'r',glyph:1.1},{id:'r',glyph:0,extra:true}])assert.equal(allocator.reserve(entry),false);
 assert.equal(allocator.reserve({get id(){reads++;return 'evil';},glyph:1}),false);assert.equal(reads,0);
 const exhausted=model.createAllocator([],Number.MAX_SAFE_INTEGER);
 assert.equal(exhausted.allocate().id,'trayecto-'+Number.MAX_SAFE_INTEGER);assert.equal(exhausted.allocate(),null);
 exhausted.release('trayecto-'+Number.MAX_SAFE_INTEGER);
 assert.equal(model.createAllocator([],exhausted.snapshot().nextSerial).allocate(),null);
 const loaded=model.createAllocator([{id:'trayecto-'+Number.MAX_SAFE_INTEGER,glyph:1}]);assert.equal(loaded.allocate(),null);
});
