const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
function fixture(){const game=createGame();game.t.clearNarrativeScene();return game;}

test('conveyor recipes use conserved existing solids, three real axles and optional four-piece supports',()=>{
 const {t}=fixture();
 for(const kind of ['straight','left','right'])for(const supports of [false,true]){
  const r=t.conveyorBlueprintTemplate(kind,supports),parts=r.groups.flatMap(g=>g.parts),recipe=r.conveyors[0];
  assert(t.savedMechanismValid(r));assert.equal(r.groups.length,4);assert.equal(r.joints.length,3);
  assert.equal(parts.filter(p=>p.shape==='coupler').length,12);
  assert.equal(parts.filter(p=>p.shape==='cube').length,(kind==='straight'?18:29)+(supports?4:0));
  assert(parts.every(p=>p.weight===1&&['cube','coupler'].includes(p.shape)));
  assert.equal(recipe.required.length,kind==='straight'?30:41);assert.equal(parts.length-recipe.required.length,supports?4:0);assert(recipe.required.every(key=>parts.some(p=>p.key===key)));
  assert.equal(recipe.kind,kind);assert(r.joints.every(j=>j.mount==='wheel'&&!j.enabled));
  assert.equal(new Set(parts.map(p=>p.key)).size,parts.length);
  assert.equal(recipe.ports.entry.direction[0],1);
  assert.equal(recipe.ports.exit.direction[kind==='straight'?0:2],kind==='left'?-1:1);
 }
 const first=t.conveyorBlueprintTemplate();first.groups[0].parts[0].p[0]=100;
 assert(t.savedMechanismValid(t.conveyorBlueprintTemplate()),'editing a placed recipe cannot corrupt the catalogue');
});

test('every roller clears its chassis and neighboring rollers throughout a full square rotation',()=>{
 const {t}=fixture();
 for(const kind of ['straight','left','right']){
  const original=t.mechanismRecordParts(t.conveyorBlueprintTemplate(kind));
  for(let angle=0;angle<90;angle+=5){
   const rigid=original.map(parts=>parts.map(p=>({...p,p:p.p.clone(),q:p.q.clone()})));
   for(let i=1;i<rigid.length;i++){
    const pivot=rigid[i].find(p=>p.shape==='cube').p.clone(),axis=t.couplerTip(rigid[i][0]).axis,q=t.Q();q.setFromAxisAngle(axis,angle*Math.PI/180);
    for(const p of rigid[i]){p.p=pivot.vadd(q.vmult(p.p.vsub(pivot)));p.q=q.mult(p.q);}
   }
   for(let i=0;i<rigid.length;i++)for(let j=i+1;j<rigid.length;j++)for(const a of rigid[i])for(const b of rigid[j])
    assert(!t.obbOverlap(a,b,.00001),`${kind} at ${angle}° intersects parts ${a.key}/${b.key}`);
  }
 }
});

test('straight sections and both elbows join through actual complete square faces at their ports',()=>{
 const {t}=fixture();
 function point(r,name){const c=r.conveyors[0],base=r.groups.flatMap(g=>g.parts).find(p=>p.key===c.base),q=t.Q();q.set(...base.q);return t.V(...base.p).vadd(q.vmult(t.V(...c.ports[name].p)));}
 for(const before of ['straight','left','right'])for(const after of ['straight','left','right']){
  const a=t.conveyorBlueprintTemplate(before),b=t.conveyorBlueprintTemplate(after),out=a.conveyors[0].ports.exit.direction,rotation=t.Q();rotation.setFromVectors(t.V(1,0,0),t.V(...out));
  const delta=point(a,'exit').vsub(rotation.vmult(point(b,'entry'))),aa=t.mechanismRecordParts(a),bb=t.mechanismRecordParts(b).map(parts=>parts.map(p=>({...p,p:delta.vadd(rotation.vmult(p.p)),q:rotation.mult(p.q)})));
  assert(aa[0].some(p=>bb[0].some(q=>t.touchingUnitFaces(p,q))),`${before} to ${after} must join physical chassis faces`);
  for(const p of aa.flat())for(const q of bb.flat())assert(!t.obbOverlap(p,q,.00001),`${before} to ${after} overlaps ${p.key}/${q.key}`);
 }
});
