const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function lab(researched=true){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle',progress:Object.fromEntries(Array.from({length:20},(_,i)=>['level'+(i+1),true]))});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;if(researched)t.setWorkshopProfile(sandbox.QBitsWorkshop.normalizeProfile({claimed:Array.from({length:20},(_,i)=>i+1),research:sandbox.QBitsWorkshop.RESEARCH.map(item=>item.id)}));t.setupWorkshop();return game;}
function piece(t,shape='cube'){const p=t.getWorkshopBench().p,g=t.addQubit([p.x,p.y+.055,p.z],1,shape);return {g,id:g.parts[0].id};}
function lookAt(game,p){const {t,sandbox}=game,doc=sandbox.document;t.canvas.requestPointerLock=()=>{doc.pointerLockElement=t.canvas;doc.dispatchEvent({type:'pointerlockchange'});};t.position.splice(0,3,p.x,t.EYE_HEIGHT,p.z+1.2);t.frame(0);t.canvas.requestPointerLock();const look=t.getLook(),dx=p.x-look.camera[0],dy=p.y-look.camera[1],dz=p.z-look.camera[2],pitch=Math.atan2(dy,Math.hypot(dx,dz)),yaw=Math.atan2(-dx,-dz);doc.dispatchEvent({type:'mousemove',movementX:(look.yaw-yaw)/.002,movementY:(look.pitch-pitch)/.002});}
function pressE(t){t.storyInput({code:'KeyE',repeat:false,preventDefault(){}});}
function button(game,text){const node=game.sandbox.document.querySelector('#command-actions').children.find(node=>node.textContent.includes(text));assert(node,'missing button: '+text);return node;}

test('looking at the physical lab bench and pressing E buys research once and fits a sensor through real menu buttons',()=>{
 const game=lab(false),{t,sandbox}=game,store=new Map();sandbox.localStorage.setItem=(key,value)=>store.set(key,value);const {id}=piece(t);lookAt(game,t.getWorkshopBench().p);t.updateTarget();assert.match(sandbox.document.querySelector('#target').textContent,/E · mesa/);pressE(t);
 assert.equal(sandbox.document.querySelector('#command-menu').hidden,false);assert.match(sandbox.document.querySelector('#command-title').textContent,/Mesa 1/);assert.equal(sandbox.document.pointerLockElement,null);
 button(game,'Investigaciones').dispatchEvent({type:'click'});button(game,'Sensor').dispatchEvent({type:'click'});assert(t.getWorkshopProfile().research.includes('sensor'));assert.equal(t.getWorkshopProfile().credits,232);assert.equal(t.awardWorkshopCredits().added,0);assert.equal(t.purchaseWorkshopResearch('sensor'),false);assert.equal(t.getWorkshopProfile().credits,232);
 button(game,'Cerrar').dispatchEvent({type:'click'});pressE(t);button(game,'Instalar sensor').dispatchEvent({type:'click'});assert(sandbox.QBitsWorkshop.partState(t.rotorPart(id).part).sensor);assert.equal(sandbox.document.pointerLockElement,t.canvas);assert.equal(t.getWorkshopProfile().credits,232,'unlocked fittings cost no additional scarce credits');
 const saved=JSON.parse(store.get('qbits.workshop.v1'));assert(saved.research.includes('sensor'));assert.equal(saved.claimed.length,20);
});
test('adaptation preserves identity, charge and bound matter, blocks raw mass edits and safely restores',()=>{
 const game=lab(),{t,sandbox}=game,{id}=piece(t),W=sandbox.QBitsWorkshop;const before=t.rotorPart(id).part;before.mood.name='Ada';before.mood.energy=.6;
 assert(t.applyWorkshopUpgrade(id,{sensor:true,battery:3,lightweight:3,movement:3}));let hit=t.rotorPart(id);assert.equal(hit.part.mood.name,'Ada');assert.equal(hit.part.shape,'cube');near(hit.part.mood.energy*40,12);near(hit.part.weight,.8);near(hit.g.body.mass,.2);near(W.materialBalance(hit.part).total,1);near(W.materialBalance(hit.part).bench,.2);
 const mass=sandbox.document.querySelector('#mass');mass.value=3;mass.dispatchEvent({type:'input'});near(t.rotorPart(id).part.weight,.8);near(t.settings.mass,.8);assert.match(sandbox.document.querySelector('#notice').textContent,/mesa/);
 hit.part.mood.energy=.9;const oldGroup=hit.g;assert.equal(t.applyWorkshopUpgrade(id,{battery:1}),false);assert.equal(t.rotorPart(id).g,oldGroup);near(hit.part.mood.energy*40,36);
 hit.part.mood.energy=.3;assert(t.applyWorkshopUpgrade(id,{sensor:false,battery:1,lightweight:1,movement:1}));hit=t.rotorPart(id);near(hit.part.weight,1);near(hit.g.body.mass,.25);near(hit.part.mood.energy*20,12);assert.equal(hit.part.mood.workshop,undefined);assert.equal(t.getWorkshopProfile().credits,4);
});
test('fitting requires a released piece on the real bench and a stopped mechanism',()=>{
 const game=lab(),{t}=game,{g,id}=piece(t);g.body.position.y=.046;assert.equal(t.applyWorkshopUpgrade(id,{sensor:true}),false);g.body.position.y=.655;t.setHeld({items:[{g}],g,part:g.parts[0]});assert.equal(t.applyWorkshopUpgrade(id,{sensor:true}),false);t.setHeld(null);
 const p=t.getWorkshopBench().p,r=t.spawnRotor(t.V(p.x+.25,p.y+.12,p.z),{mount:'fixed'});assert(t.configureRotor(r,{enabled:true}));assert.equal(t.applyWorkshopUpgrade(r.aId,{battery:2}),false);t.configureRotor(r,{enabled:false});assert(t.applyWorkshopUpgrade(r.aId,{battery:2}));
});
test('welding, splitting and lab snapshots retain the original sensor, ballast and rotor link identities',()=>{
 const game=lab(),{t,sandbox}=game,{id}=piece(t);assert(t.applyWorkshopUpgrade(id,{sensor:true,lightweight:3,battery:2}));let hit=t.rotorPart(id);const p=hit.p.clone(),neighbor=t.addQubit([p.x-.09,p.y,p.z]);const r=t.spawnRotor(t.V(-.8,.4,.2),{mount:'fixed'});assert(t.linkContactSensor(id,r));const link=JSON.stringify(hit.part.mood.sensorLink),charge=hit.part.mood.energy*30;
 const joined=t.weld({source:hit.g,target:neighbor,position:hit.g.body.position.clone(),quaternion:hit.g.body.quaternion.clone()});assert(joined);assert.equal(joined.parts.length,2);hit=t.rotorPart(id);assert.equal(JSON.stringify(hit.part.mood.sensorLink),link);near(sandbox.QBitsWorkshop.materialBalance(hit.part).total,1);
 t.detachPart(hit,false);hit=t.rotorPart(id);assert.equal(hit.g.parts.length,1);assert.equal(JSON.stringify(hit.part.mood.sensorLink),link);near(hit.part.mood.energy*30,charge);
 const snapshot=t.saveLab();t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=snapshot;t.enterLab(false);hit=t.rotorPart(id);assert(hit);assert.equal(JSON.stringify(hit.part.mood.sensorLink),link);near(hit.part.weight,.8);near(sandbox.QBitsWorkshop.materialBalance(hit.part).bench,.2);near(hit.part.mood.energy*30,charge);assert.equal(t.rotors[0].aId,r.aId);assert.equal(t.rotors[0].bId,r.bId);assert(t.getWorkshopBench());assert.doesNotThrow(()=>t.drawWorkshop());
 assert(t.applyWorkshopUpgrade(id,{sensor:false}));assert.equal(t.rotorPart(id).part.mood.sensorLink,undefined);
});
test('adapted pieces cannot duplicate or export ballast as another mechanism; ordinary templates remain available',()=>{
 const game=lab(),{t}=game,{id}=piece(t);assert(t.applyWorkshopUpgrade(id,{sensor:true,lightweight:3}));const hit=t.rotorPart(id);lookAt(game,hit.p);t.setSelected(null);const count=t.groups.length;t.duplicateSelection();assert.equal(t.groups.length,count,'aiming without selection must still guard adaptations');
 const p=t.getWorkshopBench().p,r=t.spawnRotor(t.V(p.x+.25,p.y+.12,p.z));assert(t.applyWorkshopUpgrade(r.aId,{battery:2}));assert.equal(t.saveMechanism(r),null);assert.equal(t.savedMechanisms.length,0);assert(t.applyWorkshopUpgrade(r.aId,{battery:1}));assert(t.saveMechanism(r));assert.equal(t.savedMechanisms.length,1);
});
test('reconfiguration rejects fitted lineage before any division transaction and certified scenes cannot adapt',()=>{
 const game=lab(),{t,sandbox}=game;t.beginCampaignLevel(13);t.hideStoryDialogue();const s=t.story.campaign.reconfiguration,g=t.groups.find(g=>g.parts.some(p=>p.mood.matter?.root===s.root)),part=g.parts[0];g.body.position.set(s.intake.x,t.unitGroundHeight('cube')+.004,s.intake.z);const plan=sandbox.QBitsWorkshop.planPartUpgrade(part,{sensor:true},t.getWorkshopProfile());assert(!plan.error);Object.assign(part,plan.part);
 const count=t.groups.length;assert.equal(t.beginReconfiguration('divide'),false);assert.equal(s.job,null);assert.equal(t.groups.length,count);assert.match(sandbox.document.querySelector('#notice').textContent,/Retira las adaptaciones/);
 t.beginCampaignLevel(20);t.hideStoryDialogue();const production=t.story.campaign.production;assert(production);assert.equal(t.getWorkshopBench(),null);const target=t.groups[0].parts[0].id;assert.equal(t.applyWorkshopUpgrade(target,{battery:3}),false);assert.equal(t.LEVELS.length,21);
});
test('entering and leaving the standalone puzzle removes and restores the physical bench',()=>{
 const game=lab(),{t,sandbox}=game,bench=t.getWorkshopBench();assert(t.world.bodies.includes(bench.wall.body));sandbox.document.querySelector('#start-puzzle').dispatchEvent({type:'click'});assert(t.puzzle.active);assert.equal(t.getWorkshopBench(),null);assert(!t.world.bodies.includes(bench.wall.body));t.leavePuzzle();assert(!t.puzzle.active);assert(t.getWorkshopBench());assert(t.world.bodies.includes(t.getWorkshopBench().wall.body));
});

test('a remote active motor in the same articulated assembly blocks workshop fitting',()=>{
 const {t}=lab(),p=t.getWorkshopBench().p,a=t.spawnRotor(t.V(p.x-.2,p.y+.02,p.z)),b=t.spawnRotor(t.V(p.x+.16,p.y+.02,p.z));assert(a&&b);const left=t.rotorPart(a.aId),right=t.rotorPart(b.aId),parts=[...t.worldParts(left.g),...t.worldParts(right.g)];
 for(let i=1;i<=3;i++)parts.push({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(left.p.x+.09*i,left.p.y-.09*5/56,left.p.z),q:t.Q()});t.removeGroup(left.g);t.removeGroup(right.g);t.makeGroup(parts);t.refreshRotors();assert.equal(t.rotors.length,2);assert(t.configureRotor(b,{enabled:true}));
 assert(!t.rotorGroups(b).includes(t.rotorPart(a.bId).g));assert.equal(t.applyWorkshopUpgrade(a.bId,{battery:2}),false);t.configureRotor(b,{enabled:false});assert(t.applyWorkshopUpgrade(a.bId,{battery:2}));
});
test('research reports a failed durable save while retaining the paid session purchase',()=>{
 const {t,sandbox}=lab(false);sandbox.localStorage.setItem=()=>{throw new Error('Quota exceeded');};assert(t.purchaseWorkshopResearch('sensor'));assert(t.getWorkshopProfile().research.includes('sensor'));assert.equal(t.getWorkshopProfile().credits,232);assert.match(sandbox.document.querySelector('#notice').textContent,/solo en esta sesión; no se pudo guardar/);
});
