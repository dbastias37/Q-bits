const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
function panel(){
 const elements=new Map();function element(tag='div'){return {tagName:tag.toUpperCase(),hidden:false,disabled:false,value:'',children:[],dataset:{},attributes:{},listeners:{},textContent:'',tabIndex:0,addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);},dispatch(type,extra={}){for(const fn of this.listeners[type]||[])fn({target:this,preventDefault(){},...extra});},setAttribute(key,value){this.attributes[key]=String(value);},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},focus(){this.focused=true;}};}
 const document={querySelector(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element};const sandbox={document,console};sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js/robot-arm-panel.js'),'utf8'),sandbox);
 let state={available:true,canConvert:true,canRegister:false,selectedLabel:'Q-bit 3',targets:[]},result={ok:true,message:'Aplicado'},calls=[];
 const ui=sandbox.QBitsRobotArmPanel.create({snapshot:()=>state,action:(type,payload)=>{calls.push({type,payload:JSON.parse(JSON.stringify(payload))});return result;}});
 const node=id=>document.querySelector('#arm-'+id);return {ui,node,document,calls,setState:s=>{state=s;ui.refresh();},setResult:r=>result=r};
}
function model(){return {available:true,selectedLabel:'Brazo 1',gripper:{id:4,mode:'color',color:'#00ff99',targetId:2,shape:'cube',capacity:4},targets:[{id:2,label:'Q-bit dos'},{id:3,label:'Pieza tres'}],arm:{name:'Brazo 1',status:'Esperando objeto',running:false,phase:'detect',pickReady:true,placeReady:true,repeat:true,joints:[{name:'Base',angle:0}],load:1,capacity:4,energy:50,cycles:2,efficiency:80}};}

test('gripper edits are explicit and target changes discard the previous piece draft',()=>{
 const p=panel();p.setState(model());assert.equal(p.node('filter-color').value,'#00ff99');assert.equal(p.node('color-row').hidden,false);p.node('filter-color').value='#112233';p.node('filter-color').dispatch('input');p.ui.refresh();assert.equal(p.node('filter-color').value,'#112233');assert.equal(p.calls.length,0);
 p.node('apply-filter').dispatch('click');assert.deepEqual(p.calls.at(-1),{type:'filter',payload:{mode:'color',color:'#112233',shape:'cube',targetId:2,capacity:4,reachCm:5}});
 p.node('filter-color').value='#123456';p.node('filter-color').dispatch('input');const next=model();next.gripper.id=9;next.gripper.color='#cccccc';p.setState(next);assert.equal(p.node('filter-color').value,'#cccccc');
});

test('teach, physical jog and repeat commands carry explicit stable payloads',()=>{
 const p=panel();p.setState(model());p.node('teach-pick').dispatch('click');p.node('teach-place').dispatch('click');p.node('joints').children[0].children[1].dispatch('click');p.node('repeat').checked=false;p.node('repeat').dispatch('change');
 assert.deepEqual(p.calls,[{type:'teach',payload:{pose:'pick'}},{type:'teach',payload:{pose:'place'}},{type:'jog',payload:{joint:0,degrees:-15}},{type:'repeat',payload:{value:false}}]);
});

test('running arm exposes stop and release while blocking editing, and reports actual phase',()=>{
 const p=panel(),m=model();m.arm.running=true;m.arm.phase='moving';p.setState(m);for(const id of ['start','teach-pick','teach-place','jog-step','filter-mode','apply-filter','grab'])assert.equal(p.node(id).disabled,true,id);assert.equal(p.node('stop').disabled,false);assert.equal(p.node('release').disabled,false);assert.equal(p.node('phase-move').dataset.active,'true');assert.equal(p.node('phase-detect').dataset.active,'false');assert.equal(p.node('energy').textContent,'50 J');assert.equal(p.node('efficiency').textContent,'80 %');
});

test('specific shape is distinct from primitive type and has an explicit learn action',()=>{
 const p=panel(),m=model();m.gripper.mode='form';m.gripper.formSignature='shape:test';p.setState(m);assert.equal(p.node('shape-row').hidden,false);assert.equal(p.node('shape-type-row').hidden,true);assert.equal(p.node('form-row').hidden,false);assert.match(p.node('shape-memory').textContent,/aprendida/);p.node('capture-shape').dispatch('click');assert.equal(p.calls[0].type,'captureShape');
});

test('empty selection and failed adapter action stay readable without stale numeric facts',()=>{
 const p=panel();p.ui.refresh();assert.equal(p.node('controls').hidden,true);assert.equal(p.node('gripper-controls').hidden,true);assert.equal(p.node('start').disabled,true);assert.equal(p.node('energy').textContent,'—');p.setResult({ok:false,message:'No hay espacio libre.'});p.node('blueprint').dispatch('click');assert.equal(p.node('feedback').textContent,'No hay espacio libre.');assert.equal(p.node('feedback').dataset.error,'true');
});

test('read-only pickup check preserves an unapplied filter and shows its result beside the check button',()=>{
 const p=panel();p.setState(model());p.node('filter-color').value='#112233';p.node('filter-color').dispatch('input');p.setResult({ok:true,message:'Objeto al alcance'});p.node('check').dispatch('click');
 assert.equal(p.node('filter-color').value,'#112233');assert.deepEqual(p.calls,[{type:'check',payload:{}}]);assert.equal(p.node('check-result').textContent,'Objeto al alcance');assert.equal(p.node('feedback').textContent,'');
});

test('saved library categories preserve keyboard selection and expose only their list',()=>{
 const p=panel(),d=p.document,forms=d.querySelector('#saved-library-forms-tab'),mechanisms=d.querySelector('#saved-library-mechanisms-tab');assert.equal(d.querySelector('#saved-shape-list').hidden,false);assert.equal(d.querySelector('#saved-library-mechanisms').hidden,true);forms.dispatch('keydown',{key:'ArrowRight'});assert.equal(d.querySelector('#saved-shape-list').hidden,true);assert.equal(d.querySelector('#saved-library-mechanisms').hidden,false);assert.equal(mechanisms.attributes['aria-selected'],'true');assert.equal(mechanisms.focused,true);
});


test('joint step offers 5, 15, 45 and 90 degrees without issuing a command until a direction is chosen',()=>{
 const p=panel();p.setState(model());assert.equal(p.node('jog-step').value,'15');
 for(const step of [5,45,90]){p.node('jog-step').value=String(step);p.node('jog-step').dispatch('change');const row=p.node('joints').children[0];assert.equal(row.children[1].textContent,'−'+step+'°');assert.equal(row.children[3].textContent,'+'+step+'°');assert.match(row.children[3].attributes['aria-label'],new RegExp('más '+step+' grados'));row.children[3].dispatch('click');assert.deepEqual(p.calls.at(-1),{type:'jog',payload:{joint:0,degrees:step}});p.ui.refresh();assert.equal(p.node('jog-step').value,String(step));}
 assert.equal(p.calls.length,3);p.node('jog-step').value='360';p.node('jog-step').dispatch('change');assert.equal(p.node('jog-step').value,'15');assert.equal(p.calls.length,3);
});
