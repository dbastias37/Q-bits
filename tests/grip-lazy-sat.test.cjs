const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
function setup(){const {t}=createGame();t.clearNarrativeScene();return t;}

test('a separated convex hand pair postpones edge projections and still blocks when the gap closes',()=>{
 const t=setup(),a={shape:'coupler',p:t.V(0,1,0),q:t.Q()},b={shape:'coupler',p:t.V(.2,1,0),q:t.Q()},contact=t.gripTranslationContact(t.collisionEntry(a),t.collisionEntry(b));
 assert.equal(contact.intervals.length,0,'contact preparation does not eagerly project all convex edges');
 assert.equal(t.gripTranslatedDepth(contact,t.V()),0);const firstCount=contact.intervals.length;
 const closed=t.V(.2,0,0),expected=t.gripPenetration({...a,p:a.p.vadd(closed)},b),after=t.gripTranslatedDepth(contact,closed);
 assert(expected>.00035);assert(Math.abs(after-expected)<1e-12,'the previously separated axes are retained when the hand closes the gap');
 assert(contact.intervals.length>firstCount*8,'only a small prefix was needed for the separated pair');assert.equal(contact.depth,0,'original penetration remains exact after completing the lazy intervals');
 assert.equal(t.gripTranslatedDepth(contact,t.V(.4,0,0)),0,'the opposite side remains a real gap');
});

test('lazy SAT translation agrees with the independent full convex query through repeated rotations and offsets',()=>{
 const t=setup();let seed=191;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};let blocked=0,clear=0,partial=0;
 for(let sample=0;sample<80;sample++){
  const q=t.Q(),r=t.Q();q.setFromEuler(random()*2,random()*2,random()*2);r.setFromEuler(random()*2,random()*2,random()*2);
  const a={shape:['cube','coupler','pyramid','tetra'][sample%4],p:t.V((random()-.5)*.2,1,(random()-.5)*.2),q},b={shape:['coupler','cube','tetra','pyramid'][sample%4],p:t.V(0,1,0),q:r};
  const contact=t.gripTranslationContact(t.collisionEntry(a),t.collisionEntry(b));
  for(let move=0;move<9;move++){
   const shift=move===0?t.V(.4,0,0):t.V((random()-.5)*.2,(random()-.5)*.12,(random()-.5)*.2),expected=t.gripPenetration({...a,p:a.p.vadd(shift)},b),actual=t.gripTranslatedDepth(contact,shift);
   assert(Math.abs(actual-(expected<=.00035?0:expected))<1e-9);if(actual)blocked++;else clear++;
   if(move===0&&contact.intervals.length<contact.aa.normals.length+contact.bb.normals.length)partial++;
  }
  assert(Math.abs(contact.depth-t.gripPenetration(a,b))<1e-9);
 }
 assert(blocked>20&&clear>100&&partial>20,'both real overlap and lazily rejected gaps must be exercised');
});
