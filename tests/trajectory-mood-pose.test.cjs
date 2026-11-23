const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

// Record production draw transforms and uploaded geometry. This checks the
// body/face/outline relationship without claiming to render GPU pixels.
function fixture(role=null){
 let next=0,bound=null;const draws=[],buffers=new Map(),uniforms=new Map();
 const gl=new Proxy({
  getShaderParameter:()=>true,getProgramParameter:()=>true,isContextLost:()=>false,getParameter:()=>8192,getExtension:()=>null,getError:()=>0,
  createTexture:()=>++next,createShader:()=>++next,createProgram:()=>++next,createBuffer:()=>++next,
  bindBuffer:(_,id)=>{bound=id;},bufferData:(_,data)=>buffers.set(bound,Array.from(data)),
  getAttribLocation:(_,name)=>name,getUniformLocation:(_,name)=>name,
  uniform1f:(name,...value)=>uniforms.set(name,value),uniform2f:(name,...value)=>uniforms.set(name,value),
  uniform3f:(name,...value)=>uniforms.set(name,value),uniform4f:(name,...value)=>uniforms.set(name,value),
  drawArrays:(_,first,count)=>draws.push({buffer:bound,first,count,uniforms:Object.fromEntries(uniforms)}),
 },{get:(object,key)=>key in object?object[key]:/^[A-Z_]+$/.test(key)?0:()=>{}});
 const game=createGame({gl,graphics:false}),{t,sandbox}=game;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle',encounter:null});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 Object.assign(t.getVisuals(),{markers:false,style:'cel',outlineWidth:3});
 const g=t.addQubit([.12,.3,-.18]),part=g.parts[0];assert(g.block,'fixture must use the ordinary cube body and outline paths');
 g.body.sleep();
 if(role){
  part.mood.trajectory={version:1,level:1,face:0,role,routeId:null};
  assert(t.onTrajectoryPartChanged(g,part));
  if(role==='beacon')assert(t.getTrajectorySystem().createStart(part.id).ok);
 }
 return {...game,g,part,draws,buffers};
}
const xyz=v=>[v.x,v.y,v.z];
const xyzw=q=>[q.x,q.y,q.z,q.w];
function close(actual,expected,message){
 assert.equal(actual.length,expected.length,message);
 actual.forEach((value,i)=>assert(Math.abs(value-expected[i])<1e-10,`${message}: ${value} != ${expected[i]}`));
}
function excite(part,state){Object.assign(part.mood,{state,blend:state==='excited'?[0,1,0]:[0,0,1],severity:2,energy:.9});}
function physical(g){
 return JSON.stringify({p:g.body.position,q:g.body.quaternion,v:g.body.velocity,w:g.body.angularVelocity,
  force:g.body.force,torque:g.body.torque,mass:g.body.mass,type:g.body.type,sleep:g.body.sleepState,
  parts:g.parts.map(p=>({id:p.id,weight:p.weight,offset:p.offset,q:p.q}))});
}
function capture({t,g,draws}){
 draws.length=0;t.drawGroupSolid(g);t.drawTrajectories();t.drawStructureOutlines();
 const one=kind=>{const matching=draws.filter(draw=>draw.uniforms.uKind?.[0]===kind);assert.equal(matching.length,1,`expected one production draw of kind ${kind}`);return matching[0];};
 return {solid:one(1),outline:one(18),face:draws.some(d=>d.uniforms.uKind?.[0]===20)?one(20):null,housing:draws.some(d=>d.uniforms.uKind?.[0]===3)?one(3):null};
}

test('excited and restless beacons and receivers keep body, face and outline on one physical pose',()=>{
 for(const role of ['beacon','receiver']){
  const game=fixture(role),{t,g,part,buffers}=game;
  for(const mood of ['excited','restless']){
   excite(part,mood);g.body.quaternion.setFromEuler(...(mood==='excited'?[.23,.47,-.19]:[0,0,Math.PI/2]));
   const before=physical(g),beforeMood=JSON.stringify(part.mood),pose=t.blockPose(g),rendered=capture(game);
   close(rendered.solid.uniforms.uCenter,xyz(pose.p),`${role}/${mood} solid stays on its collider`);
   close(rendered.solid.uniforms.uQuaternion,xyzw(pose.q),`${role}/${mood} solid rotation`);
   close(rendered.outline.uniforms.uCenter,rendered.solid.uniforms.uCenter,'outline centre');
   close(rendered.outline.uniforms.uQuaternion,rendered.solid.uniforms.uQuaternion,'outline rotation');
   close(rendered.outline.uniforms.uDimensions,rendered.solid.uniforms.uDimensions.map(n=>n+.0009),'outline padding');
   for(const [draw,offset] of [[rendered.housing,.0453],[rendered.face,.0458]]){
    assert(draw,'trajectory adaptation must actually draw its face and housing');
    close(draw.uniforms.uQuaternion,rendered.solid.uniforms.uQuaternion,'face/housing rotates with body');
    close(draw.uniforms.uCenter,xyz(pose.p.vadd(pose.q.vmult(t.V(offset,0,0)))),'face/housing offset follows physical +X');
   }
   close(rendered.face.uniforms.uDimensions,[1,.072,.072],'glyph keeps its complete square');
   const face=buffers.get(rendered.face.buffer);assert.equal(rendered.face.count,6);assert.equal(face.length,36);
   for(let i=0;i<face.length;i+=6){assert.equal(face[i],0);assert.equal(Math.abs(face[i+1]),.5);assert.equal(Math.abs(face[i+2]),.5);close(face.slice(i+3,i+6),[1,0,0],'glyph plane normal');}
   assert.equal(t.moodVisualPose(g,pose),pose,'no separate emotional transform is allocated for the adapted cube');
   assert.equal(physical(g),before,'drawing preserves the sleeping body and physical quantities');
   assert.equal(JSON.stringify(part.mood),beforeMood,'drawing preserves emotion, energy and adaptation');
  }
 }
});

test('ordinary cubes still animate both moods and their outlines follow the animated solid',()=>{
 const game=fixture(),{t,g,part}=game;g.body.quaternion.setFromEuler(.12,.29,-.07);
 for(const mood of ['excited','restless']){
  excite(part,mood);const before=physical(g),beforeMood=JSON.stringify(part.mood),pose=t.blockPose(g),visual=t.moodVisualPose(g,pose);
  assert.notEqual(visual,pose);assert(visual.p.distanceTo(pose.p)>0||xyzw(visual.q).some((n,i)=>Math.abs(n-xyzw(pose.q)[i])>1e-8),'ordinary cube retains an actual gesture');
  const {solid,outline,face}=capture(game);assert.equal(face,null);
  close(solid.uniforms.uCenter,xyz(visual.p),'ordinary animated centre');close(solid.uniforms.uQuaternion,xyzw(visual.q),'ordinary animated rotation');
  close(outline.uniforms.uCenter,solid.uniforms.uCenter,'ordinary outline centre');close(outline.uniforms.uQuaternion,solid.uniforms.uQuaternion,'ordinary outline rotation');
  assert.equal(physical(g),before);assert.equal(JSON.stringify(part.mood),beforeMood);
 }
});

test('removing either adaptation restores the existing mood gesture without changing charge or physics',()=>{
 for(const role of ['beacon','receiver'])for(const mood of ['excited','restless']){
  const game=fixture(role),{t,g,part}=game;excite(part,mood);
  const before=physical(g),pose=t.blockPose(g),expectedMood=JSON.parse(JSON.stringify(part.mood));delete expectedMood.trajectory;
  assert.equal(t.moodVisualPose(g,pose),pose);
  assert(t.removeTrajectoryAdaptation(part.id).ok);assert.equal(t.getTrajectorySystem().nodes.has(part.id),false);
  assert.deepEqual(JSON.parse(JSON.stringify(part.mood)),expectedMood);assert.equal(physical(g),before);
  const visual=t.moodVisualPose(g,pose);assert.notEqual(visual,pose);
  const {solid,face}=capture(game);assert.equal(face,null,'removed adaptation has no face left behind');
  close(solid.uniforms.uCenter,xyz(visual.p),'restored gesture centre');close(solid.uniforms.uQuaternion,xyzw(visual.q),'restored gesture rotation');
  assert.equal(physical(g),before);
 }
});

test('adapted cubes continue emotional transitions and energy recovery while their visual pose stays rigid',()=>{
 for(const role of ['beacon','receiver']){
  const {t,g,part}=fixture(role),m=part.mood,before=physical(g);
  Object.assign(m,{state:'neutral',blend:[1,0,0],energy:1,calm:0,idle:0,fullTime:7,agitation:0});
  t.updateMoods(.1);assert.equal(m.state,'excited');assert(m.blend[1]>0);
  let pose=t.blockPose(g);assert.equal(t.moodVisualPose(g,pose),pose);
  m.energy=.01;t.updateMoods(.01);assert.equal(m.state,'restless');assert(m.energy>.01);assert(m.blend[2]>0);
  pose=t.blockPose(g);assert.equal(t.moodVisualPose(g,pose),pose);
  Object.assign(m,{energy:.5,restLeft:0,agitation:0});t.updateMoods(.1);assert.equal(m.state,'neutral');assert(m.energy>.5);
  assert.equal(m.trajectory.role,role);assert.equal(physical(g),before,'mood updates still leave the physical body untouched');
 }
});
