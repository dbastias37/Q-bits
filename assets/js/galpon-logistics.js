(function(root,factory){
 'use strict';
 const model=factory(typeof module==='object'&&module.exports?require('./propeller-power.js'):root.QBitsPropellerPower);
 if(typeof module==='object'&&module.exports)module.exports=model;else root.QBitsGalponLogistics=model;
})(typeof globalThis!=='undefined'?globalThis:this,function(Power){
 'use strict';
 const finite=Number.isFinite,positive=value=>Number.isSafeInteger(value)&&value>0;
 function numbers(value,length){
  if(!Array.isArray(value)||value.length!==length||Reflect.ownKeys(value).length!==length+1)return null;
  const result=[];for(let i=0;i<length;i++){const item=Object.getOwnPropertyDescriptor(value,String(i));if(!item?.enumerable||!Object.prototype.hasOwnProperty.call(item,'value')||!finite(item.value))return null;result.push(item.value);}return result;
 }
 const vector=value=>{const result=numbers(value,3);return result?.every(n=>Math.abs(n)<=28)?result:null;};
 const routeId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(value);
 function data(value,allowed){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const prototype=Object.getPrototypeOf(value);if(prototype!==null&&(Object.getPrototypeOf(prototype)!==null||Object.getOwnPropertyDescriptor(prototype,'constructor')?.value?.name!=='Object'))return null;
  const result={};for(const key of Reflect.ownKeys(value)){if(typeof key!=='string'||!allowed.includes(key))return null;const item=Object.getOwnPropertyDescriptor(value,key);if(!item?.enumerable||!Object.prototype.hasOwnProperty.call(item,'value'))return null;result[key]=item.value;}return result;
 }
 function pose(value){
  value=data(value,['pointIndex','position','quaternion','beaconId','beaconPosition','sampleId','clearanceIndices']);if(!value)return null;
  if(!Number.isInteger(value.pointIndex)||value.pointIndex<0||value.pointIndex>=48||!vector(value.position)||!positive(value.beaconId)||!vector(value.beaconPosition))return null;
  const q=numbers(value.quaternion,4);if(!q||Math.abs(Math.hypot(...q)-1)>.001)return null;
  if(value.sampleId!==undefined&&(!Number.isSafeInteger(value.sampleId)||value.sampleId===0))return null;
  if(value.clearanceIndices!==undefined&&(!Array.isArray(value.clearanceIndices)||![1,2].includes(value.clearanceIndices.length)||!numbers(value.clearanceIndices,value.clearanceIndices.length)?.every(i=>Number.isInteger(i)&&i>=0&&i<48&&i!==value.pointIndex)||new Set(value.clearanceIndices).size!==value.clearanceIndices.length))return null;
  return {pointIndex:value.pointIndex,position:[...value.position],quaternion:[...q],beaconId:value.beaconId,beaconPosition:[...value.beaconPosition],...(value.sampleId!==undefined?{sampleId:value.sampleId}:{}),...(value.clearanceIndices?{clearanceIndices:[...value.clearanceIndices]}:{})};
 }
 function validConfig(value){
  value=data(value,['version','receiverId','routeId','dockReceiverId','pick','place']);
  if(!value||value.version!==1||!positive(value.receiverId)||!routeId(value.routeId)||value.dockReceiverId!==undefined&&value.dockReceiverId!==null&&!positive(value.dockReceiverId))return null;
  const result={version:1,receiverId:value.receiverId,routeId:value.routeId};
  if(value.dockReceiverId!==undefined)result.dockReceiverId=value.dockReceiverId;
  for(const key of ['pick','place'])if(value[key]!==undefined){const parsed=pose(value[key]);if(!parsed)return null;result[key]=parsed;}
  return result;
 }
 function list(value,max){
  if(!Array.isArray(value)||value.length>max||Reflect.ownKeys(value).length!==value.length+1)return null;
  const result=[];for(let i=0;i<value.length;i++){const item=Object.getOwnPropertyDescriptor(value,String(i));if(!item?.enumerable||!Object.prototype.hasOwnProperty.call(item,'value'))return null;result.push(item.value);}return result;
 }
 function validRuntime(records){
  if(records===undefined)return [];
  const entries=list(records,32);if(!entries)return null;const result=[],used=new Set(),routes=new Set();
  for(const raw of entries){
   const r=data(raw,['version','receiverId','routeId','points','loop','anchors','previous','trip']);
   if(!r||r.version!==1||!positive(r.receiverId)||used.has(r.receiverId)||!routeId(r.routeId)||routes.has(r.routeId)||typeof r.loop!=='boolean')return null;
   const rawPoints=list(r.points,48),rawAnchors=list(r.anchors,2),trip=data(r.trip,['index','phase','origin','depart','remaining','nextGrab','cornerSettled','direction']),previous=data(r.previous,['height','speed','heading']);
   if(!rawPoints||rawPoints.length<2||!rawAnchors||rawAnchors.length!==2||!trip||!previous||!Power.validConfig(previous))return null;
   const points=[],anchors=[];
   for(const value of rawPoints){const p=data(value,['x','y','z','action','wait']);if(!p||!['x','y','z'].every(k=>finite(p[k])&&Math.abs(p[k])<=28)||p.y<.15||p.y>3||!['pass','wait','land','drop','grab'].includes(p.action)||!finite(p.wait)||p.wait<0||p.wait>60)return null;points.push(p);}
   for(const value of rawAnchors){const a=data(value,['id','pose']),p=a&&numbers(a.pose,7);if(!a||!positive(a.id)||!p||p.slice(0,3).some(n=>Math.abs(n)>28)||Math.abs(Math.hypot(...p.slice(3))-1)>.001)return null;anchors.push({id:a.id,pose:p});}
   if(anchors[0].id===anchors[1].id||!Number.isInteger(trip.index)||trip.index<0||trip.index>=142||!['lift','travel','pickup','wait','descend','ground'].includes(trip.phase)||!vector(trip.origin)||!vector(trip.depart)||![-1,1].includes(trip.direction)||!['remaining','nextGrab','cornerSettled'].every(k=>finite(trip[k])&&trip[k]>=0&&trip[k]<=120))return null;
   used.add(r.receiverId);routes.add(r.routeId);result.push({version:1,receiverId:r.receiverId,routeId:r.routeId,points,loop:r.loop,anchors,previous:{...previous},trip:{...trip,origin:[...trip.origin],depart:[...trip.depart]}});
  }
  return result;
 }
 // An estimate of work, not another battery. Actual forces and every energy
 // debit stay in the existing propeller/gripper/electrical controllers.
 function estimate(input={}){
  const fail=(reason,message,extra={})=>({ok:false,reason,message,...extra});
  const points=input.points;
  if(!Array.isArray(points)||points.length<2||points.length>142||points.some(p=>!p||!['x','y','z'].every(k=>finite(p[k]))))return fail('route','Prepara un recorrido válido antes de calcular la autonomía.');
  const units=input.units,payload=input.payload??0,cells=input.cells,energy=input.energy;
  if(!finite(units)||units<=0||!finite(payload)||payload<0||!finite(energy)||energy<0||!Number.isInteger(cells)||cells<1)return fail('battery','Conecta una batería con carga real.');
  const speed=Math.max(.1,Math.min(.5,finite(input.speed)&&input.speed>0?input.speed:.5)),height=Math.max(.15,...points.map(p=>p.y));
  const mass=(units+payload)*Power.SPEC.kgPerUnit,gripWatts=payload>0?.08+.08*payload:0;
  const state={count:input.count,mass,gravity:input.gravity??9.8,height,targetHeight:height,cells,energy,availableWatts:cells*Power.SPEC.wattsPerCell-gripWatts,enabled:true,spool:1};
  const hover=Power.evaluate(state,0);
  if(!hover.canLift)return fail('load','Exceso de carga para estas hélices y baterías a la altura del recorrido.',{load:units+payload,maxLoad:hover.maxLoad/1.03});
  let distance=0,climb=0;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];distance+=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);climb+=Math.max(0,b.y-a.y);}
  // A production trip always reserves the same orthogonal path back home,
  // even before Repeat is selected. Every authored stop and corner costs time.
  const returnFactor=input.returnTrip===false?1:2;
  const stops=points.reduce((n,p)=>n+(p.wait||0),0)*returnFactor;
  const seconds=distance*returnFactor/speed*1.55+points.length*returnFactor*1.5+stops+8;
  const watts=hover.inputWatts+gripWatts,landingReserveJ=watts*12;
  const climbJ=mass*(input.gravity??9.8)*(height+climb*returnFactor)/.72;
  const motionJ=mass*speed*speed*Math.max(1,points.length-1)*returnFactor/.72;
  const requiredJ=(watts*seconds+climbJ+motionJ+.05)*1.25+landingReserveJ;
  const summary={requiredJ,availableJ:energy,seconds,landingReserveJ,watts,distance:distance*returnFactor,load:units+payload,maxLoad:hover.maxLoad/1.03};
  return energy+1e-8<requiredJ?fail('energy','Batería insuficiente: '+Math.ceil(energy)+' J disponibles; reserva estimada '+Math.ceil(requiredJ)+' J para ida, carga, vuelta y aterrizaje.',summary):{ok:true,message:'Reserva estimada '+Math.ceil(requiredJ)+' J · incluye carga, regreso y aterrizaje.',...summary};
 }
 return Object.freeze({validConfig,pose,validRuntime,estimate});
});
