const test = require('node:test');
const assert = require('node:assert/strict');
const opening = require('../assets/js/opening.js');

test('the title has one independently addressable cube for each of its 69 font dots', () => {
  const pieces = opening.makePieces();
  assert.equal(pieces.length, 69);
  assert.equal(new Set(pieces.map(p => p.target.join(','))).size, 69);
  assert.equal(new Set(pieces.map(p => p.id)).size, 69);
  for (const p of pieces) {
    assert.ok(p.target.every(Number.isFinite));
    assert.ok(Math.hypot(p.start[0], p.start[2]) > 10, 'cube must enter from outside the title');
  }
  pieces[0].target[0] = 100;
  assert.notEqual(opening.makePieces()[0].target[0], 100, 'instances must not modify font data');
});

for (const rate of [30, 60, 120]) test(`all cubes physically settle before the glow at ${rate} FPS`, () => {
  const pieces = opening.makePieces(), step = 1 / rate;
  for (let frame = 1; frame <= Math.ceil(40 * rate); frame++) opening.updatePieces(pieces, frame * step, step);
  assert.equal(pieces.filter(p => p.settled).length, 69);
  for (const p of pieces) {
    assert.ok(Math.hypot(...p.p.map((v, i) => v - p.target[i])) < .012);
    assert.ok([...p.p, ...p.v, p.angle].every(Number.isFinite));
  }
  for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
    assert.ok(Math.hypot(pieces[i].p[0] - pieces[j].p[0], pieces[i].p[2] - pieces[j].p[2]) > .335, 'settled cubes must not overlap');
  }
});

test('rolling lifts the center around a support edge and replans around an obstacle',()=>{
 const p=opening.makePieces().slice(0,2);p[0].p=[0,.1675,0];p[0].target=[1.005,.1675,0];p[0].delay=0;
 p[1].p=[.40,.1675,0];p[1].settled=true;
 opening.updatePieces(p,2,.06);
 assert.ok(p[0].p[1]>.2);assert.ok(p[0].rollAngle>0);assert.ok(Math.abs(p[0].p[2])>0,'detour must avoid blocked forward step');
 for(let t=2;t<12;t+=1/60)opening.updatePieces(p,t,1/60);
 assert.equal(p[0].settled,true);assert.ok(p[0].replans>0);
});

test('one continuous flight lands on the menu without a projection jump',()=>{
 const target=[-.4408,.1675,0];
 for(const aspect of [.45,1,16/9,3]){
  let previous=null;
  for(let i=0;i<=1200;i++){
   const view=opening.flightCamera(i/1200,aspect,target);
   const m=opening.menuSurface(view,aspect,1280,1280/aspect,target);
   assert.ok([...view.eye,...view.at,...m].every(Number.isFinite));
   assert.ok(view.eye[1]>view.at[1]);
   if(previous){
    assert.ok(Math.hypot(...view.eye.map((v,k)=>v-previous.eye[k]))<.25,'position is continuous');
    const corners=[[0,0],[1280,0],[1280,1280/aspect],[0,1280/aspect]];
    const project=(matrix,[x,y])=>[(matrix[0]*x+matrix[4]*y+matrix[12])/(matrix[3]*x+matrix[7]*y+matrix[15]),(matrix[1]*x+matrix[5]*y+matrix[13])/(matrix[3]*x+matrix[7]*y+matrix[15])];
    for(const c of corners){const now=project(m,c),before=project(previous.m,c);assert.ok(Math.hypot(now[0]-before[0],now[1]-before[1])<30,'no up-vector flip or surface jump');}
   }
   previous={...view,m};
  }
  const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  previous.m.forEach((v,i)=>assert.ok(Math.abs(v-identity[i])<.001,'menu lands at its unchanged DOM layout'));
  for(const t of [0,1]){const a=opening.flightCamera(t,aspect,target),b=opening.flightCamera(t===0?.0001:.9999,aspect,target);assert.ok(Math.hypot(...a.eye.map((v,i)=>v-b.eye[i]))<.0001,'zero endpoint velocity');}
 }
});

test('reduced motion removes the orbit and banking while keeping the same menu landing',()=>{
 const target=[0,.1675,0];
 for(const t of [0,.2,.5,.8,1]){const c=opening.flightCamera(t,.45,target,true);assert.equal(c.eye[0],0);assert.equal(c.eye[2],0);assert.equal(c.roll,0);}
 assert.deepEqual(opening.flightCamera(1,.45,target,true).eye,opening.flightCamera(1,.45,target,false).eye);
});

test('descending spiral completes one calm orbit with zero bank and no radial or vertical reversals',()=>{
 assert.equal(opening.TIMING.flight,9.5);assert.equal(opening.TIMING.menuReveal,1.2);
 const target=[-.4408,.1675,0];
 for(const aspect of [.45,1,16/9,3]){
  let last=null,peakSpeed=0,quadrants=new Set();
  for(let i=0;i<=1000;i++){
   const t=i/1000,c=opening.flightCamera(t,aspect,target),u=t*t*t*(t*(t*6-15)+10);
   const x=c.eye[0]-target[0],z=c.eye[2]-target[2];
   if(Math.hypot(x,z)>.001)quadrants.add((x>=0?'R':'L')+(z>=0?'F':'B'));
   assert.equal(c.roll,0,'no bank at any point');
   if(last){assert.ok(c.eye[1]<=last.eye[1],'height never rises');assert.ok(Math.hypot(x,z)<=Math.hypot(last.eye[0]-target[0],last.eye[2]-target[2])+1e-10,'radius never expands');}
   if(last)peakSpeed=Math.max(peakSpeed,Math.hypot(...c.eye.map((v,j)=>v-last.eye[j]))/(opening.TIMING.flight/1000));
   last=c;
  }
  assert.equal(quadrants.size,4,'camera travels around the title instead of dropping straight down');
  assert.ok(peakSpeed<9,'no aggressive speed spike');
  assert.equal(opening.nearArrival(opening.flightCamera(.5,aspect,target),aspect,target),false);
  assert.equal(opening.nearArrival(opening.flightCamera(1,aspect,target),aspect,target),true);
 }
});

test('one population approaches together, keeps rolling sweeps apart, and completes without a delayed Q batch',()=>{
 const pieces=opening.makePieces(),half=.335/2;let finished=null;
 const halfWidth=(p,axis)=>half*(Math.abs(p.rollAxis[axis===0?2:0])>.1?Math.abs(Math.sin(p.rollAngle))+Math.abs(Math.cos(p.rollAngle)):1);
 for(let frame=1;frame<=60*24;frame++){
  opening.updatePieces(pieces,frame/60,1/60);
  if(frame===120)for(const p of pieces)assert.ok(Math.hypot(p.p[0]-p.start[0],p.p[2]-p.start[2])>.01,'every cube, including Q, approaches within the same opening interval');
  for(let i=0;i<pieces.length;i++)for(let j=i+1;j<pieces.length;j++){
   const a=pieces[i],b=pieces[j],dx=Math.abs(a.p[0]-b.p[0])-halfWidth(a,0)-halfWidth(b,0),dz=Math.abs(a.p[2]-b.p[2])-halfWidth(a,2)-halfWidth(b,2);
   assert.ok(dx>=-.000001||dz>=-.000001,'no overlapping rolling footprints');
  }
  if(pieces.every(p=>p.settled&&!p.home)){finished=frame/60;break;}
 }
 assert.ok(finished!==null&&finished<24,'formation converges without a second frozen population');
});
