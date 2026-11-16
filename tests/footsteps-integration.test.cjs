const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';return game;}
test('an entire compound emits once at face landing, never during alignment or a cancelled roll',()=>{
 const {t,sandbox}=lab(),steps=[];sandbox.QBitsFootsteps.step=g=>steps.push(g);
 const g=t.makeGroup([0,1,2,3].map(i=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(i*.09,.045,0),q:t.Q()})));
 assert(t.startRoute(g,t.V(0,0,-.5),true));t.runNavigationJobs();
 // Drain the cooperative search without advancing simulation.
 for(let i=0;i<1000&&t.navigationJobs.size;i++)t.runNavigationJobs();
 assert(g.route);t.updateRoutes(.1);assert.equal(steps.length,0,'alignment is silent');
 for(let i=0;i<500&&!steps.length;i++)t.updateRoutes(1/240);
 assert.equal(steps.length,1);assert.equal(steps[0],g);
 t.stopRoute(g);for(let i=0;i<200;i++)t.updateRoutes(1/240);assert.equal(steps.length,1);
});
test('hauling footsteps use grounded travel and exclude held, idle, airborne and teleported cubes',()=>{
 const {t,sandbox}=lab(),steps=[];sandbox.QBitsFootsteps.step=g=>steps.push(g);const g=t.addQubit([0,.045,0]),slot={g};
 const walk=(dx,ground=true)=>{g.body.position.x+=dx;t.recordHaulFootstep(slot,ground);};
 t.recordHaulFootstep(slot,true);for(let i=0;i<100;i++)walk(0);assert.equal(steps.length,0);
 walk(.06);walk(.06);assert.equal(steps.length,1);
 walk(2);walk(.1,false);assert.equal(steps.length,1);
 t.setHeld({g});walk(.12);assert.equal(steps.length,1);t.setHeld(null);
 walk(.06);walk(.06);assert.equal(steps.length,2);
 assert.equal([...t.walkingAudioGroups()].length,0);g.haulJob={};assert.equal([...t.walkingAudioGroups()].length,0,'idle workers do not occupy the nearby budget');g.body.velocity.x=.1;assert.equal([...t.walkingAudioGroups()].length,1);
 t.setHeld({g});assert.equal([...t.walkingAudioGroups()].length,0);t.setHeld(null);g.storyFloat=true;assert.equal([...t.walkingAudioGroups()].length,0);
});
test('scene reset and pause reach the audio engine and settings apply independently',()=>{
 const {t,sandbox}=lab(),events=[];sandbox.QBitsFootsteps={setPaused:v=>events.push(['pause',v]),reset:()=>events.push(['reset']),configure:s=>events.push(['configure',s.footsteps,s.footstepVolume])};
 t.pause(false);assert.deepEqual(events.at(-1),['pause',true]);t.clearNarrativeScene();assert(events.some(e=>e[0]==='reset'));
 t.applyPreferences({footsteps:false,footstepVolume:19,guideVolume:63});assert.deepEqual(events.at(-1),['configure',false,19]);assert.equal(t.getVisuals().guideVolume,63);
});
