/* The three ports share one rigid frame. Layout coordinates are in Q-bit edges,
   with zero at the axle of the output section and z=0 on its centreline. */
(function (root) {
 'use strict';
 const lanes={A:[-15,-7],B:[-15,7],C:[0,0]};
 const recipes={
  double:{label:'Doble Q-bit',inputs:['cube','cube'],poses:[[[-.5,0,0],[0,0,0,1]],[[.5,0,0],[0,0,0,1]]]},
  socket:{label:'Q-bit con enganche',inputs:['cube','coupler'],poses:[[[0,0,0],[0,0,0,1]],[[0,1+5/56,0],[0,0,0,1]]]},
  pyramid:{label:'Pirámide de dos triangulares',inputs:['tetra','tetra'],poses:[[[.125,0,-.125],[0,0,0,1]],[[-.125,0,.125],[0,1,0,0]]]},
  pivot:{label:'Servo pivote',servo:'pivot'},
  hinge:{label:'Servo bisagra',servo:'hinge'},
  tip:{label:'Q-bit con punta piramidal',inputs:['cube','pyramid'],poses:[[[0,0,0],[0,0,0,1]],[[0,.625,0],[0,0,0,1]]]},
  rotor:{label:'Rotor de dos enganches',inputs:['coupler','coupler'],poses:[[[-51/56,0,0],[0,0,-Math.SQRT1_2,Math.SQRT1_2]],[[51/56,0,0],[0,0,Math.SQRT1_2,Math.SQRT1_2]]],
   blueprint:{groups:[{parts:[{key:0}]},{parts:[{key:1}]}],joints:[{a:0,b:1,rpm:30,direction:1,moving:'b',mount:'wheel',maxTorque:3.2,capacity:256,enabled:false}]}},
  bipyramid:{label:'Bipirámide',inputs:['pyramid','pyramid'],poses:[[[0,.125,0],[0,0,0,1]],[[0,-.125,0],[1,0,0,0]]]}
 };
 function planIndex(id){return typeof id==='string'&&/^plan-(0|[1-9]\d?)$/.test(id)?Number(id.slice(5)):-1;}
 function validPorts(ports,validPlan){
  if(ports?.assemblyLane!=='C')return ports?.plans===undefined&&ports?.product===undefined&&
   (ports?.assemblyLane===undefined||ports.assemblyLane==='A'||ports.assemblyLane==='B');
  if(ports.plans!==undefined&&(!Array.isArray(ports.plans)||ports.plans.length>64||!ports.plans.every(p=>validPlan?.(p))))return false;
  return Object.hasOwn(recipes,ports.product)||!!ports.plans?.[planIndex(ports.product)];
 }
 function pattern(recipe,a,b){
  const shapes=(typeof recipe==='string'?recipes[recipe]:recipe)?.inputs;
  if(shapes?.length!==2)return null;
  if(a===shapes[0]&&b===shapes[1])return [0,1];
  return a===shapes[1]&&b===shapes[0]?[1,0]:null;
 }
 // Reserve actual ingredients from opposite ports first. Only the first B of
 // each needed shape matters, even when a whole belt is backed up at the gate.
 function match(recipe,lanes,includeTravelling=false){
  const usable=e=>(e.ready||includeTravelling)&&!e.bypass&&recipe.inputs.includes(e.shape);
  const A=lanes.A.filter(usable),B=lanes.B.filter(usable);
  if(!A.length||!B.length)return null;
  const kinds=new Map();for(const e of B)if(!kinds.has(e.shape))kinds.set(e.shape,e);
  let left,right;
  for(const e of A){
   right=Array.from(kinds.values()).find(b=>e.shape!==b.shape||recipe.inputs.indexOf(e.shape)!==recipe.inputs.lastIndexOf(e.shape));
   if(right){left=e;break;}
  }
  if(!left)return null;
  const rows=Array(recipe.inputs.length).fill(null),others=[...A,...B].filter(e=>e!==left&&e!==right).sort((a,b)=>b.wait-a.wait);
  for(const e of [left,right,...others]){
   const index=recipe.inputs.findIndex((shape,i)=>!rows[i]&&shape===e.shape);
   if(index>=0)rows[index]=e;
  }
  return rows.every(Boolean)?rows:null;
 }
 function template(straight,size){
  const record={version:1,type:'rotor',name:'Acoplador',groups:[{parts:[]}],joints:[],conveyors:[],rotorSets:[]};
  let serial=0;
  for(const [lane,[x,z]] of Object.entries(lanes)){
   const keys=new Map(),joints=[],source=straight.conveyors[0];
   for(const [i,group] of straight.groups.entries()){
    const parts=group.parts.map(p=>{
     const key=serial++;keys.set(p.key,key);
     return {...p,key,p:[p.p[0]+(x+7.5)*size,p.p[1],p.p[2]+z*size],q:[...p.q]};
    });
    if(i===0)record.groups[0].parts.push(...parts);else record.groups.push({parts});
   }
   for(const joint of straight.joints){
    joints.push(record.joints.length);record.joints.push({...joint,a:keys.get(joint.a),b:keys.get(joint.b)});
   }
   const ports=JSON.parse(JSON.stringify(source.ports));
   ports.assemblyLane=lane;if(lane==='C')ports.product='double';
   record.conveyors.push({...source,base:keys.get(source.base),joints,ports,drives:[...source.drives],
    required:source.required.map(k=>keys.get(k)),moduleParts:source.moduleParts.map(k=>keys.get(k))});
   record.rotorSets.push({name:'Acoplador · '+lane,joints:[...joints]});
  }
  const shell=record.conveyors[2],s=Math.SQRT1_2;
  function add(shape,x,y,z,q=[0,0,0,1]){
   const key=serial++;
   record.groups[0].parts.push({key,shape,weight:1,p:[(x+6)*size,(y+2.5)*size,z*size],q});
   shell.required.push(key);shell.moduleParts.push(key);
  }
  const cube=(x,y,z)=>add('cube',x,y,z);
  // Pairs of square pyramids fill the two sloping faces between staircase
  // corners, exactly as in the supplied 3D sketch.
  for(const sign of [-1,1]){
   for(const [start,count,outer] of [[10,7,true],[4,3,false]]){
    cube(-10,0,sign*start);cube(-9,0,sign*start);
    for(let i=0;i<count;i++){
     const x=-9+i,z=sign*(start-i);
     if(outer){
      add('pyramid',x+.625,0,z,[0,0,-s,s]);
      add('pyramid',x+1,0,z-sign*.375,[sign*s,0,0,s]);
     }else{
      add('pyramid',x,0,z-sign*.625,[-sign*s,0,0,s]);
      add('pyramid',x+.375,0,z-sign,[0,0,s,s]);
     }
     cube(x+1,0,z-sign);
    }
   }
   for(let y=1;y<=3;y++)for(const x of [-8,-1,0])cube(x,y,sign*3);
  }
  for(let y=1;y<=3;y++)for(let z=-2;z<=2;z++)cube(-7,y,z);
  for(let x=-8;x<=0;x++)for(let z=-3;z<=3;z++)cube(x,4,z);
  return record;
 }
 root.QBitsAssembler={lanes,recipes,pattern,match,template,validPorts,planIndex};
})(typeof window==='object'?window:globalThis);
