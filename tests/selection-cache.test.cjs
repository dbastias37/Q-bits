const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),createGame=require('./game-harness.cjs');
const source=fs.readFileSync(path.join(__dirname,'../assets/js/game.js'),'utf8').replace(/\}\)\(\);\s*$/, 'window.__selectionScreenBounds=screenBounds;})();');
function fixture(){
 let id=0;const live=new Set(),uploads=[],draws=[];
 const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,getUniformLocation:()=>0,createBuffer:()=>{live.add(++id);return id;},deleteBuffer:buffer=>live.delete(buffer),createShader:()=>({}),createProgram:()=>({}),isContextLost:()=>false,bufferData:(_,data)=>uploads.push(data.length),drawArrays:(_,first,count)=>draws.push(count)}, {get:(o,k)=>k in o?o[k]:/^[A-Z_]+$/.test(k)?0:()=>{}});
 const game=createGame({gl,gameSource:source,graphics:false});game.t.clearNarrativeScene();game.t.setLook({camera:[.2,1.3,3],yaw:0,pitch:-.2});uploads.length=0;draws.length=0;return {...game,live,uploads,draws};
}
function structure(t,count){return t.makeGroup(Array.from({length:count},(_,i)=>({id:t.allocateUnitId(),weight:1,shape:['cube','tetra','pyramid','coupler'][i%4],p:t.V(i%20*.09,.3+Math.floor(i/200)*.09,Math.floor(i/20)%10*.09),q:t.Q()})));}

test('stationary selected structures reuse their outline uploads at 1, 80, 487 and 2000 pieces',()=>{
 for(const count of [1,80,487,2000]){
  const {t,uploads,draws,live}=fixture(),g=structure(t,count),before=JSON.stringify(t.worldParts(g)),bodies=t.world.bodies.length;
  t.drawRigidOutline(g,.85,true);const buffers=g.outlineCache.batches.map(b=>b.buffer),initialUploads=uploads.length,initialDraws=draws.length;
  for(let frame=0;frame<60;frame++)t.drawRigidOutline(g,.85,true);
  assert.equal(uploads.length,initialUploads,'an unchanged view should not rebuild thousands of edge triangles');assert.equal(draws.length,initialDraws+60);assert.equal(t.world.bodies.length,bodies);assert.equal(JSON.stringify(t.worldParts(g)),before);
  t.removeGroup(g);assert(buffers.every(b=>!live.has(b)),'removing the structure releases its outline buffers');
 }
});

test('outline cache follows camera, projection, body pose, observer and width while recoloring reuses geometry',()=>{
 const {t,uploads,live}=fixture(),g=structure(t,80);t.drawRigidOutline(g,.85,true);let count=uploads.length;
 const redraw=change=>{change();t.drawRigidOutline(g,.85,true);assert(uploads.length>count);count=uploads.length;t.drawRigidOutline(g,.85,true);assert.equal(uploads.length,count);};
 redraw(()=>t.setLook({camera:[.3,1.3,3]}));redraw(()=>t.setLook({yaw:.1,pitch:-.3}));redraw(()=>g.body.position.x+=.01);redraw(()=>g.body.quaternion.setFromEuler(.1,.3,-.2));redraw(()=>t.getVisuals().outlineWidth=4);redraw(()=>t.canvas.clientWidth=900);redraw(()=>t.heldFocus.focal+=.1);
 redraw(()=>t.cullingLab.renderView={eye:[.4,1.2,4],basis:{forward:t.V(0,0,-1),up:t.V(0,1,0),right:t.V(1,0,0)}});redraw(()=>t.cullingLab.renderView=null);
 t.getVisuals().outlineColor='#ff0000';t.drawRigidOutline(g,.4,true);assert.equal(uploads.length,count,'color/alpha are uniforms');
 const old=g.outlineCache.batches.map(b=>b.buffer);g.parts=g.parts.slice();t.drawRigidOutline(g,.85,true);assert(old.every(b=>!live.has(b)),'replaced geometry releases the old buffers');
 t.drawRigidOutline(g,.85,false);const many=g.outlineCache.batches.map(b=>b.buffer);assert(many.length>1);t.drawRigidOutline(g,.85,true);assert.equal(g.outlineCache.batches.length,1);assert(many.slice(1).every(b=>!live.has(b)),'changing selection cannot retain unused runs');
});

test('cached projected bounds preserve every visible material corner and refresh with the camera and body',()=>{
 const {t,sandbox}=fixture(),g=structure(t,487),bounds=sandbox.__selectionScreenBounds;
 const reference=()=>{const points=t.poses(g).flatMap(p=>t.corners(p)).map(t.project).filter(Boolean);return points.length?{left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))}:null;};
 for(const camera of [[.2,1.3,3],[-.2,.5,.2],[0,1,-5]]){
  t.setLook({camera,yaw:.1,pitch:-.2});g.body.quaternion.setFromEuler(.2,-.3,.1);const expected=reference(),actual=bounds(g);if(expected)for(const key of Object.keys(expected))assert(Math.abs(actual[key]-expected[key])<1e-6,key);else assert.equal(actual,null);
  assert.equal(bounds(g),actual,'stationary bounds are reused');g.body.position.z-=.01;const moved=bounds(g);if(moved)for(const key of Object.keys(moved))assert(Math.abs(moved[key]-reference()[key])<1e-6,key);
 }
});
