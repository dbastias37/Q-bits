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
 const reservoir=t.createPowerReservoir(t.V(-.6,0,-.15),{enabled:true});
 const from={kind:'reservoir',id:reservoir.id},to={kind:'part',id:rotor.aId};
 const material=t.addQubit([2,.05,-2]),pieces=t.worldParts(material);pieces[0].weight=2;t.removeGroup(material);
 assert(t.connectPowerCable(from,to,t.powerSurfaceRoute(from,to),pieces).ok);
 reservoir.cell.mood.energy=.73;t.frame(performance.now()+500);
 assert.equal(el('tablet-battery-value').textContent,'73 %');
 reservoir.cell.mood.energy=0;t.frame(performance.now()+1000);
 assert.equal(el('tablet-battery-value').textContent,'0 %');
});
