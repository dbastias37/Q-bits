const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

function fixture(){
 let next=0,bound=null;const draws=[],uploads=[],buffers=new Map(),uniforms=new Map(),live=new Set();
 const gl=new Proxy({
  getShaderParameter:()=>true,getProgramParameter:()=>true,isContextLost:()=>false,getParameter:()=>8192,getExtension:()=>null,getError:()=>0,checkFramebufferStatus:()=>0,
  createTexture:()=>++next,createFramebuffer:()=>++next,createRenderbuffer:()=>++next,createShader:()=>++next,createProgram:()=>++next,
  createBuffer:()=>{const id=++next;live.add(id);return id;},deleteBuffer:id=>live.delete(id),
  bindBuffer:(_,id)=>{bound=id;},bufferData:(_,data)=>{buffers.set(bound,Array.from(data));uploads.push(bound);},
  getAttribLocation:(_,name)=>name,getUniformLocation:(_,name)=>name,
  uniform1f:(name,...value)=>uniforms.set(name,value),uniform2f:(name,...value)=>uniforms.set(name,value),
  uniform3f:(name,...value)=>uniforms.set(name,value),uniform4f:(name,...value)=>uniforms.set(name,value),
  drawArrays:(mode,first,count)=>draws.push({buffer:bound,first,count,uniforms:Object.fromEntries(uniforms)}),
 },{get:(object,key)=>key in object?object[key]:/^[A-Z_]+$/.test(key)?0:()=>{}});
 const game=createGame({gl,graphics:false}),{t}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});
 Object.assign(t.getVisuals(),{markers:false,style:'cel',outlineWidth:3,outlineColor:'#30b5c4'});t.canvas.width=1280;t.canvas.height=720;
 t.setLook({camera:[.4,.5,1],yaw:0,pitch:-.2});uploads.length=0;draws.length=0;
 return {...game,draws,uploads,buffers,live};
}
function block(t,nx=1,ny=1,nz=1){
 const parts=[];
 for(let x=0;x<nx;x++)for(let y=0;y<ny;y++)for(let z=0;z<nz;z++)parts.push({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V((x-(nx-1)/2)*.09,.3+(y-(ny-1)/2)*.09,(z-(nz-1)/2)*.09),q:t.Q()});
 const g=t.makeGroup(parts);assert(g.block,'fixture must use the regular block path');return g;
}
const xyz=v=>[v.x,v.y,v.z];
const close=(actual,expected)=>{assert.equal(actual.length,expected.length);actual.forEach((value,i)=>assert(Math.abs(value-expected[i])<1e-10,`${value} != ${expected[i]}`));};

test('box outlines share twelve exterior edges across sizes, motion and scene replacement without new uploads',()=>{
 const {t,draws,uploads,buffers,live}=fixture(),g=block(t),rectangle=block(t,3,2,1);
 t.drawOutline(t.V(0,.3,0),t.Q(),t.V(.09,.09,.09));const first=draws.at(-1),data=buffers.get(first.buffer);
 assert.equal(first.count,72);assert.equal(data.length,72*9);
 const actualEdges=new Set();
 for(let offset=0;offset<data.length;offset+=6*9){
  const a=data.slice(offset,offset+3),b=data.slice(offset+3,offset+6);
  assert([...a,...b].every(value=>Math.abs(value)===.5),'the shared geometry must contain unit-box corners');
  assert.equal(a.filter((value,i)=>value!==b[i]).length,1,'each edge joins adjacent corners');
  actualEdges.add([a.join(','),b.join(',')].sort().join('|'));
 }
 assert.equal(actualEdges.size,12,'all twelve outer edges occur exactly once');
 for(let i=0;i<12;i++){
  const p=t.V(i*.03,.1+i*.02,-i*.04),q=t.Q();q.setFromEuler(i*.05,i*.04,-i*.03);
  t.drawOutline(p,q,i%2?rectangle.block.size:g.block.size,.37,i%3===0);
  assert.equal(draws.at(-1).buffer,first.buffer);close(draws.at(-1).uniforms.uCenter,xyz(p));
 }
 t.removeGroup(g);t.removeGroup(rectangle);assert(live.has(first.buffer),'removing a group must not dispose shared scene geometry');
 t.clearNarrativeScene();t.drawOutline(t.V(),t.Q(),t.V(.7,.2,.1));assert.equal(draws.at(-1).buffer,first.buffer);
 assert.equal(uploads.length,0,'pose, dimensions and scene replacement must use the existing upload');
});

test('box outline styles preserve selection color, alpha, width and geometric padding',()=>{
 const {t,draws,uploads}=fixture(),p=t.V(.2,.4,-.1),q=t.Q(),size=t.V(.27,.18,.09);q.setFromEuler(.2,.4,-.1);
 for(const {chosen,style,width,color} of [
  {chosen:true,style:'cel',width:6,color:[.12549019607843137,.7019607843137254,.8627450980392157]},
  {chosen:true,style:'clean',width:6,color:[.12549019607843137,.7019607843137254,.8627450980392157]},
  {chosen:false,style:'cel',width:6,color:[.06,.09,.1]},
  {chosen:false,style:'clean',width:1,color:[.48,.51,.54]},
 ]){
  Object.assign(t.getVisuals(),{style,outlineWidth:6,outlineColor:'#20b3dc'});t.drawOutline(p,q,size,.37,chosen);const draw=draws.at(-1);
  close(draw.uniforms.uCenter,xyz(p));close(draw.uniforms.uQuaternion,[q.x,q.y,q.z,q.w]);close(draw.uniforms.uDimensions,xyz(size).map(value=>value+.0009));
  close(draw.uniforms.uTint,[...color,.37]);assert.equal(draw.uniforms.uOutlineStroke[0],width);assert.equal(draw.uniforms.uOutlineStroke[1],t.canvas.clientHeight);
 }
 assert.equal(uploads.length,0);
});

test('a rotated regular block has one outer outline while open assemblies retain their actual gaps',()=>{
 const {t,draws,uploads}=fixture(),g=block(t,3,2,1);g.body.quaternion.setFromEuler(.23,.37,-.19);
 t.drawStructureOutlines();assert.equal(draws.length,1);const rectangular=draws[0];assert.equal(rectangular.count,72);close(rectangular.uniforms.uDimensions,[.2709,.1809,.0909]);
 t.removeGroup(g);const open=t.makeGroup([[0,0],[.09,0],[0,.09]].map(([x,y])=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(x,.3+y,0),q:t.Q()})));
 assert.equal(open.block,null);draws.length=0;t.drawStructureOutlines();assert.equal(draws.length,1);assert.equal(draws[0].count,3*72);assert.notEqual(draws[0].buffer,rectangular.buffer);
 assert.equal(uploads.length,1,'only the new irregular outline needs its own geometry');
});

test('moving and emotional block outlines follow the solid visual pose without changing sleeping physics or energy',()=>{
 const {t,draws}=fixture(),g=block(t),m=g.parts[0].mood;g.body.sleep();
 for(const [state,blend] of [['excited',[0,1,0]],['restless',[0,0,1]]]){
  Object.assign(m,{state,blend,severity:2});g.body.position.x+=.07;g.body.quaternion.setFromEuler(.04,.13,-.02);
  const physical=JSON.stringify({parts:t.worldParts(g),position:g.body.position,quaternion:g.body.quaternion,velocity:g.body.velocity,angularVelocity:g.body.angularVelocity,sleep:g.body.sleepState});
  draws.length=0;t.drawGroupSolid(g);const solid=draws.at(-1);t.drawStructureOutlines();const outline=draws.at(-1);
  close(outline.uniforms.uCenter,solid.uniforms.uCenter);close(outline.uniforms.uQuaternion,solid.uniforms.uQuaternion);
  close(outline.uniforms.uDimensions,solid.uniforms.uDimensions.map(value=>value+.0009));
  assert(outline.uniforms.uCenter.some((value,i)=>Math.abs(value-xyz(g.body.position)[i])>1e-8)||outline.uniforms.uQuaternion.some((value,i)=>Math.abs(value-[g.body.quaternion.x,g.body.quaternion.y,g.body.quaternion.z,g.body.quaternion.w][i])>1e-8),'fixture must actually animate the rendered pose');
  assert.equal(JSON.stringify({parts:t.worldParts(g),position:g.body.position,quaternion:g.body.quaternion,velocity:g.body.velocity,angularVelocity:g.body.angularVelocity,sleep:g.body.sleepState}),physical);
 }
});

test('shared box outlines retain sphere culling and current CSS stroke height',()=>{
 const {t,draws}=fixture();t.setLook({camera:[0,.3,1],yaw:0,pitch:0});t.beginVisibilityFrame();
 t.drawOutline(t.V(100,.3,0),t.Q(),t.V(.09,.09,.09));assert.equal(draws.length,0);
 t.canvas.clientHeight=1080;t.drawOutline(t.V(0,.3,0),t.Q(),t.V(.09,.09,.09));assert.equal(draws.length,1);assert.equal(draws[0].uniforms.uOutlineStroke[1],1080);
});
