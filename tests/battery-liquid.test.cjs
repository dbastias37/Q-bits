const test=require('node:test');
const assert=require('node:assert/strict');
const liquid=require('../assets/js/battery-liquid.js');
const dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const close=(a,b,tolerance=1e-8)=>assert(Math.abs(a-b)<=tolerance,`${a} is not within ${tolerance} of ${b}`);
function meshVolume(positions){let volume=0;for(let i=0;i<positions.length;i+=9)volume+=dot(Array.from(positions.slice(i,i+3)),cross(Array.from(positions.slice(i+3,i+6)),Array.from(positions.slice(i+6,i+9))))/6;return volume;}
function closedMesh(positions){const edges=new Map(),key=p=>p.map(n=>Math.round(n*1e8)).join(',');for(let i=0;i<positions.length;i+=9){const vertices=[0,3,6].map(j=>key(Array.from(positions.slice(i+j,i+j+3))));for(let j=0;j<3;j++){const a=vertices[j],b=vertices[(j+1)%3],pair=[a,b].sort().join('/'),edge=edges.get(pair)||{count:0,balance:0};edge.count++;edge.balance+=a<b?1:-1;edges.set(pair,edge);}}for(const edge of edges.values()){assert.equal(edge.count,2);assert.equal(edge.balance,0);}}
const sample=(patch={})=>({position:[0,0,0],quaternion:[0,0,0,1],velocity:[0,0,0],angularVelocity:[0,0,0],dt:1/60,...patch});
const angle=n=>Math.acos(Math.max(-1,Math.min(1,n[1])));

test('horizontal fills have the physical height and closed positive volume, including empty and full',()=>{
 const size=[.18,.09,.09],full=size.reduce((n,x)=>n*x,1);
 for(const fraction of [0,.001,.1,.5,.85,.999,1]){const mesh=liquid.fillMesh(size,[0,1,0],fraction);close(mesh.offset,(fraction-.5)*size[1],1e-10);close(meshVolume(mesh.positions),full*fraction,full*2e-7);assert.equal(mesh.positions.length,mesh.normals.length);if(fraction===0)assert.equal(mesh.positions.length,0);else closedMesh(mesh.positions);}
});

test('oblique planes conserve actual enclosed volume across all triple-cell axes and skinny normal projections',()=>{
 const sizes=[[.27,.09,.09],[.09,.27,.09],[.09,.09,.27]],normals=[[1,0,0],[0,-1,0],[0,0,1],[1,1,1],[-2,.3,1],[1,1e-6,1e-6],[1e-11,1,1e-8]],fractions=[.00001,.03,.2,.499,.5,.73,.97,.99999];
 for(const size of sizes)for(const normal of normals)for(const fraction of fractions){const mesh=liquid.fillMesh(size,normal,fraction),full=size.reduce((n,x)=>n*x,1);close(meshVolume(mesh.positions),full*fraction,full*3e-7);for(let i=0;i<mesh.positions.length;i+=3){const p=Array.from(mesh.positions.slice(i,i+3));assert(dot(p,mesh.normal)<=mesh.offset+1e-8);for(let axis=0;axis<3;axis++)assert(Math.abs(p[axis])<=size[axis]/2+1e-8);}for(let i=0;i<mesh.topPositions.length;i+=3)close(dot(Array.from(mesh.topPositions.slice(i,i+3)),mesh.normal),mesh.offset,1e-8);}
 for(const normal of [[1,1,1],[-2,.3,1],[1,0,0]])for(const fraction of [.13,.5,.87])closedMesh(liquid.fillMesh([.27,.09,.09],normal,fraction).positions);
});

test('a diagonal one-sixth cube is the known tetrahedron, independently of the CDF implementation',()=>{
 const side=.09,mesh=liquid.fillMesh([side,side,side],[1,1,1],1/6);close(mesh.offset,-side/(2*Math.sqrt(3)),1e-10);close(meshVolume(mesh.positions),side**3/6,side**3*1e-7);assert.equal(mesh.topPositions.length,9);closedMesh(mesh.positions);
});

test('90-degree, upside-down and side orientations keep the free surface horizontal in world space',()=>{
 const cases=[{q:[0,0,Math.SQRT1_2,Math.SQRT1_2],world:p=>[-p[1],p[0],p[2]]},{q:[1,0,0,0],world:p=>[p[0],-p[1],-p[2]]},{q:[Math.SQRT1_2,0,0,Math.SQRT1_2],world:p=>[p[0],-p[2],p[1]]}];
 for(const {q,world}of cases){const state=liquid.createState(),normal=liquid.updateState(state,sample({quaternion:q}),[.09,.27,.09],.35);assert.deepEqual(normal,[0,1,0]);const mesh=liquid.fillMesh([.09,.27,.09],liquid.localNormal(normal,q),.35),points=[];for(let i=0;i<mesh.topPositions.length;i+=3)points.push(world(Array.from(mesh.topPositions.slice(i,i+3))));assert(points.length>=3);for(const p of points)close(p[1],points[0][1],1e-8);close(meshVolume(mesh.positions),.09*.27*.09*.35,3e-10);}
});

test('linear impacts, angular changes and vertical collisions excite bounded waves that settle exactly',()=>{
 for(const patch of [{velocity:[2,0,0]},{angularVelocity:[0,0,5]},{velocity:[0,3,0]}]){const state=liquid.createState();liquid.updateState(state,sample(),[.27,.09,.09],.5);let peak=0;const signs=new Set();for(let i=0;i<600;i++){const n=liquid.updateState(state,sample(patch),[.27,.09,.09],.5);peak=Math.max(peak,angle(n));if(Math.abs(n[0])>1e-5)signs.add(Math.sign(n[0]));assert(angle(n)<=liquid.MAX_TILT_RADIANS+1e-10);close(Math.hypot(...n),1,1e-12);}assert(peak>.005);assert.equal(signs.size,2);assert.deepEqual(state.normal,[0,1,0]);assert.deepEqual(state.rate,[0,0]);}
});

test('pausing freezes visual state; teleports and long frame gaps reset without touching sampled data or charge',()=>{
 const state=liquid.createState(),input=Object.freeze({...sample(),energy:.37,velocity:Object.freeze([0,0,0]),position:Object.freeze([0,0,0]),quaternion:Object.freeze([0,0,0,1]),angularVelocity:Object.freeze([0,0,0])});liquid.updateState(state,input,[.09,.09,.09],input.energy);liquid.updateState(state,sample({velocity:[1,0,0]}),[.09,.09,.09],input.energy);const before=JSON.stringify(state);
 liquid.updateState(state,sample({paused:true,velocity:[20,0,0]}),[.09,.09,.09],.37);assert.equal(JSON.stringify(state),before);liquid.updateState(state,sample({dt:0}),[.09,.09,.09],.37);assert.equal(JSON.stringify(state),before);assert.equal(input.energy,.37);
 assert.deepEqual(liquid.updateState(state,sample({position:[4,0,0]}),[.09,.09,.09],.37),[0,1,0]);liquid.updateState(state,sample({position:[4,0,0],velocity:[1,0,0]}),[.09,.09,.09],.37);assert(angle(state.normal)>0);assert.deepEqual(liquid.updateState(state,sample({position:[4,0,0],dt:1}),[.09,.09,.09],.37),[0,1,0]);
});

test('adversarial finite inputs stay bounded and invalid geometry never emits nonfinite vertices',()=>{
 const state=liquid.createState();liquid.updateState(state,sample(),[.09,.09,.09],.5);for(let i=0;i<1000;i++){const n=liquid.updateState(state,sample({velocity:[i%2?100:-100,50*Math.sin(i),-20],angularVelocity:[40*Math.cos(i),5,40*Math.sin(i)],dt:i%3?.001:.1}),[.09,.09,.27],.5);assert(n.every(Number.isFinite));assert(angle(n)<=liquid.MAX_TILT_RADIANS+1e-10);}
 for(const fraction of [NaN,Infinity,-2,2,.5]){const mesh=liquid.fillMesh([NaN,-1,Infinity],[NaN,0,Infinity],fraction);assert(Array.from(mesh.positions).every(Number.isFinite));assert(Array.from(mesh.normals).every(Number.isFinite));assert(Number.isFinite(mesh.offset));assert(Number.isFinite(mesh.volume));}
 for(const fraction of [0,1]){liquid.updateState(state,sample({velocity:[5,0,0]}),[.09,.09,.09],fraction);assert.deepEqual(state.normal,[0,1,0]);}
});
