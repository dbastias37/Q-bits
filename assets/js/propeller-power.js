(function(root,factory){'use strict';const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.QBitsPropellerPower=model;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // Deliberately calibrated for Q-bits: u is material weight, 0.25 kg/u.
 // No real aircraft specification is implied. Height reduces available thrust;
 // batteries supply power AND energy, never increase a motor's thrust ceiling.
 const SPEC=Object.freeze({maxPropellers:4,kgPerUnit:.25,forcePerPropeller:135,wattsPerCell:65,idleWatts:.15,liftWatts:.018,heightLoss:.16,maxHeight:3,maxSpeed:1.2,maxRpm:2400});
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),finite=(n,d=0)=>Number.isFinite(n)?n:d;
 const maxPoints=48;
 function validRoute(route){
  return !!route&&typeof route.loop==='boolean'&&Array.isArray(route.points)&&route.points.length<=maxPoints&&route.points.every(p=>
   p&&[p.x,p.z].every(n=>Number.isFinite(n)&&Math.abs(n)<=28)&&Number.isFinite(p.height)&&p.height>=.15&&p.height<=SPEC.maxHeight&&
   ['pass','wait','land','drop','grab'].includes(p.action)&&Number.isFinite(p.wait)&&p.wait>=0&&p.wait<=120);
 }
 function config(value={}){return {height:clamp(finite(value.height,.5),.15,SPEC.maxHeight),speed:clamp(finite(value.speed,0),0,SPEC.maxSpeed),heading:clamp(finite(value.heading,0),-Math.PI,Math.PI),...(validRoute(value.route)?{route:{loop:value.route.loop,points:value.route.points.map(({x,z,height,action,wait})=>({x,z,height,action,wait}))}}:{})};}
 function validConfig(v){return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>['height','speed','heading','route'].includes(k))&&(v.route===undefined||validRoute(v.route))&&['height','speed','heading'].every(k=>Number.isFinite(v[k])&&config(v)[k]===v[k]);}
 function evaluate(s={},dt=0){
  const n=Math.floor(clamp(finite(s.count),0,256)),mass=Math.max(0,finite(s.mass)),gravity=clamp(finite(s.gravity,9.8),0,40),height=Math.max(0,finite(s.height)),cells=Math.max(0,Math.floor(finite(s.cells))),energy=Math.max(0,finite(s.energy)),seconds=clamp(finite(dt),0,.1),efficiency=1/(1+height*SPEC.heightLoss);
  const powerLimit=clamp(finite(s.availableWatts,cells*SPEC.wattsPerCell),0,cells*SPEC.wattsPerCell),watts=force=>n?SPEC.idleWatts*n+SPEC.liftWatts*n*Math.pow(Math.max(0,force)/n,1.5)/Math.sqrt(efficiency):0;
  const motorLimit=n*SPEC.forcePerPropeller*efficiency,powerForce=n?Math.pow(Math.max(0,powerLimit-SPEC.idleWatts*n)*Math.sqrt(efficiency)/(SPEC.liftWatts*n),2/3)*n:0,maxForce=Math.min(motorLimit,powerForce);
  let reason=!n?'incomplete':n>SPEC.maxPropellers?'limit':!cells?'battery':energy<=1e-8?'empty':s.blocked?'blocked':s.held?'held':s.fixed?'fixed':null;
  const canLift=!reason&&maxForce>mass*gravity*1.03;
  if(!reason&&!canLift)reason='overload';
  const vy=finite(s.vy),target=s.landing?0:config({height:s.targetHeight}).height;
  let fy=mass*Math.max(0,gravity+clamp((target-height)*5-vy*3.5,-4,3));
  let fx=mass*clamp(finite(s.targetVx)-finite(s.vx),-1.5,1.5)*2,fz=mass*clamp(finite(s.targetVz)-finite(s.vz),-1.5,1.5)*2;
  const asked=Math.hypot(fx,fy,fz),cap=asked?Math.min(1,maxForce/asked):0;fx*=cap;fy*=cap;fz*=cap;
  // A loaded drone may settle when a new payload exceeds capacity; it cannot
  // create extra lift. Static overload is a failed start, not negative energy.
  const running=!!s.enabled&&powerLimit>=n*SPEC.idleWatts&&!['incomplete','limit','battery','empty','blocked','held','fixed'].includes(reason);
  const ramp=clamp(finite(s.spool,1),0,1);fx*=ramp;fy*=ramp;fz*=ramp;
  let force=running?Math.hypot(fx,fy,fz):0;
  let inputWatts=running?watts(force)+Math.max(0,fx*finite(s.vx)+fy*vy+fz*finite(s.vz))/.72:0;
  // Reserve power for translation/climb as well as hovering. Re-evaluate force
  // rather than reporting free motion above the battery's continuous output.
  if(inputWatts>powerLimit){let lo=0,hi=1;const motion=Math.max(0,fx*finite(s.vx)+fy*vy+fz*finite(s.vz))/.72;for(let i=0;i<16;i++){const scale=(lo+hi)/2;if(watts(force*scale)+motion*scale>powerLimit)hi=scale;else lo=scale;}fx*=lo;fy*=lo;fz*=lo;force*=lo;inputWatts=watts(force)+motion*lo;}
  const spentJoules=Math.min(energy,inputWatts*seconds),fraction=seconds>0&&inputWatts>0?spentJoules/(inputWatts*seconds):1;
  if(!running){fx=fy=fz=0;}else{fx*=fraction;fy*=fraction;fz*=fraction;}
  return {reason,canLift,fx,fy,fz,inputWatts,spentJoules,maxForce,maxLoad:gravity>0?maxForce/gravity/SPEC.kgPerUnit:0,load:mass/SPEC.kgPerUnit,remainingSeconds:inputWatts>0?Math.max(0,energy-spentJoules)/inputWatts:null,rpm:running?SPEC.maxRpm*Math.sqrt(force/Math.max(1e-8,motorLimit))*fraction:0,exhausted:running&&seconds>0&&energy<=inputWatts*seconds};
 }
 return Object.freeze({SPEC,maxPoints,config,validConfig,evaluate});
});
