'use strict';
// Contiguous mission benchmark. Production, travel, grips and reception use
// the normal clocks. Configuration may use the same APIs as the tablet.
// Never manufacture fixtures or write product poses in this benchmark.
// node tests/benchmark-galpon-chain.cjs --output=/tmp/qbits-chain
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const {droneRouteDriver}=require('./benchmark-galpon-drone-route.cjs');
const {factoryDriver}=require('./benchmark-galpon-factory-route.cjs');
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const hz=Number(args.hz||60);assert([60,120,240].includes(hz));
const target=Number(args.target||80);assert(Number.isSafeInteger(target)&&target>=1&&target<=80);
const out=path.resolve(args.output||'/tmp/qbits-chain');fs.mkdirSync(out,{recursive:true});
const entries=new Map(args.checkpoint?JSON.parse(fs.readFileSync(args.checkpoint,'utf8')).entries:[]);
const storage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,String(value))};
const game=createGame({storage,nativeContext:args['native-context']!=='false'}),{t,sandbox,api}=game,el=id=>sandbox.document.querySelector('#'+id);
const result={mode:'Contiguous four-worker mission with real economy and Cannon; simulated clock accelerated, DOM/GPU instrumented.',vmContext:game.nativeContext?'ordinary-global':'contextified',milestones:[],observations:[],errors:[]};
const rounded=n=>Math.round(n*100)/100;
const mark=(event,extra={})=>{const row={event,seconds:rounded(t.story.galpon.elapsed),energyJ:rounded(t.story.galpon.energyJ),...extra};result.milestones.push(row);console.error(JSON.stringify(row));};
const read=()=>({seconds:rounded(t.story.galpon.elapsed),energyJ:rounded(t.story.galpon.energyJ),line:t.hangarLineStatus(),stock:t.hangarWorldStatus(),chain:t.story.galpon.chain&&sandbox.QBitsGalponChain.status(t.story.galpon),world:t.getHangarChainWorld()&&t.hangarChainSnapshot(),bodies:t.world.bodies.length,groups:t.groups.length});
const checkpoint=name=>{const saved=t.saveCurrentGame();assert(saved.ok,saved.error);fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify({entries:[...entries],observed:read()},null,2));};
function advance(seconds,done=()=>false){
 for(let n=0;n<seconds*60;n++){
  if(t.navigationJobs.size)t.runNavigationJobs();
  for(let step=0;step<hz/60;step++)t.stepSimulation(1/hz);
  if(n%60===59&&done())return true;
 }
 return done();
}
async function main(){
 let ready=false;const prepared=api.prepare().then(()=>ready=true);
 for(let i=0;i<30&&!ready;i++){game.frame(i*17);await Promise.resolve();await Promise.resolve();}await prepared;
 api.menu();t.applyPreferences({physicsHz:hz});el('main-galpon').click();
 if(args.iterations)t.world.solver.iterations=Number(args.iterations);
 if(args.checkpoint){el('galpon-continue').click();assert.equal(t.story.scene,'galpon');assert.deepEqual([...t.saveSession.restoreWarnings],[],'the contiguous run must restore every saved mechanism without warnings');}
 else{el('galpon-workers').value='4';el('galpon-limit').value='12';el('galpon-start').click();}
 t.onPhysicalKeyDown({code:'KeyP',key:'p',preventDefault(){},target:t.canvas});t.onPhysicalKeyUp({code:'KeyP',key:'p',preventDefault(){},target:t.canvas});el('galpon-work').click();
 if(!args.checkpoint)mark('cuatro trabajadores iniciales',{ids:[...t.story.galpon.initialIds]});
 let built=t.hangarLineStatus().built,received=t.story.galpon.received,lastExtracted=t.story.galpon.extracted,idle=0;
 for(let n=0;n<1800&&received<12;n++){
  advance(1);const line=t.hangarLineStatus();
  if(t.story.galpon.extracted===lastExtracted)idle++;else{lastExtracted=t.story.galpon.extracted;idle=0;}assert(idle<90,'Extraction made no progress for90 seconds');
  if(line.built<8&&!el('galpon-build').disabled){el('galpon-build').click();const next=t.hangarLineStatus().built;if(next>built){built=next;mark('tramo '+built);el('galpon-run').click();}}
  if(line.received>received){received=line.received;mark('recepción '+received);}
  if(n%120===119){console.error('avance A',JSON.stringify(read()));}
 }
 assert.equal(t.hangarLineStatus().built,8);assert.equal(t.story.galpon.received,12);if(!t.story.galpon.chain)checkpoint('01-primera-linea');
 if(!t.story.galpon.chain){el('galpon-chain-begin').click();assert(t.story.galpon.chain);mark('inicio B');}
 t.hideStoryDialogue();t.resumeGame();
 const w=t.getHangarChainWorld();
 assert(w.arms.every(id=>t.robotArms.some(a=>a.gripperId===id)),'every existing arm must retain its controller after reload');
 if(!w.arms.length){el('galpon-chain-plan').value='arm';el('galpon-chain-prepare').click();
  for(let n=0;n<400&&!w.arms.length;n++){advance(1);if(n%5===4)t.buildHangarChainMechanism('arm');if(n%60===59)console.error('avance brazo',JSON.stringify(read()));}
  assert.equal(w.arms.length,1,w.message);mark('brazo montado',{workers:t.hangarWorldStatus().workers,rotors:t.robotArmRotors(t.robotArms.find(a=>a.gripperId===w.arms[0])).length});
 }
 const arm=t.robotArms.find(a=>a.gripperId===w.arms[0]),hit=t.rotorPart(arm.gripperId);t.setSelected({g:hit.g,part:hit.part});
 for(const [joint,motor]of t.robotArmRotors(arm).entries()){
  const maxTorque=[2,4,3,2][joint];
  if(motor.rpm!==12||motor.maxTorque!==maxTorque||motor.capacity!==64)assert(t.robotPanelAction('motor',{joint,rpm:12,maxTorque,capacity:64}).ok);
 }
 function teach(name,point,heightCm){
  const candidates=name==='pick'?[heightCm,2,3,4].flatMap(height=>[0,.02,-.02].flatMap(dx=>[0,-.02,.02].map(dz=>({point:t.V(point.x+dx,point.y,point.z+dz),height})))):[{point,height:heightCm}];let d;
  for(const candidate of candidates){sandbox.document.pointerLockElement=t.canvas;assert(t.robotPanelAction('pose',{pose:name,heightCm:candidate.height}).ok);
   const p=candidate.point,camera=[p.x,p.y+.85,p.z+.7];t.setLook({camera,yaw:0,pitch:Math.atan2(p.y-camera[1],.7)});t.updateRobotPoseDraft(1,true);d=t.getRobotPoseDraft();
   if(d.solution?.pose){mark('pose '+name+' validada',{point:p,heightCm:candidate.height});break;}
  }
  if(!d.solution?.pose)console.error('pose diagnostic',JSON.stringify({name,point,reason:d.reason,target:d.target,surface:d.surface&&{point:d.surface.point,normal:d.surface.normal},best:d.solution&&{point:d.solution.sample?.point,normal:d.solution.sample?.normal,score:d.solution.score},normal:d.model.normal,tip:d.model.point,links:d.model.chain.map(l=>({pivot:l.pivot,axis:l.axis}))}));assert(d.solution?.pose,d.reason);
  t.canvas.dispatchEvent({type:'mousedown',button:0});assert.equal(t.getRobotPoseDraft(),null);t.resumeGame();t.hideStoryDialogue();
 }
 if(sandbox.QBitsGalponChain.status(t.story.galpon).armDemo<1){
  el('galpon-chain-feed').click();
  advance(80,()=>w.firstQueue.length>0);assert(w.firstQueue.length,w.message);
  advance(15);mark('buffer físico en recepción',{queue:w.firstQueue.map(id=>({id,p:t.rotorPart(id)?.g.body.position}))});
  mark('primera carga B sobre recepción',{queue:[...w.firstQueue]});checkpoint('02-brazo-y-carga');
  // Teach over the middle of the observed landing range, using the tray as
  // the surface. Its 12 cm offset leaves the same 3 cm gap over a 9 cm cube.
  // Cubes landing to either side remain under the physical gripper face.
  teach('pick',t.hangarChainLayout().pickup,12);teach('place',t.hangarChainLayout().table,25);
  assert(t.configureRobotArm(arm,{repeat:true}));assert(t.startRobotArm(arm),arm.status);
  const delivered=advance(90,()=>sandbox.QBitsGalponChain.status(t.story.galpon).armDemo>=1);assert(delivered,arm.status+' · '+w.message);mark('transferencia real de recepción a mesa');
 }
 t.hangarChainAction('skip');t.hideStoryDialogue();checkpoint('03-brazo-y-fuente');
 if(args.until&&args.until!=='arm'){
  const source=t.powerReservoirs.find(r=>r.id===w.sourceId);assert(source,'the real arm delivery must reveal the source');
  if(!source.enabled){t.openPowerReservoirMenu(source);t.getCommandState().items.find(item=>item.label==='Encender salida').run();t.getCommandState().items.find(item=>item.label==='Cerrar').run();}
  el('galpon-chain-plan').value='drone';assert(t.hangarChainAction('prepare'));t.hideStoryDialogue();t.resumeGame();
  const from={kind:'reservoir',id:source.id},to={kind:'part',id:arm.baseId},a=t.powerPort(from),b=t.powerPort(to),bends=[t.V(a.x,1.2,a.z),t.V(b.x,1.2,a.z),t.V(b.x,1.2,b.z)];
  const count=Math.ceil(t.powerCableLength([a,...bends,b])/2);
  if(!t.getCableSupply(hit.g).includes(source.cell)){
   assert(advance(400,()=>t.hangarChainStock().cube.length>=count),w.message);
   const parts=t.hangarChainStock().cube.slice(0,count).flatMap(g=>t.worldParts(g)),cable=t.connectPowerCable(from,to,bends,parts);assert(cable.ok,cable.error);
   mark('brazo conectado a la fuente',{metres:cable.cable.length,material:parts.map(p=>p.id)});checkpoint('04-brazo-cableado');
  }
  const driver=droneRouteDriver({t,sandbox,advance,mark}),existing=t.groups.find(g=>g.parts.some(p=>p.mood.gripper?.logistics?.pick)&&t.propellerModules([g]).length);let qr;
  if(existing){const parts=driver.partsOf(existing),system=t.getTrajectorySystem();qr={drone:existing,...parts,system,flight:t.flightForGroup(existing),route:system.routeFor(parts.receiver.id),start:()=>system.start(parts.receiver.id)};}
  else{qr=driver.setup();checkpoint('05-dron-y-ruta');}
  const C=sandbox.QBitsGalponChain;
  if(C.status(t.story.galpon).droneDelivered<1){
   assert(qr.flight.enabled||qr.start().ok);const landed=advance(100,()=>C.status(t.story.galpon).droneDelivered>=1);
   assert(landed,qr.flight.status+' · '+w.message);mark('primera entrega QR y regreso físico',{chain:C.status(t.story.galpon)});checkpoint('06-primer-viaje-qr');
  }
  if(args.until!=='drone'){
   assert(t.hangarChainAction('feed'));t.setHangarLineRunning(true);
   if(!arm.running)assert(t.startRobotArm(arm),arm.status);
   const slots=[[4.04,.575,.45],[4.24,.575,.45],[4.44,.575,.45]];
   while(C.status(t.story.galpon).droneDelivered<3){
    const count=C.status(t.story.galpon).droneDelivered;
    const tableLoad=()=>t.groups.find(g=>t.hangarChainZone(g)==='table'&&g.parts.every(p=>{const trace=t.story.galpon.chain.traces[p.mood.matter?.root];return trace?.arm&&!trace.manual;}));
    assert(advance(160,()=>!!tableLoad()&&qr.flight.trip?.phase==='ground'&&t.galponComponentSupported(qr.flight.component)),arm.status+' · '+qr.flight.status);
    qr.system.stop(qr.receiver.id,'Enseñar el siguiente puesto del enfriador');
    const load=tableLoad();assert(load);driver.teach(qr.receiver.id,load.parts[0].id,t.V(...slots[count]));assert(qr.start().ok);
    assert(advance(100,()=>C.status(t.story.galpon).droneDelivered>count),qr.flight.status+' · '+w.message);
    mark('entrega QR '+(count+1)+' y regreso',{chain:C.status(t.story.galpon)});checkpoint('06-viaje-qr-'+(count+1));
   }
   assert(advance(180,()=>C.status(t.story.galpon).armWired>=3),arm.status+' · '+w.message);
   assert(C.status(t.story.galpon).stabilized>=3);mark('tres transferencias cableadas y tres viajes QR completos',{chain:C.status(t.story.galpon)});checkpoint('07-hitos-logisticos');
   if(args.until!=='lessons'){
    const factory=factoryDriver({t,sandbox,advance,mark});factory.setup();assert(factory.order(),w.message);
    mark('dos líneas y ensambladora listas · pedido abierto',{chain:C.status(t.story.galpon),factory:factory.summary()});checkpoint('08-pedido-abierto');
    if(args.until==='complete'){
     const {feedDroneDriver}=require('./benchmark-galpon-feed-drones.cjs');
     const logistics=feedDroneDriver({t,sandbox,advance,mark});const fleet=logistics.setup();
     checkpoint('08-flota-configurada');
     assert(fleet.start()!==false,'the real feed routes must be enabled');
     mark('alimentación automática del segundo frío configurada',{fleet:logistics.summary()});checkpoint('09-cadena-autonoma');
     const started=t.story.galpon.elapsed,initialEnergyJ=t.story.galpon.energyJ,initialReceived=C.status(t.story.galpon).total,wallStarted=process.hrtime.bigint();let received=initialReceived,lastDelivery=started;
     let peakBodies=t.world.bodies.length,peakGroups=t.groups.length;
     for(let n=0;n<20000&&!C.status(t.story.galpon).completed&&(target===80||received<target);n++){
      advance(1);const current=C.status(t.story.galpon);peakBodies=Math.max(peakBodies,t.world.bodies.length);peakGroups=Math.max(peakGroups,t.groups.length);
      if(current.total>received){received=current.total;lastDelivery=t.story.galpon.elapsed;mark('rotor recibido '+received,{chain:current,bodies:t.world.bodies.length});checkpoint(received%20===0?'10-tanda-'+(received/20):'10-recepcion-'+received);}
      if(n%60===59){
       assert.doesNotThrow(()=>sandbox.QBitsGalponProduction.validate(t.story.galpon));const fleetState=logistics.summary();
       mark('cadena automática en marcha',{chain:current,fleet:fleetState,line:t.hangarLineStatus()});
       assert(arm.running,'the production arm stopped: '+arm.status);
       assert(fleetState.carriers.every(carrier=>carrier.following&&carrier.enabled),'a required automatic route stopped: '+JSON.stringify(fleetState));
      }
      assert(t.story.galpon.elapsed-lastDelivery<1200,'No new physical rotor for 1,200 simulated seconds: '+JSON.stringify({chain:current,fleet:logistics.summary(),world:t.hangarChainSnapshot()}));
     }
     assert(received>=target,'the requested number of new physical receipts must be reached');
     result.endurance={target,initialReceived,initialEnergyJ,finalEnergyJ:t.story.galpon.energyJ,spentEnergyJ:initialEnergyJ-t.story.galpon.energyJ,simulatedSeconds:t.story.galpon.elapsed-started,wallSeconds:Number(process.hrtime.bigint()-wallStarted)/1e9,peakBodies,peakGroups,receivedIds:[...t.story.galpon.chain.order.receivedIds],spent:{...t.story.galpon.spent}};
     assert.equal(new Set(result.endurance.receivedIds).size,result.endurance.receivedIds.length);
     if(target===80){
      assert(C.status(t.story.galpon).completed,'the physical order and useful-activity requirement must both complete');
      mark('cuatro tandas y continuidad completadas',{chain:C.status(t.story.galpon),endurance:result.endurance});checkpoint('11-pedido-completo');
      t.hideStoryDialogue();t.resumeGame();const afterVictory=t.story.galpon.elapsed;advance(10);assert(t.story.galpon.elapsed>afterVictory+9.9,'the same world must remain playable after completion');
      if(args['after-victory']==='rotor'){
       const before=[...result.endurance.receivedIds],energyJ=result.endurance.finalEnergyJ;
       assert(advance(600,()=>t.story.galpon.chain.order.receivedIds.length>before.length),'the completed installation must manufacture and physically receive another rotor');
       const after=[...t.story.galpon.chain.order.receivedIds];assert(before.every((id,index)=>after[index]===id));assert.equal(new Set(after).size,after.length);
       result.afterVictory={receivedBefore:before.length,receivedAfter:after.length,newIds:after.slice(before.length),seconds:t.story.galpon.elapsed-afterVictory,energyJ:t.story.galpon.energyJ,spentEnergyJ:energyJ-t.story.galpon.energyJ};
       mark('nueva recepción física después de la victoria',{afterVictory:result.afterVictory});
      }
      assert.doesNotThrow(()=>sandbox.QBitsGalponProduction.validate(t.story.galpon));checkpoint('12-continuar-tras-victoria');
     }else{
      mark('pedido parcial guardado para continuar',{chain:C.status(t.story.galpon),endurance:result.endurance});checkpoint('11-pedido-parcial-'+target);
     }
    }
   }
  }
 }
 result.final=read();result.physical={arm:t.robotArms.filter(a=>w.arms.includes(a.gripperId)).map(a=>({gripperId:a.gripperId,tip:t.robotKinematics(a).point,base:t.rotorPart(a.baseId).p,status:a.status})),queue:w.firstQueue.map(id=>({id,p:t.rotorPart(id)?.g.body.position}))};
 fs.writeFileSync(path.join(out,'benchmark.json'),JSON.stringify(result,null,2));console.error('checkpoint listo',out);
}
main().catch(error=>{result.errors.push(error.stack);try{result.final=read();result.debug={workers:t.groups.filter(g=>t.story.galpon.initialIds.includes(g.parts[0].id)).map(g=>({id:g.parts[0].id,p:g.body.position,route:g.route,haul:!!g.haulJob})),cargo:t.cargos.map(c=>({id:c.id,p:c.body.position,phase:c.job?.phase,goal:c.job?.goal}))};fs.writeFileSync(path.join(out,'benchmark.json'),JSON.stringify(result,null,2));checkpoint('failed');}catch{}console.error(error);process.exitCode=1;});
