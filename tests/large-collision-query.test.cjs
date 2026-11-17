const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
function setup(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.settings.maxCarry=2000;return game;}
function grid(t,nx,nz,{x=0,y=1,z=0,spacing=.09,shape='cube'}={}){return t.makeGroup(Array.from({length:nx*nz},(_,i)=>({id:t.allocateUnitId(),shape,weight:1,p:t.V(x+i%nx*spacing,y,z+Math.floor(i/nx)*spacing),q:t.Q()})));}

test('2000 aligned material units use one exact query box and preserve edge, corner and internal contacts',()=>{
 const {t}=setup(),g=grid(t,50,40),cube=t.addQubit([9,1,9]);assert.equal(g.parts.length,2000);assert.equal(t.rigidCollisionParts(g).length,1);
 for(const angles of [[0,0,0],[.2,.4,-.3],[1.1,-.7,.5]]){
  g.body.quaternion.setFromEuler(...angles);
  for(const local of [[0,0,0],[2.25,0,0],[2.295,0,0],[0,.091,0],[0,.089,0],[2.21,0,1.77]]){
   cube.body.position.copy(g.body.position.vadd(g.body.quaternion.vmult(t.V(...local))));cube.body.quaternion.copy(g.body.quaternion);
   const expected=t.poses(g).some(p=>t.obbOverlap(p,t.poses(cube)[0],.0005));assert.equal(t.rigidGroupsOverlap(g,cube),expected,angles+' / '+local);
  }
 }
 assert.equal(g.parts.length,2000);assert(g.parts.every(p=>p.weight===1));
});

test('large sparse concave layouts keep all holes open, including after rebuilding and rotation',()=>{
 const {t}=setup(),g=grid(t,40,25,{spacing:.18}),probe=grid(t,40,25,{x:.09,spacing:.18});assert.equal(g.parts.length+probe.parts.length,2000);
 assert.equal(t.rigidGroupsOverlap(g,probe),false,'alternating lines touch without overlapping');probe.body.position.x-=.001;assert.equal(t.rigidGroupsOverlap(g,probe),true);
 probe.body.position.x+=.001;const shared=t.Q();shared.setFromEuler(.31,.59,-.22);for(const group of [g,probe]){group.body.position.copy(shared.vmult(group.body.position));group.body.quaternion.copy(shared);}assert.equal(t.rigidGroupsOverlap(g,probe),false);
 const members=t.worldParts(g);t.removeGroup(g);const replacement=t.makeGroup(members,shared);assert.equal(t.rigidGroupsOverlap(replacement,probe),false);probe.body.position.vadd(shared.vmult(t.V(-.002,0,0)),probe.body.position);assert.equal(t.rigidGroupsOverlap(replacement,probe),true);
});

test('held multi-body snapshot refreshes between updates when a new obstacle occupies the requested path',()=>{
 const {t}=setup();assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight'),t.V()));const base=t.rotorPart(t.conveyors[0].baseId);
 t.settings.gravity=0;t.world.gravity.set(0,0,0);for(const g of t.groups)g.body.position.y+=1;
 t.grabQubit({...base,point:base.g.body.position.clone(),distance:.8});assert.equal(t.getHeld().items.length,4);
 const root=t.getHeld(),start=base.g.body.position.clone(),setTarget=target=>{root.rootOffset=target.vsub(t.V(...t.getLook().camera).vadd(t.screenRay(640,360).scale(root.distance)));};setTarget(start.vadd(t.V(.3,0,0)));
 t.updateGrab(1/60);const bounds=t.physicalGroupBounds(base.g),wall=t.storyWall(t.V(bounds.max.x+.015,(bounds.min.y+bounds.max.y)/2,(bounds.min.z+bounds.max.z)/2),t.V(.002,.7,1));
 for(let i=0;i<90;i++){t.stepPhysics(1/120);assert(!t.physicalGroupPoses(base.g).some(p=>t.obbOverlap(p,{p:wall.p,q:wall.q,half:wall.half},.001)));}
 assert(base.g.body.position.x-start.x<.025);assert(t.conveyors.length===1);
});
