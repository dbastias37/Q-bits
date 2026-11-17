const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
function pair(kind='straight'){
 const game=createGame(),{t}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});
 assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight'),t.V()));const first=t.conveyors[0],record=t.conveyorBlueprintTemplate(kind),placement=t.conveyorBlueprintPlacement(record,first),q=t.Q(),p=placement.point.clone();p.y-=.003;q.setFromAxisAngle(t.V(0,1,0),placement.quarterTurns*Math.PI/2);
 assert(t.spawnSavedMechanism(record,p,q));const second=t.conveyors[1],source=t.rotorPart(second.baseId).g,target=t.rotorPart(first.baseId).g;
 return {...game,first,second,source,target,candidate:{source,target,position:source.body.position.clone(),quaternion:source.body.quaternion.clone()}};
}
function state(t){return {ids:t.groups.flatMap(g=>g.parts.map(p=>p.id)).sort((a,b)=>a-b),groups:t.groups.slice(),bodies:t.world.bodies.slice(),constraints:t.world.constraints.slice()};}
function proxyOnlyPoint(t,conveyor){
 const base=t.rotorPart(conveyor.baseId).g,actual=t.groups.flatMap(g=>t.poses(g)).concat(t.conveyors.flatMap(c=>t.conveyorSurfacePoses(c)));
 for(const proxy of conveyor.virtual.proxies){
  const q=base.body.quaternion.mult(proxy.q),p=base.body.position.vadd(base.body.quaternion.vmult(proxy.offset)),pose={p,q,half:proxy.half};
  for(const a of [-1,1])for(const b of [-1,1])for(const along of [0,.03,-.03]){
   const point=p.vadd(q.vmult(t.V(a*(proxy.half.x+.045-.002),b*(proxy.half.y+.045-.002),along))),cube={p:point,q:t.Q()};
   if(point.y>.045&&t.obbOverlap(cube,pose,.000001)&&actual.every(other=>!t.obbOverlap(cube,other,.000001)))return point;
  }
 }return null;
}

test('joining conveyor mates retains full source roller envelopes against a foreign cube',()=>{
 const {t,second,candidate}=pair(),point=proxyOnlyPoint(t,second);assert(point,'fixture finds swept-envelope space outside every original solid and belt skin');
 const blocker=t.addQubit([point.x,point.y,point.z]),before=state(t);assert.equal(t.weld(candidate),null,'mate exception cannot remove the source envelope against a foreign obstacle');assert.deepEqual(state(t),before);
 t.removeGroup(blocker);assert(t.weld(candidate),'removing only the foreign obstacle restores the legitimate seam');
});

test('a conveyor seam still rejects overlap of original chassis material before any mutation',()=>{
 const {t,source,target,candidate}=pair();candidate.position.x-=.012;
 assert(t.poses(source,candidate.position,candidate.quaternion).some(a=>t.poses(target).some(b=>t.obbOverlap(a,b,.000001))),'fixture must intersect real material rather than only a conservative envelope');
 const before=state(t);assert.equal(t.weld(candidate),null);assert.deepEqual(state(t),before);
});

test('a foreign cube in a real corner opening does not turn its empty bounds into an obstacle',()=>{
 const {t,source,candidate}=pair('left'),bb=t.physicalGroupBounds(source),physical=t.groups.flatMap(g=>t.physicalGroupPoses(g));let point=null;
 for(let x=bb.min.x+.048;x<bb.max.x-.048&&!point;x+=.06)for(let z=bb.min.z+.048;z<bb.max.z-.048;z+=.06){
  const p=t.V(x,bb.min.y+.048,z),cube={p,q:t.Q()};if(physical.every(other=>!t.obbOverlap(cube,other,.000001))){point=p;break;}
 }
 assert(point,'corner fixture contains a genuine open region inside its bounds');const blocker=t.addQubit([point.x,point.y,point.z]),before=state(t).ids;assert(t.weld(candidate),'actual open space stays available during a join');assert.deepEqual(state(t).ids,before);assert(t.groups.includes(blocker));
});
