/* Route identities are data. Only awake beacons and running receivers are polled.
   The adapter owns physics; this module never moves a body or reads pixels. */
(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory(require('./trajectory-model.js'));else root.QBitsTrajectoryRuntime=factory(root.QBitsTrajectoryModel);})(typeof globalThis!=='undefined'?globalThis:this,function(Model){
 'use strict';
 const STEP=.05,SETTLED=.15,RESTING=.2,EPS=1e-9;
 const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
 const xyz=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
 const copyPoint=p=>({x:p.x,y:p.y,z:p.z,action:p.action||'pass',wait:p.wait||0});
 const samePoints=(a,b)=>a&&a.length===b.length&&a.every((p,i)=>p.x===b[i].x&&p.y===b[i].y&&p.z===b[i].z&&p.action===b[i].action&&p.wait===b[i].wait);
 function samePose(a,b){
  if(!a||!b||Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)>=.002||Math.abs(a.ny-b.ny)>=.015)return false;
  for(const key of ['nx','nz'])if(a[key]!==undefined||b[key]!==undefined){if(!Number.isFinite(a[key])||!Number.isFinite(b[key])||Math.abs(a[key]-b[key])>=.015)return false;}
  const keys=['qx','qy','qz','qw'];
  if(keys.some(key=>a[key]!==undefined||b[key]!==undefined)){
   if(!keys.every(key=>Number.isFinite(a[key])&&Number.isFinite(b[key])))return false;
   const normA=Math.hypot(a.qx,a.qy,a.qz,a.qw),normB=Math.hypot(b.qx,b.qy,b.qz,b.qw);
   if(normA<EPS||normB<EPS)return false;
   // q and -q describe exactly the same rotation. Compare normalized dots so
   // harmless sign changes and tiny normalization drift do not wake a route.
   const dot=Math.abs(a.qx*b.qx+a.qy*b.qy+a.qz*b.qz+a.qw*b.qw)/(normA*normB);
   if(dot<Math.cos(.015/2))return false;
  }
  return true;
 }
 function poseData(value){
  if(!xyz(value)||!Number.isFinite(value.ny))return null;
  const result={x:value.x,y:value.y,z:value.z,ny:value.ny};
  for(const key of ['nx','nz','qx','qy','qz','qw'])if(value[key]!==undefined){if(!Number.isFinite(value[key]))return null;result[key]=value[key];}
  return result;
 }
 function create(adapter){
  const nodes=new Map(),groupNodes=new Map(),routes=new Map(),endpointRoutes=new Map(),followers=new Map(),watching=new Set(),dirty=new Set();
  const stats={poseReads:0,rebuilds:0,guidance:0};
  let serial=0,clock=0,navClock=0,batchDepth=0,notificationPending=false,catalogRestored=false;
  function changed(){if(batchDepth)notificationPending=true;else adapter.changed?.();}
  function batch(operation){batchDepth++;try{return operation();}finally{if(!--batchDepth&&notificationPending){notificationPending=false;adapter.changed?.();}}}
  const failure=message=>({ok:false,message}),success=message=>({ok:true,message});
  function routeFor(id){const node=nodes.get(id);return node&&routes.get(node.part.mood.trajectory?.routeId)||null;}
  function sample(node){stats.poseReads++;const pose=poseData(adapter.pose(node));node.pose=pose;return pose;}
  function stop(id,reason='Recorrido detenido'){
   const run=followers.get(id);if(!run)return false;
   // Remove first: adapter callbacks must not see or restart an obsolete run.
   followers.delete(id);adapter.stop?.(run.drive,reason);
   const node=nodes.get(id);if(node)node.status=reason;changed();return true;
  }
  function stopRoute(id,reason){let stopped=false;for(const [receiverId,run]of followers)if(run.routeId===id)stopped=stop(receiverId,reason)||stopped;return stopped;}
  function invalidate(id,reason='Baliza modificada · vuelve a iniciar el recorrido'){
   const route=routes.get(id);if(!route)return false;
   const different=route.valid===true||route.reason!==reason;
   dirty.add(id);route.dirty=true;route.valid=false;route.reason=reason;route.polyline=null;
   for(const endpoint of [route.startId,route.endId])if(nodes.has(endpoint))watching.add(endpoint);
   stopRoute(id,reason);if(different)changed();return true;
  }
  function register(g,part){
   if(!g||!part||!Number.isSafeInteger(part.id)||part.id<=0)return false;
   const meta=Model.validatePart(part.mood?.trajectory);if(!meta)return false;
   return batch(()=>{
    unregister(part.id);part.mood.trajectory=meta;
    const owner=endpointRoutes.get(part.id);
    if(meta.role==='beacon'){
     if(owner)meta.routeId=owner;
     else if(catalogRestored||routes.has(meta.routeId))meta.routeId=null;
    }else if(catalogRestored&&meta.routeId&&!routes.has(meta.routeId))meta.routeId=null;
    const node={g,part,pose:null,stable:0,mode:null,last:null,held:false};nodes.set(part.id,node);
    sample(node);node.last=node.pose?{...node.pose}:null;node.mode=Model.classify(node.pose?.ny);
    node.held=!!adapter.held?.(node);
    let entry=groupNodes.get(g);
    if(!entry){
     const wake=()=>{for(const id of groupNodes.get(g)?.ids||[])if(nodes.get(id)?.part.mood.trajectory.role==='beacon')watching.add(id);};
     entry={ids:new Set(),wake};groupNodes.set(g,entry);g.body?.addEventListener?.('wakeup',wake);
    }
    entry.ids.add(part.id);
    if(meta.role==='beacon'){watching.add(part.id);invalidate(meta.routeId);}
    else node.status=meta.routeId?'Ruta asignada · vuelve a iniciarla':'Sin ruta';
    changed();return true;
   });
  }
  function unregister(id){
   const node=nodes.get(id);if(!node)return false;
   return batch(()=>{
    stop(id,'Receptor retirado');
    const meta=node.part.mood.trajectory;
    if(meta.role==='beacon')invalidate(meta.routeId,'Falta una baliza · vuelve a colocarla');
    const entry=groupNodes.get(node.g);entry?.ids.delete(id);
    if(entry&&!entry.ids.size){node.g.body?.removeEventListener?.('wakeup',entry.wake);groupNodes.delete(node.g);}
    nodes.delete(id);watching.delete(id);changed();return true;
   });
  }
  function unregisterGroup(g){return batch(()=>{for(const id of [...(groupNodes.get(g)?.ids||[])])unregister(id);});}
  function freeGlyph(exclude){
   const used=new Set();for(const route of routes.values())if(route.id!==exclude)used.add(route.glyph);
   for(let i=0;i<Model.GLYPHS.length;i++)if(!used.has(i))return i;return -1;
  }
  function createStart(id){
   const node=nodes.get(id);if(node?.part.mood.trajectory.role!=='beacon')return failure('Selecciona un cubo de trayectoria.');
   if(node.part.mood.trajectory.routeId||endpointRoutes.has(id))return failure('Este cubo ya tiene pareja o es un inicio.');
   if(routes.size>=Model.LIMITS.routes)return failure('No quedan caras libres. Retira un recorrido antes de crear otro.');
   const glyph=freeGlyph();if(glyph<0)return failure('No quedan caras libres. Retira un recorrido antes de crear otro.');
   let routeId=null;
   for(let attempt=0;attempt<=routes.size&&serial<Number.MAX_SAFE_INTEGER;attempt++){
    const candidate='route-'+(++serial);if(!routes.has(candidate)){routeId=candidate;break;}
   }
   if(!routeId)return failure('No quedan identidades disponibles para nuevos recorridos.');
   return batch(()=>{
    const route={version:1,id:routeId,startId:id,endId:null,glyph,points:[],loop:false};routes.set(routeId,route);endpointRoutes.set(id,routeId);
    node.part.mood.trajectory.routeId=routeId;invalidate(routeId,'Falta el cubo de fin');changed();
    return {...success('Inicio creado · elige su cubo de fin.'),routeId};
   });
  }
  function anchors(a,b,mode){
   const start=adapter.anchor(a,mode),end=adapter.anchor(b,mode);
   if(!xyz(start)||!xyz(end))return null;
   return {start,end};
  }
  function pair(routeId,id){
   const route=routes.get(routeId),node=nodes.get(id),a=route&&nodes.get(route.startId);
   if(!route||!a)return failure('Falta el cubo de inicio.');
   if(a.part.mood.trajectory.role!=='beacon'||a.part.mood.trajectory.routeId!==routeId)return failure('El inicio ya no pertenece a este recorrido.');
   if(node?.part.mood.trajectory.role!=='beacon'||id===route.startId)return failure('Elige otro cubo de trayectoria.');
   if(route.endId!==null||node.part.mood.trajectory.routeId||endpointRoutes.has(id))return failure('Este cubo ya tiene pareja.');
   if(!a.pose||!node.pose)return failure('Coloca y suelta ambos cubos.');
   const mode=a.mode==='air'&&node.mode==='air'?'air':'ground',ends=anchors(a,node,mode),height=mode==='air'?.5:.012;
   if(!ends)return failure('No se pudo situar el inicio o el fin.');
   // A paired route always has serializable endpoints, even while the two
   // physical cubes are held, moving, or waiting to settle.
   const candidate=Model.validateRoute({version:1,id:route.id,startId:route.startId,endId:id,glyph:route.glyph,points:[{...ends.start,y:height,action:'pass',wait:0},{...ends.end,y:height,action:mode==='air'?'land':'pass',wait:0}],loop:route.loop});
   if(!candidate)return failure('Los extremos están fuera del área de construcción.');
   return batch(()=>{
    route.endId=id;route.points=candidate.points;node.part.mood.trajectory.routeId=routeId;endpointRoutes.set(id,routeId);
    invalidate(routeId);refresh(route);changed();return success(route.reason||'Pareja vinculada · ya puedes trazar su recorrido.');
   });
  }
  function assign(id,routeId){
   const node=nodes.get(id),route=routes.get(routeId);if(node?.part.mood.trajectory.role!=='receiver')return failure('Selecciona un receptor de trayectoria.');
   if(!route||route.endId===null)return failure('Esta ruta necesita un inicio y un fin.');
   if(node.part.mood.trajectory.routeId===routeId)return success('Este receptor ya tiene asignado el recorrido.');
   return batch(()=>{stop(id);node.part.mood.trajectory.routeId=routeId;node.status='Ruta asignada';changed();return success('Ruta asignada · coloca el mecanismo cerca del inicio.');});
  }
  function unlink(id){
   const node=nodes.get(id);if(!node)return failure('La pieza ya no está disponible.');
   const meta=node.part.mood.trajectory,route=routes.get(meta.routeId);
   return batch(()=>{
    const stopped=stop(id);
    if(meta.role==='receiver'){
     if(meta.routeId!==null||stopped){meta.routeId=null;node.status='Sin ruta';changed();}
     return success('Receptor desvinculado.');
    }
    if(route){
     stopRoute(route.id,'Pareja desvinculada');
     for(const n of nodes.values())if(n.part.mood.trajectory.routeId===route.id){n.part.mood.trajectory.routeId=null;if(n.part.mood.trajectory.role==='receiver')n.status='Sin ruta';}
     endpointRoutes.delete(route.startId);if(route.endId!==null)endpointRoutes.delete(route.endId);
     routes.delete(route.id);dirty.delete(route.id);adapter.disposeRoute?.(route);changed();
    }
    if(meta.routeId!==null){meta.routeId=null;changed();}
    return success('Pareja desvinculada.');
   });
  }
  function projectPoints(points,ends,mode){
   return points.map((point,index)=>({
    ...copyPoint(point),
    ...(index===0?{x:ends.start.x,z:ends.start.z}:index===points.length-1?{x:ends.end.x,z:ends.end.z}:{})
   }));
  }
  function geometry(points,mode){return points.map(point=>({...copyPoint(point),y:mode==='ground'?.012:point.y}));}
  function geometryReason(points,mode,range){
   if(points.some(p=>!xyz(p)||Math.abs(p.x)>13.85||Math.abs(p.z)>13.85))return 'Recorrido fuera de la sala';
   if(mode==='air'&&points.some(p=>p.y<Model.LIMITS.heights[0]||p.y>Model.LIMITS.heights[1]))return 'Ajusta la altura de vuelo entre 0,15 y 3 m';
   if(Model.length(points)>range+1e-6)return 'No alcanza · acorta el recorrido o mejora la pareja';
   return null;
  }
  function refresh(route){
   if(!route||routes.get(route.id)!==route)return route;
   if(!route.dirty&&route._evaluated)return route;
   const before={valid:route.valid,reason:route.reason,range:route.range,mode:route.mode,length:route.length,points:route.points};
   dirty.delete(route.id);route.dirty=false;route._evaluated=true;route.valid=false;route.polyline=null;route.range=0;
   const a=nodes.get(route.startId),b=nodes.get(route.endId);
   let reason=null;
   if(!a)reason='Falta el cubo de inicio';
   else if(route.endId===null||!b)reason='Falta el cubo de fin';
   else if(a.part.mood.trajectory.role!=='beacon'||b.part.mood.trajectory.role!=='beacon'||a.part.mood.trajectory.routeId!==route.id||b.part.mood.trajectory.routeId!==route.id)reason='Vínculo incompleto';
   else{
    route.range=Math.min(Model.range(a.part.mood.trajectory.level),Model.range(b.part.mood.trajectory.level));
    if(!a.pose||!b.pose)reason='No se reconoce la posición de las balizas';
    else if(adapter.held?.(a)||adapter.held?.(b)||a.stable+EPS<SETTLED||b.stable+EPS<SETTLED)reason='Coloca y suelta ambos cubos';
    else if(a.mode!==b.mode||!['ground','air'].includes(a.mode))reason=a.mode==='hidden'||b.mode==='hidden'?'Cara oculta · gira el cubo':'Orienta ambas caras hacia un lateral o hacia arriba';
    else if(a.pose.y>.16||b.pose.y>.16||a.pose.y<-.01||b.pose.y<-.01)reason='Coloca las balizas en el piso';
    else{
     route.mode=a.mode;
     const ends=anchors(a,b,route.mode);
     if(!ends)reason='No se pudo situar el inicio o el fin';
     else{
      const authored=projectPoints(route.points,ends,route.mode);
      const firstFloorRoute=before.mode===undefined&&authored.every(point=>point.y>=0&&point.y<Model.LIMITS.heights[0]);
      if(route.mode==='air'&&(before.mode==='ground'||firstFloorRoute))for(const point of authored)if(point.y<Model.LIMITS.heights[0])point.y=.5;
      // An object physically outside the bounded construction area can still
      // show an invalid preview. Keep the last serializable anchors until the
      // player returns it, instead of corrupting an otherwise recoverable save.
      if(authored.every(point=>Math.abs(point.x)<=28&&Math.abs(point.y)<=28&&Math.abs(point.z)<=28)&&!samePoints(route.points,authored))route.points=authored;
      const projected=geometry(authored,route.mode);route.displayPoints=projected;
      route.length=Model.length(projected);reason=geometryReason(projected,route.mode,route.range);
      if(!reason){
       if(!route._compiled||!samePoints(route._compiled.points,projected)){
        route._compiled=Model.makePolyline(projected);stats.rebuilds++;route.revision=(route.revision||0)+1;
       }
       route.polyline=route._compiled;route.valid=true;
      }
     }
    }
   }
   route.reason=reason||'Listo';
   if(before.valid!==route.valid||before.reason!==route.reason||before.range!==route.range||before.mode!==route.mode||before.length!==route.length||before.points!==route.points)changed();
   return route;
  }
  function edit(id,points,loop){
   const route=routeFor(id);if(!route||route.endId===null)return failure('Vincula primero el cubo de fin.');
   refresh(route);
   const a=nodes.get(route.startId),b=nodes.get(route.endId);
   if(!a||!b||!a.pose||!b.pose||!['ground','air'].includes(route.mode)||a.mode!==b.mode||a.stable+EPS<SETTLED||b.stable+EPS<SETTLED||adapter.held?.(a)||adapter.held?.(b))return failure(route.reason||'Coloca y suelta ambos cubos.');
   const normalized=Model.validateRoute({version:1,id:route.id,startId:route.startId,endId:route.endId,glyph:route.glyph,points,loop:loop??route.loop});
   if(!normalized)return failure('El recorrido contiene puntos inválidos.');
   const ends=anchors(a,b,route.mode);if(!ends)return failure('No se pudo situar el inicio o el fin.');
   const authored=projectPoints(normalized.points,ends,route.mode),projected=geometry(authored,route.mode),reason=geometryReason(projected,route.mode,route.range);
   if(reason)return failure(reason);
   if(samePoints(route.points,authored)&&route.loop===normalized.loop)return success('El recorrido ya tiene esos ajustes.');
   return batch(()=>{
    stopRoute(route.id,'Recorrido editado · vuelve a iniciarlo');route.points=authored;route.loop=normalized.loop;
    invalidate(route.id,'Recorrido editado · vuelve a iniciarlo');refresh(route);changed();return success('Recorrido guardado.');
   });
  }
  function nextGlyph(id){
   const route=routeFor(id);if(!route)return failure('Crea primero el inicio.');
   const used=new Set();for(const other of routes.values())if(other!==route)used.add(other.glyph);
   for(let offset=1;offset<Model.GLYPHS.length;offset++){
    const next=(route.glyph+offset)%Model.GLYPHS.length;
    if(!used.has(next)){route.glyph=next;changed();return success('Cara actualizada en la pareja y sus receptores.');}
   }
   return failure('No quedan otras caras libres.');
  }
  function start(id){
   const node=nodes.get(id),route=routeFor(id);if(node?.part.mood.trajectory.role!=='receiver'||!route)return failure('Asigna una ruta al receptor.');
   if(followers.has(id))return failure('El recorrido ya está en marcha.');
   for(const run of followers.values())if(run.routeId===route.id)return failure('Esta ruta ya tiene un mecanismo en marcha.');
   return batch(()=>{
    for(const endpoint of [route.startId,route.endId]){
     const beacon=nodes.get(endpoint);if(!beacon)continue;
     const pose=sample(beacon),held=!!adapter.held?.(beacon);
     if(!samePose(beacon.last,pose)||held){beacon.last=pose?{...pose}:null;beacon.stable=0;beacon.held=held;invalidate(route.id,'Coloca y suelta ambos cubos');}
    }
    refresh(route);if(!route.valid)return failure(route.reason);
    const result=adapter.start(node,route);if(!result?.ok)return failure(result?.message||'El mecanismo no puede seguir esta ruta.');
    followers.set(id,{routeId:route.id,revision:route.revision,drive:result.drive});navClock=0;node.status='En recorrido';changed();return success('Recorrido iniciado.');
   });
  }
  function update(dt){
   if(!Number.isFinite(dt)||dt<=0||(!watching.size&&!followers.size&&!dirty.size))return;
   // In global pause the caller does not advance dt. Do not accumulate an idle
   // navigation clock that would cause a large first step after a later start.
   const delta=Math.min(dt,.25);
   if(watching.size||dirty.size)clock+=delta;else clock=0;
   if(followers.size)navClock+=delta;else navClock=0;
   batch(()=>{
    if(clock+EPS>=STEP){const elapsed=clock;clock=0;
     for(const id of watching){
      const node=nodes.get(id);if(!node||node.part.mood.trajectory.role!=='beacon'){watching.delete(id);continue;}
      const pose=sample(node),held=!!adapter.held?.(node),moved=!samePose(node.last,pose),wasHeld=node.held,wasStable=node.stable;
      node.held=held;node.stable=held||moved||wasHeld?0:node.stable+elapsed;
      if(moved){node.last=pose?{...pose}:null;invalidate(node.part.mood.trajectory.routeId,'Baliza movida · vuelve a iniciar el recorrido');}
      else if(held!==wasHeld)invalidate(node.part.mood.trajectory.routeId,held?'Coloca y suelta ambos cubos':'Baliza soltada · espera a que se estabilice');
      if(node.stable+EPS>=SETTLED){
       const mode=Model.classify(pose?.ny,node.mode),modeChanged=mode!==node.mode;node.mode=mode;
       if(modeChanged||wasStable+EPS<SETTLED)invalidate(node.part.mood.trajectory.routeId);
      }
      if(!adapter.awake?.(node)&&node.stable+EPS>=RESTING)watching.delete(id);
     }
     for(const id of [...dirty]){const route=routes.get(id);if(route)refresh(route);else dirty.delete(id);}
    }
    if(navClock+EPS>=STEP){const elapsed=navClock;navClock=0;
     for(const [id,run]of followers){
      const route=routes.get(run.routeId);
      if(!route?.valid||route.revision!==run.revision){stop(id,route?.reason||'Ruta incompleta');continue;}
      stats.guidance++;const result=adapter.step(run.drive,route,elapsed)||{};
      if(result.done||result.error)stop(id,result.message||(result.done?'Recorrido terminado':'Recorrido detenido'));
     }
    }
   });
  }
  function snapshot(){
   return {version:1,serial,routes:[...routes.values()].map(route=>({version:1,id:route.id,startId:route.startId,endId:route.endId,glyph:route.glyph,points:route.points.map(copyPoint),loop:route.loop}))};
  }
  function snapshotData(data){
   if(!data||typeof data!=='object'||Array.isArray(data))return null;
   const prototype=Object.getPrototypeOf(data);
   if(prototype!==null&&(Object.getPrototypeOf(prototype)!==null||Object.getOwnPropertyDescriptor(prototype,'constructor')?.value?.name!=='Object'))return null;
   const keys=Reflect.ownKeys(data);if(keys.length!==3||keys.some(key=>!['version','serial','routes'].includes(key)))return null;
   const result={};
   for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(data,key);if(!descriptor?.enumerable||!own(descriptor,'value'))return null;result[key]=descriptor.value;}
   return result;
  }
  function validSnapshot(data){
   if(data===undefined||data===null)return {version:1,serial:0,routes:[]};
   try{
    const value=snapshotData(data);
    if(!value||value.version!==1||!Array.isArray(value.routes)||value.routes.length>Model.LIMITS.routes||Reflect.ownKeys(value.routes).length!==value.routes.length+1||!Number.isSafeInteger(value.serial)||value.serial<0)return null;
    const ids=new Set(),glyphs=new Set(),endpoints=new Set(),list=[];
    let highest=value.serial;
    for(let i=0;i<value.routes.length;i++){
     const descriptor=Object.getOwnPropertyDescriptor(value.routes,String(i));if(!descriptor?.enumerable||!own(descriptor,'value'))return null;
     const route=Model.validateRoute(descriptor.value);
     if(!route||ids.has(route.id)||glyphs.has(route.glyph)||endpoints.has(route.startId)||route.endId!==null&&endpoints.has(route.endId))return null;
     ids.add(route.id);glyphs.add(route.glyph);endpoints.add(route.startId);if(route.endId!==null)endpoints.add(route.endId);list.push(route);
     const match=/^route-([0-9]+)$/.exec(route.id);
     if(match){const suffix=Number(match[1]);if(Number.isSafeInteger(suffix)&&suffix>highest)highest=suffix;}
    }
    return {version:1,serial:highest,routes:list};
   }catch(_error){return null;}
  }
  function restore(data){
   const parsed=validSnapshot(data);if(!parsed)return false;
   return batch(()=>{
    const reason='Recorrido guardado · vuelve a iniciarlo';
    for(const id of [...followers.keys()])stop(id,reason);
    for(const route of routes.values())adapter.disposeRoute?.(route);
    routes.clear();endpointRoutes.clear();dirty.clear();serial=Math.max(serial,parsed.serial);clock=navClock=0;catalogRestored=true;
    for(const route of parsed.routes){routes.set(route.id,route);endpointRoutes.set(route.startId,route.id);if(route.endId!==null)endpointRoutes.set(route.endId,route.id);}
    for(const node of nodes.values()){
     const meta=node.part.mood.trajectory;
     if(meta.role==='beacon'){meta.routeId=endpointRoutes.get(node.part.id)||null;node.stable=0;watching.add(node.part.id);}
     else{if(!routes.has(meta.routeId)||routes.get(meta.routeId).endId===null)meta.routeId=null;node.status=meta.routeId?reason:'Sin ruta';}
    }
    for(const route of routes.values())invalidate(route.id,reason);
    changed();return true;
   });
  }
  function clear(){
   return batch(()=>{
    const hadState=nodes.size||routes.size||followers.size||serial;
    for(const id of [...nodes.keys()])unregister(id);
    for(const route of routes.values())adapter.disposeRoute?.(route);
    routes.clear();endpointRoutes.clear();followers.clear();dirty.clear();watching.clear();serial=0;clock=navClock=0;catalogRestored=false;
    if(hadState)changed();
   });
  }
  return {nodes,routes,followers,stats,register,unregister,unregisterGroup,routeFor,refresh,invalidate,createStart,pair,assign,unlink,edit,nextGlyph,start,stop,stopRoute,update,snapshot,validSnapshot,restore,clear,get watching(){return watching.size;}};
 }
 return {create};
});
