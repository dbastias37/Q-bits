'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const repo='/workspace/scratch/1941ba59df8d/Q-bits',input=process.argv[2]||'/tmp/qbits-chain-final-20261126/80/failed.json',saved=JSON.parse(fs.readFileSync(input)),entries=new Map(saved.entries),storage={getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,String(v))};
let source=fs.readFileSync(repo+'/assets/js/game.js','utf8');const sourceHash=crypto.createHash('sha256').update(source).digest('hex');
const probe=`
window.inspectPickupYaw=function(receiverId,payloadId){
 const system=getTrajectorySystem(),node=system.nodes.get(receiverId),route=system.routeFor(receiverId),flight=flightForGroup(node.g),component=flight.component,root=component[0],gripper=component.flatMap(g=>g.parts).find(p=>p.mood.gripper),hit=robotGripperHit(gripper.id),cargo=rotorPart(payloadId),config=trajectoryLogisticsConfig(node),saved=config.pick;
 const vector=v=>[v.x,v.y,v.z],quat=q=>[q.x,q.y,q.z,q.w],yaw=q=>{const x=q.vmult(V(1,0,0));return Math.atan2(-x.z,x.x)*180/Math.PI;},tilt=q=>Math.acos(clamp(q.vmult(V(0,1,0)).y,-1,1))*180/Math.PI;
 const state={center:component.reduce((v,g)=>add(v,mul(g.body.position,g.body.mass/component.reduce((n,x)=>n+x.body.mass,0))),V()),height:Math.max(0,Math.min(...component.map(g=>bounds(g).min.y)))};
 const point=route.points[saved.pointIndex],shift=V(point.x-state.center.x,point.y-state.height,point.z-state.center.z),runtime={...partPose(hit.g,hit.part),p:add(hit.p,shift)};
 const taughtQ=shelfQuaternion(saved.quaternion),taughtRoot=V(...saved.position),taught={...partPose(hit.g,hit.part),p:add(taughtRoot,taughtQ.vmult(hit.part.offset)),q:taughtQ.mult(hit.part.q)};
 const taughtFace=add(taught.p,taught.q.vmult(V(0,-HALF,0))),anchoredCenter={...runtime,p:taught.p.clone()},anchoredFace={...runtime,p:sub(taughtFace,runtime.q.vmult(V(0,-HALF,0)))},orientationOnly={...runtime,q:taught.q};
 const candidate={g:cargo.g,part:cargo.part,body:cargo.g.body,weight:totalWeight(cargo.g)},candidatePoses=poses(cargo.g);
 const check=p=>{
  const result=gripperCheck(gripper.id,true,{pose:p}),virtualHit={...hit,p:p.p,q:p.q},face=add(p.p,p.q.vmult(V(0,-HALF,0))),inv=p.q.inverse(),local=candidatePoses.flatMap(pose=>corners(pose)).map(v=>inv.vmult(sub(v,p.p))),rayHits=[];
  for(const x of [-.03,0,.03])for(const z of [-.03,0,.03]){const origin=add(p.p,p.q.vmult(V(x,-HALF+.015,z))),normal=p.q.vmult(V(0,-1,0));for(const pose of candidatePoses){const r=rayPart(origin,normal,pose,.8);if(r)rayHits.push({x,z,gap:r.distance-.015});}}
  const translation=sub(p.p,hit.p),ghost=component.flatMap(g=>poses(g,add(g.body.position,translation)));
  const projectedFree=creationPosesClear(ghost,false,{groups:component});
  return {tool:vector(p.p),face:vector(face),quaternion:quat(p.q),yaw:yaw(p.q),ok:result.ok,code:result.code,message:result.message,candidateId:result.candidate?.part?.id||null,distance:Number.isFinite(gripperFaceDistance(virtualHit,candidate,.8))?gripperFaceDistance(virtualHit,candidate,.8):null,localBounds:{min:['x','y','z'].map(k=>Math.min(...local.map(v=>v[k]))),max:['x','y','z'].map(k=>Math.max(...local.map(v=>v[k])))},rayHits,translatedChassisClear:projectedFree,translation:vector(translation),chassisTarget:vector(add(state.center,translation)),heightTarget:state.height+translation.y};
 };
 const native=trajectoryPickupReadiness(node,route,flight,state),report={receiverId,gripperId:gripper.id,payloadId,componentCount:component.length,seconds:story.galpon.elapsed,energyJ:story.galpon.energyJ,bodyQuaternion:quat(root.body.quaternion),yawCurrent:yaw(root.body.quaternion),yawTaught:yaw(taughtQ),tiltCurrent:tilt(root.body.quaternion),tiltTaught:tilt(taughtQ),center:vector(state.center),height:state.height,bodyPosition:vector(root.body.position),toolCurrent:vector(hit.p),localToolOffset:vector(hit.part.offset),worldToolOffset:vector(sub(hit.p,state.center)),payload:{position:vector(cargo.g.body.position),quaternion:quat(cargo.g.body.quaternion),yaw:yaw(cargo.g.body.quaternion),weight:totalWeight(cargo.g),busy:!!(cargo.g.robotHeld||cargo.g.route||cargo.g.haulJob||cargo.g.blueprintJob||cargo.g.cooler)},saved,routePoint:point,nativeReadiness:{ok:native.ok,code:native.code,message:native.message},probes:{runtime:check(runtime),taught:check(taught),anchoredToolCenter:check(anchoredCenter),anchoredToolFace:check(anchoredFace),taughtOrientationOnly:check(orientationOnly)}};
 report.probes.anchoredToolFace.correctionFromRoute=vector(sub(V(...report.probes.anchoredToolFace.chassisTarget),V(point.x,state.center.y+point.y-state.height,point.z)));
 const translation=sub(anchoredFace.p,hit.p),obstacles=[];
 for(const g of groups)for(const pose of poses(g,component.includes(g)?add(g.body.position,translation):g.body.position))obstacles.push({id:'part:'+pose.part.id,pose});
 for(const c of cargos)obstacles.push({id:'cargo:'+c.id,pose:cargoPose(c)});
 for(const f of families)obstacles.push({id:'family:'+f.id,pose:familyPose(f)});
 storyWorld.walls.forEach((pose,i)=>obstacles.push({id:'wall:'+i,pose}));
 report.anchoredFaceSweptObstructions=[];
 for(const m of flight.modules){const hub=partPose(m.g,m.hub,add(m.g.body.position,translation)),tip=couplerTip(hub).point,inv=hub.q.inverse(),ignored=new Set([m.hub.id,...m.blades.map(p=>p.id)]);
  for(const item of obstacles)if(!ignored.has(item.pose.part?.id)&&propellerSweepIntersects(item.pose,tip,inv,CUBE_SIZE*Math.SQRT2+.003))report.anchoredFaceSweptObstructions.push(item.id);
  if(tip.y<.001)report.anchoredFaceSweptObstructions.push('floor');
 }
 const sweep={angles:360,originalMisses:[],anchoredFaceMisses:[],anchoredDistances:[]};
 for(let degrees=0;degrees<360;degrees++){
  const turn=Q();turn.setFromAxisAngle(V(0,1,0),degrees*Math.PI/180);const bodyQ=turn.mult(root.body.quaternion),toolQ=bodyQ.mult(hit.part.q),raw={...runtime,p:add(V(point.x,state.center.y+point.y-state.height,point.z),bodyQ.vmult(hit.part.offset)),q:toolQ},anchored={...raw,p:sub(taughtFace,toolQ.vmult(V(0,-HALF,0)))};
  const a=gripperCheck(gripper.id,true,{pose:raw}),b=gripperCheck(gripper.id,true,{pose:anchored});
  if(!a.ok||a.candidate?.part?.id!==payloadId)sweep.originalMisses.push({degrees,code:a.code});
  if(!b.ok||b.candidate?.part?.id!==payloadId)sweep.anchoredFaceMisses.push({degrees,code:b.code});else sweep.anchoredDistances.push(b.candidate.distance);
 }
 report.yawSweep={angles:sweep.angles,originalMisses:sweep.originalMisses,anchoredFaceMisses:sweep.anchoredFaceMisses,minAnchoredDistance:Math.min(...sweep.anchoredDistances),maxAnchoredDistance:Math.max(...sweep.anchoredDistances)};
 return report;
};`;
const at=source.lastIndexOf('})();');source=source.slice(0,at)+probe+source.slice(at);const{t,sandbox}=require(repo+'/tests/game-harness.cjs')({storage,gameSource:source,nativeContext:true,graphics:false});t.story.ready=true;assert(t.continueHangarGame(),t.saveSession.message);assert.deepEqual([...t.saveSession.restoreWarnings],[]);
const physical=()=>JSON.stringify({energy:t.story.galpon.energyJ,seconds:t.story.galpon.elapsed,bodies:t.world.bodies.map(b=>({id:b.id,p:b.position,q:b.quaternion})),records:t.story.galpon.records,parts:t.groups.flatMap(g=>g.parts.map(p=>({id:p.id,energy:p.mood.energy}))) });
const before=physical(),report=sandbox.inspectPickupYaw(295,902);assert.equal(physical(),before);report.unchangedPhysicalState=true;report.sourceHash=sourceHash;report.input=input;
const data=JSON.parse(new Map(saved.entries).get('qbits.save.galpon.v1')).data,group=data.snapshot.groups.find(g=>g.parts.some(p=>p.id===295));
const weight=group.parts.reduce((n,p)=>n+p.weight,0),savedCenter=['x','y','z'].map(k=>group.parts.reduce((n,p)=>n+p.p[k]*p.weight,0)/weight);assert(savedCenter.every(Number.isFinite));report.restoreCenter={savedFromWorldParts:savedCenter,loaded:report.center,delta:report.center.map((v,k)=>v-savedCenter[k])};
fs.writeFileSync(process.argv[3]||'/tmp/qbits-pick-yaw-60.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
