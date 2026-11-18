const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const model=require('../assets/js/campaign-production.js');
const DT=1/240;
function campaign(level){const game=createGame();game.t.story.ready=true;game.t.beginCampaignLevel(level);game.t.hideStoryDialogue();game.sandbox.document.pointerLockElement=game.t.canvas;return game;}
function material(t,s){return t.groups.filter(g=>g.parts.some(p=>p.mood.production?.batch===s.batch));}
function audit(t,s){
 const physical=material(t,s).flatMap(g=>g.parts),buffer=s.buffer,job=s.packJob?.parts||[],delivered=s.ledger.accepted.flatMap(p=>p.ids||[p.id]);
 const ids=[...s.ledger.stock,...physical.map(p=>p.id),...buffer.map(p=>p.id),...job.map(p=>p.id),...delivered];
 assert.equal(ids.length,s.entries.length);assert.equal(new Set(ids).size,ids.length);assert.deepEqual([...ids].sort((a,b)=>a-b),Array.from(s.entries,p=>p.id).sort((a,b)=>a-b));
 const mass=(s.ledger.stock.length+delivered.length)*.5+[...physical,...buffer,...job].reduce((n,p)=>n+p.weight,0);assert(Math.abs(mass-s.goal.units*.5)<1e-8);
 assert.equal(model.totals(s.ledger).totalMass,mass);
}
function step(t,seconds){for(let i=0;i<seconds/DT;i++)t.stepPhysics(DT);}
function until(t,condition,seconds=60,each=()=>{}){for(let i=0;i<seconds/DT&&!condition();i++){t.stepPhysics(DT);each(i);}assert(condition(),'expected condition within '+seconds+' seconds');}
function obstacle(t,s,p){const g=t.makeGroup([{id:t.allocateUnitId(),weight:1,p:p||t.V(-1.65,s.surface+.045,s.z),q:t.Q()}]);g.body.type=4;g.body.updateMassProperties();return g;}

for(const level of [19,20])test(`level${level} physically produces and delivers its finite ordered batch with conserved IDs and mass`,()=>{
 const {t,sandbox}=campaign(level),s=t.story.campaign.production;let joins=0;sandbox.QBitsJoinAudio.play=()=>joins++;assert.equal(t.groups.length,3);assert(t.startProduction());let packageRendered=false;
 until(t,()=>s.complete||s.failed,60,i=>{if(i%60===0)audit(t,s);if(!packageRendered&&material(t,s).some(g=>g.parts.length===2)){assert.doesNotThrow(()=>{t.drawStoryWorld();t.drawQubits();});packageRendered=true;}});
 assert(s.complete,s.reason);assert.equal(s.ledger.accepted.length,s.goal.target);assert.equal(s.ledger.stock.length,0);assert.equal(material(t,s).length,0);audit(t,s);
 assert(s.autonomy>=s.goal.minAutonomy);assert(s.joules>0&&s.joules<=s.goal.budget);assert.equal(s.rotor.enabled,false);
 const spent=[s.rotor.aId,s.rotor.bId].reduce((n,id)=>n+(.8-t.rotorPart(id).part.mood.energy)*60,0);assert(Math.abs(spent-s.joules)<1e-7,'all station work is charged to the actual rotor batteries');
 if(level===20)assert(packageRendered);assert.equal(joins,level===20?s.goal.target:0,'only completed packages produce one joining event');assert(t.story.progress['lore.production'+level]);
 t.tickCampaign(1.2);assert(t.story.campaign.gates[0].solved);t.tickCampaign(1);t.position[2]=-4.3;t.tickCampaign(.01);assert.equal(t.story.phase,'finishing');
});
test('idle and under-speed rotors never manufacture a unit or earn productive time',()=>{
 const {t}=campaign(19),s=t.story.campaign.production;step(t,2);assert.equal(s.ledger.released.length,0);t.configureRotor(s.rotor,{rpm:1});assert(t.startProduction());step(t,3);
 assert.equal(s.ledger.released.length,0);assert.equal(s.autonomy,0);assert(s.joules>0);assert(!s.complete);
});
test('a blocked feeder preserves its exact finite stock and can recover when the obstruction clears',()=>{
 const {t}=campaign(19),s=t.story.campaign.production,g=obstacle(t,s);const ids=[...s.ledger.stock];t.startProduction();step(t,4);
 assert.deepEqual([...s.ledger.stock],ids);assert.equal(s.autonomy,0);assert.equal(s.ledger.accepted.length,0);audit(t,s);
 t.removeGroup(g);until(t,()=>s.complete||s.failed);assert(s.complete,s.reason);audit(t,s);
});
test('packing reserves the original pair once and waits atomically for a free physical output',()=>{
 const {t}=campaign(20),s=t.story.campaign.production,g=obstacle(t,s,t.V(.15,s.surface+.045,s.z));t.startProduction();until(t,()=>s.packJob?.time>=.7,20);
 const job=s.packJob,ids=[...job.item.ids],count=s.ledger.packed.length;step(t,1);assert.equal(s.packJob,job);assert.equal(job.time,.7);assert.deepEqual([...job.item.ids],ids);assert.equal(s.ledger.packed.length,count);assert(!material(t,s).some(g=>g.parts.length===2));audit(t,s);
 t.removeGroup(g);until(t,()=>material(t,s).some(g=>g.parts.length===2),2);audit(t,s);assert.equal(s.ledger.packed.length,count);
});
test('pause, catalogue, hidden document, and transition freeze all production clocks and inventory',()=>{
 const {t,sandbox}=campaign(20),s=t.story.campaign.production;t.startProduction();step(t,3);
 const snapshot=()=>JSON.stringify({time:s.time,autonomy:s.autonomy,j:s.joules,stock:s.ledger.stock,accepted:s.ledger.accepted,buffer:s.buffer,job:s.packJob});const before=snapshot();
 for(const mode of ['pause','codex','menu']){t.story.mode=mode;t.tickProduction(100);assert.equal(snapshot(),before);}t.story.mode='playing';
 sandbox.document.hidden=true;t.tickProduction(100);assert.equal(snapshot(),before);sandbox.document.hidden=false;
 t.story.transition={};t.tickProduction(100);assert.equal(snapshot(),before);t.story.transition=null;
 sandbox.document.querySelector('#panel').hidden=false;t.tickProduction(.1);assert(s.time>JSON.parse(before).time);
});
test('manual intervention invalidates the entire attempt; explicit reset cannot mix old deliveries with a new batch',()=>{
 const {t}=campaign(19),s=t.story.campaign.production;t.startProduction();until(t,()=>s.ledger.accepted.length===1,25);const oldId=s.ledger.accepted[0].id,oldBatch=s.batch;
 t.configureRotor(s.rotor,{rpm:25});assert(s.failed);assert.equal(s.autonomy,0);assert.equal(t.startProduction(),false);step(t,.1);assert.equal(s.rotor.enabled,false);
 t.resetProduction();assert(!s.failed);assert.notEqual(s.batch,oldBatch);assert.equal(s.ledger.accepted.length,0);assert.equal(s.ledger.stock.length,3);assert(!s.entries.some(p=>p.id===oldId));assert.equal(t.groups.length,3);assert.equal(t.rotors.length,1);audit(t,s);assert(t.startProduction());
});
test('missing or altered physical material is rejected without inventing replacement stock',()=>{
 for(const edit of ['delete','weight','kind']){const {t}=campaign(19),s=t.story.campaign.production;t.startProduction();until(t,()=>material(t,s).length===1,4);const g=material(t,s)[0],remaining=s.ledger.stock.length;
  if(edit==='delete')t.removeGroup(g);else if(edit==='weight')g.parts[0].weight=1;else g.parts[0].mood.production.kind='B';t.stepPhysics(DT);assert(s.failed,edit);assert.equal(s.ledger.stock.length,remaining);assert.equal(s.ledger.accepted.length,0);
 }
});
test('resource units remain nonsentient and cannot receive ordinary Q-bit walking orders',()=>{
 const {t}=campaign(19),s=t.story.campaign.production;t.startProduction();until(t,()=>material(t,s).length===1,4);const g=material(t,s)[0],part=g.parts[0];t.updateMoods(300);assert.equal(part.mood.state,'neutral');assert.equal(part.mood.energy,1);assert.equal(t.startRoute(g,t.V(1,0,1)),false);assert.equal(g.route,null);
});
test('station control is reachable through E and its menu starts the actual batch',()=>{
 const {t,sandbox}=campaign(19),s=t.story.campaign.production;
 const doc=sandbox.document;t.canvas.requestPointerLock=()=>{doc.pointerLockElement=t.canvas;doc.dispatchEvent({type:'pointerlockchange'});};t.canvas.requestPointerLock();
 const look=t.getLook(),dx=s.control.x-look.camera[0],dy=s.control.y-look.camera[1],dz=s.control.z-look.camera[2],pitch=Math.atan2(dy,Math.hypot(dx,dz)),yaw=Math.atan2(-dx,-dz);
 doc.dispatchEvent({type:'mousemove',movementX:(look.yaw-yaw)/.002,movementY:(look.pitch-pitch)/.002});t.storyInput({code:'KeyE',repeat:false,preventDefault(){}});
 assert.equal(doc.querySelector('#command-menu').hidden,false);const button=doc.querySelector('#command-actions').children.find(child=>child.textContent==='Iniciar lote');assert(button);button.dispatchEvent({type:'click'});assert(s.started);assert(s.rotor.enabled);assert.equal(doc.pointerLockElement,t.canvas);
});

test('a missing bench cannot be reported as a fresh runnable batch and restarting the level restores it',()=>{
 const {t}=campaign(19),s=t.story.campaign.production;t.startProduction();step(t,.1);
 t.removeGroup(t.rotorPart(s.rotor.aId).g);t.stepPhysics(DT);assert(s.failed);
 const batch=s.batch,stock=[...s.ledger.stock];assert.equal(t.resetProduction(),false);assert.equal(s.batch,batch);assert.deepEqual([...s.ledger.stock],stock);
 assert(s.failed);assert.match(s.reason,/Reinicia el nivel/);assert.equal(t.startProduction(),false);
 t.beginCampaignLevel(19);t.hideStoryDialogue();assert.equal(t.groups.length,3);assert.equal(t.rotors.length,1);assert(t.startProduction());
});
