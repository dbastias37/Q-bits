(function(root,factory){'use strict';const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.QBitsWorkshop=model;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION=1,CREDIT_PER_LEVEL=12,MAX_LEVEL=20,EPS=1e-8;
 const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
 const level=value=>Number.isInteger(value)&&value>=1&&value<=3?value:1;
 const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=EPS*Math.max(1,Math.abs(a),Math.abs(b));
 const RESEARCH=Object.freeze([
  {id:'sensor',label:'Sensor de contacto',cost:8,bench:1,minLevel:0,requires:[]},
  {id:'bench2',label:'Mesa de trabajo II',cost:24,bench:1,minLevel:8,requires:[]},
  {id:'battery2',label:'Batería II · +50 % de capacidad',cost:20,bench:2,minLevel:0,requires:[]},
  {id:'lightweight2',label:'Estructura ligera II · 90 % de masa',cost:20,bench:2,minLevel:0,requires:[]},
  {id:'movement2',label:'Movimiento II · +10 % de velocidad',cost:20,bench:2,minLevel:0,requires:[]},
  {id:'bench3',label:'Mesa de trabajo III',cost:48,bench:2,minLevel:16,requires:[]},
  {id:'battery3',label:'Batería III · doble capacidad',cost:32,bench:3,minLevel:0,requires:['battery2']},
  {id:'lightweight3',label:'Estructura ligera III · 80 % de masa',cost:32,bench:3,minLevel:0,requires:['lightweight2']},
  {id:'movement3',label:'Movimiento III · +20 % de velocidad',cost:32,bench:3,minLevel:0,requires:['movement2']}
 ].map(entry=>Object.freeze({...entry,requires:Object.freeze(entry.requires)})));
 const SPEC=Object.freeze({
  battery:Object.freeze({1:20,2:30,3:40}),
  mass:Object.freeze({1:1,2:.9,3:.8}),
  grip:Object.freeze({1:1,2:.9,3:.8}),
  load:Object.freeze({1:1,2:.85,3:.7}),
  speed:Object.freeze({1:1,2:1.1,3:1.2}),
  movementEnergy:Object.freeze({1:1,2:1.15,3:1.35})
 });
 function benchFrom(research){return research.includes('bench3')?3:research.includes('bench2')?2:1;}
 function completed(progress,n){return record(progress)&&own(progress,'level'+n)&&progress['level'+n]===true;}
 /** Credits are derived from bounded, one-time completion receipts, never from a saved balance. */
 function normalizeProfile(raw){
  raw=record(raw)?raw:{};
  const claimed=[...new Set((Array.isArray(raw.claimed)?raw.claimed:[]).filter(n=>Number.isInteger(n)&&n>=1&&n<=MAX_LEVEL))].sort((a,b)=>a-b);
  const earned=claimed.length*CREDIT_PER_LEVEL,wanted=new Set(Array.isArray(raw.research)?raw.research:[]),research=[];let spent=0;
  for(const item of RESEARCH){
   if(!wanted.has(item.id)||item.bench>benchFrom(research)||item.minLevel&&!claimed.includes(item.minLevel)||item.requires.some(id=>!research.includes(id))||spent+item.cost>earned)continue;
   research.push(item.id);spent+=item.cost;
  }
  return {version:VERSION,claimed,research,earned,spent,credits:earned-spent,bench:benchFrom(research)};
 }
 function awardCompleted(raw,progress){
  const before=normalizeProfile(raw),awardedLevels=[];
  for(let n=1;n<=MAX_LEVEL;n++)if(completed(progress,n)&&!before.claimed.includes(n))awardedLevels.push(n);
  const profile=normalizeProfile({...before,claimed:before.claimed.concat(awardedLevels)});
  return {profile,added:awardedLevels.length*CREDIT_PER_LEVEL,awardedLevels};
 }
 function researchStatus(raw,key,progress){
  const profile=progress===undefined?normalizeProfile(raw):awardCompleted(raw,progress).profile,item=RESEARCH.find(entry=>entry.id===key);
  if(!item)return {id:key,available:false,owned:false,cost:0,reason:'Investigación desconocida.'};
  const owned=profile.research.includes(key);let reason='';
  if(owned)reason='Ya investigado.';
  else if(profile.bench<item.bench)reason='Requiere mesa de trabajo '+item.bench+'.';
  else if(item.minLevel&&!profile.claimed.includes(item.minLevel))reason='Completa el nivel '+item.minLevel+'.';
  else if(item.requires.some(id=>!profile.research.includes(id)))reason='Investiga primero el nivel anterior de esta mejora.';
  else if(profile.credits<item.cost)reason='Faltan '+(item.cost-profile.credits)+' créditos de investigación.';
  return {...item,owned,available:!reason,reason};
 }
 function purchase(raw,key,progress){
  const profile=progress===undefined?normalizeProfile(raw):awardCompleted(raw,progress).profile,status=researchStatus(profile,key);
  if(!status.available)return {ok:false,error:status.reason,profile};
  return {ok:true,profile:normalizeProfile({...profile,research:profile.research.concat(key)}),cost:status.cost};
 }
 function availableResearch(raw,progress){return RESEARCH.map(entry=>researchStatus(raw,entry.id,progress));}
 function defaults(part){return {version:VERSION,ownerId:part?.id,sensor:false,battery:1,lightweight:1,movement:1,baseWeight:part?.weight,ballast:0};}
 function stateValid(part,state){
  if(!record(part)||!Number.isSafeInteger(part.id)||part.id<1||!Number.isFinite(part.weight)||part.weight<=0||part.weight>128||!record(state)||state.version!==VERSION||state.ownerId!==part.id||typeof state.sensor!=='boolean')return false;
  if(['battery','lightweight','movement'].some(key=>!Number.isInteger(state[key])||state[key]<1||state[key]>3))return false;
  return Number.isFinite(state.baseWeight)&&state.baseWeight>0&&state.baseWeight<=128&&Number.isFinite(state.ballast)&&state.ballast>=0&&close(part.weight+state.ballast,state.baseWeight)&&close(part.weight,state.baseWeight*SPEC.mass[state.lightweight]);
 }
 /** Invalid metadata never creates an upgraded battery or movement capability. */
 function partState(part){const raw=part?.mood?.workshop;return raw&&stateValid(part,raw)?{...raw}:defaults(part);}
 function batteryCapacity(part){return SPEC.battery[partState(part).battery];}
 function movementFactors(part){const state=partState(part);return {speed:SPEC.speed[state.movement],energy:SPEC.movementEnergy[state.movement],grip:SPEC.grip[state.lightweight],load:SPEC.load[state.lightweight]};}
 function hasAdaptation(part){const raw=part?.mood?.workshop;if(!raw)return false;if(!stateValid(part,raw))return true;return raw.sensor||raw.battery>1||raw.lightweight>1||raw.movement>1;}
 function materialBalance(part){const state=partState(part);return {piece:part?.weight,bench:state.ballast,total:(part?.weight||0)+state.ballast,base:state.baseWeight};}
 /**
  * Research is paid once globally. Fitting is reversible and costs no additional
  * credits; scene resets therefore cannot consume a finite campaign currency.
  * Removed matter is a nontransferable ballast receipt bound to this piece ID.
  * A caller must block division of adapted parts until all tiers return to I.
  */
 function planPartUpgrade(part,patch,rawProfile){
  const fail=error=>({error});
  if(!record(part)||!Number.isSafeInteger(part.id)||part.id<1||!Number.isFinite(part.weight)||part.weight<=0||part.weight>128||!['cube','pyramid','tetra','coupler'].includes(part.shape||'cube')||!record(part.mood)||!Number.isFinite(part.mood.energy)||part.mood.energy<0||part.mood.energy>1)return fail('La pieza tiene datos inválidos.');
  if(part.mood.production)return fail('La materia de los pedidos no admite adaptaciones.');
  if(part.mood.externalBattery)return fail('Usa los controles de batería: una batería externa no admite adaptaciones de Q-bit.');
  if(!record(patch)||Object.keys(patch).some(key=>!['sensor','battery','lightweight','movement'].includes(key)))return fail('Adaptación desconocida.');
  const saved=part.mood.workshop;if(saved&&!stateValid(part,saved))return fail('La calibración guardada no corresponde a esta pieza.');
  const before=partState(part),next={...before},profile=normalizeProfile(rawProfile);
  for(const key of Object.keys(patch)){
   const value=patch[key];if(key==='sensor'){if(typeof value!=='boolean')return fail('El sensor debe estar activado o desactivado.');}
   else if(!Number.isInteger(value)||value<1||value>3)return fail('El nivel de adaptación debe estar entre I y III.');
   next[key]=value;
  }
  if(next.sensor&&!profile.research.includes('sensor'))return fail('Investiga primero el sensor de contacto.');
  for(const key of ['battery','lightweight','movement'])if(next[key]>1&&!profile.research.includes(key+next[key]))return fail('Investiga primero la mejora '+key+' '+next[key]+'.');
  if(next.lightweight>1&&part.mood.matter)return fail('Recompón y retira las adaptaciones antes de aligerar materia dividida.');
  const storedJ=part.mood.energy*SPEC.battery[before.battery],capacity=SPEC.battery[next.battery];
  if(storedJ>capacity+EPS)return fail('La batería menor no puede guardar la energía actual. Utiliza energía antes de cambiarla.');
  const weight=next.baseWeight*SPEC.mass[next.lightweight];next.ballast=next.baseWeight-weight;
  const mood={...part.mood,energy:Math.min(1,storedJ/capacity),workshop:next};if(Array.isArray(part.mood.blend))mood.blend=[...part.mood.blend];
  if(!next.sensor&&next.battery===1&&next.lightweight===1&&next.movement===1)delete mood.workshop;
  return {part:{...part,weight,mood},materialDelta:part.weight-weight,material:{piece:weight,bench:next.ballast,total:next.baseWeight},storedJ,capacity,cost:0};
 }
 return Object.freeze({VERSION,CREDIT_PER_LEVEL,MAX_LEVEL,RESEARCH,SPEC,normalizeProfile,awardCompleted,researchStatus,purchase,availableResearch,partState,batteryCapacity,movementFactors,hasAdaptation,materialBalance,planPartUpgrade});
});
