/* Lightweight box assemblies derived from the user-supplied desk and honeycomb
 * references. Geometry, source credits and simplification: docs/FURNITURE_MODELS.md.
 * The honeycomb arrangement is adapted from re:3D (CC BY-SA 4.0). */
(function(root,factory){'use strict';const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.QBitsFurniture=model;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION=1,GRAY=[.82,.84,.83,1],LEAD=[.39,.44,.43,1],GREEN=[.28,.58,.43,1];
 const box=(name,p,half,color=GRAY,angle=0)=>({name,p,q:[0,0,Math.sin(angle/2),Math.cos(angle/2)],half,color:color.slice()});
 function bounds(parts){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const part of parts){const [x,y,z,w]=part.q,m=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]];
   for(let i=0;i<3;i++){const extent=m[i].reduce((sum,value,j)=>sum+Math.abs(value)*part.half[j],0);min[i]=Math.min(min[i],part.p[i]-extent);max[i]=Math.max(max[i],part.p[i]+extent);}}
  return {min,max};
 }
 function desk(){
  // Local origin is the centre of the usable top. Floor is y=-.6.
  // The source's continuous L profile stays open beneath the working side.
  const parts=[
   box('top',[0,-.015,0],[.7,.015,.4]),
   box('edge-band',[0,-.040,0],[.7,.010,.4],LEAD),
   box('rear-panel',[0,-.316,-.355],[.665,.266,.035]),
   box('foot',[0,-.591,-.355],[.665,.009,.035],LEAD),
   box('status-inlay',[.49,-.040,.4005],[.055,.004,.0005],GREEN)
  ];
  return {version:VERSION,parts,bounds:bounds(parts),surfaceHalf:[.7,0,.4],surfaceY:0,aimBox:{p:[0,-.3,0],half:[.7,.3,.4]},source:'scifi_desk.glb',attribution:{title:'SciFi Desk',author:'Sousinho',url:'https://sketchfab.com/3d-models/scifi-desk-d4a09022a8874ae6bdc44b3e42a6ea6c',license:'Sketchfab Standard',licenseUrl:'https://sketchfab.com/licenses'}};
 }
 function shelf(){
  // XY is the wall plane. Front is +Z; y=0 is the lowest physical edge.
  // Fifteen original hexagons, retaining the stepped six-column silhouette.
  const radius=.16,thickness=.012,depth=.24,h=Math.sqrt(3)*radius;
  const columns=[[.5,1.5],[1,2],[.5,1.5,2.5],[1,2,3],[.5,1.5,2.5],[2,3]];
  const cells=[],parts=[],edges=new Set();
  for(const [column,rows]of columns.entries())for(const row of rows){
   const x=(column-2.5)*1.5*radius,y=row*h+thickness/2,index=cells.length;
   cells.push({index,p:[x,y,depth/2],radius:radius-thickness,halfDepth:depth/2});
   const vertices=Array.from({length:6},(_,i)=>[x+Math.cos(i*Math.PI/3)*radius,y+Math.sin(i*Math.PI/3)*radius]);
   for(let i=0;i<6;i++){
    const a=vertices[i],b=vertices[(i+1)%6],key=[a.map(v=>v.toFixed(6)).join(','),b.map(v=>v.toFixed(6)).join(',')].sort().join('|');
    if(edges.has(key))continue;edges.add(key);
    // Small overlaps close the mitres. Rendered boxes and colliders are identical.
    parts.push(box('hex-edge-'+parts.length,[(a[0]+b[0])/2,(a[1]+b[1])/2,depth/2],[(radius+thickness*.6)/2,thickness/2,depth/2],GRAY,Math.atan2(b[1]-a[1],b[0]-a[0])));
   }
  }
  return {version:VERSION,parts,cells,bounds:bounds(parts),source:'honeycomb_shelf.glb',attribution:{title:'Honeycomb Shelf',author:'re:3D',url:'https://sketchfab.com/3d-models/honeycomb-shelf-181888b5bfbc48019061529af3270839',license:'CC BY-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/',scope:'Adapted honeycomb geometry and arrangement only'}};
 }
 return Object.freeze({VERSION,desk,shelf});
});
