const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');
const near = (actual, expected, tolerance=1e-9) => assert(Math.abs(actual-expected)<tolerance, `${actual} != ${expected}`);

test('T-bit hulls use a common edge length, congruent joining faces and true mass centroids', () => {
  const {t}=createGame();
  for(const [shape,vertices,faces] of [['tetra',4,4],['pyramid',5,5]]){
    const profile=t.unitProfile(shape);
    assert.equal(profile.vertices.length,vertices);assert.equal(profile.faces.length,faces);
    const extents=['x','y','z'].map(k=>Math.max(...profile.vertices.map(v=>v[k]))-Math.min(...profile.vertices.map(v=>v[k])));
    near(Math.max(...extents),.09);
    let volume=0,center=t.V();
    for(let i=0;i<profile.faces.length;i++){
      const face=profile.faces[i],normal=profile.faceNormals[i],plane=normal.dot(profile.faceCenters[i]);
      assert(plane>0,'the origin must lie strictly inside every outward plane');
      for(const v of profile.vertices)assert(normal.dot(v)<=plane+1e-10);
      for(let j=1;j<face.length-1;j++){
        const [a,b,c]=[face[0],face[j],face[j+1]].map(k=>profile.vertices[k]);
        const v=a.dot(b.cross(c))/6;volume+=v;
        center.vadd(a.vadd(b).vadd(c).scale(v/4),center);
      }
    }
    assert(volume>0);near(center.norm()/volume,0);
    near(t.unitGroundHeight(shape),-Math.min(...profile.vertices.map(v=>v.y)));
    for(const [a,b] of profile.edges)near(profile.vertices[a].distanceTo(profile.vertices[b]),.09);
    if(shape==='pyramid'){near(extents[0],.09);near(extents[1],.09/Math.sqrt(2));near(extents[2],.09);}
  }
});

test('T-bit picking and overlap use solid faces, leaving the empty corners of their bounds empty', () => {
  const {t}=createGame();
  for(const shape of ['tetra','pyramid'])for(const turned of [false,true]){
    const q=t.Q();if(turned)q.setFromEuler(.41,.7,-.23);
    const pose={shape,p:t.V(2,1,-1),q},toWorld=v=>pose.p.vadd(q.vmult(v));
    const top=Math.max(...t.unitProfile(shape).vertices.map(v=>v.y));
    const ray=q.vmult(t.V(0,0,-1));
    assert(t.rayPart(toWorld(t.V(0,0,.2)),ray,pose,1),'a center ray hits a sloped face');
    assert.equal(t.rayPart(toWorld(t.V(.04,top-.005,.2)),ray,pose,1),null,'a ray through a bounding-box corner misses');
    assert.equal(t.rayPart(toWorld(t.V(0,0,.2)),ray,pose,.05),null,'max distance is respected');
    const empty={p:toWorld(t.V(.04,top-.005,0)),q,half:t.V(.002,.002,.002)};
    const filled={p:toWorld(t.V(0,0,0)),q,half:t.V(.002,.002,.002)};
    assert.equal(t.obbOverlap(pose,empty),false);assert.equal(t.obbOverlap(empty,pose),false);
    assert.equal(t.obbOverlap(pose,filled),true);assert.equal(t.obbOverlap(filled,pose),true);
  }
});

test('mixed structures keep exact rotated hull bounds and never collapse into a solid cube', () => {
  const {t}=createGame();t.clearNarrativeScene();
  const g=t.makeGroup(['cube','tetra','pyramid'].map((shape,i)=>({id:100+i,weight:i+1,shape,p:t.V(i*.14,.4,i*.06),q:t.Q()})));
  assert.equal(g.block,null);assert.equal(g.body.shapes.length,3);
  assert.equal(t.worldParts(g).map(p=>p.shape).join(','),'cube,tetra,pyramid');
  for(let i=0;i<60;i++){
    const q=t.Q();q.setFromEuler(i*.19,i*.31,i*.07);const position=t.V(Math.sin(i),1,Math.cos(i));
    const points=t.poses(g,position,q).flatMap(t.corners),bounds=t.bounds(g,position,q);
    for(const axis of ['x','y','z']){near(bounds.min[axis],Math.min(...points.map(v=>v[axis])));near(bounds.max[axis],Math.max(...points.map(v=>v[axis])));}
  }
  const owned=t.bounds(g);owned.min.x=999;assert.notEqual(t.bounds(g).min.x,999);
});

test('both convex T-bits fall, collide and settle on the floor after an angled drop', () => {
  const {t,sandbox}=createGame();t.clearNarrativeScene();
  const units=['cube','tetra','pyramid'].map((shape,i)=>{
    const q=t.Q();q.setFromEuler(.41,.31,.26);
    const g=t.makeGroup([{id:200+i,weight:1,shape,p:t.V(i*.4,1,0),q}]);
    if(shape!=='cube'){
      assert(g.body.shapes[0] instanceof sandbox.CANNON.ConvexPolyhedron);
      assert.equal(g.body.shapes[0].vertices.length,t.unitProfile(shape).vertices.length);
      assert.match(g.parts[0].mood.name,/^T-bit /);
    }
    g.testLowest=Infinity;return g;
  });
  for(let i=0;i<2400;i++){
    t.world.step(1/240);
    for(const g of units){assert(Number.isFinite(g.body.position.y));g.testLowest=Math.min(g.testLowest,t.bounds(g).min.y);assert(g.testLowest>-.02,'contact must recover within one falling physics step');}
  }
  for(const g of units){near(t.bounds(g).min.y,0,.001);assert(g.body.velocity.norm()<.03);assert(g.body.angularVelocity.norm()<.03);}
  for(const g of units.slice(1))assert(g.testLowest>=units[0].testLowest-.002,'new hulls must not penetrate farther than the cube control');
});

test('T-bit rendering and outlines reuse shared meshes across creation and redraws', () => {
  const {t,buffers}=createGame();t.clearNarrativeScene();const initial=buffers.size;
  for(let cycle=0;cycle<4;cycle++){
    for(const [i,shape] of ['tetra','pyramid'].entries()){
      const g=t.makeGroup([{id:300+cycle*2+i,weight:1,shape,p:t.V(i*.2,.2,0),q:t.Q()}]);
      for(let frame=0;frame<20;frame++){const pose=t.poses(g)[0];t.drawUnitMesh(pose);t.drawUnitMesh(pose,[.2,.3,.3,.2],4);t.drawUnitOutline(pose);}
      t.removeGroup(g);
    }
    assert.equal(buffers.size,initial,'redraws must not allocate GPU buffers');
  }
});
