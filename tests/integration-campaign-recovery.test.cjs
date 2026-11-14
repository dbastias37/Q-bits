const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

function campaign(level){
 const game=createGame(),{t,sandbox}=game,doc=sandbox.document;
 t.story.ready=true;t.beginCampaignLevel(level);t.hideStoryDialogue();doc.body.dataset.booting='false';
 t.canvas.requestPointerLock=()=>{doc.pointerLockElement=t.canvas;doc.dispatchEvent({type:'pointerlockchange'});};
 t.position.splice(0,3,-1.1,t.EYE_HEIGHT,.65);t.frame(0);t.canvas.requestPointerLock();
 return game;
}
function until(t,predicate,seconds=25){
 for(let i=0;i<seconds*240&&!predicate();i++)t.stepPhysics(1/240);
 assert(predicate(),'expected production state before timeout');
}
function grab(t,g){
 const point=t.poses(g)[0].p,distance=point.distanceTo(t.V(...t.getLook().camera));assert(distance<2.7);
 t.grabQubit({g,part:g.parts[0],point,distance});assert(t.getHeld()?.g===g,'the chosen body is held');
}
test('resetting production preserves a held companion that is outside the discarded batch',()=>{
 const game=campaign(19),{t}=game,s=t.story.campaign.production;assert(t.startProduction());
 const guide=t.groups.find(g=>g.parts.some(p=>p.id===t.story.guideId));grab(t,guide);const grip=t.getHeld();
 assert(t.resetProduction());
 assert(t.getHeld()===grip);assert(t.groups.includes(guide));assert(t.world.bodies.includes(guide.body));
 for(const item of grip.items){assert(t.world.bodies.includes(item.anchorBody));assert(t.world.constraints.includes(item.joint));}
 assert.equal(s.ledger.stock.length,s.goal.units);assert(!s.failed);t.releaseQubit();
});

test('the reset transaction itself cannot discard a held batch body while leaving its hand constraint alive',()=>{
 const {t}=campaign(19),s=t.story.campaign.production;assert(t.startProduction());
 const material=()=>t.groups.find(g=>g.parts.some(p=>p.mood.production?.batch===s.batch));until(t,()=>!!material());
 const g=material();grab(t,g);const grip=t.getHeld();assert(t.resetProduction());
 assert(!t.getHeld(),'reset must be safe independently of the menu releasing the grip first');
 assert(!t.world.bodies.includes(g.body));
 for(const item of grip.items){assert(!t.world.bodies.includes(item.anchorBody));assert(!t.world.constraints.includes(item.joint));}
 assert.equal(s.ledger.stock.length,s.goal.units);assert(t.startProduction());
});
