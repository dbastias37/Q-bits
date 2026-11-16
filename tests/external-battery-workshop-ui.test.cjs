const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle',progress:{}});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.setupWorkshop();return game;}
function bar(t,count){const p=t.getWorkshopBench().p;return t.makeGroup(Array.from({length:count},(_,i)=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(p.x+(i-(count-1)/2)*.09,p.y+.055,p.z),q:t.Q()})));}
function node(game,id){return game.sandbox.document.querySelector('#'+id);}
function button(game,label){const found=node(game,'command-actions').children.find(b=>b.textContent.includes(label));assert(found,label);return found;}
function joinBattery(t,cell,rotor){const hit=t.rotorPart(rotor.aId),old=t.worldParts(hit.g),bp=t.worldParts(cell)[0];bp.p=hit.p.vadd(t.V(.09,-.09*5/56,0));t.removeGroup(hit.g);t.removeGroup(cell);const g=t.makeGroup([...old,bp]);t.refreshRotors();return {g,id:bp.id};}

test('all three external battery versions are available immediately and preserve matter and existing joules',()=>{
 for(const size of [1,2,3]){const game=lab(),{t}=game,g=bar(t,size),ids=g.parts.map(p=>p.id),mass=g.body.mass,energy=g.parts.reduce((n,p)=>n+p.mood.energy*t.gameBatteryCapacity(p),0),credits=t.getWorkshopProfile().credits;
  assert.equal(t.getWorkshopProfile().research.length,0);assert.equal(t.batteryWorkshopCheck(ids[0],size),'');
  assert(t.createExternalBattery(ids[0],size));const info=t.externalBatteryPackInfo(ids[0]);
  assert.equal(info.parts.length,size);assert.equal(info.capacity,120*size);near(info.storedJ,energy);assert.equal(info.enabled,false);
  assert.deepEqual(g.parts.map(p=>p.id),ids);near(g.body.mass,mass);assert.equal(t.groups.length,1);assert.equal(t.getWorkshopProfile().credits,credits);
  assert(g.parts.every(p=>p.shape==='cube'&&t.isExternalBattery(p)));
 }
});

test('conversion validates whole released straight structure before any mutation',()=>{
 const {t}=lab(),g=bar(t,3),ids=g.parts.map(p=>p.id),before=g.parts.map(p=>p.mood.energy);
 assert.equal(t.createExternalBattery(ids[0],2),false);assert(g.parts.every(p=>!p.mood.externalBattery));
 t.setHeld({g,part:g.parts[0],items:[{g}]});assert.equal(t.createExternalBattery(ids[0],3),false);t.setHeld(null);
 g.body.position.x+=2;assert.equal(t.createExternalBattery(ids[0],3),false);g.body.position.x-=2;
 g.parts[0].mood.production={kind:'A'};assert.equal(t.createExternalBattery(ids[0],3),false);delete g.parts[0].mood.production;
 assert.deepEqual(g.parts.map(p=>p.mood.energy),before);assert(g.parts.every(p=>!p.mood.externalBattery));
 const p=t.getWorkshopBench().p;const bent=t.makeGroup([[0,0],[.09,0],[0,.09]].map(([x,z])=>({id:t.allocateUnitId(),weight:1,shape:'cube',p:t.V(p.x+x,p.y+.055,p.z+z),q:t.Q()})));
 assert.equal(t.createExternalBattery(bent.parts[0].id,3),false);assert(bent.parts.every(p=>!p.mood.externalBattery));
});

test('workshop buttons expose three material choices without research and teach external activation',()=>{
 const game=lab(),{t}=game,g=bar(t,2);t.setSelected({g,part:g.parts[0]});t.showWorkshopBatteries();
 const choices=node(game,'workshop-options').children;assert.equal(choices.length,3);assert.equal(t.getWorkshopPanel().model.allowed,true);assert.equal(g.parts.some(t.isExternalBattery),false);
 choices[0].dispatchEvent({type:'click'});assert.equal(node(game,'workshop-apply').disabled,true);choices[1].dispatchEvent({type:'click'});node(game,'workshop-apply').dispatchEvent({type:'click'});assert(g.parts.every(t.isExternalBattery));assert.equal(t.getWorkshopPanel().isOpen,true);
 assert.match(node(game,'workshop-help').textContent,/actívala/);assert.match(node(game,'workshop-help').textContent,/piso/);t.closeWorkshopPanel(false);t.showExternalBatteryGuide(g.parts[0].id);
 const instructions=node(game,'command-actions').children.map(b=>b.textContent).join(' ');assert.match(instructions,/Sin una activa usa las internas/);
 button(game,'Volver a la batería').dispatchEvent({type:'click'});button(game,'Activar batería').dispatchEvent({type:'click'});assert(g.parts.every(p=>t.externalBatteryState(p).enabled));assert.match(node(game,'command-title').textContent,/Batería II/);
 button(game,'Apagar batería').dispatchEvent({type:'click'});assert(g.parts.every(p=>!t.externalBatteryState(p).enabled));
});

test('source selector in rotor panel activates attached battery and stops motors during deliberate source changes',()=>{
 const game=lab(),{t}=game,g=bar(t,1),id=g.parts[0].id;assert(t.createExternalBattery(id,1));const rotor=t.spawnRotor(t.V(0,.4,0));joinBattery(t,g,rotor);
 const hit=t.rotorPart(rotor.aId);t.setSelected({g:hit.g,part:hit.part});t.updateMechanismPanel();assert.match(node(game,'rotor-supply-status').textContent,/Reserva interna/);assert.equal(node(game,'connected-batteries').children.length,1);
 assert(t.configureRotor(rotor,{enabled:true}));node(game,'connected-batteries').children[0].dispatchEvent({type:'click'});assert.equal(rotor.enabled,false);assert(t.externalBatteryState(t.rotorPart(id).part).enabled);assert.match(node(game,'rotor-supply-status').textContent,/Batería externa activa/);
 t.rotorPart(rotor.aId).part.mood.energy=0;t.rotorPart(rotor.bId).part.mood.energy=0;assert(t.configureRotor(rotor,{enabled:true}));
 node(game,'connected-batteries').children[0].dispatchEvent({type:'click'});assert.equal(rotor.enabled,false);assert.equal(t.configureRotor(rotor,{enabled:true}),false);assert.match(node(game,'rotor-supply-status').textContent,/Reserva interna/);
});

test('restoring ordinary cubes preserves joules and refuses to discard excess battery charge',()=>{
 const {t}=lab(),g=bar(t,2),id=g.parts[0].id;assert(t.createExternalBattery(id,2));const before=g.parts.reduce((n,p)=>n+p.mood.energy*t.externalBatteryCapacity(p),0);
 assert(t.restoreExternalBattery(id));assert(g.parts.every(p=>!p.mood.externalBattery));near(g.parts.reduce((n,p)=>n+p.mood.energy*t.gameBatteryCapacity(p),0),before);
 assert(t.createExternalBattery(id,2));g.parts[0].mood.energy=.9;const state=JSON.stringify(g.parts.map(p=>p.mood));assert.equal(t.restoreExternalBattery(id),false);assert.equal(JSON.stringify(g.parts.map(p=>p.mood)),state);
});

test('battery actions reject certified campaign conversion and external mass edits',()=>{
 const game=lab(),{t}=game,g=bar(t,1),id=g.parts[0].id;assert(t.createExternalBattery(id,1));t.setSelected({g,part:g.parts[0]});const mass=node(game,'mass');mass.value=3;mass.dispatchEvent({type:'input'});assert.equal(g.parts[0].weight,1);
 t.beginCampaignLevel(20);assert.equal(t.createExternalBattery(t.groups[0].parts[0].id,1),false);assert.equal(t.LEVELS.length,21);
});
