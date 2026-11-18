const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
function fakeNode(){return {value:'',children:[],hidden:false,disabled:false,textContent:'',dataset:{},attributes:{},listeners:{},replaceChildren(...items){this.children=items;},append(...items){this.children.push(...items);},appendChild(item){this.children.push(item);},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,f){(this.listeners[k]??=[]).push(f);},removeEventListener(k,f){this.listeners[k]=this.listeners[k].filter(x=>x!==f);},dispatch(k){for(const f of this.listeners[k]||[])f();}};}
function panel(){
 const nodes=new Map();const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 for(const [,id]of html.matchAll(/id="(servo-[^"]+)"/g))nodes.set('#'+id,fakeNode());
 const host={querySelector:id=>nodes.get(id)},sandbox={document:{createElement:()=>fakeNode()}};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js/servo-panel.js'),'utf8'),sandbox);
 const calls=[];let applyResult=true;const ui=sandbox.QBitsServoPanel.create({host,onApply:patch=>{calls.push({type:'apply',patch:JSON.parse(JSON.stringify(patch))});return applyResult;},onAction:type=>{calls.push({type});return true;},onMarch:action=>{calls.push({type:'march',...action});return true;}});
 return {ui,calls,node:id=>nodes.get('#servo-'+id),setApplyResult:result=>applyResult=result};
}
const snapshot=()=>({id:1,kind:'hinge',label:'Servo bisagra',angle:12,min:-40,max:40,target:0,speed:45,mode:'repeat',enabled:false,torque:.4,capacity:32});
test('servo selection has shared-tip explanation and changing target resets only its own draft',()=>{
 const p=panel();p.ui.render(snapshot());assert.match(p.node('description').textContent,/puntas permanecen siempre unidas/);assert.equal(p.node('controls').hidden,false);assert.equal(p.node('angle').textContent,'Ángulo actual: 12°');
 p.node('speed').value='80';p.node('speed').dispatch('input');p.ui.render({...snapshot(),angle:15});assert.equal(p.node('speed').value,'80');assert.equal(p.calls.length,0);
 p.ui.render({...snapshot(),id:2});assert.equal(p.node('speed').value,'45');p.ui.render(null);assert.equal(p.node('controls').hidden,true);assert.equal(p.node('start').disabled,true);
});
test('start applies visible settings before movement and never starts when application fails',()=>{
 const p=panel();p.ui.render(snapshot());p.node('speed').value='70';p.node('start').dispatch('click');assert.deepEqual(p.calls,[{type:'apply',patch:{min:-40,max:40,speed:70,mode:'repeat',target:0}},{type:'start'}]);
 p.calls.length=0;p.setApplyResult({ok:false,message:'Sin batería'});p.node('start').dispatch('click');assert.equal(p.calls.length,1);assert.equal(p.node('feedback').textContent,'Sin batería');assert.equal(p.node('feedback').dataset.error,'true');
});
test('invalid ranges and out-of-range held target cannot command the motor',()=>{
 const p=panel();p.ui.render(snapshot());p.node('min').value='60';p.node('start').dispatch('click');assert.equal(p.calls.length,0);
 p.ui.render({...snapshot(),id:2,mode:'hold'});p.node('target').value='80';p.node('start').dispatch('click');assert.equal(p.calls.length,0);assert.match(p.node('feedback').textContent,/dentro del recorrido/);
 p.node('target').value='20';p.node('speed').value='';p.node('apply').dispatch('click');assert.equal(p.calls.length,0);
});
test('running controls lock settings and expose stop, retain the measured angle, and dispose their events',()=>{
 const p=panel();p.ui.render({...snapshot(),enabled:true});assert.equal(p.node('start').disabled,true);assert.equal(p.node('stop').disabled,false);p.node('stop').dispatch('click');assert.equal(p.node('invert').disabled,true);p.node('invert').dispatch('click');assert.deepEqual(p.calls,[{type:'stop'}]);
 assert.match(p.node('pointer').attributes.d,/M 100 92 L/);p.ui.destroy();p.node('stop').dispatch('click');assert.equal(p.calls.length,1);
});

test('march controls start and stop the whole mechanism and expose opposed starting ends',()=>{
 const p=panel(),march={running:false,status:'Detenido',members:[{id:1,label:'Cadera',direction:1,angle:0,min:-20,max:20},{id:2,label:'Rodilla',direction:-1,angle:0,min:-30,max:30}]};p.ui.render({...snapshot(),march});
 assert.equal(p.node('march-members').children.length,2);p.node('march-start').dispatch('click');assert.equal(p.calls.at(-1).type,'start');
 const select=p.node('march-members').children[1].children[0].children[0];assert.equal(select.value,'-1');select.value='1';select.dispatch('change');assert.equal(p.calls.at(-1).direction,1);
 p.ui.render({...snapshot(),march:{...march,running:true}});assert(p.node('march-start').disabled);p.node('march-stop').dispatch('click');assert.equal(p.calls.at(-1).type,'stop');
});
