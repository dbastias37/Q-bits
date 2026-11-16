const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}
function node(game,id){return game.sandbox.document.querySelector('#'+id);}
function input(game,id,value,type='input'){const el=node(game,id);el.value=String(value);el.dispatchEvent({type});}
function click(game,id){node(game,id).dispatchEvent({type:'click'});}
function key(game,type,code){game.sandbox.document.dispatchEvent({type,code,repeat:false});}
function mouse(game,button=0,extra={}){game.t.canvas.dispatchEvent({type:'mousedown',button,...extra});game.sandbox.document.dispatchEvent({type:'mouseup',button,...extra});}
function aimPoint(t,distance=.7){return t.V(...t.getLook().camera).vadd(t.screenRay(640,360).scale(distance));}
function rotorAt(t,p,options={}){const a=t.makeGroup([{id:t.allocateUnitId(),shape:'coupler',weight:1,p,q:t.Q()}]),flip=t.Q();flip.setFromAxisAngle(t.V(0,0,1),Math.PI);const b=t.makeGroup([{id:t.allocateUnitId(),shape:'coupler',weight:1,p:p.vadd(t.V(0,2*.09*51/56,0)),q:flip}]);const r=t.connectRotorTips(a.parts[0].id,b.parts[0].id,options);assert(r);return r;}
function moveRotor(t,r,delta){for(const g of t.rotorGroups(r)){g.body.position.vadd(delta,g.body.position);g.body.aabbNeedsUpdate=true;}}
function pair(game){const {t}=game,p=aimPoint(t),a=rotorAt(t,p,{direction:1,rpm:25,maxTorque:.4,capacity:32}),b=rotorAt(t,p.vadd(t.V(.4,0,0)),{direction:-1,rpm:40,maxTorque:.6,capacity:64});return [a,b];}
function state(members){return members.map(r=>({rpm:r.rpm,force:r.maxTorque,capacity:r.capacity,direction:r.direction,moving:r.moving,mount:r.mount,enabled:r.enabled}));}
function choose(t,members){t.clearRotorSelection();members.forEach(r=>t.toggleRotorSelection(r));}

test('panel creates and renames a named set, applies integer controls and runs all selected rotors',()=>{
 const game=lab(),{t}=game,members=pair(game);choose(t,members);t.updateMechanismPanel();
 input(game,'rotor-set-name','Automóvil','change');click(game,'rotor-set-create');assert.equal(t.rotorSets.length,1);const set=t.rotorSets[0];assert.equal(set.name,'Automóvil');assert.equal(t.rotorSetMembers(set).length,2);
 input(game,'rotor-set-name','Deslizante','change');click(game,'rotor-set-create');assert.equal(t.rotorSets.length,1);assert.equal(set.name,'Deslizante');
 const orientation=members.map(r=>[r.direction,r.moving,r.mount]);
 input(game,'rotor-rpm',58);input(game,'rotor-force',75);input(game,'rotor-capacity',80);
 assert(members.every(r=>r.rpm===58&&r.maxTorque===.75&&r.capacity===80));
 assert.equal(node(game,'rotor-rpm-value').textContent,'58');assert.equal(node(game,'rotor-force-value').textContent,'75');assert.equal(node(game,'rotor-capacity-value').textContent,'80');
 click(game,'rotor-start');assert(members.every(r=>r.enabled));assert.deepEqual(members.map(r=>[r.direction,r.moving,r.mount]),orientation);
 click(game,'rotor-invert');assert.deepEqual(members.map(r=>r.direction),[-1,1]);assert(members.every(r=>r.enabled));
 click(game,'rotor-stop');assert(members.every(r=>!r.enabled));
 click(game,'rotor-set-dissolve');assert.equal(t.rotorSets.length,0);assert.equal(t.rotors.length,2);assert(members.every(r=>r.rpm===58&&r.maxTorque===.75&&r.capacity===80));
});

test('opening a mixed selection shows Varios without changing settings or per-rotor orientation',()=>{
 const game=lab(),{t}=game,members=pair(game);choose(t,members);const before=state(members);t.updateMechanismPanel();
 for(const id of ['rotor-rpm-value','rotor-force-value','rotor-capacity-value'])assert.equal(node(game,id).textContent,'Varios');
 assert.deepEqual(state(members),before);for(const id of ['rotor-side','rotor-mount','rotor-clockwise','rotor-counterclockwise','rotor-disconnect'])assert.equal(node(game,id).disabled,true);
 choose(t,[members[1]]);t.updateMechanismPanel();assert.equal(node(game,'rotor-side').disabled,false);input(game,'rotor-side','a','change');assert.equal(members[1].moving,'a');assert.equal(members[0].moving,before[0].moving);
});

test('physical Ctrl and mouse pipeline toggles exact hinges from either endpoint without grabbing',()=>{
 const game=lab(),{t}=game,members=pair(game),point=aimPoint(t);t.setSelected(null);
 key(game,'keydown','ControlLeft');mouse(game);assert.deepEqual(Array.from(t.selectedRotors(),r=>r.id),[members[0].id]);assert.equal(t.getHeld(),null);
 moveRotor(t,members[0],t.V(-.5,0,0));moveRotor(t,members[1],t.V(-.4,0,0));mouse(game);
 assert.deepEqual(Array.from(t.selectedRotors(),r=>r.id),members.map(r=>r.id));assert.equal(t.getHeld(),null);
 moveRotor(t,members[1],point.vsub(t.rotorPart(members[1].bId).p));mouse(game);assert.deepEqual(Array.from(t.selectedRotors(),r=>r.id),[members[0].id]);
 moveRotor(t,members[1],t.V(.6,0,0));mouse(game);assert.deepEqual(Array.from(t.selectedRotors(),r=>r.id),[members[0].id]);
 key(game,'keyup','ControlLeft');key(game,'keydown','KeyG');key(game,'keyup','KeyG');assert.equal(t.selectedRotors().length,0);assert.equal(t.getSelected(),null);
});

test('selection action T adds a rotor and switches cleanly back to ordinary pieces',()=>{
 const game=lab(),{t}=game,[r]=pair(game);t.setSelected(null);key(game,'keydown','KeyT');key(game,'keyup','KeyT');assert.deepEqual(Array.from(t.selectedRotors(),v=>v.id),[r.id]);
 moveRotor(t,r,t.V(-1,0,0));const point=aimPoint(t),cube=t.addQubit([point.x,point.y,point.z]);key(game,'keydown','KeyT');key(game,'keyup','KeyT');assert.equal(t.selectedRotors().length,0);assert.equal(t.getSelected().g,cube);
});

test('controller selection shares the exact rotor path and clears it when selecting a cube',()=>{
 const game=lab(),{t,sandbox}=game,[r]=pair(game);t.setSelected(null);sandbox.document.pointerLockElement=null;
 function pad(pressed=[]){return {index:0,id:'Test controller',mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},(_,i)=>({pressed:pressed.includes(i),value:pressed.includes(i)?1:0}))};}
 let current=pad();sandbox.navigator.getGamepads=()=>[current];t.pollGamepadInput(.05);current=pad([3]);t.pollGamepadInput(.05);assert.deepEqual(Array.from(t.selectedRotors(),v=>v.id),[r.id]);current=pad();t.pollGamepadInput(.05);
 moveRotor(t,r,t.V(-1,0,0));const point=aimPoint(t),cube=t.addQubit([point.x,point.y,point.z]);current=pad([3]);t.pollGamepadInput(.05);assert.equal(t.selectedRotors().length,0);assert.equal(t.getSelected().g,cube);
});

test('right-click of a named member reopens the entire set and its actions',()=>{
 const game=lab(),{t}=game,members=pair(game),set=t.createRotorSet('Auto',members);t.clearRotorSelection();t.setSelected(null);mouse(game,2);
 assert.equal(t.activeRotorSet(),set);assert.equal(t.selectedRotors().length,2);assert.equal(node(game,'command-menu').hidden,false);assert.match(node(game,'command-title').textContent,/Auto · 2/);
 const labels=node(game,'command-actions').children.map(el=>el.textContent);for(const label of ['Iniciar marcha','Detener conjunto','Invertir marcha','Velocidad, fuerza y carga…','Nombre y miembros…'])assert(labels.includes(label));
});

test('saved set list selects all members and the panel start fails atomically for an empty battery',()=>{
 const game=lab(),{t}=game,members=pair(game),set=t.createRotorSet('Carga',members);t.clearRotorSelection();t.setSelected(null);t.updateMechanismPanel();
 node(game,'rotor-set-list').children[0].dispatchEvent({type:'click'});assert.equal(t.activeRotorSet(),set);assert.equal(t.selectedRotors().length,2);
 t.rotorPart(members[1].bId).part.mood.energy=0;click(game,'rotor-start');assert(members.every(r=>!r.enabled));assert.match(node(game,'notice').textContent,/sin energía/);
 t.rotorPart(members[1].bId).part.mood.energy=1;click(game,'rotor-start');assert(members.every(r=>r.enabled));
});

test('individual advanced controls follow the explicit rotor selection, even when the aim selection differs',()=>{
 const game=lab(),{t}=game,[a,b]=pair(game);choose(t,[a]);t.setSelected(t.rotorPart(b.aId));t.updateMechanismPanel();
 input(game,'rotor-side','a','change');assert.equal(a.moving,'a');assert.equal(b.moving,'b');
 input(game,'rotor-mount','fixed','change');assert.equal(a.mount,'fixed');assert.equal(b.mount,'wheel');
 click(game,'rotor-counterclockwise');assert.equal(a.direction,-1);assert.equal(a.enabled,true);assert.equal(b.enabled,false);
 click(game,'rotor-stop');click(game,'rotor-disconnect');assert(!t.rotors.includes(a));assert(t.rotors.includes(b));
});

test('holding Ctrl while carrying a rotor retains release controls and does not select another hinge',()=>{
 const game=lab(),{t}=game,[r]=pair(game),hit=t.rotorPart(r.aId);t.setSelected(null);t.grabQubit({g:hit.g,part:hit.part,point:hit.p,distance:.7});assert(t.getHeld());
 key(game,'keydown','ControlLeft');mouse(game);key(game,'keyup','ControlLeft');assert.equal(t.selectedRotors().length,0);assert.equal(t.getHeld(),null);
});

test('the common panel can drive twenty selected rotors instead of assuming a four-wheel vehicle',()=>{
 const game=lab(),{t}=game,members=Array.from({length:20},(_,i)=>rotorAt(t,t.V((i%5)*.5,.6,Math.floor(i/5)*.5),{direction:i%2?-1:1}));choose(t,members);t.updateMechanismPanel();
 input(game,'rotor-set-name','Veinte ejes','change');click(game,'rotor-set-create');input(game,'rotor-rpm',48);input(game,'rotor-force',40);input(game,'rotor-capacity',128);click(game,'rotor-start');
 assert.equal(t.rotorSetMembers(t.rotorSets[0]).length,20);assert.match(node(game,'rotor-status').textContent,/20 rotores · 20 en marcha/);
 for(let i=0;i<24;i++)t.stepPhysics(1/240);
 assert(members.every(r=>r.enabled&&r.rpm===48&&r.maxTorque===.4&&r.capacity===128&&Number.isFinite(r.actualRpm)&&r.power.inputWatts>0));click(game,'rotor-stop');assert(members.every(r=>!r.enabled));
});
