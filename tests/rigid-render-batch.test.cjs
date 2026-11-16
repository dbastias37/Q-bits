const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
function fixture(options={}){
 let next=0,bound=null;const calls=[],uploads=new Map(),live=new Set(),attributes=new Map(),enabledAttributes=new Set();
 const gl=new Proxy({
  getShaderParameter:()=>true,getProgramParameter:()=>true,isContextLost:()=>false,getParameter:()=>8192,getExtension:()=>null,getError:()=>0,checkFramebufferStatus:()=>0,
  createTexture:()=>++next,createFramebuffer:()=>++next,createRenderbuffer:()=>++next,
  enableVertexAttribArray:location=>enabledAttributes.add(location),disableVertexAttribArray:location=>enabledAttributes.delete(location),
  createShader:()=>++next,createProgram:()=>++next,createBuffer:()=>{const id=++next;live.add(id);return id;},
  deleteBuffer:id=>{live.delete(id);calls.push(['delete',id]);},
  bindBuffer:(_,id)=>{bound=id;},bufferData:(_,data)=>{uploads.set(bound,Array.from(data));calls.push(['upload',bound]);},
  getAttribLocation:(_,name)=>{if(!attributes.has(name))attributes.set(name,attributes.size);return attributes.get(name);},getUniformLocation:(_,name)=>name,
  drawArrays:(mode,first,count)=>calls.push(['draw',bound,first,count,[...enabledAttributes]]),
 },{get:(o,key)=>key in o?o[key]:/^[A-Z_]+$/.test(key)?0:(...args)=>{}});
 const game=createGame({gl,graphics:options.graphics===true}),{t}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});
 calls.length=0;return {...game,calls,uploads,live,attributes,enabledAttributes};
}
function assembly(t,count=12){
 const orientation=t.Q();orientation.setFromEuler(.12,.26,-.31);const parts=[];
 for(let i=0;i<count;i++){const q=t.Q();q.setFromEuler(i*.17,i*.09,i*.05);parts.push({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V((i%4)*.15,.4+Math.floor(i/4)*.12,(i%3)*.11),q});}
 const group=t.makeGroup(parts,orientation);assert.equal(group.block,null);return group;
}
const close=(a,b,tolerance=2e-7)=>assert(Math.abs(a-b)<tolerance,`${a} != ${b}`);

test('an irregular rigid assembly uses one cube draw with original piece-local shading and world vertices',()=>{
 const {t,calls,uploads}=fixture(),g=assembly(t),state=JSON.stringify(t.worldParts(g));t.drawGroupSolid(g);
 const draws=calls.filter(x=>x[0]==='draw');assert.equal(draws.length,1);assert.equal(draws[0][3],12*36);
 const data=uploads.get(draws[0][1]);assert.equal(data.length,12*36*12);
 for(let part=0;part<g.parts.length;part++)for(let vertex=0;vertex<36;vertex++){
  const at=(part*36+vertex)*12,p=g.parts[part],pose=t.poses(g)[part];
  const piece=t.V(...data.slice(at+6,at+9)),normal=t.V(...data.slice(at+9,at+12));
  assert.equal(Math.max(Math.abs(piece.x),Math.abs(piece.y),Math.abs(piece.z)),.5);
  close(normal.norm(),1);const expected=pose.q.vmult(piece.scale(.09)).vadd(pose.p),actual=g.body.quaternion.vmult(t.V(...data.slice(at,at+3))).vadd(g.body.position);
  const actualNormal=g.body.quaternion.vmult(t.V(...data.slice(at+3,at+6))),expectedNormal=pose.q.vmult(normal);
  for(const axis of ['x','y','z']){close(actual[axis],expected[axis]);close(actualNormal[axis],expectedNormal[axis]);}
 }
 assert.equal(JSON.stringify(t.worldParts(g)),state,'rendering cannot change material, poses or energy');
});

test('moving a rigid body reuses its mesh while changing geometry rebuilds and removal frees GPU memory',()=>{
 const {t,calls,live}=fixture(),g=assembly(t);t.drawGroupSolid(g);const entry=g.rigidCubeBatch,initialUploads=calls.filter(x=>x[0]==='upload').length;
 for(let i=0;i<30;i++){g.body.position.x+=.01;g.body.quaternion.setFromEuler(i*.01,i*.02,i*.03);t.drawGroupSolid(g);assert.equal(g.rigidCubeBatch,entry);}
 assert.equal(calls.filter(x=>x[0]==='upload').length,initialUploads);assert(live.has(entry.buffer));
 g.parts[0].offset.x+=.01;t.drawGroupSolid(g);assert.notEqual(g.rigidCubeBatch.buffer,entry.buffer);assert.equal(live.has(entry.buffer),false);
 const final=g.rigidCubeBatch.buffer;t.removeGroup(g);assert.equal(live.has(final),false);assert.equal(g.rigidCubeBatch,undefined);
});

test('battery conversion invalidates membership and preserves separate battery and coupler rendering',()=>{
 const {t,calls}=fixture(),g=assembly(t);t.drawGroupSolid(g);const old=g.rigidCubeBatch.buffer,p=g.parts[0];
 p.mood.externalBattery={version:1,ownerId:p.id,packId:p.id,enabled:false};
 g.parts[1].shape='coupler';calls.length=0;t.drawGroupSolid(g);
 assert.notEqual(g.rigidCubeBatch.buffer,old);assert.equal(g.rigidCubeBatch.count,10*36);
 const draws=calls.filter(x=>x[0]==='draw');assert(draws.some(x=>x[3]===30),'coupler body remains separate');assert(draws.some(x=>x[3]===12),'coupler metallic tip remains separate');
 assert(draws.filter(x=>x[3]===36).length>=4,'battery cap, base and contacts remain visible');
 delete p.mood.externalBattery;t.drawGroupSolid(g);assert.equal(g.rigidCubeBatch.count,11*36);
});

test('loose pieces, small assemblies and regular solid blocks keep their existing render paths',()=>{
 const {t,calls}=fixture(),small=assembly(t,3);t.drawGroupSolid(small);assert.equal(calls.filter(x=>x[0]==='draw').length,3);assert.equal(small.rigidCubeBatch,undefined);
 const block=t.makeGroup(Array.from({length:8},(_,i)=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V((i%2)*.09,.5+Math.floor(i/4)*.09,Math.floor(i/2)%2*.09),q:t.Q()})));assert(block.block);calls.length=0;t.drawGroupSolid(block);assert.equal(calls.filter(x=>x[0]==='draw').length,1);assert.equal(block.rigidCubeBatch,undefined);
});


test('postprocess receives only its own attributes and scene restores all four streams afterward',()=>{
 const {t,calls,attributes,enabledAttributes}=fixture({graphics:true});assembly(t);Object.assign(t.getVisuals(),{bloom:true,bloomStrength:20,dither:0,bits:8});
 t.renderScene();const fullscreen=attributes.get('aScreen');assert.notEqual(fullscreen,undefined,'production postprocess was active');
 const postDraws=calls.filter(call=>call[0]==='draw'&&call[4].includes(fullscreen));assert(postDraws.length>0);
 for(const draw of postDraws)assert.deepEqual(draw[4],[fullscreen],'stale scene streams must not reach another shader');
 for(const name of ['aPosition','aNormal','aPiecePosition','aPieceNormal'])assert(enabledAttributes.has(attributes.get(name)),name+' restored');
 assert.equal(enabledAttributes.has(fullscreen),false);
});


test('restoring a battery to an ordinary solid block releases the now-unused cached mesh',()=>{
 const {t,live}=fixture(),g=t.makeGroup(Array.from({length:6},(_,i)=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(i*.09,.5,0),q:t.Q()})));assert(g.block);
 const p=g.parts[0];p.mood.externalBattery={version:1,ownerId:p.id,packId:p.id,enabled:false};t.drawGroupSolid(g);const buffer=g.rigidCubeBatch.buffer;assert(live.has(buffer));
 delete p.mood.externalBattery;t.drawGroupSolid(g);assert.equal(live.has(buffer),false);assert.equal(g.rigidCubeBatch,undefined);
});

test('mixed T-bits and couplers batch by original material while preserving every vertex and releasing all buffers',()=>{
 const {t,calls,uploads,live}=fixture(),g=assembly(t,16);for(let i=0;i<g.parts.length;i++)g.parts[i].shape=['cube','tetra','pyramid','coupler'][i%4];
 const before=JSON.stringify(t.worldParts(g));t.drawGroupSolid(g);const batches=g.rigidCubeBatch.batches;
 assert.equal(batches.length,4);assert.equal(calls.filter(c=>c[0]==='draw').length,4);
 const vertices=batches.reduce((sum,b)=>sum+b.count,0);assert.equal(vertices,4*(36+12+18+42));
 // Each local vertex stream must transform through the same original piece.
 for(const batch of batches){const data=uploads.get(batch.buffer);for(let i=0;i<data.length;i+=12){const local=t.V(...data.slice(i,i+3)),piece=t.V(...data.slice(i+6,i+9));assert(g.parts.some(p=>{if(batch.key==='cube'&&p.shape!=='cube'||batch.key==='tbit'&&!['tetra','pyramid'].includes(p.shape)||['coupler','tip'].includes(batch.key)&&p.shape!=='coupler')return false;return p.q.vmult(piece.scale(.09)).vadd(p.offset).distanceTo(local)<2e-7;}));}}
 assert.equal(JSON.stringify(t.worldParts(g)),before);const ids=batches.map(b=>b.buffer);g.body.position.y+=.2;calls.length=0;t.drawGroupSolid(g);assert.equal(calls.filter(c=>c[0]==='upload').length,0);t.removeGroup(g);assert(ids.every(id=>!live.has(id)));
});
