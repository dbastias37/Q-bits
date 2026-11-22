const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const createGame=require('./game-harness.cjs');
const source=fs.readFileSync(path.join(__dirname,'../assets/js/game.js'),'utf8'),at=source.lastIndexOf('})();');
function lab(){
 const game=createGame({graphics:false,gameSource:source.slice(0,at)+'window.__mechanicalMood={moodVisualPose};'+source.slice(at)}),{t,sandbox}=game;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;
}
function state(t){return JSON.stringify(t.groups.map(g=>({p:g.body.position.toArray(),q:g.body.quaternion.toArray(),v:g.body.velocity.toArray(),w:g.body.angularVelocity.toArray(),parts:g.parts.map(p=>({id:p.id,mood:p.mood}))})));}
function excite(g,kind){for(const p of g.parts)Object.assign(p.mood,{state:kind,blend:kind==='excited'?[0,1,0]:[0,0,1],severity:2,energy:.9});}
for(const mood of ['excited','restless'])test(`${mood} gestures preserve the physical pose of both attached rotor tips`,()=>{
 const {t,sandbox}=lab(),rotor=t.spawnRotor(t.V(0,.3,0)),pair=t.rotorGroups(rotor);
 for(const g of pair)excite(g,mood);const before=state(t);
 for(const g of pair){const pose=t.poses(g)[0];assert.equal(sandbox.__mechanicalMood.moodVisualPose(g,pose),pose,'a joint endpoint must not bob or twist independently of its collider');}
 assert.equal(state(t),before,'rendering preserves moods, charge, identities and physical state');
});
test('a real gripper and its held single cube keep their contact pose while moods remain available',()=>{
 const {t,sandbox}=lab(),gripper=t.addQubit([0,.145,0]),payload=t.addQubit([0,.05,0]);
 assert(t.configureGripper(gripper.parts[0],{}));assert(t.gripperGrab(gripper.parts[0].id));
 excite(gripper,'excited');excite(payload,'restless');const before=state(t);
 for(const g of [gripper,payload]){const pose=t.poses(g)[0];assert.equal(sandbox.__mechanicalMood.moodVisualPose(g,pose),pose);}
 assert.equal(state(t),before);assert.equal(t.robotGrips.size,1);
});
for(const mood of ['excited','restless'])test(`a free ${mood} Q-bit retains its render-only gesture`,()=>{
 const {t,sandbox}=lab(),g=t.addQubit([0,.045,0]);excite(g,mood);const pose=t.poses(g)[0],before=state(t),visual=sandbox.__mechanicalMood.moodVisualPose(g,pose);
 assert.notEqual(visual,pose);assert(visual.p.distanceTo(pose.p)>0||Math.abs(visual.q.z-pose.q.z)>0,'the free unit still expresses its mood');
 assert.equal(state(t),before,'the gesture never changes the collider or emotional state');
});
