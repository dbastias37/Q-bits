const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
function panel(){
 const elements=new Map();function element(){return {hidden:false,disabled:false,checked:false,value:'',children:[],dataset:{},attributes:{},listeners:{},textContent:'',addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);},dispatch(type,extra={}){for(const fn of this.listeners[type]||[])fn({target:this,preventDefault(){},...extra});},setAttribute(key,value){this.attributes[key]=String(value);}};}
 const document={querySelector(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);}};const sandbox={document,console};sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js/conveyor-panel.js'),'utf8'),sandbox);
 let state={available:true},result={ok:true,message:'Aplicado'},calls=[],throws=false;
 const ui=sandbox.QBitsConveyorPanel.create({snapshot:()=>state,action:(type,payload)=>{if(throws)throw new Error('adapter');calls.push({type,payload:JSON.parse(JSON.stringify(payload))});return result;}});
 const node=id=>document.querySelector('#conveyor-'+id);node('orientation').value='0';node('height').value='0';return {ui,node,calls,setState:s=>{state=s;ui.refresh();},setResult:r=>result=r,setThrows:v=>{throws=v;}};
}
function model(){return {available:true,selectedLabel:'Cinta recta 3',supportsAvailable:true,materialsWithSupports:{straight:'19 cubos + 6 enganches',left:'24 cubos + 8 enganches',right:'24 cubos + 8 enganches'},materials:{straight:'15 cubos + 6 enganches',left:'20 cubos + 8 enganches',right:'20 cubos + 8 enganches'},conveyor:{id:3,kind:'straight',enabled:false,direction:1,status:'Detenida',load:2,capacity:8,speed:0,energy:33.75,connected:2}};}

test('empty selection permits blueprints but blocks transport and clears old facts',()=>{
 const p=panel();p.setState(model());p.setState({available:true});assert.equal(p.node('controls').hidden,true);assert.equal(p.node('toggle').disabled,true);assert.equal(p.node('reverse').disabled,true);assert.equal(p.node('blueprint-straight').disabled,false);assert.equal(p.node('extend').disabled,true);for(const id of ['load','speed','energy','connected'])assert.equal(p.node(id).textContent,'—');p.node('toggle').dispatch('click');assert.equal(p.calls.length,0);
});

test('three blueprint commands carry placement and explicit construction options',()=>{
 const p=panel();p.setState(model());p.node('orientation').value='3';p.node('height').value='1.08';p.node('supports').checked=true;p.node('supports').dispatch('change');
 for(const kind of ['straight','left','right']){p.node('blueprint-'+kind).dispatch('click');assert.deepEqual(p.calls.at(-1),{type:'blueprint',payload:{kind,supports:true,quarterTurns:3,height:1.08,extend:false}});}
 assert.match(p.node('materials-straight').textContent,/19 cubos/);p.node('supports').checked=false;p.node('supports').dispatch('change');assert.match(p.node('materials-straight').textContent,/15 cubos/);assert.equal(p.node('supports-row').hidden,false);
});

test('extending a selected conveyor disables manual positioning and never survives selection loss',()=>{
 const p=panel();p.setState(model());p.node('extend').checked=true;p.node('extend').dispatch('change');p.node('height').value='invalid';p.node('orientation').value='invalid';assert.equal(p.node('orientation').disabled,true);assert.equal(p.node('height').disabled,true);p.node('blueprint-right').dispatch('click');assert.equal(p.calls.at(-1).payload.extend,true);assert.equal(p.calls.at(-1).payload.height,0);assert.equal(p.calls.at(-1).payload.quarterTurns,0);p.node('height').value='0';p.node('orientation').value='0';
 p.setState({available:true});assert.equal(p.node('extend').checked,false);assert.equal(p.node('height').disabled,false);p.node('blueprint-straight').dispatch('click');assert.equal(p.calls.at(-1).payload.extend,false);assert.equal(p.calls.at(-1).payload.supports,false);assert.equal(p.node('supports-row').hidden,true);
});

test('transport controls reflect actual selection and emit direction and state changes',()=>{
 const p=panel();p.setState(model());p.node('toggle').dispatch('click');p.node('reverse').dispatch('click');p.node('forward').dispatch('click');assert.deepEqual(p.calls,[{type:'toggle',payload:{enabled:true}},{type:'direction',payload:{direction:-1}},{type:'direction',payload:{direction:1}}]);
 const m=model();m.conveyor.enabled=true;m.conveyor.direction=-1;m.conveyor.status='Transportando';m.conveyor.speed=.186;m.conveyor.connected=1;p.setState(m);assert.equal(p.node('toggle').textContent,'Detener tramo');assert.equal(p.node('reverse').attributes['aria-pressed'],'true');assert.equal(p.node('forward').attributes['aria-pressed'],'false');assert.equal(p.node('status').textContent,'Transportando');assert.equal(p.node('speed').textContent,'0.19 m/s');assert.equal(p.node('energy').textContent,'33.8 J');assert.equal(p.node('connected').textContent,'1 tramo');p.node('toggle').dispatch('click');assert.deepEqual(p.calls.at(-1),{type:'toggle',payload:{enabled:false}});
});

test('unavailable conveyor controls cannot submit actions and placement rejects invalid values',()=>{
 const p=panel();const m=model();m.available=false;p.setState(m);for(const id of ['blueprint-straight','blueprint-left','blueprint-right','toggle','forward','reverse']){assert.equal(p.node(id).disabled,true);p.node(id).dispatch('click');}assert.equal(p.calls.length,0);
 p.setState(model());for(const height of ['NaN','-0.09','6.1']){p.node('height').value=height;p.node('blueprint-straight').dispatch('click');assert.equal(p.calls.length,0);assert.equal(p.node('feedback').dataset.error,'true');}p.node('height').value='0';p.node('orientation').value='4';p.node('blueprint-straight').dispatch('click');assert.equal(p.calls.length,0);
});

test('failed actions stay visible, exceptions recover, and selecting another conveyor clears feedback',()=>{
 const p=panel();p.setState(model());p.setResult({ok:false,message:'Falta batería.'});p.node('toggle').dispatch('click');assert.equal(p.node('feedback').textContent,'Falta batería.');assert.equal(p.node('feedback').dataset.error,'true');p.ui.refresh();assert.equal(p.node('feedback').textContent,'Falta batería.');p.setThrows(true);p.node('toggle').dispatch('click');assert.match(p.node('feedback').textContent,/No se pudo aplicar/);p.setThrows(false);p.setResult({ok:true,message:'Tramo iniciado.'});p.node('toggle').dispatch('click');assert.equal(p.node('feedback').textContent,'Tramo iniciado.');const m=model();m.conveyor.id=9;p.setState(m);assert.equal(p.node('feedback').textContent,'');
});

test('shipping markup labels construction controls and loads conveyor before game',()=>{
 const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),boot=fs.readFileSync(path.join(root,'assets/js/boot.js'),'utf8');assert.match(html,/id="conveyor-panel" aria-labelledby="conveyor-title"/);assert.match(html,/assets\/css\/conveyor-panel\.css/);for(const id of ['orientation','height','supports','extend','toggle','forward','reverse','blueprint-straight','blueprint-left','blueprint-right'])assert.equal((html.match(new RegExp('id="conveyor-'+id+'"','g'))||[]).length,1,id);assert.ok(html.indexOf('id="arm-panel"')<html.indexOf('id="conveyor-panel"'));assert.ok(boot.indexOf("loadScript('assets/js/conveyor-panel.js')")<boot.indexOf("loadScript('assets/js/game.js')"));
});
