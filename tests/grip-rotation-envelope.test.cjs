const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),createGame=require('./game-harness.cjs');
const source=fs.readFileSync(path.join(__dirname,'../assets/js/game.js'),'utf8'),reference=source.replace('if(!coolers.length){\n  const turn=desired.mult', 'if(false){\n  const turn=desired.mult');assert.notEqual(source,reference);
function setup(gameSource=source){const game=createGame({gameSource}),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.settings.maxCarry=2000;return game;}
function take(t,g){t.grabQubit({g,part:g.parts[0],point:g.body.position.clone(),distance:1});assert(t.getHeld());return t.getHeld().items[0];}
const same=(a,b)=>assert(Math.abs(a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w)>1-1e-10);
function belt(gameSource,angles,offset){const {t}=setup(gameSource);assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight'),t.V()));for(const g of t.groups)g.body.position.vadd(t.V(...offset),g.body.position);const g=t.rotorPart(t.conveyors[0].baseId).g,item=take(t,g),desired=t.Q();desired.setFromEuler(...angles);return {t,g,item,desired,result:t.safeGripRotation(item,desired)};}

test('open-space rotations fast-accept exactly the same orientation as the original full swept check',()=>{
 for(const [angles,offset]of [[[0,.7,0],[0,0,0]],[[.4,.3,-.2],[0,1,0]],[[-.5,1.2,.3],[0,2,0]]]){const a=belt(source,angles,offset),b=belt(reference,angles,offset);assert.equal(a.result,a.desired,'whole continuous envelope is clear');same(a.result,b.result);assert.equal(a.item.passiveGrip,false);assert.equal(a.t.getHeld().items.filter(i=>i.passiveGrip).length,3);}
});

test('rotation near floor or room edge falls back to the same precise limit',()=>{
 for(const [angles,offset]of [[[.7,0,0],[0,0,0]],[[0,.8,0],[13.68,1,0]]]){const a=belt(source,angles,offset),b=belt(reference,angles,offset);assert.notEqual(a.result,a.desired);same(a.result,b.result);}
});

test('clear endpoints never authorize a rotation whose intermediate arc intersects a thin solid',()=>{
 const {t}=setup(),g=t.makeGroup(Array.from({length:20},(_,i)=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V((i-9.5)*.09,1,0),q:t.Q()}))),item=take(t,g),wall=t.storyWall(t.V(0,1,.5),t.V(.2,.5,.002)),desired=t.Q();desired.setFromAxisAngle(t.V(0,1,0),Math.PI);
 assert(t.validPose(g,g.body.position,g.body.quaternion));assert(t.validPose(g,g.body.position,desired),'both endpoints are clear');const result=t.safeGripRotation(item,desired);assert.notEqual(result,desired);assert(Math.abs(result.w)>.7,'sweep stops before the middle of the turn');assert(!t.physicalGroupPoses(g,g.body.position,result).some(p=>t.obbOverlap(p,{p:wall.p,q:wall.q,half:wall.half},.0004)));
});
