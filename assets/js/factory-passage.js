// The gallery is scenery, not a second physics simulation or a material source.
// It owns no Cannon bodies, DOM nodes, inventory entries, clocks or GPU buffers.
(function(root,factory){
 'use strict';
 const passage=factory();
 if(typeof module==='object'&&module.exports)module.exports=passage;
 else root.QBitsFactoryPassage=passage;
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const VERSION=1,PLAYER_RADIUS=.28,LEAD_DISTANCE=1.35,WAIT_DISTANCE=2.6,GUIDE_SPEED=.9,MAX_DT=.1;
 const EPS=1e-8,TAU=Math.PI*2,SCENERY_PERIOD=240;
 const START=Object.freeze([0,3,7.5]),EXIT=Object.freeze([-3,0,-9.6]);
 const BOUNDS=Object.freeze({minX:-14,maxX:14,minZ:-14,maxZ:14});
 const ROUTE=Object.freeze([
  START,Object.freeze([0,3,.7]),Object.freeze([-3,3,.7]),Object.freeze([-3,3,-.3]),
  Object.freeze([-3,1.5,-3.3]),Object.freeze([-3,1.5,-4.7]),
  Object.freeze([-3,0,-7.7]),EXIT
 ]);
 const segments=[];
 let ROUTE_LENGTH=0;
 for(let i=1;i<ROUTE.length;i++){
  const a=ROUTE[i-1],b=ROUTE[i],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);
  segments.push({a,b,dx,dz,length,start:ROUTE_LENGTH});ROUTE_LENGTH+=length;
 }
 // Inset the exterior boundary, not the shared ends of adjoining corridors.
 // These rectangles overlap at the turns, so crouching or diagonal input
 // cannot strand a player in a seam between two independently shrunken rooms.
 const walkAreas=Object.freeze([
  Object.freeze({minX:-.72,maxX:.72,minZ:1.42,maxZ:8.12}),
  Object.freeze({minX:-3.72,maxX:.72,minZ:-.02,maxZ:1.42}),
  Object.freeze({minX:-3.72,maxX:-2.28,minZ:-10.12,maxZ:-.02})
 ]);
 const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
 const smooth=value=>value*value*(3-2*value);
 const finite=value=>typeof value==='number'&&Number.isFinite(value);
 const validId=value=>value===null||Number.isSafeInteger(value)&&value>0;
 const vector=value=>Array.isArray(value)?value:value&&[value.x,value.y,value.z];
 const finiteXZ=value=>value&&finite(value[0])&&finite(value[2]);
 const positiveMod=(value,divisor)=>(value%divisor+divisor)%divisor;

 function floorAt(x,z){
  if(!finite(x)||!finite(z))return START[1];
  if(x>-2||z>=-.3)return 3;
  if(z>=-3.3)return 3-(-.3-z)*.5;
  if(z>=-4.7)return 1.5;
  if(z>=-7.7)return 1.5-(-4.7-z)*.5;
  return 0;
 }
 function flightAt(x,z){
  if(x>-2)return null;
  if(z<-.3&&z>-3.3)return {distance:-.3-z,top:3};
  if(z<-4.7&&z>-7.7)return {distance:-4.7-z,top:1.5};
  return null;
 }
 function treadHeightAt(x,z){
  const flight=flightAt(x,z);
  return flight?Math.max(0,flight.top-.15*(Math.min(9,Math.floor((flight.distance+EPS)/.3))+1)):floorAt(x,z);
 }
 function guideFloorAt(x,z){
  const flight=flightAt(x,z);if(!flight)return floorAt(x,z);
  const step=Math.floor((flight.distance+EPS)/.3),within=flight.distance-step*.3;
  // Let the back of a 9 cm companion clear each edge before easing down.
  // Its bottom stays above the visible tread; the player's camera uses the
  // independent continuous ramp in floorAt and never bobs on these steps.
  const descent=smooth(clamp((within-.045)/.12,0,1));
  return Math.max(0,flight.top-.15*(step+descent));
 }
 function contains(x,z){
  return walkAreas.some(area=>x>=area.minX-EPS&&x<=area.maxX+EPS&&z>=area.minZ-EPS&&z<=area.maxZ+EPS);
 }
 function nearestWalkPoint(point){
  let result=[START[0],START[1],START[2]],distance=Infinity;
  for(const area of walkAreas){
   const x=clamp(point[0],area.minX,area.maxX),z=clamp(point[2],area.minZ,area.maxZ),d=(x-point[0])**2+(z-point[2])**2;
   if(d<distance){distance=d;result=[x,floorAt(x,z),z];}
  }
  return result;
 }
 function constrainMove(from,to){
  const origin=vector(from),wanted=vector(to);
  let p=finiteXZ(origin)?nearestWalkPoint(origin):[...START];
  if(!finiteXZ(wanted))return p;
  const x=clamp(wanted[0],BOUNDS.minX,BOUNDS.maxX),z=clamp(wanted[2],BOUNDS.minZ,BOUNDS.maxZ);
  const steps=Math.max(1,Math.ceil(Math.hypot(x-p[0],z-p[2])/.14));
  const dx=(x-p[0])/steps,dz=(z-p[2])/steps;
  // Swept, bounded substeps prevent a resumed frame or invalid save position
  // from tunnelling through the inside corner. Axis resolution keeps sliding.
  for(let i=0;i<steps;i++){
   if(contains(p[0]+dx,p[2]))p[0]+=dx;
   if(contains(p[0],p[2]+dz))p[2]+=dz;
  }
  if(Math.abs(p[0]-x)<EPS)p[0]=x;
  if(Math.abs(p[2]-z)<EPS)p[2]=z;
  p[1]=floorAt(p[0],p[2]);return p;
 }
 function routePoint(distance){
  const d=clamp(distance,0,ROUTE_LENGTH);
  const segment=segments.find(item=>d<item.start+item.length-EPS)||segments[segments.length-1];
  const u=d===ROUTE_LENGTH?1:clamp((d-segment.start)/segment.length,0,1);
  return [segment.a[0]+segment.dx*u,segment.a[1]+(segment.b[1]-segment.a[1])*u,segment.a[2]+segment.dz*u];
 }
 function sampleRoute(distance){
  const d=clamp(finite(distance)?distance:0,0,ROUTE_LENGTH);
  let index=segments.findIndex(segment=>d<segment.start+segment.length-EPS);
  if(index<0)index=segments.length-1;
  const segment=segments[index],u=d===ROUTE_LENGTH?1:clamp((d-segment.start)/segment.length,0,1);
  const x=u===1?segment.b[0]:segment.a[0]+segment.dx*u,z=u===1?segment.b[2]:segment.a[2]+segment.dz*u;
  const behind=routePoint(d-.15),ahead=routePoint(d+.15),dx=ahead[0]-behind[0],dz=ahead[2]-behind[2];
  return {p:[x,guideFloorAt(x,z),z],yaw:Math.atan2(-dx,-dz),pitch:Math.atan2(ahead[1]-behind[1],Math.hypot(dx,dz)),segment:index,distance:d};
 }
 function routeProgress(point){
  let best=0,bestDistance=Infinity;
  for(const segment of segments){
   const u=clamp(((point[0]-segment.a[0])*segment.dx+(point[2]-segment.a[2])*segment.dz)/(segment.length*segment.length),0,1);
   const x=segment.a[0]+segment.dx*u,z=segment.a[2]+segment.dz*u,d=(x-point[0])**2+(z-point[2])**2;
   if(d<bestDistance){bestDistance=d;best=segment.start+segment.length*u;}
  }
  return best;
 }
 function create({guideId=null}={}){
  return {version:VERSION,time:0,guideDistance:LEAD_DISTANCE,guideId:validId(guideId)?guideId:null,arrived:false};
 }
 function restore(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==VERSION||!finite(value.time)||value.time<0||
   !finite(value.guideDistance)||value.guideDistance<0||value.guideDistance>ROUTE_LENGTH||!validId(value.guideId)||
   typeof value.arrived!=='boolean'||value.arrived!==(value.guideDistance===ROUTE_LENGTH))return null;
  return {version:VERSION,time:value.time,guideDistance:value.guideDistance,guideId:value.guideId,arrived:value.arrived};
 }
 function snapshot(state){return restore(state);}
 function tick(state,dt,player,{paused=false,escortPaused=false}={}){
  if(!state||paused||!finite(dt)||dt<=0)return state;
  const elapsed=Math.min(dt,MAX_DT);state.time+=elapsed;
  if(escortPaused||state.arrived)return state;
  const p=vector(player);if(!finiteXZ(p))return state;
  const progress=routeProgress(p),guide=sampleRoute(state.guideDistance).p;
  // A player ahead can always be followed. A player behind sets the pace and
  // can inspect the windows for as long as desired without a countdown.
  if(progress<state.guideDistance&&Math.hypot(p[0]-guide[0],p[2]-guide[2])>WAIT_DISTANCE)return state;
  const target=Math.min(ROUTE_LENGTH,progress+LEAD_DISTANCE);
  state.guideDistance=Math.max(state.guideDistance,Math.min(target,state.guideDistance+GUIDE_SPEED*elapsed));
  if(ROUTE_LENGTH-state.guideDistance<EPS){state.guideDistance=ROUTE_LENGTH;state.arrived=true;}
  return state;
 }

 const WHITE=[.94,.953,.945,1],EDGE=[.77,.83,.81,1],DARK=[.19,.25,.25,1],STEEL=[.49,.57,.56,1];
 const LIGHT=[.84,.97,.92,1],GREEN=[.29,.65,.54,1],GLASS=[.69,.85,.81,.075];
 const boxes=[];
 function box(p,size,color=WHITE,extra={}){boxes.push({p,size,color,section:'passage',...extra});}
 // White gallery, a left turn, two flights and a quiet landing. Adjacent slabs
 // share edges instead of overlapping coplanar surfaces at the corner.
 box([0,2.9,5.1],[2.16,.2,6.8],WHITE,{surface:'floor'});
 box([-1.5,2.9,.7],[5.16,.2,2],WHITE,{surface:'floor'});
 box([0,6.5,5.1],[2.16,.16,6.8]);
 box([-1.5,6.5,.7],[5.16,.16,2]);
 box([-1.08,4.7,5.1],[.16,3.4,6.8]);
 box([0,4.7,8.5],[2.32,3.4,.16]);
 box([-2.58,4.7,1.7],[3.16,3.4,.16]);
 box([-.46,4.7,-.3],[3.24,3.4,.16]);
 box([-4.08,4.7,.7],[.16,3.4,2]);
 box([1.08,3.26,4.1],[.16,.52,8.8]);
 box([1.08,6.28,4.1],[.16,.44,8.8]);
 for(const z of [-.3,1.7,3.9,6.1,8.5])box([1.08,4.76,z],[.2,2.48,.11]);
 for(const [z,length] of [[.7,1.9],[2.8,2.08],[5,2.08],[7.3,2.28]])
  box([1.08,4.76,z],[.014,2.48,length],GLASS,{glass:true});
 for(const z of [2.7,5.6,7.7])box([0,6.405,z],[.72,.018,.1],LIGHT);
 box([-2.6,6.405,.7],[.72,.018,.1],LIGHT);
 for(const [start,top] of [[-.3,3],[-4.7,1.5]]){
  for(let i=0;i<10;i++){
   const height=top-.15*(i+1),z=start-(i+.5)*.3;
   // The last tread at y=0 is the existing room floor. Another almost
   // coplanar slab would produce broad depth bands in a 16-bit GLES buffer.
   if(height>EPS){
    box([-3,height/2,z],[2.16,height,.3],WHITE,{surface:'tread'});
    box([-3,height+.004,start-(i+1)*.3+.018],[1.93,.008,.035],EDGE,{surface:'nosing'});
   }
  }
 }
 box([-3,.75,-4],[2.16,1.5,1.4],WHITE,{surface:'floor'});
 // Vertical side walls also enclose the stair flights; no prop body is needed.
 for(const x of [-4.08,-1.92])box([x,3.15,-5.35],[.16,6.3,10.1]);
 box([-3,6.5,-5.35],[2.32,.16,10.1]);
 for(const [z,y] of [[-1.8,5.3],[-4,4.2],[-6.2,3.1],[-9.2,2.65]])
  box([-4.0,y,z],[.018,.1,.6],LIGHT);
 box([-3,1.65,-10.4],[2.32,3.3,.16],WHITE,{surface:'door-back'});
 box([-3,1.25,-10.22],[1.45,2.5,.18],[.87,.91,.89,1],{surface:'door-panel'});
 box([-2.34,1.55,-10.115],[.015,.28,.014],GREEN);

 const factory=(p,size,color=WHITE)=>box(p,size,color,{section:'factory'});
 // This inaccessible scenic floor is separated from the global room plane,
 // without changing any walkable height or adding a collision body.
 box([6.75,.035,4.4],[11.1,.05,9.2],[.72,.77,.75,1],{section:'factory',surface:'floor'});
 factory([12.3,3.5,4.4],[.18,7,9.2]);
 factory([6.75,3.5,9],[11.1,7,.18]);
 factory([6.75,3.5,-.2],[11.1,7,.18]);
 factory([6.75,7,4.4],[11.1,.18,9.2]);
 for(const x of [3.4,6.7,10]){
  factory([x,3.5,8.83],[.28,7,.28],EDGE);
  factory([x,6.88,4.4],[.16,.04,6],LIGHT);
 }
 const belts=[{a:3.7,b:8.7,z:5.8,phase:0},{a:4.5,b:9.5,z:2.4,phase:.5}];
 for(const belt of belts){
  const middle=(belt.a+belt.b)/2;
  factory([middle,1.22,belt.z],[belt.b-belt.a+.35,.24,.78],DARK);
  factory([middle,1,belt.z],[belt.b-belt.a+.35,.5,.78],DARK);
  for(const z of [belt.z-.45,belt.z+.45])factory([middle,1.31,z],[belt.b-belt.a+.6,.14,.1],STEEL);
  for(const x of [belt.a+.5,belt.b-.5])for(const z of [belt.z-.3,belt.z+.3])factory([x,.55,z],[.14,1.1,.14],STEEL);
  for(const x of [belt.a,belt.b])factory([x,1.48,belt.z],[.55,.72,.98]);
 }
 const arms=[{x:10,z:5.8,period:16,phase:0},{x:10.8,z:2.4,period:20,phase:1.2}];
 for(const arm of arms){factory([arm.x,.23,arm.z],[.85,.46,.85],DARK);factory([arm.x,.72,arm.z],[.3,.52,.3],STEEL);}
 const STATIC_BOXES=Object.freeze(boxes.map(item=>Object.freeze({...item,p:Object.freeze(item.p),size:Object.freeze(item.size),color:Object.freeze(item.color)})));
 function staticBoxes(){return STATIC_BOXES;}
 const FACTORY_BOUNDS=Object.freeze({p:Object.freeze([6.75,3.5,4.4]),radius:8.1});

 // A fixed set of boxes is reused on every call. Motion is sampled directly
 // from scene time, so culling never advances or rewinds an animation.
 const moving=[];
 function movingBox(size,color){const item={p:[0,0,0],size:[...size],color,rotation:{yaw:0,pitch:0,roll:0},section:'factory'};moving.push(item);return item;}
 const carriers=belts.map(()=>Array.from({length:3},()=>movingBox([.27,.23,.27],[.83,.87,.85,1])));
 const armBoxes=arms.map(()=>({upper:movingBox([.18,1.12,.18],WHITE),fore:movingBox([.14,.95,.14],STEEL),
  elbow:movingBox([.24,.24,.24],DARK),wrist:movingBox([.22,.14,.22],DARK),
  fingers:[movingBox([.055,.19,.12],STEEL),movingBox([.055,.19,.12],STEEL)]}));
 const drones=Array.from({length:2},()=>({body:movingBox([.36,.14,.36],WHITE),
  struts:[movingBox([.86,.035,.055],DARK),movingBox([.055,.035,.86],DARK)],
  rotors:Array.from({length:4},()=>movingBox([.31,.013,.045],STEEL)),
  lamp:movingBox([.09,.018,.06],GREEN)}));
 function position(item,x,y,z){item.p[0]=x;item.p[1]=y;item.p[2]=z;}
 function link(item,ax,ay,bx,by,z){position(item,(ax+bx)/2,(ay+by)/2,z);item.rotation.roll=-Math.atan2(bx-ax,by-ay);}
 function scenery(time=0){
  const t=positiveMod(finite(time)?time:0,SCENERY_PERIOD);
  for(let b=0;b<belts.length;b++){
   const belt=belts[b];
   for(let i=0;i<3;i++){
    const phase=positiveMod(t/12+i/3+belt.phase,1),item=carriers[b][i];
    let x,y;
    // The lower return and both vertical turns are concealed by the solid
    // conveyor casing. The loop closes spatially, with no recycled teleport.
    if(phase<.42){x=belt.a+(belt.b-belt.a)*phase/.42;y=1.48;}
    else if(phase<.5){x=belt.b;y=1.48-.58*smooth((phase-.42)/.08);}
    else if(phase<.92){x=belt.b-(belt.b-belt.a)*(phase-.5)/.42;y=.9;}
    else{x=belt.a;y=.9+.58*smooth((phase-.92)/.08);}
    position(item,x,y,belt.z);
   }
  }
  for(let i=0;i<arms.length;i++){
   const arm=arms[i],parts=armBoxes[i],phase=t/arm.period*TAU+arm.phase;
   const a=-.55-.3*Math.sin(phase),b=-1.35+.48*Math.sin(phase+.8);
   const ax=arm.x,ay=.98,bx=ax+Math.sin(a)*1.12,by=ay+Math.cos(a)*1.12;
   const cx=bx+Math.sin(b)*.95,cy=by+Math.cos(b)*.95;
   link(parts.upper,ax,ay,bx,by,arm.z);link(parts.fore,bx,by,cx,cy,arm.z);
   position(parts.elbow,bx,by,arm.z);position(parts.wrist,cx,cy,arm.z);
   const gap=.09+.045*(1+Math.sin(phase+.8));
   position(parts.fingers[0],cx-gap,cy-.12,arm.z);position(parts.fingers[1],cx+gap,cy-.12,arm.z);
  }
  for(let i=0;i<drones.length;i++){
   const drone=drones[i],angle=t/(i?30:24)*TAU+i*Math.PI;
   const x=6.8+2.15*Math.cos(angle),y=4.2+i*.75+.16*Math.sin(angle*2),z=4.4+2.25*Math.sin(angle);
   position(drone.body,x,y,z);position(drone.struts[0],x,y,z);position(drone.struts[1],x,y,z);
   const offsets=[[-.43,0],[.43,0],[0,-.43],[0,.43]];
   for(let j=0;j<4;j++){position(drone.rotors[j],x+offsets[j][0],y+.035,z+offsets[j][1]);drone.rotors[j].rotation.yaw=positiveMod(t*TAU*8+j,TAU);}
   position(drone.lamp,x,y-.081,z+.12);
  }
  return moving;
 }
 return Object.freeze({VERSION,START,EXIT,ROUTE,ROUTE_LENGTH,PLAYER_RADIUS,BOUNDS,FACTORY_BOUNDS,
  LEAD_DISTANCE,WAIT_DISTANCE,GUIDE_SPEED,SCENERY_PERIOD,create,restore,snapshot,tick,floorAt,treadHeightAt,
  constrainMove,sampleRoute,staticBoxes,scenery});
});
