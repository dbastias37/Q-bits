/* A single rotating wireframe. The game supplies the same local poses and mesh
   profiles as placement. Large inventories use spatial cells for the display. */
window.QBitsTabletProjector=(()=>{
 const boxEdges=[[0,1],[1,3],[3,2],[2,0],[4,5],[5,7],[7,6],[6,4],[0,4],[1,5],[2,6],[3,7]];
 function corners(min,max){
  return Array.from({length:8},(_,i)=>[i&1?max[0]:min[0],i&2?max[1]:min[1],i&4?max[2]:min[2]]);
 }
 function bounds(){return {min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};}
 function include(b,p){for(let i=0;i<3;i++){b.min[i]=Math.min(b.min[i],p[i]);b.max[i]=Math.max(b.max[i],p[i]);}}
 function build(parts,profile){
  if(!parts.length)return null;
  const points=[],edges=[],extents=bounds(),individual=[],coarse=parts.length>80;
  const edgeCache=new Map();
  for(const part of parts){
   const outline=profile(part.shape||'cube'),local=part.half?corners([-part.half.x,-part.half.y,-part.half.z],[part.half.x,part.half.y,part.half.z]):outline.vertices;
   const offset=points.length,b=coarse?bounds():extents;
   for(const vertex of local){
    const v=part.q.vmult(Array.isArray(vertex)?{x:vertex[0],y:vertex[1],z:vertex[2]}:vertex);
    const p=[v.x+part.p.x,v.y+part.p.y,v.z+part.p.z];include(b,p);if(!coarse)points.push(p);
   }
   if(coarse){include(extents,b.min);include(extents,b.max);individual.push(b);continue;}
   if(!part.half&&!edgeCache.has(outline)){
    const lines=new Map();
    for(const face of outline.faces)face.forEach((a,i)=>{const other=face[(i+1)%face.length];lines.set(Math.min(a,other)+','+Math.max(a,other),[a,other]);});
    edgeCache.set(outline,[...lines.values()]);
   }
   for(const [a,c] of part.half?boxEdges:edgeCache.get(outline))edges.push([offset+a,offset+c]);
  }
  const center=extents.min.map((v,i)=>(v+extents.max[i])/2);
  const extent=Math.max(...center.map((v,i)=>extents.max[i]-extents.min[i]),.001);
  if(coarse){
   const cells=new Map();
   for(const b of individual){
    const key=b.min.map((v,i)=>Math.min(4,Math.floor(((v+b.max[i])/2-extents.min[i])*5/extent))).join(',');
    if(!cells.has(key))cells.set(key,bounds());const cell=cells.get(key);include(cell,b.min);include(cell,b.max);
   }
   for(const b of cells.values()){const offset=points.length;points.push(...corners(b.min,b.max));for(const [a,c] of boxEdges)edges.push([offset+a,offset+c]);}
  }
  const vertices=points.map(p=>p.map((v,i)=>(v-center[i])/extent));
  const radius=Math.max(.001,...vertices.map(v=>Math.hypot(...v)));
  return {vertices,edges,radius,coarse,count:parts.length};
 }
 function paint(canvas,model,angle){
  const ctx=canvas.getContext('2d');if(!ctx||!model)return;
  const w=canvas.width,h=canvas.height,x=w*.5,y=h*.39,k=Math.min(w*.43,h*.33)/model.radius;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#70e9da18';ctx.beginPath();ctx.moveTo(x-5,h*.9);ctx.lineTo(x-w*.23,h*.42);ctx.lineTo(x+w*.23,h*.42);ctx.lineTo(x+5,h*.9);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#73d1c6';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,h*.9,w*.09,h*.022,0,0,2*Math.PI);ctx.stroke();
  const c=Math.cos(angle),s=Math.sin(angle),points=model.vertices.map(([a,b,d])=>[x+k*(c*a+s*d),y+k*(-.92*b+.39*(-s*a+c*d))]);
  ctx.beginPath();for(const [a,b] of model.edges){ctx.moveTo(...points[a]);ctx.lineTo(...points[b]);}
  ctx.lineWidth=model.coarse?.85:1.35;ctx.strokeStyle='#9bf6e6';ctx.stroke();
 }
 return {build,paint};
})();
