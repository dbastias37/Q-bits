const test=require('node:test');
const assert=require('node:assert/strict');
const model=require('../assets/js/campaign-automation.js');
const createGame=require('./game-harness.cjs');
const DT=1/240;
function campaign(level){const game=createGame();game.t.story.ready=true;game.t.beginCampaignLevel(level);game.t.hideStoryDialogue();game.sandbox.document.pointerLockElement=game.t.canvas;return game;}
function step(t,seconds){for(let i=0;i<seconds/DT;i++)t.stepPhysics(DT);}
function run(t,limit=15){const s=t.story.campaign.automation;for(let i=0;i<limit/DT&&!s.run.complete&&!s.run.failed;i++)t.stepPhysics(DT);return s;}
function near(actual,expected,epsilon=1e-8){assert(Math.abs(actual-expected)<=epsilon,`${actual} != ${expected}`);}

test('autonomy counts continuous useful work, bills startup/stall and freezes paused frames',()=>{
 const goal={seconds:2,budget:3,delivery:true};let s=model.create();
 s=model.advance(s,{productive:false,powered:true,joules:.3},1,goal);near(s.seconds,0);near(s.joules,.3);
 s=model.advance(s,{productive:true,powered:true,joules:.5},1,goal);near(s.seconds,1);near(s.joules,.8);
 assert.equal(model.advance(s,{paused:true,productive:true,joules:100},60,goal),s);
 s=model.advance(s,{productive:false,powered:true,joules:.2},1,goal);near(s.seconds,0);near(s.joules,1);
 s=model.advance(s,{productive:true,joules:.4,delivered:true},1,goal);assert(!s.complete);
 s=model.advance(s,{productive:true,joules:.4,delivered:true},1,goal);assert(s.complete);
});
test('an over-budget attempt stays failed until an explicit restart and an idle delivery never wins',()=>{
 const goal={seconds:2,budget:1,delivery:true};let s=model.create();
 for(let i=0;i<20;i++)s=model.advance(s,{productive:false,delivered:true},1,goal);
 assert(!s.complete);near(s.seconds,0);
 s=model.advance(s,{productive:true,joules:1.1},.1,goal);assert(s.failed);
 assert.equal(model.advance(s,{productive:true,delivered:true},10,goal),s);
 s=model.reset(s);assert(!s.failed);assert.equal(s.resets,1);near(s.joules,0);
});
for(const level of [16,17,18])test(`level ${level} completes through actual Cannon motion within its energy budget`,()=>{
 const {t}=campaign(level),s=t.story.campaign.automation,r=s.rotor;
 assert(s);assert.equal(t.rotorPowerState(r).load,s.goal.load);assert.equal(r.enabled,false);
 assert(t.configureRotor(r,{enabled:true}));run(t);
 assert(s.run.complete,JSON.stringify(s.run));assert(!s.run.failed);assert(s.run.seconds+1e-8>=s.goal.seconds);
 assert(s.run.joules>0&&s.run.joules<=s.goal.budget);assert.equal(r.enabled,false);
 const spent=[r.aId,r.bId].reduce((n,id)=>n+(.8-t.rotorPart(id).part.mood.energy)*300,0);near(s.run.joules,spent,1e-7);
 if(level===18){const end=t.rotorPart(s.endpoint);assert(end.p.distanceTo(s.origin)>.6);assert(end.p.distanceTo(s.target)<.07);step(t,.5);assert(t.rotorPart(s.endpoint).p.distanceTo(s.target)<.09,'physical receiver supports the delivered piece');}
 assert(t.story.progress['lore.rotor'+level]);
 t.tickCampaign(1.2);assert(t.story.campaign.gates[0].solved);assert.doesNotThrow(()=>t.drawStoryWorld());
 t.tickCampaign(1);t.position[2]=-4.3;t.tickCampaign(.01);assert.equal(t.story.phase,'finishing','player can leave without dismantling the fixed bench');
});
test('high speed exceeds level17 budget, stops motor, and a slower fresh attempt can pass',()=>{
 const {t}=campaign(17),s=t.story.campaign.automation,r=s.rotor;t.configureRotor(r,{rpm:120,enabled:true});run(t);
 assert(s.run.failed);assert(!s.run.complete);assert.equal(r.enabled,false);
 t.configureRotor(r,{rpm:30,enabled:true});assert(!s.run.failed);near(s.run.seconds,0);run(t);assert(s.run.complete);
});
test('idle, stalled and relocated benches do not earn autonomous seconds',()=>{
 const {t}=campaign(18),s=t.story.campaign.automation,r=s.rotor;step(t,.25);near(s.run.seconds,0);
 t.configureRotor(r,{rpm:1,enabled:true});step(t,3);assert(!s.run.complete);near(s.run.seconds,0);
 t.configureRotor(r,{rpm:30,enabled:false});for(const g of t.rotorGroups(r))g.body.position.x+=.3;
 t.configureRotor(r,{enabled:true});step(t,3);assert(!s.run.complete);near(s.run.seconds,0);assert.match(s.run.reason,/Conserva el banco/);
});
test('pause freezes autonomy and P keeps it running; changing motor or grabbing restarts the measurement',()=>{
 const {t,sandbox}=campaign(16),s=t.story.campaign.automation,r=s.rotor;t.configureRotor(r,{enabled:true});step(t,1);assert(s.run.seconds>.5);
 const before=JSON.stringify(s.run);t.story.mode='pause';t.tickAutomation(10);assert.equal(JSON.stringify(s.run),before);
 t.story.mode='playing';sandbox.document.querySelector('#panel').hidden=false;t.tickAutomation(.1);assert(s.run.seconds>JSON.parse(before).seconds);sandbox.document.querySelector('#panel').hidden=true;
 t.configureRotor(r,{rpm:20});near(s.run.seconds,0);step(t,1);assert(s.run.seconds>.5);
 const a=t.rotorPart(r.aId);t.grabQubit({g:a.g,part:a.part,point:a.p,distance:1});assert(t.getHeld());near(s.run.seconds,0);assert.equal(r.enabled,false);
});
test('removing either endpoint or disconnecting the hinge cannot crash or complete a mission',()=>{
 for(const side of ['aId','bId']){const {t}=campaign(18),s=t.story.campaign.automation;t.configureRotor(s.rotor,{enabled:true});step(t,.3);t.removeGroup(t.rotorPart(s.rotor[side]).g);assert.doesNotThrow(()=>step(t,.1));assert(!s.run.complete);near(s.run.seconds,0);}
 const {t}=campaign(16),s=t.story.campaign.automation;t.disconnectRotor(s.rotor);assert.doesNotThrow(()=>step(t,.1));assert(!s.run.complete);
});
test('certified setup restores calibrated physics and blocks debug mass and battery changes',()=>{
 const game=createGame(),{t,sandbox}=game;t.settings.friction=1;t.settings.bounce=1;t.settings.damping=.9;t.beginCampaignLevel(16);t.hideStoryDialogue();
 near(t.settings.friction,.38);near(t.settings.bounce,.12);near(t.settings.damping,.12);
 const s=t.story.campaign.automation,a=t.rotorPart(s.rotor.aId);t.setSelected({g:a.g,part:a.part});a.part.mood.energy=.2;
 sandbox.document.querySelector('#mood-test-rested').dispatchEvent({type:'click'});near(a.part.mood.energy,.2);
 const mass=sandbox.document.querySelector('#mass');mass.value=3;mass.dispatchEvent({type:'input'});near(a.part.weight,1);
 const bodies=t.groups.length,motors=t.rotors.length;assert.equal(t.mechanismsAvailable(),false);assert.equal(t.spawnRotor(t.V(1,.1,1)),null);t.spawnQubit();t.duplicateSelection();assert.equal(t.groups.length,bodies);assert.equal(t.rotors.length,motors,'outside motors cannot assist a certified trial');
});
test('torque certifications cap campaign configurations and preserve unrestricted sandbox mechanisms',()=>{
 const {t,sandbox}=campaign(16),r=t.story.campaign.automation.rotor;t.story.progress.level18=true;t.story.progress.torqueTier=3;
 t.configureRotor(r,{maxTorque:4});near(r.maxTorque,.4);near(t.campaignTorqueCap(),.4);t.updateMechanismPanel();assert(sandbox.document.querySelector('#rotor-tier').disabled);
 t.beginCampaignLevel(13);const free=t.spawnRotor(t.V(.9,.1,0),{maxTorque:4});assert(free);near(free.maxTorque,1);t.configureRotor(free,{maxTorque:4});near(free.maxTorque,1);
 t.story.scene='lab';t.configureRotor(free,{maxTorque:4});near(free.maxTorque,4);assert.equal(t.configureRotor(null,{enabled:true}),false);
});
test('completion unlocks profile tiers only after the level result and next level stays available',()=>{
 const {t,sandbox}=campaign(16);assert.equal(sandbox.QBitsProgression.availableTier(t.story.progress),1);
 t.configureRotor(t.story.campaign.automation.rotor,{enabled:true});run(t);assert.equal(sandbox.QBitsProgression.availableTier(t.story.progress),1);
 t.showCampaignResults();assert.equal(sandbox.QBitsProgression.availableTier(t.story.progress),2);assert.equal(sandbox.document.querySelector('#complete-next').hidden,false);
 t.beginCampaignLevel(18);t.configureRotor(t.story.campaign.automation.rotor,{enabled:true});run(t);t.showCampaignResults();assert.equal(sandbox.QBitsProgression.availableTier(t.story.progress),3);
});
