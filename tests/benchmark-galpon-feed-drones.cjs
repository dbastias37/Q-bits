'use strict';
// Native continuation of an already constructed factory. No manufactured
// fixtures, credited traces, cargo transforms, or battery refills live here.
// The only setup movement is the normal hand carrying empty equipment.
const assert=require('node:assert/strict');
const {droneRouteDriver}=require('./benchmark-galpon-drone-route.cjs');

function feedDroneDriver({t,sandbox,advance,mark=()=>{}}){
 const driver=droneRouteDriver({t,sandbox,advance,mark}),V=(x,y,z)=>t.V(x,y,z),system=t.getTrajectorySystem();
 let fleet=null;
 const state=()=>t.getHangarChainWorld(),trace=g=>t.story.galpon.chain.traces[g.parts[0].mood.matter?.root];
 const carriers=()=>t.groups.filter(g=>g.parts.some(p=>p.mood.gripper)&&t.propellerModules([g]).length);
 const coldLoads=()=>t.groups.filter(g=>!g.robotHeld&&g.parts.length===1&&g.parts[0].shape==='cube'&&t.hangarChainZone(g)==='second-cooler'&&trace(g)?.second&&!trace(g)?.manual&&
  sandbox.QBitsGalponProduction.record(t.story.galpon,g.parts[0].id)?.secondActiveSeconds>=sandbox.QBitsGalponChain.CONFIG.secondCoolingSeconds-1e-7).sort((a,b)=>a.body.position.x-b.body.position.x);
 const tableLoad=()=>t.groups.find(g=>!g.robotHeld&&g.parts.length===1&&g.parts[0].shape==='cube'&&t.hangarChainZone(g)==='table'&&trace(g)?.firstLine&&trace(g)?.arm&&!trace(g)?.manual);
 function wait(condition,seconds,label){
  for(let i=0;i<Math.ceil(seconds*60);i++){if(condition())return i/60;advance(1/60);}
  assert(condition(),label+' '+JSON.stringify(summary()));return seconds;
 }
 function describe(drone){
  const parts=driver.partsOf(drone),flight=t.flightForGroup(drone),route=system.routeFor(parts.receiver.id);
  return {drone,...parts,flight,system,route,start:()=>system.followers.has(parts.receiver.id)?{ok:true,message:'Already following the saved route'}:system.start(parts.receiver.id)};
 }
 function ports(){
  return Object.fromEntries(['feedA','feedB'].map(kind=>{
   const belt=t.conveyors.find(c=>c.baseId===state().belts[kind]);assert(belt,'build '+kind+' before its transport link');
   const entry=t.conveyorPortWorld(belt,'entry');assert(entry,'the real feed needs an entry port');
   return [kind,{belt,entry,landing:entry.p.vadd(entry.direction.scale(.08))}];
  }));
 }
 function classify(){
  const endpoints=ports(),routes={},unassigned=[];let upstream=null;
  for(const drone of carriers()){
   const q=describe(drone),pose=q.grip.mood.gripper.logistics?.place?.position;
   if(!pose){unassigned.push(q);continue;}
   const kind=Object.keys(endpoints).find(key=>Math.hypot(pose[0]-endpoints[key].landing.x,pose[2]-endpoints[key].landing.z)<.20);
   if(kind){assert(!routes[kind],'more than one saved drone claims '+kind);routes[kind]=q;}
   else{
    const cold=t.hangarChainLayout().cold;
    if(Math.abs(pose[0]-cold.x)<.5&&Math.abs(pose[2]-cold.z)<.5){assert(!upstream,'expected one existing table-to-cooler carrier');upstream=q;}
    else unassigned.push(q);
   }
  }
  return {endpoints,routes,upstream,unassigned};
 }
 function parked(q){return !t.robotGrips.has(q.grip.id)&&t.galponComponentSupported(q.flight.component)&&(!q.flight.enabled||q.flight.trip?.phase==='ground');}
 function park(q,seconds=180){
  if(!q)return;
  wait(()=>parked(q),seconds,'wait for the existing carrier to land before setup');
  if(system.followers.has(q.receiver.id))assert(system.stop(q.receiver.id,'Pausa de instalación · apoyado en origen'));
  assert(!q.flight.enabled,'an airborne paused carrier must land through its normal flight controls first');
 }
 function summary(){
  const rows=carriers().map(g=>{
   const q=describe(g),config=q.grip.mood.gripper.logistics;
   return {receiverId:q.receiver.id,gripId:q.grip.id,batteryId:q.cell.id,routeId:q.route?.id,length:q.route?.length,valid:q.route?.valid,reason:q.route?.reason,
    following:system.followers.has(q.receiver.id),enabled:q.flight.enabled,status:q.flight.status,charge:q.flight.chargeStatus,waiting:q.flight.logisticsWaitReason,
    phase:q.flight.trip?.phase,index:q.flight.trip?.index,position:[g.body.position.x,g.body.position.y,g.body.position.z],storedJ:q.cell.mood.energy*t.externalBatteryCapacity(q.cell),
    pick:config?.pick?.position,place:config?.place?.position,payloadId:t.robotGrips.get(q.grip.id)?.g?.parts[0]?.id};
  });
  return {seconds:t.story.galpon.elapsed,energyJ:t.story.galpon.energyJ,carriers:rows,
   arms:t.robotArms.map(a=>({gripperId:a.gripperId,running:a.running,state:a.state,status:a.status,cycles:a.cycles,payloadId:t.robotGrips.get(a.gripperId)?.g?.parts[0]?.id})),firstQueue:[...state().firstQueue],
   table:t.groups.filter(g=>t.hangarChainZone(g)==='table').map(g=>({id:g.parts[0].id,position:[g.body.position.x,g.body.position.y,g.body.position.z]})),
   cold:coldLoads().map(g=>({id:g.parts[0].id,origin:g.parts[0].mood.matter.root,position:[g.body.position.x,g.body.position.y,g.body.position.z]})),
   stock:Object.fromEntries(Object.entries(t.hangarChainStock()).map(([shape,list])=>[shape,list.length])),chain:sandbox.QBitsGalponChain.status(t.story.galpon)};
 }
 function unusedBeacons(){return t.groups.filter(g=>g.parts.length===1&&g.parts[0].mood.trajectory?.role==='beacon'&&!g.parts[0].mood.trajectory.routeId).map(g=>g.parts[0].id);}
 function build(kind,load,options){
  const current=classify(),existing=current.routes[kind];if(existing)return existing;
  assert(current.unassigned.length<=1,'finish or remove the other incomplete carrier before assembling another');
  const incomplete=current.unassigned[0],landing=current.endpoints[kind].landing;
  if(incomplete?.route?.startId&&incomplete.route.endId){
   // A checkpoint after cable installation already owns the pair. Complete
   // its charge/preview without another pair, blueprint or material debit.
   assert(!incomplete.flight.enabled,'land the unfinished carrier before teaching its route');
   const cable=driver.connectDock(state().sourceId,incomplete.route.startId);
   wait(()=>incomplete.cell.mood.energy>=.9,40,'the existing dock must recharge its unfinished carrier');
   incomplete.route=driver.teach(incomplete.receiver.id,load.parts[0].id,landing,{pickZone:'second-cooler'});
   mark('transporte '+kind+' completado desde su cable guardado',{receiverId:incomplete.receiver.id,cableId:cable.id,metres:incomplete.route.length});return incomplete;
  }
  const built=driver.prepareConstruction({drone:current.unassigned[0]?.drone,productionTimeout:options.productionTimeout});
  mark('capital del transporte '+kind+' listo',{receiverId:built.receiver.id});
  const free=unusedBeacons(),fresh=free.length>=2?[]:driver.markersFromStock(),beaconIds=[...free,...fresh].slice(0,2);
  // The original plate is flanked by two distinct floor pads. Reverse the
  // feed QR's heading using native face turns so its anchor points toward -Z.
  const home=kind==='feedA'?[3.82,.006,.45]:[4.85,.006,.45];
  const q=driver.configure({drone:built.drone,loadId:load.parts[0].id,pickZone:'second-cooler',home,drop:[landing.x,landing.y,landing.z],
   beaconIds,endBeacon:[landing.x+(kind==='feedA'?.02:.10),.047,landing.z+.36],endFacingTurns:2});
  mark('transporte '+kind+' enseñado',{receiverId:q.receiver.id,loadId:load.parts[0].id,home,drop:[landing.x,landing.y,landing.z],metres:q.route.length});return q;
 }
 function oneDelivery(q,payload,seconds=180){
  const id=payload.parts[0].id,origin=payload.parts[0].mood.matter.root,start=t.story.galpon.elapsed;let took=false;
  assert(q.start().ok,system.nodes.get(q.receiver.id)?.status);
  wait(()=>{
   took||=t.robotGrips.get(q.grip.id)?.g===payload;
   assert(system.followers.has(q.receiver.id),'the native feed route stopped: '+q.flight.status);
   return took&&parked(q);
  },seconds,'the feed carrier did not complete its genuine pickup, delivery and return');
  park(q);wait(()=>t.story.galpon.chain.traces[origin]?.feed===true,2,'delivery needs actual contact with its feed');
  mark('producto inicial transportado al alimentador',{receiverId:q.receiver.id,id,origin,durationSeconds:t.story.galpon.elapsed-start});
 }
 function taughtGripPoint(q,name){
  const pose=q.grip.mood.gripper.logistics?.[name];assert(pose,'teach '+name+' before aligning the next transport');
  // The reference carrier is one rigid body. Its saved tool position is a
  // physical measurement; use it as the next operator's aiming reference.
  const rotation=t.Q();rotation.set(...pose.quaternion);const offset=rotation.vmult(q.grip.offset);
  return V(pose.position[0]+offset.x,pose.position[1]+offset.y,pose.position[2]+offset.z);
 }
 function centerColdPickups(seconds){
  const incoming=fleet.upstream,delivery=taughtGripPoint(incoming,'place'),pickPoint=[delivery.x,t.hangarChainLayout().cold.y,delivery.z];
  if(Object.values(fleet.routes).every(q=>{const p=taughtGripPoint(q,'pick');return Math.hypot(p.x-delivery.x,p.z-delivery.z)<.006;}))return;
  // Leave a real incoming sample on the cooler. Stopping empty outgoing
  // carriers at home prevents them taking that teaching sample first.
  for(const q of Object.values(fleet.routes))park(q,seconds);
  let sample;
  wait(()=>{
   sample=coldLoads()[0];return !!sample&&parked(incoming)&&t.story.galpon.chain.drone.delivered.includes(sample.parts[0].mood.matter.root);
  },seconds,'wait for the incoming delivery and its real return before centering cold pickups');
  park(incoming);const endpoints=ports();
  for(const kind of ['feedA','feedB']){
   const q=fleet.routes[kind],landing=endpoints[kind].landing,marker=t.rotorPart(q.route.endId);
   if(kind==='feedA'&&Math.abs(marker.p.x-landing.x-.02)>.006){
    driver.crossRoom(marker.part.id,V(landing.x+.02,.047,landing.z+.36),{faceUp:true,faceTurns:2});
    system.refresh(q.route);assert(q.route.valid,q.route.reason);
   }
   // Keep the tool centred over the feed as different arm drops arrive on
   // either side of the common cold pickup. The real load keeps its offset.
   q.route=driver.teach(q.receiver.id,sample.parts[0].id,landing,{pickZone:'second-cooler',pickPoint,dropGripPoint:[landing.x,landing.y,landing.z]});
   mark('toma central del enfriador enseñada para '+kind,{receiverId:q.receiver.id,sampleId:sample.parts[0].id,pickPoint,metres:q.route.length});
  }
 }
 function prepareContinuousDock(incoming,load,{pickPoint,dropGripPoint,drop}){
  park(incoming);
  const begin=t.story.galpon.elapsed,energy=t.story.galpon.energyJ,body=incoming.drone.body,state=t.flightSnapshot(incoming.flight);
  // The lesson needs room for three separate cold samples. Once those extras
  // leave through real flights, the continuous route can shorten its final
  // leg and put the origin's complete lift column farther from the table.
  // Move only the empty carrier and its existing beacons with the native hand.
  driver.crossRoom(incoming.receiver.id,V(4,body.position.y-state.height+.006,-.25));
  driver.crossRoom(incoming.route.startId,V(4,.047,-.60),{faceUp:true});
  driver.crossRoom(incoming.route.endId,V(4.20,.047,.10),{faceUp:true});
  system.refresh(incoming.route);assert(incoming.route.valid,incoming.route.reason);
  incoming.route=driver.teach(incoming.receiver.id,load.parts[0].id,drop,{pickPoint,dropGripPoint});
  assert(incoming.route.length<=4&&t.galponComponentSupported(incoming.flight.component));
  fleet.newInstallation=false;
  mark('origen continuo recolocado con mano y poses reenseñadas',{receiverId:incoming.receiver.id,home:[4,.006,-.25],endBeacon:[4.20,.047,.10],metres:incoming.route.length,
   durationSeconds:t.story.galpon.elapsed-begin,sourceSpentJ:energy-t.story.galpon.energyJ});
 }
 function setup({productionTimeout=600,loadTimeout=180,drainInitial=true,recalibrate=false}={}){
  assert(t.story.scene==='galpon'&&state()?.assembler?.placed&&state().laser,'continue the existing powered two-feed factory first');
  assert(state().arms.every(id=>t.robotArms.some(a=>a.gripperId===id)),'restore every existing arm controller before continuing the factory');
  driver.enableSource();advance(.25);let found=classify();assert(found.upstream,'the table-to-cooler route must already exist');
  for(const endpoint of Object.values(found.endpoints))if(!endpoint.belt.running)assert(t.startConveyor(endpoint.belt),endpoint.belt.status);
  // A complete saved fleet is already concrete. Resume its exact routes and
  // runtime rather than manufacturing duplicate equipment or editing samples.
  const samePick=found.routes.feedA&&found.routes.feedB&&(()=>{const a=found.routes.feedA.grip.mood.gripper.logistics.pick.position,b=found.routes.feedB.grip.mood.gripper.logistics.pick.position;return Math.hypot(a[0]-b[0],a[2]-b[2])<.1;})();
  if(found.routes.feedA&&found.routes.feedB&&samePick){
   fleet={routes:found.routes,upstream:found.upstream,preservePoses:!recalibrate,summary,start:startFleet};mark('flota existente recuperada',summary());return fleet;
  }
  park(found.upstream);for(const q of Object.values(found.routes))park(q);
  wait(()=>coldLoads().length>0,loadTimeout,'wait for at least one genuinely stabilized product on the second cooler');
  let loads=coldLoads(),primary=loads[0],primaryId=primary.parts[0].id;
  const primaryDrop=[t.bounds(primary).center.x,t.hangarChainLayout().cold.y,t.bounds(primary).center.z];
  const routes={};routes.feedA=build('feedA',primary,{productionTimeout});
  loads=coldLoads();assert(loads.some(g=>g.parts[0].id===primaryId),'the real shared sample must remain on the cold plate during installation');
  routes.feedB=build('feedB',loads.at(-1),{productionTimeout});
  const endpoints=ports();
  if(drainInitial){
   for(const extra of coldLoads().filter(g=>g.parts[0].id!==primaryId).reverse()){
    routes.feedB.route=driver.teach(routes.feedB.receiver.id,extra.parts[0].id,endpoints.feedB.landing,{pickZone:'second-cooler'});
    oneDelivery(routes.feedB,extra);
   }
  }
  primary=t.rotorPart(primaryId)?.g;assert(primary&&t.hangarChainZone(primary)==='second-cooler','leave one real primary sample until both pickup poses are taught');
  for(const kind of ['feedA','feedB'])routes[kind].route=driver.teach(routes[kind].receiver.id,primaryId,endpoints[kind].landing,{pickZone:'second-cooler'});
  assert(t.hangarChainAction('feed'));
  fleet={routes,upstream:found.upstream,primaryId,primaryDrop,newInstallation:true,summary,start:startFleet};
  // Finish the physical calibration before exposing a resumable ready fleet.
  // This uses the first outgoing/incoming trips as real teaching samples.
  // Subsequent starts, including reload, preserve these exact saved poses.
  startFleet({loadTimeout});for(const q of [...Object.values(routes),fleet.upstream])park(q,loadTimeout);
  fleet.preservePoses=true;
  mark('dos transportes listos para los alimentadores',summary());return fleet;
 }
 function startFleet({feeds=['feedA','feedB'],upstream=true,loadTimeout=180}={}){
  assert(fleet,'run setup before starting the fleet');assert(feeds.length&&feeds.every(kind=>['feedA','feedB'].includes(kind)));
  for(const kind of feeds){const result=fleet.routes[kind].start();assert(result.ok,result.message);}
  mark('transportes de alimentadores en marcha',{receivers:feeds.map(kind=>fleet.routes[kind].receiver.id)});
  if(upstream){
   if(fleet.preservePoses){
    const resumed=fleet.upstream.start();assert(resumed.ok,resumed.message);assert(t.hangarChainAction('feed'));
    mark('flota guardada reanudada con sus poses existentes',summary());return fleet;
   }
   const incoming=fleet.upstream,place=taughtGripPoint(incoming,'place');
   const desired=fleet.primaryDrop||[4.04,t.hangarChainLayout().cold.y,.45];
   const cold=t.hangarChainLayout().cold,dropGripPoint=[cold.x-.20,cold.y,cold.z-.20];
   const table=t.hangarChainLayout().table,pickPoint=[table.x-.0085,table.y,table.z-.0126],pick=incoming.route.points.find(point=>point.action==='grab'),hit=t.rotorPart(incoming.grip.id),snapshot=t.flightSnapshot(incoming.flight);
   const centered=Math.hypot(pick.x+hit.p.x-snapshot.center.x-pickPoint[0],pick.z+hit.p.z-snapshot.center.z-pickPoint[2])<.006;
   if(Math.hypot(place.x-dropGripPoint[0],place.z-dropGripPoint[2])>.08||!centered){
    park(incoming);
    // The first physical outgoing pickup must clear the arrival volume before
    // the incoming preview can be taught at the shared cold pocket.
    wait(()=>{
     const payload=fleet.primaryId&&t.rotorPart(fleet.primaryId)?.g;
     return !payload||Math.hypot(payload.body.position.x-desired[0],payload.body.position.z-desired[2])>.5;
    },loadTimeout,'wait for an outgoing carrier to clear the cold arrival pocket');
    wait(()=>!!tableLoad(),loadTimeout,'wait for a new automatic arm delivery to teach the incoming pickup');
    incoming.route=driver.teach(incoming.receiver.id,tableLoad().parts[0].id,desired,{pickPoint,dropGripPoint});
    mark('entrada del enfriador reenseñada tras retirada física',{receiverId:incoming.receiver.id,pickPoint,dropGripPoint});
   }
   if(fleet.newInstallation){
    wait(()=>!!tableLoad(),loadTimeout,'wait for a real table sample before relocating its empty carrier');
    prepareContinuousDock(incoming,tableLoad(),{pickPoint,dropGripPoint,drop:desired});
   }
   const result=incoming.start();assert(result.ok,result.message);
   centerColdPickups(loadTimeout);
   for(const kind of feeds){const resumed=fleet.routes[kind].start();assert(resumed.ok,resumed.message);}
   const resumed=incoming.start();assert(resumed.ok,resumed.message);
  }
  assert(t.hangarChainAction('feed'));mark('flota configurada en repetición real',summary());return fleet;
 }
 return {setup,start:startFleet,summary,driver};
}

module.exports={feedDroneDriver};

if(require.main===module){
 const fs=require('node:fs'),path=require('node:path'),createGame=require('./game-harness.cjs');
 const args=Object.fromEntries(process.argv.slice(2).map(value=>value.replace(/^--/,'').split('=')));
 assert(args.checkpoint,'pass --checkpoint=/path/to/a/real/factory/checkpoint.json');
 const output=path.resolve(args.output||'/tmp/qbits-native-feed-drones');fs.mkdirSync(output,{recursive:true});
 const checkpoint=JSON.parse(fs.readFileSync(args.checkpoint,'utf8')),entries=new Map(checkpoint.entries),storage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,String(value))};
 const game=createGame({storage}),{t,sandbox,api}=game,hz=Number(args.hz||60);assert([60,120,240].includes(hz));
 const result={scope:'Native second-cooler-to-feed transport: actual production, paid blueprints, native hand equipment placement, QR previews, powered docking and physical cargo travel. No fixture material or process cargo writes.',events:[]};let driver,serial=0;
 const persist=name=>{const saved=t.saveCurrentGame();assert(saved.ok,saved.error);fs.writeFileSync(path.join(output,name+'.json'),JSON.stringify({entries:[...entries],observed:driver?.summary()},null,2)+'\n');};
 const mark=(event,extra={})=>{const row={event,seconds:t.story.galpon.elapsed,energyJ:t.story.galpon.energyJ,...extra};result.events.push(row);console.error(JSON.stringify(row));
  // Only completed, released setup stages call mark. These are resumable real
  // saves; a failed preview or active hand is preserved by the failure handler.
  if(!event.startsWith('esperando '))persist(String(++serial).padStart(2,'0')+'-'+event.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').toLowerCase());
 };
 const advance=seconds=>{for(let frame=0;frame<Math.ceil(seconds*60);frame++){if(t.navigationJobs.size)t.runNavigationJobs();for(let i=0;i<hz/60;i++)t.stepSimulation(1/hz);}};
 (async()=>{
  let ready=false;const prepared=api.prepare().then(()=>ready=true);for(let i=0;i<30&&!ready;i++){game.frame(i*17);await Promise.resolve();await Promise.resolve();}await prepared;
  api.menu();t.applyPreferences({physicsHz:hz});sandbox.document.querySelector('#main-galpon').click();sandbox.document.querySelector('#galpon-continue').click();assert.equal(t.story.scene,'galpon');assert.deepEqual([...t.saveSession.restoreWarnings],[],'the durable factory must restore every mechanism without a warning');
  driver=feedDroneDriver({t,sandbox,advance,mark});result.initial=driver.summary();const fleet=driver.setup({productionTimeout:Number(args.timeout||600),drainInitial:args.drain!=='false',recalibrate:args.recalibrate==='true'});persist('ready');
  if(args.start!=='false')fleet.start({feeds:args.only?['feed'+args.only.toUpperCase()]:['feedA','feedB'],upstream:args.upstream!=='false'});
  const seconds=Number(args.seconds||0);for(let elapsed=0;elapsed<seconds;elapsed++){advance(1);if(elapsed%30===29)mark('avance de flota',{elapsed:elapsed+1,...driver.summary()});}
  result.final=driver.summary();persist('final');assert.doesNotThrow(()=>sandbox.QBitsGalponProduction.validate(t.story.galpon));
  fs.writeFileSync(path.join(output,'benchmark.json'),JSON.stringify(result,null,2)+'\n');console.error('Native feed transport complete:',output);
 })().catch(error=>{result.failure=error.stack;try{result.final=driver?.summary();persist('failed');}catch{}fs.writeFileSync(path.join(output,'benchmark.json'),JSON.stringify(result,null,2)+'\n');console.error(error);process.exitCode=1;});
}
