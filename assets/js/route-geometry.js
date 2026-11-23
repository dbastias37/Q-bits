// Shared cardinal elbows for cables and trajectory guides. No grid rounding,
// obstacle search, rendering or physics. A micron of floating-point noise does
// not create a new bend; each authored destination retains its exact position.
(function(root,factory){'use strict';const geometry=factory();if(typeof module==='object'&&module.exports)module.exports=geometry;else root.QBitsRouteGeometry=geometry;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
 const axes=Object.freeze(['x','z','y']);
 const EPSILON=1e-6;
 function orthogonal(points){
  if(!Array.isArray(points)||!points.length)return [];
  let actions=false;
  for(const point of points){
   if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)||!Number.isFinite(point.z))return [];
   actions=actions||own(point,'action')||own(point,'wait');
  }
  const copy=point=>({x:point.x,y:point.y,z:point.z,...(own(point,'action')?{action:point.action}:{}),...(own(point,'wait')?{wait:point.wait}:{})});
  const result=[copy(points[0])];
  for(let i=1;i<points.length;i++){
   const target=points[i],cursor={...result[result.length-1]},changed=axes.filter(axis=>Math.abs(cursor[axis]-target[axis])>EPSILON);
   for(let index=0;index<changed.length;index++){
    cursor[changed[index]]=target[changed[index]];
    // An action belongs to its authored destination, never to an inserted bend.
    result.push(index===changed.length-1?copy(target):{x:cursor.x,y:cursor.y,z:cursor.z,...(actions?{action:'pass',wait:0}:{})});
   }
   // Cable supports without metadata need no zero-length segments. Authored
   // trajectory points may deliberately wait/drop/land at the same location.
   if(!changed.length){
    if(own(target,'action')||own(target,'wait'))result.push(copy(target));
    else if(i===points.length-1)result[result.length-1]=copy(target);
   }
  }
  return result;
 }
 return Object.freeze({EPSILON,orthogonal});
});
