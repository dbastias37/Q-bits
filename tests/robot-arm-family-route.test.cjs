const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

test('an arm rejects a taught destination occupied by a physical family before enabling its motors',()=>{
 const {t,sandbox}=createGame({graphics:false});t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});sandbox.document.body.dataset.booting='false';
 assert(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V()));const arm=t.robotArms[0],hit=t.rotorPart(arm.gripperId),model=t.robotKinematics(arm),members=t.robotArmRotors(arm);
 const end=members.map((rotor,i)=>t.robotTargetError(rotor,arm.poses.place[i]));for(const link of model.chain)end[link.index]*=link.sign;
 const destination=t.robotKinematicSample(model,end).links.at(-1).position;
 const loose=t.addQubit([3,.05,3]),family=t.groupIntoFamilies([loose])?.[0];assert(family);assert(!t.groups.includes(loose));assert(t.world.bodies.includes(family.body));
 // Place an existing family in the destination before requesting motion.
 // Its stored part is absent from groups; the family collider still exists.
 family.body.position.copy(destination);family.body.aabbNeedsUpdate=true;
 t.setSelected({g:hit.g,part:hit.part});const before=t.getSimTime(),charge=t.groups.flatMap(g=>g.parts.map(p=>p.mood.energy)),familyPosition=family.body.position.clone();
 const result=t.robotPanelAction('goto',{pose:'place'});assert.equal(result.ok,false);assert.match(arm.status,/Recorrido bloqueado/);
 assert.equal(arm.running,false);assert.equal(arm.jogging,false);assert(members.every(rotor=>!rotor.enabled));assert.equal(t.robotGrips.size,0);
 assert.equal(t.getSimTime(),before);assert.deepEqual(t.groups.flatMap(g=>g.parts.map(p=>p.mood.energy)),charge);assert(family.body.position.almostEquals(familyPosition));
 family.body.position.set(3,.075,3);family.body.aabbNeedsUpdate=true;
 assert(t.robotPanelAction('goto',{pose:'place'}).ok,'clearing the real destination permits the same taught route');
});
