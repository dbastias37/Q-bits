(function(root,factory){
 'use strict';const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;else root.QBitsBatteryLiquid=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // A visual free surface, independent of the battery's charge and rigid body.
 // Distances use metres; normals point from liquid into air.
 const MAX_TILT=Math.tan(12*Math.PI/180),UP=[0,1,0];
 const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
 const clamp=(n,low,high)=>Math.max(low,Math.min(high,n));
 const vector=(v,fallback=[0,0,0])=>[finite(v?.[0]??v?.x,fallback[0]),finite(v?.[1]??v?.y,fallback[1]),finite(v?.[2]??v?.z,fallback[2])];
 const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const normalized=(v,fallback=UP)=>{const a=vector(v),length=Math.hypot(...a);return length>1e-12?a.map(n=>n/length):fallback.slice();};
 const dimensions=size=>vector(size,[.09,.09,.09]).map(n=>n>0?clamp(n,1e-6,1000):.09);
 function quaternion(q){const a=[finite(q?.[0]??q?.x),finite(q?.[1]??q?.y),finite(q?.[2]??q?.z),finite(q?.[3]??q?.w,1)],length=Math.hypot(...a);return length>1e-12?a.map(n=>n/length):[0,0,0,1];}
 function rotate(v,q){const u=q.slice(0,3),t=cross(u,v).map(n=>2*n),c=cross(u,t);return v.map((n,i)=>n+q[3]*t[i]+c[i]);}
 function localNormal(worldNormal,q){const n=normalized(worldNormal),r=quaternion(q);return normalized(rotate(n,[-r[0],-r[1],-r[2],r[3]]));}
 function bounded(v,limit){const length=Math.hypot(...v);return length>limit?v.map(n=>n*limit/length):v;}
 function createState(){return {tilt:[0,0],rate:[0,0],normal:UP.slice(),previous:null};}
 function reset(state,sample){state.tilt=[0,0];state.rate=[0,0];state.normal=UP.slice();state.previous=sample;return state.normal.slice();}
 function updateState(state,input={},size=[.09,.09,.09],fraction=.5){
  state=state&&typeof state==='object'?state:createState();input=input&&typeof input==='object'?input:{};
  const dt=finite(input.dt),paused=input.paused||dt<=0;
  if(paused)return normalized(state.normal);
  const sample={position:vector(input.position),velocity:vector(input.velocity),angularVelocity:vector(input.angularVelocity),quaternion:quaternion(input.quaternion)};
  if(!state.previous||!Array.isArray(state.tilt)||!Array.isArray(state.rate)||[...state.tilt,...state.rate].some(n=>!Number.isFinite(n))||dt>.25)return reset(state,sample);
  const before=state.previous,span=Math.max(...dimensions(size)),travel=sample.position.map((n,i)=>n-before.position[i]-(sample.velocity[i]+before.velocity[i])*.5*dt);
  if(Math.hypot(...travel)>Math.max(.4,span*3))return reset(state,sample);
  const dv=sample.velocity.map((n,i)=>clamp(n-before.velocity[i],-20,20)),dw=sample.angularVelocity.map((n,i)=>clamp(n-before.angularVelocity[i],-50,50));
  // A velocity discontinuity produces a short wave. Sustained acceleration
  // shifts its equilibrium; once acceleration ends, gravity restores world up.
  const fill=clamp(finite(fraction),0,1),mobility=4*fill*(1-fill),gravity=clamp(finite(input.gravity,9.81),.1,100);
  if(mobility<1e-8)return reset(state,sample);
  let axis=rotate([1,0,0],sample.quaternion),horizontal=Math.hypot(axis[0],axis[2]);
  if(horizontal<.1){axis=rotate([0,0,1],sample.quaternion);horizontal=Math.hypot(axis[0],axis[2]);}
  const impact=Math.abs(dv[1])>.12?clamp(dv[1],-8,8)*.16:0;
  let rate=bounded([state.rate[0]+mobility*(dv[0]*.55+dw[2]*.026+impact*axis[0]/horizontal),state.rate[1]+mobility*(dv[2]*.55-dw[0]*.026+impact*axis[2]/horizontal)],2);
  const target=bounded([dv[0]/dt/gravity*.3*mobility,dv[2]/dt/gravity*.3*mobility],MAX_TILT),omega=clamp(Math.sqrt(gravity/span)*1.1,7,14),damping=.36,decay=damping*omega,frequency=omega*Math.sqrt(1-damping*damping),exponential=Math.exp(-decay*dt),cos=Math.cos(frequency*dt),sin=Math.sin(frequency*dt);
  // Exact damped spring integration for a constant target over this step.
  let tilt=state.tilt.map((x,i)=>{const displacement=x-target[i],v=rate[i];rate[i]=exponential*(v*cos-(decay*v+omega*omega*displacement)*sin/frequency);return target[i]+exponential*(displacement*cos+(v+decay*displacement)*sin/frequency);});
  const length=Math.hypot(...tilt);if(length>MAX_TILT){tilt=bounded(tilt,MAX_TILT);const outward=(tilt[0]*rate[0]+tilt[1]*rate[1])/(MAX_TILT*MAX_TILT);if(outward>0)rate=rate.map((v,i)=>v-outward*tilt[i]);}
  if(Math.hypot(...tilt,...rate,...target)<1e-5){tilt=[0,0];rate=[0,0];}
  state.tilt=tilt;state.rate=bounded(rate,2);state.normal=normalized([tilt[0],1,tilt[1]]);state.previous=sample;return state.normal.slice();
 }

 // Exact CDF of a sum of up to three uniform distributions. The integrated
 // two-axis CDF avoids subtracting nearly equal cubics for skinny projections.
 function integralTwo(s,a,b){
  if(s<=0)return 0;if(s>=a+b)return s-(a+b)/2;
  if(s<=a)return s*s*s/(6*a*b);
  if(s<=b)return (s*s/2-a*s/2+a*a/6)/b;
  const tail=a+b-s;return s-(a+b)/2+tail*tail*tail/(6*a*b);
 }
 function projectedCDF(s,widths){
  const total=widths.reduce((n,a)=>n+a,0);if(s<=0)return 0;if(s>=total)return 1;if(s>total/2)return 1-projectedCDF(total-s,widths);
  if(widths.length===1)return s/widths[0];
  const [a,b,c]=widths;if(widths.length===2)return s<=a?s*s/(2*a*b):(s-a/2)/b;
  return clamp((integralTwo(s,a,b)-integralTwo(s-c,a,b))/c,0,1);
 }
 function plane(size,normal,fraction){
  const extent=normal.reduce((n,x,i)=>n+Math.abs(x)*size[i]/2,0),raw=normal.map((x,i)=>Math.abs(x)*size[i]),scale=Math.max(...raw),widths=raw.filter(a=>a>scale*1e-12).map(a=>a/scale).sort((a,b)=>a-b),total=widths.reduce((n,a)=>n+a,0);
  if(fraction<=0)return -extent;if(fraction>=1)return extent;if(fraction===.5)return 0;
  const target=Math.min(fraction,1-fraction);let low=0,high=total/2;
  for(let i=0;i<34;i++){const middle=(low+high)/2;if(projectedCDF(middle,widths)<target)low=middle;else high=middle;}
  const offset=((low+high)/2-total/2)*scale;return fraction>.5?-offset:offset;
 }
 function fillMesh(size,localSurfaceNormal,fraction){
  const box=dimensions(size),normal=normalized(localSurfaceNormal),fill=clamp(finite(fraction),0,1),offset=plane(box,normal,fill),volume=box[0]*box[1]*box[2]*fill;
  const sides=[],sideNormals=[],top=[],topNormals=[],positions=[],normals=[],epsilon=Math.max(...box)*1e-10;
  const result=()=>({positions:new Float32Array(positions),normals:new Float32Array(normals),sidePositions:new Float32Array(sides),sideNormals:new Float32Array(sideNormals),topPositions:new Float32Array(top),topNormals:new Float32Array(topNormals),offset,volume,fraction:fill,normal:normal.slice(),size:box.slice()});
  if(fill===0)return result();
  const [x,y,z]=box.map(n=>n/2),vertices=[[-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]],faces=[[[0,3,2,1],[0,0,-1]],[[4,5,6,7],[0,0,1]],[[0,1,5,4],[0,-1,0]],[[3,7,6,2],[0,1,0]],[[0,4,7,3],[-1,0,0]],[[1,2,6,5],[1,0,0]]],cap=[];
  function capPoint(point){if(!cap.some(p=>Math.hypot(...p.map((n,i)=>n-point[i]))<=epsilon*4))cap.push(point);}
  function triangles(polygon,n,target,targetNormals){for(let i=1;i<polygon.length-1;i++){const a=polygon[0],b=polygon[i],c=polygon[i+1];if(Math.hypot(...cross(b.map((v,k)=>v-a[k]),c.map((v,k)=>v-a[k])))<=epsilon*epsilon)continue;target.push(...a,...b,...c);targetNormals.push(...n,...n,...n);}}
  for(const [indices,n]of faces){
   let polygon=indices.map(i=>vertices[i]);if(fill<1){const clipped=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],da=dot(normal,a)-offset,db=dot(normal,b)-offset,insideA=da<=0,insideB=db<=0;if(insideA)clipped.push(a);if(insideA!==insideB){const ratio=da/(da-db),intersection=a.map((v,k)=>v+(b[k]-v)*ratio);clipped.push(intersection);capPoint(intersection);}if(Math.abs(da)<=epsilon)capPoint(a);}polygon=clipped;}
   triangles(polygon,n,sides,sideNormals);
  }
  if(fill<1&&cap.length>=3){const center=cap.reduce((sum,p)=>sum.map((n,i)=>n+p[i]/cap.length),[0,0,0]),u=normalized(cross(Math.abs(normal[1])<.9?UP:[1,0,0],normal)),v=cross(normal,u);cap.sort((a,b)=>{const aa=a.map((n,i)=>n-center[i]),bb=b.map((n,i)=>n-center[i]);return Math.atan2(dot(aa,v),dot(aa,u))-Math.atan2(dot(bb,v),dot(bb,u));});triangles(cap,normal,top,topNormals);}
  positions.push(...sides,...top);normals.push(...sideNormals,...topNormals);return result();
 }
 return Object.freeze({createState,updateState,localNormal,fillMesh,MAX_TILT_RADIANS:12*Math.PI/180});
});
