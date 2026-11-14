const test=require('node:test');
const assert=require('node:assert/strict');
const model=require('../assets/js/campaign-reconfiguration.js');
const createGame=require('./game-harness.cjs');
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const seed=()=>model.identify({id:100,shape:'cube',weight:1,mood:{name:'Ada',energy:.37,blend:[1,0,0],state:'neutral'}});
let serial=1000;
const ids=parts=>parts.map(p=>({...p,id:++serial}));
const energy=parts=>parts.reduce((n,p)=>n+p.weight*p.mood.energy,0);
function setup(level){const game=createGame(),{t,sandbox}=game;Object.assign(t.story,{ready:true,mode:'playing',scene:'lab'});sandbox.document.body.dataset.booting='false';t.beginCampaignLevel(level);t.hideStoryDialogue();return game;}
const matter=t=>t.groups.filter(g=>g.parts.some(p=>p.mood.matter?.root===t.story.campaign.reconfiguration.root));
function deposit(t,groups){const p=t.story.campaign.reconfiguration.intake;groups.forEach((g,i)=>{g.body.position.set(p.x+(i%3-1)*.12,t.unitGroundHeight(g.parts[0].shape)+.004,p.z+(Math.floor(i/3)-.5)*.12);g.body.quaternion.set(0,0,0,1);g.body.velocity.set(0,0,0);g.body.angularVelocity.set(0,0,0);});}
function finish(t){for(let i=0;i<81;i++)t.tickReconfiguration(.05);assert.equal(t.story.campaign.reconfiguration.job,null);}

test('cube → six pyramids → twelve triangles → six pyramids → original cube conserves material, energy and identity',()=>{
 const original=seed(),pyramids=ids(model.plan('divide',[original]).outputs);
 const triangles=pyramids.flatMap(p=>ids(model.plan('subdivide',[p]).outputs));
 assert.equal(triangles.length,12);near(energy(triangles),energy([original]));near(triangles.reduce((n,p)=>n+p.weight,0),1);
 assert(triangles.every(p=>p.mood.matter.root===100));assert(model.plan('subdivide',[triangles[0]]).error);
 const rebuilt=[];for(let i=0;i<12;i+=2)rebuilt.push(...ids(model.plan('pyramid',triangles.slice(i,i+2)).outputs));
 const final=model.plan('cube',rebuilt).outputs[0];assert.equal(final.shape,'cube');assert.equal(final.mood.name,'Ada');assert.equal(final.mood.matter.path,'');near(final.weight,1);near(final.mood.energy,.37);
 assert.equal(original.mood.matter.path,'','planning never mutates source lineage');
});
test('missing, duplicate, foreign and modified material is rejected without creating output',()=>{
 const pyramids=ids(model.plan('divide',[seed()]).outputs);
 assert(model.plan('cube',pyramids.slice(1)).error);
 assert(model.plan('cube',[...pyramids.slice(1),pyramids[1]]).error);
 const foreign=structuredClone(pyramids);foreign[0].mood.matter.root=200;assert(model.plan('cube',foreign).error);
 const wrong=structuredClone(pyramids);wrong[0].weight=1;assert(model.plan('cube',wrong).error);
 const pair=ids(model.plan('subdivide',[pyramids[0]]).outputs);pair[1].mood.matter.path='1b';assert(model.plan('pyramid',pair).error);
});
test('malformed material and non-complementary lineage cannot reconstitute a missing half',()=>{
 for(const parts of [null,[],[null],[undefined],[{}]])assert(model.plan('divide',parts).error);
 const pyramid=ids(model.plan('divide',[seed()]).outputs)[0];
 const pair=ids(model.plan('subdivide',[pyramid]).outputs);
 for(const path of ['0a','0c','0aa','0b-extra','1b','']){
  const invalid=structuredClone(pair);invalid[1].mood.matter.path=path;
  assert(model.plan('pyramid',invalid).error,`invalid lineage ${path} must not replace the missing 0b half`);
  assert(model.plan('pyramid',invalid.reverse()).error,'validity cannot depend on which piece enters first');
 }
 assert.equal(model.plan('pyramid',pair).outputs.length,1);
 assert.equal(model.complete('unknown',{pyramid:1,cube:1}),false);
 assert.equal(model.complete('division',null),false);
});
test('recombination weights unequal energy and preserves active exhaustion',()=>{
 const halves=ids(model.plan('subdivide',[ids(model.plan('divide',[seed()]).outputs)[0]]).outputs);
 halves[0].mood.energy=.1;halves[1].mood.energy=.9;Object.assign(halves[0].mood,{state:'restless',reason:'agotado',restLeft:15,blend:[0,0,1]});
 const combined=model.plan('pyramid',halves).outputs[0];near(combined.mood.energy,.5);assert.equal(combined.mood.state,'restless');assert.equal(combined.mood.restLeft,15);
});
test('level 13 transforms real bodies once and replaces crew IDs; fractions never multiply hauling strength',()=>{
 const {t}=setup(13),source=matter(t)[0],originalEnergy=source.parts[0].mood.energy;
 assert.equal(t.beginReconfiguration('subdivide'),false);assert.equal(t.beginReconfiguration('divide'),false,'cannot reach across the room');
 deposit(t,[source]);assert(t.beginReconfiguration('divide'));assert.equal(t.beginReconfiguration('divide'),false);assert.equal(matter(t).length,0);
 finish(t);const result=matter(t);assert.equal(result.length,6);near(result.reduce((n,g)=>n+t.groupWorkUnits(g),0),1);
 near(result.reduce((n,g)=>n+g.parts[0].weight*g.parts[0].mood.energy,0),originalEnergy);
 assert.equal(t.story.campaign.crew.length,7);assert.equal(new Set(t.story.campaign.crew).size,7);assert(t.story.progress['lore.division']);
 for(let i=0;i<80;i++)t.tickReconfiguration(.05);assert.equal(matter(t).length,6);
});
test('pausing, hidden tabs and transitions freeze a pending transaction; blocked output waits atomically',()=>{
 const {t,sandbox}=setup(13);deposit(t,matter(t));assert(t.beginReconfiguration('divide'));
 const s=t.story.campaign.reconfiguration;
 t.story.mode='pause';t.tickReconfiguration(5);near(s.job.time,0);t.story.mode='playing';
 sandbox.document.hidden=true;t.tickReconfiguration(5);near(s.job.time,0);sandbox.document.hidden=false;
 t.story.transition={};t.tickReconfiguration(5);near(s.job.time,0);t.story.transition=null;
 const blocker=t.addQubit([s.exit.x-.17,.05,s.exit.z],1);t.tickReconfiguration(4.1);
 assert(s.job.blocked);assert.equal(matter(t).length,0);assert.equal(s.stats.divide,0);
 t.removeGroup(blocker);finish(t);assert.equal(matter(t).length,6);assert.equal(s.stats.divide,1);
});
test('level 14 requires both divisions; level 15 physically reunites its seven fragments into the same cube',()=>{
 const {t}=setup(14);deposit(t,matter(t));assert(t.beginReconfiguration('divide'));finish(t);
 const pieces=matter(t);pieces.slice(1).forEach((g,i)=>g.body.position.set(1+i*.16,.05,.4));deposit(t,[pieces[0]]);assert(t.beginReconfiguration('subdivide'));finish(t);
 assert.equal(matter(t).length,7);assert.equal(t.story.campaign.reconfiguration.stats.subdivide,1);
 t.beginCampaignLevel(15);t.hideStoryDialogue();const s=t.story.campaign.reconfiguration,root=s.root;
 assert.equal(matter(t).length,7);deposit(t,matter(t).filter(g=>g.parts[0].shape==='tetra'));
 assert(t.beginReconfiguration('pyramid'));finish(t);assert.equal(matter(t).length,6);
 deposit(t,matter(t));assert(t.beginReconfiguration('cube'));finish(t);
 const final=matter(t);assert.equal(final.length,1);assert.equal(final[0].parts[0].id,root);assert.equal(final[0].parts[0].shape,'cube');near(t.groupWorkUnits(final[0]),1);
 for(let i=0;i<30;i++)t.tickStory(.05);assert(t.story.campaign.gates[0].solved);
});
test('catalogue templates are real compatible assemblies, consume existing parts as blueprints and deduplicate saves',()=>{
 const {t}=setup(14);for(const kind of ['cube','pyramid']){
  const recipe=t.catalogueRecipe(kind);assert(t.savedShapeValid(recipe));assert(t.rememberCatalogueRecipe(kind));assert(t.rememberCatalogueRecipe(kind));
  const bp=t.placeBlueprint(recipe,t.V(1,0,-1));assert(bp);t.blueprints.splice(t.blueprints.indexOf(bp),1);
 }
 assert.equal(t.savedShapes.length,2);assert.equal(t.groups.length,2,'saving a plan never grants bodies');
 t.showCodex();assert.equal(t.story.mode,'codex');t.closeCodex();assert.equal(t.story.mode,'playing');
});
test('chamber is reachable by looking and pressing E; menu clicks transform and catalogue returns to play',()=>{
 const {t,sandbox}=setup(13),doc=sandbox.document,s=t.story.campaign.reconfiguration;
 t.canvas.requestPointerLock=()=>{doc.pointerLockElement=t.canvas;doc.dispatchEvent({type:'pointerlockchange'});};
 t.position.splice(0,3,s.p.x,t.EYE_HEIGHT,1.1);t.frame(0);
 t.canvas.requestPointerLock();
 const look=t.getLook(),target=t.V(s.p.x,.4,s.p.z+.2),dx=target.x-look.camera[0],dy=target.y-look.camera[1],dz=target.z-look.camera[2];
 const pitch=Math.atan2(dy,Math.hypot(dx,dz)),yaw=Math.atan2(-dx,-dz);
 doc.dispatchEvent({type:'mousemove',movementX:(look.yaw-yaw)/.002,movementY:(look.pitch-pitch)/.002});
 deposit(t,matter(t));t.storyInput({code:'KeyE',repeat:false,preventDefault(){}});
 assert.equal(doc.querySelector('#command-menu').hidden,false);assert.equal(doc.pointerLockElement,null);
 doc.querySelector('#command-actions').children[0].dispatchEvent({type:'click'});
 assert(s.job);assert.equal(doc.querySelector('#command-menu').hidden,true);assert.equal(doc.pointerLockElement,t.canvas);
 t.storyInput({code:'KeyJ',repeat:false,preventDefault(){}});assert.equal(t.story.mode,'codex');
 t.tickReconfiguration(5);near(s.job.time,0);
 t.storyInput({code:'Escape',repeat:false,preventDefault(){}});assert.equal(t.story.mode,'playing');assert.equal(doc.pointerLockElement,t.canvas);
 finish(t);assert.equal(matter(t).length,6);
});
test('campaign results continue across blocks and only the final configured level hides Next',()=>{
 const {t,sandbox}=setup(12);t.showCampaignResults();assert.equal(sandbox.document.querySelector('#complete-next').hidden,false);
 assert.equal(t.LEVELS[13].reconfiguration,'division');
 t.beginCampaignLevel(15);t.showCampaignResults();assert.equal(sandbox.document.querySelector('#complete-next').hidden,15===t.LEVELS.length-1);
 t.beginCampaignLevel(t.LEVELS.length-1);t.showCampaignResults();assert.equal(sandbox.document.querySelector('#complete-next').hidden,true);
 assert.equal(t.chapters.length,t.LEVELS.length);assert(t.LEVELS.length>=16);
});
test('restarting during conversion discards the old transaction and never leaks bodies into the next scene',()=>{
 const {t}=setup(13);deposit(t,matter(t));assert(t.beginReconfiguration('divide'));t.tickReconfiguration(2);
 t.beginCampaignLevel(14);const count=t.groups.length;t.tickReconfiguration(10);assert.equal(t.groups.length,count);assert.equal(matter(t).length,1);
});
