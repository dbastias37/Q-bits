const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),createGame=require('./game-harness.cjs');
const source=fs.readFileSync(path.join(__dirname,'../assets/js/game.js'),'utf8').replace(/\}\)\(\);\s*$/, 'window.__selectionScreenBounds=screenBounds;window.__drawStructureOutlines=drawStructureOutlines;})();');
function fixture(gameSource=source){
 let id=0;const live=new Set(),uploads=[],draws=[],uniforms=new Map();
 const uniform=(name,...values)=>uniforms.set(name,values);
 const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,getUniformLocation:(_,name)=>name,uniform1f:uniform,uniform2f:uniform,uniform3f:uniform,uniform4f:uniform,createBuffer:()=>{live.add(++id);return id;},deleteBuffer:buffer=>live.delete(buffer),createShader:()=>({}),createProgram:()=>({}),isContextLost:()=>false,bufferData:(_,data)=>uploads.push(data.length),drawArrays:(_,first,count)=>draws.push(count)}, {get:(o,k)=>k in o?o[k]:/^[A-Z_]+$/.test(k)?0:()=>{}});
 const game=createGame({gl,gameSource,graphics:false});game.t.clearNarrativeScene();game.t.setLook({camera:[.2,1.3,3],yaw:0,pitch:-.2});uploads.length=0;draws.length=0;return {...game,live,uploads,draws,uniforms};
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

test('moving selected outlines keep local GPU geometry while pose, width, color and style use uniforms',()=>{
 const {t,uploads,live,uniforms}=fixture(),g=structure(t,80);t.drawRigidOutline(g,.85,true);const count=uploads.length,buffer=g.outlineCache.batches[0].buffer;
 const redraw=change=>{change();t.drawRigidOutline(g,.85,true);assert.equal(uploads.length,count,'moving outlines must not project or upload every edge on the CPU');assert.equal(g.outlineCache.batches[0].buffer,buffer);};
 redraw(()=>t.setLook({camera:[.3,1.3,3]}));redraw(()=>t.setLook({yaw:.1,pitch:-.3}));redraw(()=>g.body.position.x+=.01);redraw(()=>g.body.quaternion.setFromEuler(.1,.3,-.2));
 assert.deepEqual(uniforms.get('uCenter'),[g.body.position.x,g.body.position.y,g.body.position.z]);assert.deepEqual(uniforms.get('uQuaternion'),[g.body.quaternion.x,g.body.quaternion.y,g.body.quaternion.z,g.body.quaternion.w]);
 redraw(()=>t.getVisuals().outlineWidth=4);redraw(()=>{t.canvas.clientWidth=900;t.canvas.clientHeight=600;});redraw(()=>t.heldFocus.focal+=.1);assert.deepEqual(uniforms.get('uOutlineStroke'),[4,600]);
 redraw(()=>t.cullingLab.renderView={eye:[.4,1.2,4],basis:{forward:t.V(0,0,-1),up:t.V(0,1,0),right:t.V(1,0,0)}});redraw(()=>t.cullingLab.renderView=null);
 t.getVisuals().outlineColor='#ff0000';t.drawRigidOutline(g,.4,true);assert.equal(uploads.length,count,'color/alpha are uniforms');assert.deepEqual(uniforms.get('uTint'),[1,0,0,.4]);
 for(let frame=0;frame<60;frame++){t.setLook({yaw:frame*.002,pitch:-.3+frame*.001});g.body.position.z-=.001;g.body.quaternion.setFromEuler(frame*.002,.3,-.2);t.drawRigidOutline(g,.85,frame%2===0);}assert.equal(uploads.length,count,'camera, carrying and selection changes reuse the same buffer');
 t.drawRigidOutline(g,.85,false);assert.deepEqual(uniforms.get('uKind'),[19]);assert.equal(g.outlineCache.batches.length,1,'mixed outlines retain per-piece colors inside one draw');t.drawRigidOutline(g,.85,true);assert.deepEqual(uniforms.get('uKind'),[18]);assert.equal(uploads.length,count);
 const old=g.outlineCache.batches.map(b=>b.buffer);g.parts=g.parts.slice();t.drawRigidOutline(g,.85,true);assert(old.every(b=>!live.has(b)),'replaced geometry releases the old buffers');
 assert.equal(uploads.length,count+1,'a topology change creates one replacement buffer');
});

test('rotor selection transforms only its endpoints, not every part of every visible assembly',()=>{
 const instrumented=source.replace(/\}\)\(\);\s*$/,`const realPartPose=partPose,realPoses=poses;window.__outlinePartTransforms=[];window.__outlineGroupTransforms=[];
 partPose=(g,part,...args)=>{window.__outlinePartTransforms.push(part.id);return realPartPose(g,part,...args);};
 poses=(g,...args)=>{window.__outlineGroupTransforms.push(g.body.id);return realPoses(g,...args);};})();`);
 const {t,sandbox}=fixture(instrumented);structure(t,487);const p=t.V(.2,.4,0),flip=t.Q();flip.setFromAxisAngle(t.V(0,0,1),Math.PI);
 const a=t.makeGroup([{id:t.allocateUnitId(),shape:'coupler',weight:1,p,q:t.Q()}]),b=t.makeGroup([{id:t.allocateUnitId(),shape:'coupler',weight:1,p:p.vadd(t.V(0,2*.09*51/56,0)),q:flip}]);
 const rotor=t.connectRotorTips(a.parts[0].id,b.parts[0].id);assert(rotor);t.toggleRotorSelection(rotor);Object.assign(t.getVisuals(),{style:'psx',markers:false});
 sandbox.__outlinePartTransforms.length=0;sandbox.__outlineGroupTransforms.length=0;sandbox.__drawStructureOutlines();
 assert.deepEqual(Array.from(sandbox.__outlineGroupTransforms),[]);assert.deepEqual(Array.from(sandbox.__outlinePartTransforms).sort((a,b)=>a-b),[rotor.aId,rotor.bId].sort((a,b)=>a-b));
});

test('cached projected bounds preserve every visible material corner and refresh with the camera and body',()=>{
 const {t,sandbox}=fixture(),g=structure(t,487),bounds=sandbox.__selectionScreenBounds;
 const reference=()=>{const points=t.poses(g).flatMap(p=>t.corners(p)).map(t.project).filter(Boolean);return points.length?{left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))}:null;};
 for(const camera of [[.2,1.3,3],[-.2,.5,.2],[0,1,-5]]){
  t.setLook({camera,yaw:.1,pitch:-.2});g.body.quaternion.setFromEuler(.2,-.3,.1);const expected=reference(),actual=bounds(g);if(expected)for(const key of Object.keys(expected))assert(Math.abs(actual[key]-expected[key])<1e-6,key);else assert.equal(actual,null);
  assert.equal(bounds(g),actual,'stationary bounds are reused');g.body.position.z-=.01;const moved=bounds(g);if(moved)for(const key of Object.keys(moved))assert(Math.abs(moved[key]-reference()[key])<1e-6,key);
 }
});
