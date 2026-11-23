const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Geometry=require('../assets/js/route-geometry.js');
const xyz=(x,y,z)=>({x,y,z});
const cardinal=points=>{for(let i=1;i<points.length;i++)assert(['x','y','z'].filter(axis=>Math.abs(points[i][axis]-points[i-1][axis])>Geometry.EPSILON).length<=1,'each nonzero segment follows one world axis');};

test('shared route geometry uses X, Z, Y elbows without moving authored coordinates to a metric grid',()=>{
 const input=Object.freeze([Object.freeze(xyz(.013,.5,.027)),Object.freeze(xyz(.267,1.2,.436)),Object.freeze(xyz(-.311,.8,-.221))]);
 const result=Geometry.orthogonal(input);
 assert.deepEqual(result,[xyz(.013,.5,.027),xyz(.267,.5,.027),xyz(.267,.5,.436),xyz(.267,1.2,.436),xyz(-.311,1.2,.436),xyz(-.311,1.2,-.221),xyz(-.311,.8,-.221)]);
 cardinal(result);assert(result.every(point=>!input.includes(point)));
 const sandbox={};vm.runInNewContext(fs.readFileSync(require.resolve('../assets/js/route-geometry.js'),'utf8'),sandbox);
 assert.deepEqual(JSON.parse(JSON.stringify(sandbox.QBitsRouteGeometry.orthogonal(input))),result);assert(Object.isFrozen(sandbox.QBitsRouteGeometry));
});

test('inserted bends only pass while every authored action stays at its destination, including coincidences',()=>{
 const input=[{...xyz(0,.5,0),action:'pass',wait:0},{...xyz(2,1,3),action:'drop',wait:2},{...xyz(2,1,3),action:'wait',wait:4},{...xyz(2,1,3),action:'land',wait:0}];
 const before=JSON.stringify(input),result=Geometry.orthogonal(input);cardinal(result);
 assert.deepEqual(result.map(point=>[point.action,point.wait]),[['pass',0],['pass',0],['pass',0],['drop',2],['wait',4],['land',0]]);
 for(const point of result.filter(point=>point.action!=='pass'))assert.deepEqual([point.x,point.y,point.z],[2,1,3]);
 assert.equal(JSON.stringify(input),before);result[3].wait=9;assert.equal(input[1].wait,2);
});

test('duplicate cable supports collapse and insignificant physical drift creates no extra elbows',()=>{
 assert.deepEqual(Geometry.orthogonal([xyz(0,.008,0),xyz(0,.008,0),xyz(2,.008,0),xyz(2,.008,0)]),[xyz(0,.008,0),xyz(2,.008,0)]);
 const end={x:.45,y:.012+1e-16,z:1e-16,action:'wait',wait:1};
 const result=Geometry.orthogonal([{x:0,y:.012,z:0,action:'pass',wait:0},end]);
 assert.equal(result.length,2);assert.deepEqual(result[1],end);cardinal(result);
 const cableEnd=xyz(2,.008+1e-10,0),cable=Geometry.orthogonal([xyz(0,.008,0),xyz(2,.008,0),cableEnd]);
 assert.equal(cable.length,2);assert.deepEqual(cable.at(-1),cableEnd);
});

test('malformed or nonfinite route inputs produce no partial geometry',()=>{
 for(const input of [null,{},[],Array(2),[xyz(0,0,0),null],[xyz(0,0,0),xyz(Infinity,0,0)],[xyz(0,0,0),xyz(1,NaN,0)]])assert.deepEqual(Geometry.orthogonal(input),[]);
});
