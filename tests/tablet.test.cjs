const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');
const preferences = require('../assets/js/preferences.js');

function lab() {
 const game = createGame(), {t, sandbox} = game, doc = sandbox.document;
 t.clearNarrativeScene();
 Object.assign(t.story, {ready:true, scene:'lab', mode:'playing', phase:'idle'});
 doc.body.dataset.booting='false';
 doc.pointerLockElement=t.canvas;
 t.canvas.requestPointerLock=()=>{doc.pointerLockElement=t.canvas;doc.dispatchEvent({type:'pointerlockchange'});};
 const el=id=>doc.getElementById(id), key=(type,code,target)=>doc.dispatchEvent({type,code,target,repeat:false});
 const middle=surface=>surface.dispatchEvent({type:'mousedown',button:1});
 return {...game,doc,el,key,middle};
}

test('M3 opens while walking, the wheel changes section, and a second M3 returns control',()=>{
 const {t,doc,el,key,middle}=lab();
 key('keydown','KeyW');middle(t.canvas);
 assert.equal(el('panel').hidden,false);assert.equal(doc.pointerLockElement,null);
 assert(t.keys.has('KeyW'));
 const before=[...t.position];t.frame(performance.now()+500);
 assert.notDeepEqual([...t.position],before);
 key('keyup','KeyW');assert(!t.keys.has('KeyW'));
 key('keydown','KeyW',{tagName:'INPUT',type:'text'});assert(!t.keys.has('KeyW'));
 el('panel').dispatchEvent({type:'wheel',deltaY:100});
 assert.equal(el('wheel-machines').getAttribute('aria-pressed'),'true');
 assert.equal(el('page-mechanisms').hidden,false);
 middle(el('panel'));assert.equal(el('panel').hidden,true);assert.equal(doc.pointerLockElement,t.canvas);
});

test('Q selects a catalog category in the same tablet and prepares one blueprint',()=>{
 const {t,doc,el,key}=lab();
 key('keydown','KeyQ');key('keyup','KeyQ');assert(!el('page-catalog').hidden);assert(!t.radialOpen());
 const filters=el('catalog-filters');
 filters.children.find(b=>b.textContent==='Máquinas').dispatchEvent({type:'click'});
 const arm=el('catalog-entries').children.find(b=>b.dataset.creation==='quick-arm');
 assert(arm);arm.dispatchEvent({type:'click'});
 assert.equal(el('panel').hidden,true);assert.equal(doc.pointerLockElement,t.canvas);assert(t.getCreationPreview());
 assert.equal(t.groups.length,0);
});

test('Shift and the wheel open only a nearby physical workbench and walking away restores the bank',()=>{
 const {t,el,middle}=lab();
 t.setupWorkshop();const {p}=t.getWorkshopBench();t.position[0]=p.x+6;t.position[2]=p.z;
 middle(t.canvas);assert.equal(el('tablet-workshop').disabled,true);
 el('tablet-workshop').dispatchEvent({type:'click'});assert(!t.getWorkshopPanel()?.isOpen);
 t.position[0]=p.x+.8;t.frame(performance.now()+500);assert.equal(el('tablet-workshop').disabled,false);
 el('panel').dispatchEvent({type:'wheel',deltaY:100,shiftKey:true});assert(t.getWorkshopPanel().isOpen);
 assert(!t.storySuspended());t.position[0]=p.x+6;t.frame(performance.now()+600);
 assert(!t.getWorkshopPanel().isOpen);assert(!el('panel').hidden);assert.equal(el('panel').dataset.mode,'bank');
});

test('hand changes persist and old preferences acquire the default tablet scale',()=>{
 const {t,el,middle,sandbox}=lab();let stored;
 sandbox.localStorage.setItem=(key,data)=>{if(key===preferences.KEY)stored=JSON.parse(data);};
 middle(t.canvas);el('tablet-hand').dispatchEvent({type:'click'});
 assert.equal(stored.tabletHand,'right');assert.equal(el('panel').dataset.hand,'right');
 assert.equal(preferences.sanitize({}).tabletScale,100);
 assert.equal(preferences.sanitize({tabletScale:250}).tabletScale,125);
});

test('both 3D housings stay on screen at every corner and scale',()=>{
 const {sandbox}=lab(),{placement}=sandbox.QBitsTabletView,points=sandbox.QBitsTabletModel.positions;
 assert.equal(preferences.sanitize({tabletHand:'right'}).tabletX,100);
 assert.equal(preferences.sanitize({tabletX:-20,tabletY:180,tabletStyle:'unknown'}).tabletStyle,'glass');
 for(const [w,h] of [[320,568],[667,375],[1366,768],[2048,1024]]){
  for(const hand of ['left','right'])for(const style of ['glass','alloy'])for(const scale of [75,100,125]){
   for(const corner of [[0,0],[25,25],[50,50],[75,75],[100,0],[0,100],[100,100]]){
    const f=placement(w,h,{tabletStyle:style,tabletHand:hand,tabletScale:scale,tabletX:corner[0],tabletY:corner[1]});
    const m=f.pose;
    assert.equal(Math.sign(m[8]),Math.sign(50-corner[0]));
    assert(Math.abs(f.width/f.height-760/460)<1e-9);
    for(let i=0;i<points.length;i+=3){
     const x=points[i]*f.width,y=points[i+1]*f.height,z=points[i+2]*f.depth;
     const divisor=m[3]*x+m[7]*y+m[11]*z+1;
     const px=f.x+(m[0]*x+m[4]*y+m[8]*z)/divisor,py=f.y+(m[1]*x+m[5]*y+m[9]*z)/divisor;
     assert(px>=0&&px<w&&py>=0&&py<h,'Projected housing fits the viewport');
    }
   }
  }
 }
});

test('dragging the header persists both coordinates and does not change the active page',()=>{
 const {t,el,middle,sandbox}=lab();
 let stored;
 sandbox.localStorage.setItem=(key,value)=>{if(key===preferences.KEY)stored=JSON.parse(value);};
 middle(t.canvas);
 const grip=el('tablet-grip');grip.setPointerCapture=()=>{};
 grip.dispatchEvent({type:'pointerdown',button:0,pointerId:4,clientX:150,clientY:490});
 grip.dispatchEvent({type:'pointermove',pointerId:4,clientX:400,clientY:390});
 grip.dispatchEvent({type:'lostpointercapture',pointerId:4});
 assert(stored.tabletX>0&&stored.tabletX<100);
 assert(stored.tabletY>0&&stored.tabletY<100);
 assert.equal(el('panel').dataset.group,'bodies');
});

test('the bezel follows the selected battery even when switched off and distinguishes empty from absent',()=>{
 const {t,el,middle}=lab();
 const g=t.addQubit([3,.3,0]),part=g.parts[0];
 part.mood.externalBattery={version:1,ownerId:part.id,packId:part.id,enabled:false};
 part.mood.energy=.37;t.setSelected({g,part});
 middle(t.canvas);
 assert.equal(el('tablet-battery-value').textContent,'37 %');
 const bezel=el('tablet-battery');
 assert.match(bezel.title,/apagada/);
 assert.equal(bezel.dataset.level,'normal');
 const start=performance.now();
 for(const [i,[percent,level]] of [[35,'low'],[16,'low'],[15,'critical'],[14,'critical'],[16,'low'],[80,'normal']].entries()){
  part.mood.energy=percent/100;t.frame(start+300*(i+1));
  assert.equal(bezel.dataset.level,level);
  assert.equal(el('tablet-battery-value').textContent,percent+' %');
  assert.equal(el('tablet-charge-fill').style.width,percent+'%');
 }
 part.mood.energy=0;t.frame(start+2300);
 assert.equal(el('tablet-battery-value').textContent,'0 %');
 assert.equal(bezel.dataset.level,'critical');
 t.removeGroup(g);t.frame(start+2700);
 assert.equal(bezel.dataset.level,'none');
 assert.equal(el('tablet-battery-value').textContent,'—');
});

test('the bezel weights internal motor reserves and switches to a cabled reservoir, including at zero',()=>{
 const {t,el,middle}=lab();
 const rotor=t.spawnRotor(t.V(.8,.12,.6),{mount:'fixed',capacity:256});
 const hit=t.rotorPart(rotor.aId),other=t.rotorPart(rotor.bId);
 hit.part.mood.energy=.2;other.part.mood.energy=.6;t.setSelected(hit);
 middle(t.canvas);
 assert.equal(el('tablet-battery-value').textContent,'40 %');
 assert.deepEqual(Array.from(el('tablet-transport').children,b=>b.dataset.command),['rotor-start','rotor-stop','rotor-invert']);
 const reservoir=t.createPowerReservoir(t.V(-.6,0,-.15),{enabled:true});
 const from={kind:'reservoir',id:reservoir.id},to={kind:'part',id:rotor.aId};
 const material=t.addQubit([2,.05,-2]),pieces=t.worldParts(material);pieces[0].weight=2;t.removeGroup(material);
 assert(t.connectPowerCable(from,to,t.powerSurfaceRoute(from,to),pieces).ok);
 reservoir.cell.mood.energy=.73;t.frame(performance.now()+500);
 assert.equal(el('tablet-battery-value').textContent,'73 %');
 reservoir.cell.mood.energy=0;t.frame(performance.now()+1000);
 assert.equal(el('tablet-battery-value').textContent,'0 %');
});

function lookAt(t,point){
 const height=1.6,back=1.6;
 t.setLook({camera:[point.x,height,point.z+back],yaw:0,pitch:Math.atan2(point.y-height,back)});
}
function worldClick(t,button=0){
 for(const type of ['mousedown','mouseup','click'])t.canvas.dispatchEvent({type,button,clientX:640,clientY:360});
}
function chooseBlueprint({el,key},category,id){
 key('keydown','KeyQ');key('keyup','KeyQ');
 el('catalog-filters').children.find(button=>button.textContent===category).click();
 const entry=el('catalog-entries').children.find(button=>button.dataset.creation===id);
 assert.ok(entry,id+' missing from '+category);entry.click();
}
const hardware=(el,id)=>el('tablet-transport').children.find(button=>button.dataset.command===id);
const commands=el=>Array.from(el('tablet-transport').children,button=>button.dataset.command);

test('placing a saved drone, inspecting it while looking away, and operating its bezel keys controls that copy',()=>{
 const game=lab(),{t,el,middle}=game;
 const original=t.spawnSavedMechanism(t.propellerBlueprintTemplate(true),t.V(-1.5,0,0));
 assert(t.saveMechanism(original,'Mi dron'));
 chooseBlueprint(game,'Guardados','quick-saved-mechanism-0');
 lookAt(t,t.V(1,0,0));worldClick(t);
 const copy=t.getSelected();assert(copy);assert.notEqual(copy.g,original);
 lookAt(t,original.body.position);middle(t.canvas);
 assert.equal(t.getSelected().g,copy.g);
 assert.equal(el('tablet-battery-value').textContent,'100 %');
 assert.match(el('tablet-battery').title,/apagada/);
 assert.deepEqual(commands(el),['flight-start','flight-land','flight-stop','battery-on']);
 assert.equal(hardware(el,'flight-land').disabled,true);
 hardware(el,'battery-on').click();assert.equal(t.externalBatterySummary(copy.g).active,true);
 el('wheel-bodies').click();
 hardware(el,'flight-start').click();
 assert.equal(t.flightForGroup(copy.g).enabled,true);assert.equal(t.flightForGroup(original).enabled,false);
 assert.equal(hardware(el,'flight-land').disabled,false);
 hardware(el,'flight-land').click();assert.equal(t.flightForGroup(copy.g).landing,true);
 hardware(el,'flight-stop').click();assert.equal(t.flightForGroup(copy.g).enabled,false);
 const oldKey=hardware(el,'flight-start');
 const rotor=t.spawnRotor(t.V(2,.15,-1),{mount:'fixed',capacity:256}),tip=t.rotorPart(rotor.aId);
 lookAt(t,t.poses(tip.g).find(p=>p.part===tip.part).p);worldClick(t);
 assert.equal(t.rotorForGroup(t.getSelected().g),rotor);
 assert.deepEqual(commands(el),['rotor-start','rotor-stop','rotor-invert']);
 oldKey.click();assert.equal(t.flightForGroup(copy.g).enabled,false);
 hardware(el,'rotor-start').click();assert.equal(rotor.enabled,true);
 const sense=rotor.direction;
 hardware(el,'rotor-invert').click();assert.equal(rotor.direction,-sense);
 hardware(el,'rotor-stop').click();assert.equal(rotor.enabled,false);
 assert.equal(t.externalBatterySummary(original).active,false);
});

test('an empty propeller, a separate pack, and its charge are distinguished after canvas selection',()=>{
 const game=lab(),{t,el,middle}=game;
 chooseBlueprint(game,'Máquinas','quick-propeller');lookAt(t,t.V(1,0,0));worldClick(t);middle(t.canvas);
 assert.equal(el('tablet-battery-value').textContent,'—');assert.match(el('tablet-battery').title,/Sin batería/);
 assert.deepEqual(commands(el),['flight-start','flight-land','flight-stop']);
 middle(el('panel'));chooseBlueprint(game,'Equipo','quick-battery-1');lookAt(t,t.V(-1,0,.3));worldClick(t);
 const pack=t.getSelected();assert(t.isExternalBattery(pack.part));pack.part.mood.energy=.14;
 lookAt(t,t.V(1,0,0));middle(t.canvas);
 assert.deepEqual(commands(el),['battery-on']);
 assert.equal(el('tablet-battery-value').textContent,'14 %');
 assert.equal(el('tablet-battery').dataset.level,'critical');hardware(el,'battery-on').click();
 assert.equal(t.externalBatteryState(pack.part).enabled,true);
 assert.deepEqual(commands(el),['battery-off']);hardware(el,'battery-off').click();
 assert.equal(t.externalBatteryState(pack.part).enabled,false);
 // Selecting the propeller again must discard the separate pack.
 lookAt(t,t.V(1,.08,0));worldClick(t);
 assert.match(el('tablet-battery').title,/Sin batería/);assert.equal(hardware(el,'battery-on'),undefined);
});

test('the tablet displays the stored charge of an offline wired reservoir without supplying motor power',()=>{
 const {t,el,middle}=lab();
 const rotor=t.spawnRotor(t.V(1,.12,.6),{mount:'fixed',capacity:256}),hit=t.rotorPart(rotor.aId);
 const tank=t.createPowerReservoir(t.V(-.6,0,-.15),{enabled:false});
 const from={kind:'reservoir',id:tank.id},to={kind:'part',id:hit.part.id};
 const material=t.addQubit([2,.05,-2]),pieces=t.worldParts(material);pieces[0].weight=2;t.removeGroup(material);
 assert(t.connectPowerCable(from,to,t.powerSurfaceRoute(from,to),pieces).ok);
 tank.cell.mood.energy=.23;lookAt(t,t.poses(hit.g).find(p=>p.part===hit.part).p);middle(t.canvas);
 assert.equal(el('tablet-battery-value').textContent,'23 %');assert.match(el('tablet-battery').title,/apagada/);
 assert.equal(t.externalBatterySummary(hit.g).active,false);
});

test('a servo, arm, gripper and belt expose the controls of the placed mechanism',()=>{
 const game=lab(),{t,el,middle}=game;
 const cases=[
  ['Máquinas','quick-servo-hinge',['servo-start','servo-stop','servo-invert','servo-march-start','servo-march-stop']],
  ['Máquinas','quick-arm',['arm-start','arm-stop','arm-grab','arm-release']],
  ['Piezas','quick-gripper',['arm-grab','arm-release']],
  ['Máquinas','quick-conveyor-straight',['conveyor-toggle','conveyor-forward','conveyor-reverse']]
 ];
 for(const [index,[category,id,expected]]of cases.entries()){
  chooseBlueprint(game,category,id);lookAt(t,t.V(index*1.4-2,0,0));worldClick(t);middle(t.canvas);
  assert(t.getSelected(),id);assert.deepEqual(commands(el),expected,id);
  if(id==='quick-servo-hinge'){
   const r=t.rotorForGroup(t.getSelected().g),original=r.servo.direction;
   hardware(el,'servo-invert').click();assert.equal(r.servo.direction,-original);
   hardware(el,'servo-march-start').click();assert(t.servoMarchFor(r));
   hardware(el,'servo-march-stop').click();assert.equal(r.enabled,false);
  }
  if(id==='quick-conveyor-straight'){
   const belt=t.conveyorForGroup(t.getSelected().g);
   hardware(el,'conveyor-reverse').click();assert.equal(belt.direction,-1);
   hardware(el,'conveyor-forward').click();assert.equal(belt.direction,1);
  }
  middle(el('panel'));
 }
});

test('workbench selection, power switch and removing the target update the physical display',()=>{
 const {t,el,middle}=lab();
 t.setupWorkshop();const {p}=t.getWorkshopBench();t.position[0]=p.x+.7;t.position[2]=p.z;
 const first=t.addQubit([p.x,p.y+.048,p.z]),second=t.addQubit([p.x+.23,p.y+.048,p.z]);
 for(const [g,energy]of [[first,.46],[second,.12]]){
  const part=g.parts[0];part.mood.externalBattery={version:1,ownerId:part.id,packId:part.id,enabled:false};part.mood.energy=energy;
 }
 middle(t.canvas);el('tablet-workshop').click();assert(t.getWorkshopPanel().isOpen);
 assert.equal(el('tablet-battery-value').textContent,'46 %');
 lookAt(t,second.body.position);worldClick(t);
 assert.equal(t.getWorkshopPanel().model.targetId,second.parts[0].id);
 assert.equal(el('tablet-battery-value').textContent,'12 %');
 hardware(el,'battery-on').click();assert(t.externalBatteryState(second.parts[0]).enabled);
 assert.equal(t.externalBatteryState(first.parts[0]).enabled,false);
 t.removeGroup(second);t.frame(performance.now()+300);
 assert.equal(t.getWorkshopPanel().model.targetId,first.parts[0].id);
 assert.equal(el('tablet-battery-value').textContent,'46 %');
 t.removeGroup(first);t.frame(performance.now()+650);
 assert.equal(el('tablet-battery-value').textContent,'—');assert.deepEqual(commands(el),[]);
});

test('inspection follows the clicked mechanism and its physical keys in the campaign as well as the bank',()=>{
 const {t,el,middle,doc}=lab();
 const rotor=t.spawnRotor(t.V(1,.12,0),{mount:'fixed',capacity:256});
 t.rotorPart(rotor.aId).part.mood.energy=.4;t.rotorPart(rotor.bId).part.mood.energy=.6;
 t.dispatchControlAction('clear',true);t.dispatchControlAction('clear',false);
 Object.assign(t.story,{scene:'campaign',progress:{level5:true}});
 lookAt(t,t.V(-2,0,-1));middle(t.canvas);
 assert.deepEqual(commands(el),[]);
 const hit=t.rotorPart(rotor.aId);lookAt(t,hit.p);worldClick(t);
 assert.equal(el('page-mechanisms').hidden,false);
 assert.equal(doc.pointerLockElement,null);assert.equal(t.rotorForGroup(t.getSelected().g),rotor);
 assert.equal(el('tablet-battery-value').textContent,'50 %');assert(hardware(el,'rotor-start'));
});

test('mixed switches show total stored charge on the machine and each selectable battery keeps its own reading',()=>{
 const {t,el,middle}=lab();
 const flight=t.spawnSavedMechanism(t.propellerBlueprintTemplate(true),t.V(1,0,0));
 const battery=flight.parts.find(t.isExternalBattery);battery.mood.energy=.2;
 const tank=t.createPowerReservoir(t.V(-.6,0,-.15),{enabled:true});tank.cell.mood.energy=.8;
 const from={kind:'reservoir',id:tank.id},to={kind:'part',id:battery.id};
 const wire=t.addQubit([2,.05,-2]),pieces=t.worldParts(wire);pieces[0].weight=2;t.removeGroup(wire);
 assert(t.connectPowerCable(from,to,t.powerSurfaceRoute(from,to),pieces).ok);
 middle(t.canvas);
 const pack=t.externalBatteryCapacity(battery),expected=Math.round((tank.capacity*.8+pack*.2)/(tank.capacity+pack)*100);
 assert.equal(el('tablet-battery-value').textContent,expected+' %');
 assert.match(el('tablet-battery').title,/incluye baterías apagadas/);
 // Approach the low battery from the side to avoid the propeller mounted above it.
 const at=t.rotorPart(battery.id).p;t.setLook({camera:[at.x,at.y,at.z+1],yaw:0,pitch:0});worldClick(t);
 assert.equal(t.getSelected().part.id,battery.id);assert.equal(el('tablet-battery-value').textContent,'20 %');
 assert(hardware(el,'battery-on'));
});
