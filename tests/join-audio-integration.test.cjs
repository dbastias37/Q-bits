const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:false,scene:'lab',mode:'playing',phase:'idle'});const events=[];sandbox.QBitsJoinAudio.play=(point)=>events.push([point.x,point.y,point.z]);return {...game,events};}
function supply(t,bp){for(const [index,target]of t.blueprintTargets(bp).entries()){const g=t.makeGroup([{id:t.allocateUnitId(),shape:target.shape,weight:1,p:target.p.clone(),q:target.q.clone()}]),slot={g,bp,index,state:'placed'};g.blueprintJob=slot;bp.slots.push(slot);}bp.active=true;}
test('a 192-piece union emits once; failed and repeated joins stay silent',()=>{
 const {t,events}=lab();const plate=x=>t.makeGroup(Array.from({length:96},(_,i)=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(x+(i%8)*.09,1,Math.floor(i/8)*.09),q:t.Q()})));
 const target=plate(0),source=plate(.735),candidate={source,target,position:source.body.position.clone(),quaternion:source.body.quaternion.clone()};
 assert.equal(events.length,0);assert.equal(t.weld(candidate),null);assert.equal(events.length,0);
 candidate.position.x-=.015;const joined=t.weld(candidate);assert(joined);assert.equal(joined.parts.length,192);assert.equal(events.length,1);
 assert.equal(t.weld(candidate),null);assert.equal(events.length,1);
});
test('manually joining rotor tips emits once; spawning and restoring mechanisms are silent',()=>{
 const {t,events}=lab(),rotor=t.spawnRotor(t.V(0,1,0));assert(rotor);assert.equal(events.length,0);
 const a=t.rotorPart(rotor.aId),b=t.rotorPart(rotor.bId);t.disconnectRotor(rotor);
 assert(t.weld({source:a.g,target:b.g,position:a.g.body.position.clone(),quaternion:a.g.body.quaternion.clone(),rotorTip:true,aId:a.part.id,bId:b.part.id}));assert.equal(events.length,1);
 const record=t.mechanismSnapshot(t.rotors[0]);assert(record);assert(t.spawnSavedMechanism(record,t.V(3,0,0)));assert.equal(events.length,1);
});
test('ordinary and mechanism blueprints each emit one completion, with no preview sound',()=>{
 const {t,events}=lab();const shape={name:'Dos cubos',parts:[{shape:'cube',p:[0,.045,0],q:[0,0,0,1]},{shape:'cube',p:[.09,.045,0],q:[0,0,0,1]}]};
 const bp=t.placeBlueprint(shape,t.V());assert(bp);supply(t,bp);assert.equal(events.length,0);t.updateBlueprints(0);assert.equal(events.length,1);assert(!t.blueprints.includes(bp));
 t.clearNarrativeScene();const arm=t.placeMechanismBlueprint(t.robotArmBlueprintTemplate(),t.V());assert(arm);supply(t,arm);assert.equal(events.length,1);t.updateBlueprints(0);assert.equal(events.length,2);assert.equal(t.robotArms.length,1);
});
test('a completed conveyor extension sounds once despite its internal chassis weld',()=>{
 const {t,events}=lab(),recipe=t.conveyorBlueprintTemplate('straight'),first=t.placeMechanismBlueprint(recipe,t.V());assert(first);supply(t,first);t.updateBlueprints(0);assert.equal(events.length,1);
 const previous=t.conveyors[0],placement=t.conveyorBlueprintPlacement(recipe,previous),bp=t.placeBlueprint(t.mechanismBlueprintShape(recipe),placement.point,placement);assert(bp);bp.conveyorLink=previous.baseId;supply(t,bp);t.updateBlueprints(0);
 assert.equal(t.conveyors.length,2);assert.equal(t.rotorPart(previous.baseId).g,t.rotorPart(t.conveyors[1].baseId).g);assert.equal(events.length,2,'one new event, not two');
});
test('incomplete or invalid blueprints emit nothing and pause and reset cancel playback',()=>{
 const {t,sandbox,events}=lab(),bp=t.placeMechanismBlueprint(t.robotArmBlueprintTemplate(),t.V());assert(bp);bp.active=true;t.updateBlueprints(0);assert.equal(events.length,0);
 supply(t,bp);bp.slots[5].g.body.position.x+=.03;t.updateBlueprints(0);assert.equal(events.length,0);
 const stopped=[];sandbox.QBitsJoinAudio.stop=()=>stopped.push('stop');sandbox.QBitsJoinAudio.setPaused=v=>stopped.push(v);
 t.pause(false);assert(stopped.includes(true));t.clearNarrativeScene();assert(stopped.includes('stop'));
});

test('an unavailable audio device cannot roll back a completed physical mechanism',()=>{
 const {t,sandbox}=lab(),bp=t.placeMechanismBlueprint(t.robotArmBlueprintTemplate(),t.V());assert(bp);supply(t,bp);
 sandbox.QBitsJoinAudio.play=()=>{throw Error('audio device disconnected');};assert.doesNotThrow(()=>t.updateBlueprints(0));
 assert.equal(t.blueprints.length,0);assert.equal(t.robotArms.length,1);assert.equal(t.rotors.length,4);assert.equal(t.groups.length,5);
});
