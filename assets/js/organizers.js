(function(root){
 'use strict';
 const CAPACITY=50,MAX_SHELVES=16,SHAPES=['cube','tetra','pyramid','coupler'];
 const round=n=>Math.round(n*10000)/10000;
 const rotate=(q,p)=>{const [x,y,z,w]=q,[a,b,c]=p,tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];};
 const multiply=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
 const kind=p=>p.shape+(p.mood?.externalBattery?':battery':'')+(p.mood?.workshop?.sensor?':sensor':'')+(p.mood?.gripper?':gripper':'');
 const count=item=>Array.isArray(item?.groups)?item.groups.reduce((sum,g)=>sum+(g.parts?.length||0),0):0;
 function category(item){
  const parts=item.groups.flatMap(g=>g.parts),labels=[],ports=new Map();
  // Each rigid body's own geometry is canonicalized independently, so changing
  // a hinge angle, position, charge or piece ID does not change its category.
  for(const [index,g]of item.groups.entries()){
   const center=[0,1,2].map(axis=>g.parts.reduce((sum,p)=>sum+p.p[axis],0)/g.parts.length);let best=null,bestPorts=null;
   const frames=new Map();for(const part of g.parts){let q=part.q;if(q[3]<0)q=q.map(n=>-n);const key=q.map(n=>Math.round(n*1e10)).join(',');if(!frames.has(key))frames.set(key,part);}
   for(const anchor of frames.values()){const inverse=[-anchor.q[0],-anchor.q[1],-anchor.q[2],anchor.q[3]],candidate=new Map();
    for(const p of g.parts){let q=multiply(inverse,p.q);if(q[3]<-1e-6||Math.abs(q[3])<1e-6&&q.find(n=>Math.abs(n)>1e-6)<0)q=q.map(n=>-n);candidate.set(p.id,JSON.stringify([kind(p),rotate(inverse,p.p.map((n,a)=>n-center[a])).map(round),q.map(round)]));}
    const signature=JSON.stringify([...candidate.values()].sort());if(best===null||signature<best){best=signature;bestPorts=candidate;}
   }
   labels.push(best);for(const [id,value]of bestPorts)ports.set(id,{index,value});
  }
  const edges=labels.map(()=>[]);for(const joint of item.joints||[]){const a=ports.get(joint.aId),b=ports.get(joint.bId);if(a&&b){edges[a.index].push({to:b.index,from:a.value,target:b.value});edges[b.index].push({to:a.index,from:b.value,target:a.value});}}
  const branch=(index,parent)=>[labels[index],edges[index].filter(e=>e.to!==parent).map(e=>[e.from,e.target,branch(e.to,index)]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))];
  const key=labels.map((_,i)=>JSON.stringify(branch(i,-1))).sort()[0]+(item.robotArms?.length?':robot-arm':'')+(item.conveyors?.length?':conveyor:'+item.conveyors.map(c=>c.kind).sort().join(','):'');
  const label=item.conveyors?.length?'Línea de '+item.conveyors.length+' cinta'+(item.conveyors.length===1?'':'s')+' · '+parts.length+' piezas':item.robotArms?.length?'Brazo de '+parts.length+' piezas':parts.length===1?(parts[0].mood?.gripper?'Cubo de agarre':parts[0].mood?.externalBattery?'Batería':{cube:'Q-bit',tetra:'T-bit triangular',pyramid:'T-bit de base cuadrada',coupler:'Enganche'}[parts[0].shape]):parts.every(p=>p.mood?.externalBattery)?'Batería de '+parts.length+' celdas':parts.length===2&&item.joints?.length===1?'Rotor':'Mecanismo de '+parts.length+' piezas';
  return {key,label};
 }
 function validItem(item){
  const vector=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=1000);
  if(item?.version!==1||!Array.isArray(item.groups)||!item.groups.length||item.groups.length>2000||count(item)>2000||!Array.isArray(item.joints)||item.joints.length!==item.groups.length-1)return false;
  const ids=new Map(),owners=new Map();
  for(const [index,g]of item.groups.entries()){
   if(!Array.isArray(g.parts)||!g.parts.length||!vector(g.q,4)||Math.abs(Math.hypot(...g.q)-1)>.001)return false;
   for(const p of g.parts){if(!Number.isSafeInteger(p.id)||p.id<=0||ids.has(p.id)||!SHAPES.includes(p.shape)||!Number.isFinite(p.weight)||p.weight<=0||p.weight>1000||!vector(p.p,3)||!vector(p.q,4)||Math.abs(Math.hypot(...p.q)-1)>.001||!p.mood||typeof p.mood!=='object'||typeof p.mood.name!=='string'||!Number.isFinite(p.mood.energy)||p.mood.energy<0||p.mood.energy>1)return false;
    const b=p.mood.externalBattery;if(b&&(p.shape!=='cube'||b.version!==1||b.ownerId!==p.id||!Number.isSafeInteger(b.packId)||b.packId<=0||typeof b.enabled!=='boolean'))return false;
    const grip=p.mood.gripper;if(grip&&(p.shape!=='cube'||b||grip.version!==1||!['any','color','piece','shape','form'].includes(grip.mode)||!/^#[0-9a-f]{6}$/i.test(grip.color)||!SHAPES.includes(grip.shape)||(grip.targetId!==null&&(!Number.isSafeInteger(grip.targetId)||grip.targetId===0))||!Number.isInteger(grip.capacity)||grip.capacity<1||grip.capacity>2000||(grip.formSignature!==undefined&&(typeof grip.formSignature!=='string'||grip.formSignature.length>512000))||(grip.mode==='form'&&!grip.formSignature)))return false;
    ids.set(p.id,p);owners.set(p.id,index);
   }
  }
  const used=new Set(),links=item.groups.map(()=>[]);
  for(const j of item.joints){if(!ids.has(j.aId)||!ids.has(j.bId)||j.aId===j.bId||used.has(j.aId)||used.has(j.bId)||ids.get(j.aId).shape!=='coupler'||ids.get(j.bId).shape!=='coupler'||owners.get(j.aId)===owners.get(j.bId))return false;used.add(j.aId);used.add(j.bId);links[owners.get(j.aId)].push(owners.get(j.bId));links[owners.get(j.bId)].push(owners.get(j.aId));}
  if(item.robotArms!==undefined){
   if(!Array.isArray(item.robotArms)||item.robotArms.length>item.groups.length)return false;
   const grippers=new Set(),jointKeys=new Set(item.joints.map(j=>j.aId+':'+j.bId)),claimed=new Set();
   for(const arm of item.robotArms){
    if(!arm||!ids.get(arm.gripperId)?.mood.gripper||!ids.has(arm.baseId)||grippers.has(arm.gripperId)||typeof arm.repeat!=='boolean'||!Array.isArray(arm.joints)||!arm.joints.length||arm.joints.length>4||!arm.poses||typeof arm.poses!=='object'||Array.isArray(arm.poses))return false;
    grippers.add(arm.gripperId);
    for(const joint of arm.joints){const key=joint?.aId+':'+joint?.bId;if(!jointKeys.has(key)||claimed.has(key))return false;claimed.add(key);}
    const poseValid=pose=>Array.isArray(pose)&&pose.length===arm.joints.length&&pose.every(q=>vector(q,4)&&Math.abs(Math.hypot(...q)-1)<.01);
    if(!poseValid(arm.poses.pick)||arm.poses.place!==null&&!poseValid(arm.poses.place))return false;
   }
  }
  if(item.conveyors!==undefined){
   if(!Array.isArray(item.conveyors)||!item.conveyors.length||item.conveyors.length>item.joints.length)return false;
   const bases=new Set(),jointKeys=new Set(item.joints.map(j=>j.aId+':'+j.bId)),claimed=new Set((item.robotArms||[]).flatMap(a=>a.joints.map(j=>j.aId+':'+j.bId)));
   for(const module of item.conveyors){
    if(!module||(module.version!==undefined&&module.version!==1)||!ids.has(module.baseId)||bases.has(module.baseId)||!['straight','left','right'].includes(module.kind)||![1,-1].includes(module.direction)||!Number.isInteger(module.capacity)||module.capacity<1||module.capacity>2000||!Array.isArray(module.joints)||!module.joints.length||module.joints.length>16)return false;
    bases.add(module.baseId);
    for(const joint of module.joints){const key=joint?.aId+':'+joint?.bId;if(!jointKeys.has(key)||claimed.has(key)||(joint.forward!==undefined&&![1,-1].includes(joint.forward))||![owners.get(joint.aId),owners.get(joint.bId)].includes(owners.get(module.baseId)))return false;claimed.add(key);}
    if(module.required!==undefined){const allowed=new Set([owners.get(module.baseId),...module.joints.flatMap(j=>[owners.get(j.aId),owners.get(j.bId)])]);if(!Array.isArray(module.required)||!module.required.length||module.required.length>2000||new Set(module.required).size!==module.required.length||module.required.some(id=>!ids.has(id)||!allowed.has(owners.get(id)))||![module.baseId,...module.joints.flatMap(j=>[j.aId,j.bId]),...item.groups.flatMap((group,index)=>allowed.has(index)&&index!==owners.get(module.baseId)?group.parts.map(part=>part.id):[])].every(id=>module.required.includes(id)))return false;}
    if(module.ports!==undefined){const ports=module.ports;if(!ports||typeof ports!=='object'||Array.isArray(ports)||!['entry','exit'].every(key=>{const port=ports[key];return port&&vector(port.p,3)&&port.p.every(n=>Math.abs(n)<=10)&&vector(port.direction,3)&&Math.abs(Math.hypot(...port.direction)-1)<.0001;}))return false;}
   }
  }
  const seen=new Set([0]),queue=[0];for(const at of queue)for(const next of links[at])if(!seen.has(next)){seen.add(next);queue.push(next);}return seen.size===item.groups.length;
 }
 const api={CAPACITY,MAX_SHELVES,count,category,validItem};root.QBitsOrganizers=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
