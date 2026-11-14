(function(root,factory){'use strict';const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.QBitsProduction=model;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const chapters=[['19','Una pieza cada vez','Dosificación · inventario y orden'],['20','Los primeros seis paquetes','Materia, receta y entrega autónoma']];
 const levels=[
  {count:1,gates:[{kind:'production'}],production:{maxTorque:.4,units:3,packages:false,target:3,minAutonomy:5,budget:20,interval:1.2},lines:['Estos bloques son materia de trabajo. No saludan ni se ofenden: los compañeros seguimos fuera de los paquetes. El depósito contiene tres medias unidades, en orden A, B, A.','Apunta a la estación y pulsa E. Ajusta el intervalo del dosificador e inicia el lote. El rotor mueve la cinta; el receptor solo cuenta las piezas que llegan físicamente y en su orden. Si intervienes, reinicia el lote desde la estación.']},
  {count:1,gates:[{kind:'production'}],production:{maxTorque:.4,units:12,packages:true,target:6,minAutonomy:15,budget:30,interval:2.4},lines:['Ahora el encargo pide seis paquetes: una media unidad A y una B en cada uno. Tenemos doce medias unidades. La envoltura no es una fábrica secreta de materia, aunque sería útil para el presupuesto.','Empieza con el dosificador a 2,4 s: demasiadas unidades juntas pueden atascar la línea. La cámara reúne A con B y la cinta lleva cada paquete al receptor. Completa el lote sin intervenir y con al menos quince segundos de trabajo útil sin intervenir. E abre los controles; reiniciar descarta el intento y repone un único lote de prueba.']}
 ];
 const lessons={
  production19:{title:'VII · Una pieza cada vez',level:19,text:'Un dosificador entrega unidades separadas desde una reserva finita. La salida debe estar libre antes de retirar otra unidad del depósito. El receptor comprueba identidad y orden: una pieza que vuelve a pasar no cuenta dos veces.',recipe:null},
  production20:{title:'VIII · Un paquete conserva su materia',level:20,text:'La receta de este encargo reúne una media unidad A y una B. El paquete conserva ambas identidades y una unidad de masa. La cámara espera si la salida está ocupada. La producción solo se completa cuando todos los paquetes llegan al receptor durante el mismo intento sin intervención. El contador suma solo segundos de trabajo útil de ese lote y se congela durante esperas; un intento interrumpido requiere reiniciar.',recipe:null}
 };
 const HALF=.5,EPS=1e-8;
 const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 const validId=id=>Number.isSafeInteger(id)&&id>0;
 const close=(a,b)=>Number.isFinite(a)&&Math.abs(a-b)<EPS;
 const validEntry=part=>record(part)&&validId(part.id)&&['A','B'].includes(part.kind)&&close(part.weight,HALF)&&(!Object.prototype.hasOwnProperty.call(part,'shape')||part.shape==='cube');
 function create(entries,goal={}){
  if(!Array.isArray(entries)||!entries.length||entries.some(part=>!validEntry(part))||new Set(entries.map(part=>part.id)).size!==entries.length)return {error:'El lote necesita identidades únicas y medias unidades A o B.'};
  goal=record(goal)?goal:{};
  const packages=goal.packages===true,target=goal.target??(packages?entries.length/2:entries.length);
  if(!Number.isInteger(target)||target<1||entries.length!==target*(packages?2:1)||packages&&entries.filter(part=>part.kind==='A').length!==target||packages&&entries.filter(part=>part.kind==='B').length!==target)return {error:'La reserva no coincide con el encargo.'};
  const units=Object.freeze(entries.map(part=>Object.freeze({id:part.id,kind:part.kind,weight:HALF})));
  const status=Object.create(null);for(const part of units)status[part.id]='stock';
  return {units,goal:Object.freeze({packages,target}),stock:units.map(part=>part.id),released:[],packed:[],accepted:[],status,error:null};
 }
 function usable(state){return record(state)&&Array.isArray(state.units)&&Array.isArray(state.stock)&&record(state.status)&&record(state.goal)&&Array.isArray(state.released)&&Array.isArray(state.packed)&&Array.isArray(state.accepted)&&!state.error;}
 function original(state,id){return state.units.find(part=>part.id===id);}
 function matches(state,part,status){const unit=validEntry(part)&&original(state,part.id);return !!unit&&unit.kind===part.kind&&close(unit.weight,part.weight)&&state.status[part.id]===status;}
 function release(state){
  if(!usable(state)||!state.stock.length)return null;
  const id=state.stock[0],unit=original(state,id);if(!unit||state.status[id]!=='stock')return null;
  state.stock.shift();state.status[id]='loose';state.released.push(id);return unit;
 }
 function pack(state,parts){
  if(!usable(state)||!state.goal.packages||!Array.isArray(parts)||parts.length!==2||parts[0]?.id===parts[1]?.id||parts.some(part=>!matches(state,part,'loose'))||!parts.some(part=>part.kind==='A')||!parts.some(part=>part.kind==='B'))return {error:'La receta exige una media unidad A y una B disponibles.'};
  const ids=Object.freeze(parts.map(part=>part.id)),item=Object.freeze({ids,kind:'package',weight:1});
  for(const id of ids)state.status[id]='packed';state.packed.push(item);return item;
 }
 function accept(state,item){
  if(!usable(state)||!record(item)||state.accepted.length>=state.goal.target)return false;
  let accepted;
  if(state.goal.packages){
   if(item.kind!=='package'||!Array.isArray(item.ids)||item.ids.length!==2||item.ids.some(id=>!validId(id))||new Set(item.ids).size!==2||!close(item.weight,1))return false;
   const made=state.packed.find(entry=>entry.ids.every(id=>item.ids.includes(id)));
   if(!made||made.ids.some(id=>state.status[id]!=='packed'))return false;
   accepted=made;
  }else{
   if(!matches(state,item,'loose'))return false;
   // Order is the original source sequence, independent of delivery timing.
   const expected=state.units[state.accepted.length];if(expected.id!==item.id||expected.kind!==item.kind)return false;
   accepted=Object.freeze({id:item.id,kind:item.kind,weight:HALF});
  }
  for(const id of accepted.ids||[accepted.id])state.status[id]='delivered';state.accepted.push(accepted);return true;
 }
 function totals(state){
  if(!usable(state))return null;
  const result={initialMass:state.units.length*HALF,stock:0,loose:0,packed:0,delivered:0,stockMass:0,looseMass:0,packedMass:0,deliveredMass:0,totalMass:0,packages:0,accepted:state.accepted.length};
  for(const unit of state.units){const status=state.status[unit.id];if(!['stock','loose','packed','delivered'].includes(status))return null;result[status]++;result[status+'Mass']+=unit.weight;result.totalMass+=unit.weight;}
  result.packages=state.packed.filter(item=>item.ids.every(id=>state.status[id]==='packed')).length;return result;
 }
 return Object.freeze({chapters,levels,lessons,create,release,package:pack,accept,totals});
});
