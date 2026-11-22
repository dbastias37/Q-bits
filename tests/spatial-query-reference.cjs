// Exhaustive query reference from 1a0425a. Kept only in tests: production
// broad phases must return the same physical piece/point and landing height.
module.exports = String.raw`function referenceAim(max=2.7,dir=direction()){
 const origin=V(...camera);let hit=null,best=Math.min(puzzleRayLimit(max,dir),raycastCargo(max,dir)?.distance??max);
 for(const g of groups)for(const pose of poses(g)){const r=rayPart(origin,dir,pose,best);if(r&&r.distance<best){best=r.distance;hit={...r,g,part:pose.part};}}
 // A completed band's visible surface selects its own module, including when
 // several modules share one welded chassis. Closer solids still occlude it.
 if(typeof conveyorSurfacePoses==='function')for(const conveyor of conveyors){
  const base=rotorPart(conveyor.baseId);if(!base)continue;
  for(const pose of conveyorSurfacePoses(conveyor)){const distance=rayPuzzleBox(origin,dir,pose,best);if(distance===null||distance>=best)continue;
   const point=add(origin,mul(dir,distance)),local=pose.q.inverse().vmult(sub(point,pose.p)),normal=V();let axis='y',gap=Infinity;
   for(const key of ['x','y','z']){const edge=Math.abs(Math.abs(local[key])-pose.half[key]);if(edge<gap){axis=key;gap=edge;}}
   normal[axis]=local[axis]<0?-1:1;best=distance;hit={distance,point,normal:pose.q.vmult(normal),g:base.g,part:base.part};
  }
 }
 return hit;
}

function referenceLanding(g){
 let delta=-bounds(g).min.y;
 const others=groups.filter(o=>o!==g&&!(held?.items?.some(item=>item.g===o))).flatMap(o=>poses(o)).concat(cargos.map(cargoPose));
 const solids=[...(puzzle.active?puzzle.walls:[]),...storyWorld.walls],down=V(0,-1,0);
 for(const pose of poses(g)){
  const samples=corners(pose);samples.push(pose.p);
  for(const point of samples){
   const origin=add(point,V(0,.0005,0));
   for(const other of others){const hit=rayPart(origin,down,other,30);if(hit)delta=Math.max(delta,Math.min(0,.0005-hit.distance));}
   // Use each real furniture segment, with its orientation, rather than its
   // enclosing box. The empty spaces beneath the desk and inside shelves stay open.
   for(const solid of solids){const distance=rayPuzzleBox(origin,down,solid,30);if(distance!==null)delta=Math.max(delta,Math.min(0,.0005-distance));}
  }
 }
 return {position:add(g.body.position,V(0,delta+.002,0)),delta};
}
`;
