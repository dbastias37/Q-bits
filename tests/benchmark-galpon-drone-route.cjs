'use strict';
// Configuration helper for the contiguous A -> B benchmark. It deliberately
// has no material fixture, ledger mutation, charge refill, or cargo pose write.
// All setup movement below holds the carrier/beacons with the normal hand;
// only the player's look is instrumented, as in the other benchmark drivers.
const assert=require('node:assert/strict');

function droneRouteDriver({t,sandbox,advance,mark=()=>{}}){
 const V=(x,y,z)=>t.V(x,y,z),asVector=p=>Array.isArray(p)?V(...p):p.clone();
 const reserved=new Set();
 function constructionStock(){
  return Object.fromEntries(Object.entries(t.hangarChainStock()).map(([shape,groups])=>[shape,groups.filter(g=>!t.hangarChainZone(g)&&g.parts.every(p=>{
   const trace=t.story.galpon.chain.traces[p.mood.matter?.root];return !reserved.has(p.id)&&!trace?.arm&&!trace?.drone&&!trace?.second&&!trace?.feed;
  }))]));
 }
 const el=id=>sandbox.document.querySelector('#'+id);
 const pauseAndInput=()=>{
  t.closeTrajectoryPanel(false);t.closeWorkshopPanel(false);t.hideStoryDialogue();t.resumeGame();
  el('panel').hidden=true;sandbox.document.body.dataset.booting='false';
  sandbox.document.pointerLockElement=t.canvas;sandbox.document.dispatchEvent({type:'pointerlockchange'});
  t.setMultiSelection([]);t.resetGameInputs();
 };
 function until(condition,seconds,label){
  for(let i=0;i<Math.ceil(seconds*60);i++){advance(1/60);if(condition())return (i+1)/60;}
  assert(condition(),label);return seconds;
 }
 function lookAt(point,overhead=false){const distance=overhead?.05:.7,camera=[point.x,point.y+.85,point.z+distance];t.setLook({camera,yaw:0,pitch:Math.atan2(point.y-camera[1],distance)});}
 function handTarget(center,yaw=0,pitch=-.25){
  const h=t.getHeld();assert(h,'manual setup lost its held object');
  const dir=V(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
  const camera=center.vsub(h.rootOffset||V()).vsub(dir.scale(h.distance));
  t.setLook({camera:[camera.x,camera.y,camera.z],yaw,pitch});
 }
 function moveHeld(center,yaw=0){
  const h=t.getHeld(),g=h.g,target=asVector(center),distance=g.body.position.distanceTo(target);handTarget(target,yaw);
  return until(()=>g.body.position.distanceTo(target)<.012&&g.body.velocity.norm()<.08,Math.max(5,distance/.5+4),
   'Native hand cannot reach '+JSON.stringify({id:h.part.id,target,current:g.body.position}));
 }
 function carry(id,waypoints,{faceUp=false,faceTurns=0}={}){
  pauseAndInput();const hit=t.rotorPart(id);assert(hit,'missing setup part '+id);
  const component=t.rotorConnectedGroups([hit.g]);
  assert(!component.some(g=>g.robotHeld),'setup cannot take a robot payload');
  assert(![...t.robotGrips.keys()].some(toolId=>component.includes(t.rotorPart(toolId)?.g)),'release this carrier payload before moving its mechanism');
  const trace=t.story.galpon.chain.traces[hit.part.mood.matter?.root];
  assert(!reserved.has(id)&&!t.hangarChainZone(hit.g)&&!trace?.arm&&!trace?.drone&&!trace?.second&&!trace?.feed,'route setup cannot move process cargo');
  const before={id,energy:hit.part.mood.energy,parts:hit.g.parts.map(p=>p.id)};
  const pitch=-.25,dir=V(0,Math.sin(pitch),-Math.cos(pitch)),eye=hit.p.vsub(dir.scale(.9));
  t.setLook({camera:[eye.x,eye.y,eye.z],yaw:0,pitch});t.grabQubit({...hit,point:hit.p.clone(),distance:.9});
  assert.equal(t.getHeld()?.g,hit.g,'normal hand must accept this construction component');
  try{
   for(let i=0;i<waypoints.length;i++){
    moveHeld(waypoints[i]);
    if((faceUp||faceTurns)&&i===0){
     const center=hit.g.body.position.clone();handTarget(center,-Math.PI/2);
     const turn=code=>{
      sandbox.document.dispatchEvent({type:'keydown',code:'ShiftLeft',repeat:false});
      sandbox.document.dispatchEvent({type:'keydown',code,repeat:false});
      sandbox.document.dispatchEvent({type:'keyup',code});sandbox.document.dispatchEvent({type:'keyup',code:'ShiftLeft'});
      until(()=>!t.getHeld().faceTurn?.active,4,'native '+code+' did not finish the QR face turn');
     };
     if(faceUp&&t.rotorPart(id).q.vmult(V(1,0,0)).y<.99){
      // A resumed installation may have let an unfinished marker fall on
      // another face. Snap through the ordinary face controls, bring its X
      // axis into the vertical turning plane, then turn that face upward.
      turn('KeyE');
      if(Math.abs(t.rotorPart(id).q.vmult(V(1,0,0)).z)>.9)turn('KeyE');
      for(let face=0;face<4&&t.rotorPart(id).q.vmult(V(1,0,0)).y<.99;face++)turn('KeyR');
     }
     // A resumed setup may already have performed this orientation. Use the
     // requested cardinal heading, still reached by the ordinary face keys.
     const heading=V(-Math.sin(faceTurns*Math.PI/2),0,Math.cos(faceTurns*Math.PI/2));
     for(let face=0;face<4&&t.rotorPart(id).q.vmult(V(0,0,1)).dot(heading)<.99;face++)turn('KeyE');
     assert(t.rotorPart(id).q.vmult(V(0,0,1)).dot(heading)>.99,'QR heading must match its native cardinal face turns');
     if(faceUp)assert(t.rotorPart(id).q.vmult(V(1,0,0)).y>.99,'QR face must point upward after the normal face turn');
    }
   }
  }finally{t.releaseQubit(false);t.resetGameInputs();}
  advance(.75);assert.deepEqual(hit.g.parts.map(p=>p.id),before.parts);assert.equal(hit.part.mood.energy,before.energy);
  return hit.g;
 }
 function crossRoom(id,target,options={}){
  const g=t.rotorPart(id).g,p=g.body.position,targetBody=asVector(target),height=1.55;
  return carry(id,[V(p.x,height,p.z),V(targetBody.x,height,p.z),V(targetBody.x,height,targetBody.z),targetBody],options);
 }
 function parkConstruction(g){
  for(let slot=0;slot<36;slot++){
   const point=V(-5.35+(slot%6)*.16,.12,-2.5-Math.floor(slot/6)*.16);
   if(t.groups.some(other=>other!==g&&Math.hypot(other.body.position.x-point.x,other.body.position.z-point.z)<.13&&t.bounds(other).min.y<.2))continue;
   return crossRoom(g.parts[0].id,point);
  }
  assert.fail('the physical construction parking area is full');
 }
 function adapt(id,role){
  let hit=t.rotorPart(id);assert(hit,'missing adapter cube');
  if(hit.part.mood.trajectory?.role===role)return hit;
  const productionMode=t.story.hangarWorld.mode;t.hangarWorldAction('stop');
  // The adaptation area extends left of the automatic former inlet. Keep a
  // loose beacon outside that inlet so production does not consume it first.
  const at=t.hangarTray('former',0),targetPart=V(at.x-.55,.145,at.z-.12),targetBody=targetPart.vsub(hit.g.body.quaternion.vmult(hit.part.offset));
  try{
   crossRoom(id,targetBody);hit=t.rotorPart(id);
   assert(hit,'construction cube entered another process before adaptation');
   assert(t.applyWorkshopUpgrade(id,{trajectory:{role,level:1}}),el('notice').textContent+' '+JSON.stringify({id,position:hit.p,held:!!t.getHeld(),at}));
  }finally{t.hangarWorldAction(productionMode);}
  mark('adaptación real '+role,{id,energy:hit.part.mood.energy});return hit;
 }
 function partsOf(drone){
  const receiver=drone.parts.find(p=>p.shape==='cube'&&!p.mood.gripper&&!p.mood.externalBattery),grip=drone.parts.find(p=>p.mood.gripper),cell=drone.parts.find(t.isExternalBattery);
  assert(receiver&&grip&&cell,'reference drone needs its real receiver, gripper and battery cubes');return {receiver,grip,cell};
 }
 function assemble(){
  const before=new Set(t.groups),stock=constructionStock(),need={cube:Math.max(0,3-stock.cube.length),coupler:Math.max(0,1-stock.coupler.length),tetra:Math.max(0,2-stock.tetra.length)};
  if(Object.values(need).some(Boolean))return {ok:false,need,message:'Prepare the drone plan with the existing production line first.'};
  const native=t.hangarChainStock();if(['cube','coupler','tetra'].some(shape=>native[shape].slice(0,{cube:3,coupler:1,tetra:2}[shape]).some(g=>!stock[shape].includes(g))))return {ok:false,need:{},message:'The native plan would consume process cargo; finish or reserve that cargo before construction.'};
  if(!t.buildHangarChainMechanism('drone'))return {ok:false,need:{},message:t.getHangarChainWorld().message};
  const drone=t.groups.find(g=>!before.has(g)&&g.parts.some(p=>p.mood.gripper)&&t.propellerModules([g]).length);
  assert(drone);mark('dron montado con stock real',{ids:drone.parts.map(p=>p.id)});return {ok:true,drone,...partsOf(drone)};
 }
 function reconfigureBlades(cubeId=null){
  const stock=constructionStock();if(stock.tetra.length>=2)return {ok:true,existing:true,bladeIds:stock.tetra.slice(0,2).map(g=>g.parts[0].id)};
  const cube=cubeId?t.rotorPart(cubeId)?.g:stock.cube[0];assert(cube?.parts.length===1&&cube.parts[0].shape==='cube','one existing free cube is needed for the blades');
  const productionMode=t.story.hangarWorld.mode;t.hangarWorldAction('stop');
  const origin=cube.parts[0].mood.matter.root,at=t.hangarTray('former',0),input=V(at.x-.55,.08,at.z-.12);
  try{
   until(()=>!t.story.galpon.jobs.former,20,'finish the real former job before blade reconfiguration');
   const exit=t.hangarTray('coupler',0),available=new Set(Object.values(constructionStock()).flat());
   const blocking=t.groups.filter(g=>g!==cube&&g.body.position.x>=exit.x-.84&&g.body.position.x<=exit.x+.12&&Math.abs(g.body.position.z-exit.z)<.14&&t.bounds(g).min.y<.18);
   for(const g of blocking){assert(available.has(g),'the former output contains process cargo; clear it through its normal process first');parkConstruction(g);}
   crossRoom(cube.parts[0].id,input);assert(t.hangarReconfigure('divide'),el('notice').textContent);
   const pyramids=t.hangarChainStock().pyramid.filter(g=>g.parts[0].mood.matter.root===origin);assert.equal(pyramids.length,6);
   // Free the complete exit before the second normal operation. All five
   // unused sixths remain physical stock, with their original root and energy.
   for(let i=1;i<pyramids.length;i++)parkConstruction(pyramids[i]);
   crossRoom(pyramids[0].parts[0].id,input);assert(t.hangarReconfigure('subdivide'),el('notice').textContent);
   const blades=t.hangarChainStock().tetra.filter(g=>g.parts[0].mood.matter.root===origin);assert.equal(blades.length,2);
   const result={ok:true,origin,bladeIds:blades.map(g=>g.parts[0].id),leftoverIds:pyramids.slice(1).map(g=>g.parts[0].id)};
   mark('palas reconfiguradas con sobrantes conservados',result);return result;
  }finally{t.hangarWorldAction(productionMode);}
 }
 function markersFromStock(){
  const stock=constructionStock().cube;assert(stock.length>=2,'two free cooled cubes are needed for the physical QR beacons');
  return stock.slice(0,2).map(g=>g.parts[0].id);
 }
 function connectDock(sourceId,beaconId){
  const existing=t.powerCables.find(c=>c.to?.id===beaconId||c.from?.id===beaconId);if(existing)return existing;
  const from={kind:'reservoir',id:sourceId},to={kind:'part',id:beaconId},a=t.powerPort(from),b=t.powerPort(to);assert(a&&b,'source and dock ports must exist');
  const points=[V(a.x,1.2,a.z),V(b.x,1.2,a.z),V(b.x,1.2,b.z)],path=[a,...points,b],length=t.powerCableLength(path);
  const count=Math.ceil(length/2),stock=constructionStock().cube;assert(stock.length>=count,'dock cable needs '+count+' existing free cubes');
  const materials=stock.slice(0,count).flatMap(g=>t.worldParts(g)),result=t.connectPowerCable(from,to,points,materials);assert(result.ok,result.error);
  mark('cable físico de recarga',{id:result.cable.id,metres:result.cable.length,materialIds:materials.map(p=>p.id)});return result.cable;
 }
 function teach(receiverId,loadId,drop,{pickZone='table',pickPoint=null,dropGripPoint=null}={}){
  pauseAndInput();const payload=t.rotorPart(loadId)?.g;assert(payload,'wait for a real delivery in '+pickZone);assert.equal(t.hangarChainZone(payload),pickZone);
  const box=t.bounds(payload),system=t.getTrajectorySystem(),before=payload.body.position.clone();
  assert(t.beginLogisticsPoseDraft(receiverId,'pick'));lookAt(pickPoint?asVector(pickPoint):V(box.center.x,box.max.y,box.center.z),!!pickPoint);
  if(pickPoint){
   // Aim at the real tray (or sample, if the ray meets it) and use the same
   // wheel control as the player. Only the camera/draft changes, never cargo.
   t.updateLogisticsPoseDraft(1,true);const draft=t.getLogisticsPoseDraft(),surface=draft.preview?.surface;
   assert(surface?.point&&surface.normal.y>.85,'the central pickup needs an observed upper tray/sample face');
   const offset=box.max.y+.025-surface.point.y;assert(offset>=.005&&offset<=2,'the observed pickup height must fit the editor');
   for(let steps=0;steps<400&&Math.abs((draft.clearance||.025)-offset)>.0026;steps++)t.handleWheel({deltaY:(draft.clearance||.025)<offset?-1:1,preventDefault(){}});
  }
  assert(t.updateLogisticsPoseDraft(1,true),t.getLogisticsPoseDraft().reason);assert.equal(t.getLogisticsPoseDraft().preview.candidate?.g,payload,'the taught pickup must target the selected real '+pickZone+' cargo');assert(t.confirmLogisticsPoseDraft(),el('notice').textContent);
  let destination=asVector(drop);
  if(dropGripPoint){
   const root=t.rotorPart(receiverId).g,{grip}=partsOf(root),pose=grip.mood.gripper.logistics.pick,rotation=t.Q();rotation.set(...pose.quaternion);
   const observedGrip=V(...pose.position).vadd(rotation.vmult(grip.offset)),desired=asVector(dropGripPoint);
   // Aim the current sample so the release tool has a stable shared centre.
   // Subsequent loads keep their real pickup offsets throughout the trip.
   destination=V(desired.x+box.center.x-observedGrip.x,desired.y,desired.z+box.center.z-observedGrip.z);
  }
  assert(t.beginLogisticsPoseDraft(receiverId,'place'));lookAt(destination,!!dropGripPoint);
  assert(t.updateLogisticsPoseDraft(1,true),t.getLogisticsPoseDraft().reason);assert(t.confirmLogisticsPoseDraft(),el('notice').textContent);
  assert(payload.body.position.distanceTo(before)<1e-7,'preview must not move the real process product');pauseAndInput();
  const route=system.routeFor(receiverId);system.refresh(route);assert(route.valid,route.reason);return route;
 }
 // The lesson endpoints leave space for its three distinct cold-plate slots.
 // Continuous production can teach a nearer endpoint after those slots clear.
 function configure({drone,loadId,sourceId=t.getHangarChainWorld().sourceId,beaconIds=null,home=[3.60,.006,-.25],drop=[4.04,.575,.45],endBeacon=null,pickZone='table',endFacingTurns=0}={}){
  assert(drone&&sourceId,'existing drone and revealed power source are required');const {receiver,grip,cell}=partsOf(drone),flight=t.flightForGroup(drone),system=t.getTrajectorySystem();
  reserved.add(loadId);beaconIds=beaconIds||markersFromStock();
  assert(!flight.enabled,'land and stop the carrier before route setup');assert(beaconIds.length===2);
  adapt(receiver.id,'receiver');
  const state=t.flightSnapshot(flight),center=drone.body.position.vadd(V(home[0]-state.center.x,home[1]-state.height,home[2]-state.center.z));crossRoom(receiver.id,center);
  const startPoint=V(home[0],.047,home[2]-.35),endPoint=endBeacon?asVector(endBeacon):V(drop[0]+.44,.047,drop[2]-.35);
  adapt(beaconIds[0],'beacon');crossRoom(beaconIds[0],startPoint,{faceUp:true});
  adapt(beaconIds[1],'beacon');
  const endGroup=t.rotorPart(beaconIds[1]).g,endBody=endGroup.body.position;
  // Check the complete descent column with the existing collision query. A
  // shorter feed endpoint can put the old fixed detour over its support plate.
  const clear=[.35,.40,.45,.50,.60,.70].map(dx=>V(endPoint.x+dx,.047,endPoint.z-.18)).find(p=>{
   for(let i=0;i<=40;i++)if(!t.validPose(endGroup,V(p.x,.047+(1.55-.047)*i/40,p.z),endGroup.body.quaternion))return false;
   return true;
  });assert(clear,'leave a clear physical descent beside the endpoint fixture');
  // The endpoint sits beside/below the cold frame. Descend outside its rail,
  // then carry the beacon horizontally through the clear floor pocket.
  carry(beaconIds[1],[V(endBody.x,1.55,endBody.z),V(clear.x,1.55,endBody.z),V(clear.x,1.55,clear.z),clear,endPoint],{faceUp:true,faceTurns:endFacingTurns});
  assert(t.toggleExternalBattery(cell.id,true));advance(1);
  const routeCreated=system.createStart(beaconIds[0]);assert(routeCreated.ok,routeCreated.message);assert(system.pair(routeCreated.routeId,beaconIds[1]).ok);assert(system.assign(receiver.id,routeCreated.routeId).ok);
  const cable=connectDock(sourceId,beaconIds[0]);
  until(()=>cell.mood.energy>=.9,40,'dock did not physically recharge: '+flight.chargeStatus);
  const route=teach(receiver.id,loadId,drop,{pickZone}),estimate=t.trajectoryEnergyEstimate(flight,route);assert(estimate.ok,estimate.message);
  mark('ruta QR enseñada sobre carga real',{receiverId:receiver.id,beacons:beaconIds,loadId,metres:route.length,storedJ:cell.mood.energy*t.externalBatteryCapacity(cell),estimateJ:estimate.requiredJ});
  return {drone,receiver,grip,cell,flight,system,route,cable,beaconIds,start:()=>system.start(receiver.id)};
 }
 function waitForStock(needed,seconds=600,label='material'){
  for(let elapsed=0;elapsed<=seconds;elapsed++){
   const stock=constructionStock(),counts=Object.fromEntries(Object.entries(stock).map(([shape,groups])=>[shape,groups.length]));
   if(Object.entries(needed).every(([shape,count])=>counts[shape]>=count))return stock;
   if(elapsed===seconds)assert.fail('Production did not complete '+label+': '+JSON.stringify({needed,counts,world:t.hangarWorldStatus(),message:t.getHangarChainWorld().message}));
   if(elapsed&&elapsed%30===0)mark('esperando '+label,{needed,stock:counts});advance(1);
  }
 }
 function enableSource(sourceId=t.getHangarChainWorld().sourceId){
  const source=t.powerReservoirs.find(r=>r.id===sourceId);assert(source?.missionOwned,'wait for the real mission source to be revealed');
  if(!source.enabled){
   t.openPowerReservoirMenu(source);const on=t.getCommandState().items.find(item=>item.label==='Encender salida');assert(on&&!on.disabled);on.run();
   const close=t.getCommandState().items.find(item=>item.label==='Cerrar');assert(close);close.run();
   assert(source.enabled);mark('fuente existente encendida',{sourceId:source.id,energyJ:t.story.galpon.energyJ});
  }
  pauseAndInput();return source;
 }
 function prepareConstruction({drone=null,productionTimeout=600}={}){
  pauseAndInput();t.setSelected(null);assert(t.hangarWorldAction('work'));
  if(!drone){
   el('galpon-chain-plan').value='drone';assert(t.hangarChainAction('prepare'));
   waitForStock({cube:4,coupler:1},productionTimeout,'material real del dron');
   reconfigureBlades();const built=assemble();assert(built.ok,built.message);drone=built.drone;
  }
  assert(t.hangarWorldAction('cube'));waitForStock({cube:8},productionTimeout,'cubos reales para QR y cable');
  mark('capital físico del dron preparado',{ids:drone.parts.map(p=>p.id),stockCubes:constructionStock().cube.length});
  return {drone,...partsOf(drone)};
 }
 function setup({loadId=null,sourceId=t.getHangarChainWorld().sourceId,drone=null,productionTimeout=600,loadTimeout=180,...routeOptions}={}){
  const tablePayload=()=>t.groups.find(g=>!g.robotHeld&&g.parts.length===1&&g.parts[0].shape==='cube'&&t.hangarChainZone(g)==='table'&&
   (()=>{const trace=t.story.galpon.chain.traces[g.parts[0].mood.matter?.root];return trace?.arm&&trace.firstLine&&!trace.manual;})());
  if(loadId)reserved.add(loadId);else{const existing=tablePayload();if(existing){loadId=existing.parts[0].id;reserved.add(loadId);}}
  enableSource(sourceId);const built=prepareConstruction({drone,productionTimeout});
  assert(t.hangarChainAction('feed'));
  if(!loadId){until(()=>!!tablePayload(),loadTimeout,'wait for an actual automatic arm delivery on the table');loadId=tablePayload().parts[0].id;reserved.add(loadId);}
  const ready=configure({...routeOptions,drone:built.drone,loadId,sourceId});
  mark('dron preparado para el primer viaje real',{receiverId:ready.receiver.id,loadId});return {...ready,loadId};
 }
 return {setup,prepareConstruction,waitForStock,enableSource,assemble,reconfigureBlades,configure,adapt,carry,crossRoom,connectDock,teach,partsOf,markersFromStock};
}

module.exports={droneRouteDriver};
