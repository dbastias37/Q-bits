(function (root, factory) {
  'use strict';
  const rules = factory(typeof module === 'object' && module.exports ? require('./galpon-production.js') : root.QBitsGalponProduction);
  if (typeof module === 'object' && module.exports) module.exports = rules;
  else root.QBitsGalponChain = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (G) {
  'use strict';

  // Physical contacts, grips and route arrivals supply evidence. This module
  // reserves the existing identities; neither a preview nor a timer adds matter.
  const CONFIG = Object.freeze({
    armTransfers:3, droneTransfers:3, batches:4, batchSize:20,
    // A measured mission flight carries 1 u in about 49 s. One rotor can
    // require four serial flights across its two transport links: 196 s,
    // plus real recharge and station work. Parallel designs can be faster.
    continuitySeconds:60, recentDeliverySeconds:240, controlledWaitSeconds:180, idleGraceSeconds:8,
    continuityDeliveries:1, laserSeconds:1.2, laserJ:4, rotorSeconds:2, rotorJ:12,
    secondCoolingSeconds:.5, returnReserveFraction:.2, clearOutputsTarget:3, maxProducts:1000
  });
  const STATIONS = Object.freeze({laser:'laser',assembler:'rotor'});
  const ACTIVITY = Object.freeze({processing:'Procesando',transport:'Traslado con carga',returning:'Regreso automático',
    charging:'Recarga con transferencia real',waiting:'Espera controlada de un ciclo en curso',
    idle:'Sin actividad comprobada',starved:'Faltan insumos',power:'Corte de energía',blocked:'Salida o recorrido bloqueado',
    stopped:'Cadena detenida',manual:'Intervención manual'});
  const EPS = 1e-7;
  const finite = Number.isFinite;
  const positive = value => Number.isSafeInteger(value) && value > 0;
  const unit = value => finite(value) && value >= 0 && value <= 1;
  const close = (a,b) => finite(a) && finite(b) && Math.abs(a-b) <= EPS;
  const clone = value => JSON.parse(JSON.stringify(value));
  const unique = ids => Array.isArray(ids) && ids.length > 0 && ids.every(positive) && new Set(ids).size === ids.length;
  const fail = error => ({ok:false,error});
  const check = (ok,message) => { if (!ok) throw Error('Cadena del galpón · '+message); };
  const stationKey = station => 'station:'+station;
  const originsFor = (s,ids) => [...new Set(ids.map(id => G.record(s,id)?.origin).filter(positive))];
  const quota = CONFIG.batches*CONFIG.batchSize;

  function ensure(s) {
    if (!s.chain) s.chain = {
      version:1, clock:s.elapsed, serial:0, epoch:0,
      jobs:{laser:null,assembler:null}, traces:{},
      arm:{demo:[],wired:[],toolId:null}, drone:{delivered:[]}, stabilized:[],
      products:[], order:null, completed:false
    };
    if (!s.chain.opportunities) s.chain.opportunities = {reserveReturn:null,clearOutputs:[]};
    return s.chain;
  }
  function trace(s,origin) {
    const c = ensure(s);
    if (!c.traces[origin]) c.traces[origin] = {
      manual:false, firstLine:s.records.some(r => r.origin === origin && r.credited),
      arm:false, drone:false, second:false, feed:false, lastAt:c.clock, lastMethod:null
    };
    return c.traces[origin];
  }
  function resetContinuity(c,reason) {
    if (c.opportunities && c.opportunities.clearOutputs.length < CONFIG.clearOutputsTarget &&
        (['power','blocked','manual','stopped'].includes(reason) || String(reason).startsWith('Intervención manual'))) c.opportunities.clearOutputs = [];
    const order = c.order;
    if (!order || c.completed) return;
    order.continuity = {seconds:0,wait:0,deliveries:0,lastDelivery:null,reason:ACTIVITY[reason] || reason,state:Object.hasOwn(ACTIVITY,reason)?reason:'waiting'};
    order.sustained = false;
  }
  // A physical safety stop is an event, not a fabricated logic interval.
  // The adapter calls this once when a productive mechanism actually stops;
  // ordinary grounded waits do not interrupt the useful-activity window.
  function interrupt(s,reason) {
    if (!s?.chain || !['power','blocked','stopped'].includes(reason)) return false;
    resetContinuity(ensure(s),reason);return true;
  }
  function markManual(s,ids) {
    if (!unique(ids) || ids.some(id => !G.record(s,id))) return false;
    const c = ensure(s);
    const pendingProducts = new Set(c.products.filter(p => !p.received && p.orderEpoch === c.order?.epoch).flatMap(p => p.partIds));
    const interrupts = ids.some(id => {
      const r = G.record(s,id),t = c.traces[r.origin];
      const cargo = r.place === 'world' || ['group','received'].includes(r.place) && r.group?.startsWith('family:');
      return cargo && !r.worker && (pendingProducts.has(id) || ['cube','pyramid','tetra'].includes(r.kind) &&
        !!t && (t.firstLine || t.second || t.feed));
    });
    for (const origin of originsFor(s,ids)) Object.assign(trace(s,origin),{
      manual:true, firstLine:false, arm:false, drone:false, second:false, feed:false,
      lastAt:c.clock,lastMethod:null
    });
    if (interrupts) resetContinuity(c,'Intervención manual · reintroduce el material en la primera línea.');
    return true;
  }
  function reintroduce(s,ids) {
    if (!unique(ids) || ids.some(id => !['cube','worker'].includes(G.record(s,id)?.kind))) return false;
    const c = ensure(s);
    for (const origin of originsFor(s,ids)) Object.assign(trace(s,origin),{
      manual:false,firstLine:true,arm:false,drone:false,second:false,feed:false,lastAt:c.clock,lastMethod:null
    });
    return true;
  }
  function observeArm(s,evidence) {
    const c = ensure(s);
    // A completed lesson stays completed when the player moves on to building.
    if (c.arm.wired.length >= CONFIG.armTransfers) return true;
    const valid = evidence && positive(evidence.toolId) && G.record(s,evidence.toolId) &&
      evidence.running === true && evidence.repeated === true && evidence.wired === true;
    if (!valid) {c.arm.wired = [];c.arm.toolId = null;return false;}
    if (c.arm.toolId && c.arm.toolId !== evidence.toolId) c.arm.wired = [];
    c.arm.toolId = evidence.toolId;return true;
  }
  function secondReady(s,origin) {
    const members = s.records.filter(r => r.origin === origin);
    return members.length > 0 && members.every(r => G.stabilized(r) &&
      (r.secondActiveSeconds || 0)+EPS >= CONFIG.secondCoolingSeconds);
  }
  // A second machine may already have removed, divided or reserved the cargo
  // when the delivery drone finally lands. Return evidence belongs to its
  // original matter, not to a retired cube ID or a body still on the cooler.
  function noteReturn(s,event = {}) {
    const {origins,toolId} = event;
    if (!unique(origins) || !positive(toolId) || !G.record(s,toolId) || event.powered !== true || event.returned !== true ||
        origins.some(origin => {
          const members = s.records.filter(r => r.origin === origin);
          return !members.length || members.some(r => r.kind === 'raw' || !['world','group','received','machine'].includes(r.place));
        })) return false;
    const c = ensure(s);
    if (origins.some(origin => trace(s,origin).manual || !trace(s,origin).firstLine)) return false;
    for (const origin of origins) {
      const t = trace(s,origin);t.drone = true;t.lastAt = c.clock;t.lastMethod = 'drone';
      if (!c.drone.delivered.includes(origin)) c.drone.delivered.push(origin);
      if (t.second && secondReady(s,origin) && !c.stabilized.includes(origin)) c.stabilized.push(origin);
    }
    if (!c.opportunities.reserveReturn && finite(event.storedJ) && finite(event.capacityJ) && event.capacityJ > 0 &&
        event.storedJ >= event.capacityJ*CONFIG.returnReserveFraction && event.storedJ <= event.capacityJ+EPS) {
      c.opportunities.reserveReturn = {origin:origins[0],storedJ:event.storedJ,capacityJ:event.capacityJ,at:c.clock};
    }
    return true;
  }
  function noteTransfer(s,event = {}) {
    const {ids,method,zone,toolId} = event;
    if (!unique(ids) || !['arm','drone'].includes(method) || !['table','second-cooler','feed'].includes(zone) ||
        !positive(toolId) || !G.record(s,toolId) || event.powered !== true || ids.some(id => {
          const r = G.record(s,id);return !r || r.kind === 'raw' || !['world','group','received'].includes(r.place);
        })) return false;
    const c = ensure(s), origins = originsFor(s,ids);
    if (origins.some(origin => trace(s,origin).manual || !trace(s,origin).firstLine)) return false;
    if (method === 'drone' && zone === 'second-cooler') return noteReturn(s,{origins,toolId,powered:event.powered,returned:event.returned});
    for (const origin of origins) {
      const t = trace(s,origin);t[method] = true;t.lastAt = c.clock;t.lastMethod = method;
      if (zone === 'feed') t.feed = true;
      if (method === 'arm' && zone === 'table') {
        if (!c.arm.demo.includes(origin)) c.arm.demo.push(origin);
        if ((event.kind === 'wired' || event.wired === true) && event.repeated === true &&
            observeArm(s,{toolId,running:true,repeated:true,wired:true}) && c.arm.wired.length < CONFIG.armTransfers && !c.arm.wired.includes(origin)) c.arm.wired.push(origin);
      }
    }
    return true;
  }

  // Each actual member pays for its own thermal mass. Cold input stays cold;
  // a family envelope is never treated as one free cooling operation.
  function cool(s,ids,dt,options = {}) {
    if (!unique(ids) || !finite(dt) || dt <= 0 || options.second !== true || options.powered === false) return false;
    const rs = ids.map(id => G.record(s,id));
    if (!rs.every(r => r && r.kind !== 'raw' && ['world','group','received'].includes(r.place))) return false;
    let worked = false;
    for (const r of rs) {
      const active = r.secondActiveSeconds || 0;
      const needed = Math.max(0,(r.heat-G.CONFIG.stableHeat)/G.CONFIG.activePerSecond,CONFIG.secondCoolingSeconds-active);
      const watts = G.CONFIG.activeWatts*r.weight;
      const seconds = Math.min(dt,needed,s.energyJ/watts);
      if (seconds > 0 && G.spend(s,seconds*watts,'cooling')) {
        r.heat = Math.max(0,r.heat-seconds*G.CONFIG.activePerSecond);
        r.secondActiveSeconds = Math.min(CONFIG.secondCoolingSeconds,active+seconds);
        worked = true;
      }
    }
    const c = ensure(s);
    for (const origin of originsFor(s,ids)) {
      const t = trace(s,origin);
      if (secondReady(s,origin)) {
        t.second = true;
        if (!t.manual && t.drone && !c.stabilized.includes(origin)) c.stabilized.push(origin);
      }
    }
    return worked;
  }

  function fromRecord(r) {
    return {id:r.id,shape:r.kind === 'worker'?'cube':r.kind,weight:r.weight,p:{x:0,y:0,z:0},q:{x:0,y:0,z:0,w:1},
      mood:{energy:r.energy,matter:{root:r.origin,path:r.path,rootWeight:1,name:'Materia '+r.origin}}};
  }
  function partMatches(r,p) {
    return !!r && p && p.id === r.id && (p.shape || 'cube') === (r.kind === 'worker'?'cube':r.kind) &&
      close(p.weight,r.weight) && close(p.mood?.energy,r.energy) && p.mood?.matter?.root === r.origin &&
      p.mood.matter.path === r.path && p.mood.matter.rootWeight === 1 && !p.mood.externalBattery &&
      !p.mood.gripper && !p.mood.trajectory && !p.mood.flight && !p.mood.workshop && !p.mood.production;
  }
  function recipePlan(s,recipe,inputs,outputs,station = null) {
    if (!Array.isArray(inputs) || !Array.isArray(outputs) || !unique(inputs.map(p => p?.id)) || !unique(outputs.map(p => p?.id))) return null;
    const rs = inputs.map(p => G.record(s,p.id));
    if (!rs.every((r,i) => partMatches(r,inputs[i]) && r.source === 'extraction' && !r.worker &&
        G.stabilized(r) && (station ? r.place === 'machine' && r.group === stationKey(station) : r.place === 'world'))) return null;
    let expected;
    if (recipe === 'laser') {
      if (rs.length !== 1 || rs[0].kind !== 'cube' || rs[0].path !== '') return null;
      expected = Array.from({length:6},(_,i) => ({origin:rs[0].origin,path:String(i),shape:'pyramid',weight:1/6,records:rs}));
    } else if (recipe === 'rotor') {
      const cubes = rs.filter(r => r.kind === 'cube'), pyramids = rs.filter(r => r.kind === 'pyramid');
      if (rs.length !== 7 || cubes.length !== 1 || pyramids.length !== 6 || cubes[0].path !== '' ||
          pyramids.some(r => r.origin !== pyramids[0].origin || !/^[0-5]$/.test(r.path)) ||
          new Set(pyramids.map(r => r.path)).size !== 6 || cubes[0].origin === pyramids[0].origin) return null;
      expected = [cubes,pyramids].map(records => ({origin:records[0].origin,path:'',shape:'coupler',weight:1,records}));
    } else return null;
    if (outputs.length !== expected.length) return null;
    const ids = new Set(rs.map(r => r.id)), matches = [];
    for (const out of outputs) {
      const item = expected.find(e => e.origin === out.mood?.matter?.root && e.path === out.mood?.matter?.path);
      if (!item || matches.includes(item) || out.shape !== item.shape || !close(out.weight,item.weight) ||
          out.mood?.matter?.rootWeight !== 1 || out.mood.externalBattery || out.mood.gripper || out.mood.trajectory ||
          out.mood.flight || out.mood.workshop || out.mood.production) return null;
      const mass = item.records.reduce((n,r) => n+r.weight,0);
      const energy = item.records.reduce((n,r) => n+r.weight*r.energy,0)/mass;
      if (!close(out.mood.energy,energy) || s.records.some(r => !ids.has(r.id) && (r.id === out.id || r.origin === out.id && r.origin !== item.origin))) return null;
      matches.push(item);
    }
    if (s.records.length-rs.length+outputs.length > G.CONFIG.maxParts) return null;
    return outputs.map((p,i) => {
      const e = matches[i], r = e.records[0];
      return {...r,id:p.id,kind:e.shape,path:e.path,weight:e.weight,energy:p.mood.energy,place:'world',group:null,carriers:[],
        heat:Math.max(...e.records.map(v => v.heat)),activeSeconds:Math.min(...e.records.map(v => v.activeSeconds)),
        secondActiveSeconds:Math.min(...e.records.map(v => v.secondActiveSeconds || 0))};
    });
  }
  function laserBacklog(s) {
    const c = s.chain, assembler = c?.jobs.assembler;
    const reserved = new Set(assembler?.inputIds || []);
    // A fragment outside its tray still belongs to the pending industrial
    // batch. Only a real assembler reservation releases capacity for a new cut.
    const pieces = s.records.filter(r => {
      const t = c?.traces[r.origin];
      return r.kind === 'pyramid' && t?.firstLine && t.second && t.feed &&
        !(r.place === 'machine' && r.group === stationKey('assembler') && reserved.has(r.id));
    });
    const origins = [...new Set(pieces.map(r => r.origin))];
    return {origins,pieces:pieces.length,units:pieces.reduce((total,r) => total+r.weight,0),blocked:origins.length > 0};
  }
  function prepare(s,station,recipe,inputParts,outputs,options = {}) {
    const c = ensure(s);
    if (s.received < G.CONFIG.quota || STATIONS[station] !== recipe || c.jobs[station]) return fail('La estación no está disponible.');
    if (recipe === 'laser' && laserBacklog(s).blocked) return fail('Esperando consumo de las seis pirámides anteriores.');
    if (recipe === 'rotor' && c.products.length >= CONFIG.maxProducts) return fail('Retira productos antes de ampliar la producción.');
    const inputs = Array.isArray(inputParts) ? inputParts.map(p => typeof p === 'number' ? G.record(s,p) && fromRecord(G.record(s,p)) : p) : null;
    if (!recipePlan(s,recipe,inputs,outputs)) return fail('Entrada incompatible: verifica formas, estabilización, carga y orígenes completos.');
    const reserved = new Set(Object.values(c.jobs).filter(Boolean).flatMap(j => j.outputs.map(p => p.id)));
    if (outputs.some(p => reserved.has(p.id)) || inputs.some(p => reserved.has(p.id))) return fail('Una identidad ya está reservada.');
    const id = options.id ?? c.serial+1;
    if (!positive(id) || id <= c.serial) return fail('Identidad de proceso repetida.');
    const previous = inputs.map(p => clone(G.record(s,p.id)));
    if (!G.reserve(s,inputs.map(p => p.id),stationKey(station))) return fail('La entrada está ocupada.');
    const duration = recipe === 'laser' ? CONFIG.laserSeconds : CONFIG.rotorSeconds;
    const job = {id,station,recipe,inputIds:inputs.map(p => p.id),inputs:clone(inputs),outputs:clone(outputs),previous,
      duration,elapsed:0,workJ:recipe === 'laser'?CONFIG.laserJ:CONFIG.rotorJ,paidJ:0,startedAt:c.clock,state:'processing'};
    c.serial = id;c.jobs[station] = job;
    return {ok:true,job};
  }
  function ready(s,station) {
    const job = s.chain?.jobs?.[station];
    return job && job.elapsed+EPS >= job.duration && job.paidJ+EPS >= job.workJ ? job : null;
  }
  function commit(s,station) {
    const c = ensure(s), job = ready(s,station);
    if (!job) return fail('El proceso todavía no ha terminado.');
    const records = recipePlan(s,job.recipe,job.inputs,job.outputs,station);
    if (!records) return fail('La reserva cambió durante el proceso.');
    const ids = new Set(job.inputIds), remaining = s.records.filter(r => !ids.has(r.id));
    let product = null;
    if (job.recipe === 'rotor') {
      const forming = G.CONFIG.formingJ*2;
      if (s.spent.assembly+EPS < forming) return fail('El trabajo de conformado no está pagado.');
      // Work was debited while processing. Classify the two resulting
      // couplers now, so the original exact forming ledger also validates
      // interrupted and aborted reservations without a refund or double debit.
      s.spent.assembly -= forming;s.spent.forming += forming;
      product = {id:'rotor:'+job.id,partIds:records.map(r => r.id),origins:records.map(r => r.origin),
        madeAt:c.clock,orderEpoch:c.order?.epoch || 0,received:false,receivedAt:null};
      c.products.push(product);
    }
    s.records = remaining.concat(records);c.jobs[station] = null;
    return {ok:true,outputs:clone(job.outputs),records,product,transaction:{station,job:clone(job),outputIds:records.map(r => r.id),productId:product?.id || null}};
  }
  // An adapter can fail while rebuilding a real hinge or body. Return the
  // already paid process to its ready state, rather than restoring energy or
  // leaving both its old inputs and its attempted output in circulation.
  function rollback(s,transaction) {
    const c = ensure(s), {station,job,outputIds,productId} = transaction || {};
    if (!job || STATIONS[station] !== job.recipe || c.jobs[station] || !unique(outputIds) ||
        outputIds.some(id => G.record(s,id)?.place !== 'world')) return false;
    const product = productId && c.products.find(p => p.id === productId);
    if (productId && (!product || product.received)) return false;
    const ids = new Set(outputIds);
    s.records = s.records.filter(r => !ids.has(r.id)).concat(job.previous.map(r => ({...clone(r),place:'machine',group:stationKey(station)})));
    if (product) {
      c.products.splice(c.products.indexOf(product),1);
      const forming = G.CONFIG.formingJ*2;s.spent.forming -= forming;s.spent.assembly += forming;
    }
    c.jobs[station] = clone(job);return true;
  }
  function abort(s,station) {
    const c = ensure(s), job = c.jobs[station];
    if (!job || !G.release(s,job.inputIds,stationKey(station))) return fail('No hay una reserva recuperable.');
    c.jobs[station] = null;
    return {ok:true,inputs:clone(job.inputs),paidJ:job.paidJ};
  }

  function beginOrder(s) {
    const c = ensure(s);
    if (c.order) return c.order;
    if (s.received < G.CONFIG.quota || !c.arm.demo.length || c.arm.wired.length < CONFIG.armTransfers ||
        c.drone.delivered.length < CONFIG.droneTransfers || c.stabilized.length < CONFIG.droneTransfers) return null;
    c.epoch++;
    c.order = {epoch:c.epoch,startedAt:c.clock,receivedIds:[],sustained:false,
      continuity:{seconds:0,wait:0,deliveries:0,lastDelivery:null,reason:'Esperando entregas nuevas.',state:'waiting'}};
    return c.order;
  }
  function productEligible(s,product) {
    const c = ensure(s);
    return !!c.order && product.orderEpoch === c.order.epoch && product.madeAt+EPS >= c.order.startedAt &&
      product.origins.every(origin => {
        const t = c.traces[origin];return !!t && !t.manual && t.firstLine && t.second && t.feed && ['arm','drone'].includes(t.lastMethod);
      }) && product.partIds.every(id => G.record(s,id)?.kind === 'coupler');
  }
  function maybeComplete(c) {
    if (c.order && c.order.receivedIds.length >= quota && c.order.sustained) c.completed = true;
  }
  function receiveRotor(s,productId,options = {}) {
    const c = ensure(s), product = c.products.find(p => p.id === productId);
    if (!product || product.received || options.automatic !== true || !productEligible(s,product)) return false;
    product.received = true;product.receivedAt = c.clock;c.order.receivedIds.push(product.id);
    // Reception is physical even when power fails at this same observation.
    // Its optional uninterrupted streak needs the adapter's current evidence,
    // before a third receipt can latch the achievement ahead of tick().
    const interruption = ['power','blocked','manual','stopped'].includes(options.interruption) ? options.interruption : null;
    if (interruption) resetContinuity(c,interruption);
    else if (c.opportunities.clearOutputs.length < CONFIG.clearOutputsTarget) c.opportunities.clearOutputs.push(product.id);
    const continuity = c.order.continuity;
    continuity.lastDelivery = c.clock;continuity.deliveries++;continuity.wait = 0;continuity.reason = 'Producción y recepción comprobadas.';continuity.state = 'processing';
    maybeComplete(c);return true;
  }
  function tick(s,dt,options = {}) {
    if (!finite(dt) || dt <= 0) return;
    const c = ensure(s);c.clock += dt;
    if (Object.hasOwn(options,'arm')) observeArm(s,options.arm);
    let interruptedJob = false;
    for (const job of Object.values(c.jobs)) {
      if (!job || ready(s,job.station)) continue;
      const powered = options.powered !== false && !(options.powered && typeof options.powered === 'object' && options.powered[job.station] === false);
      if (!powered) {job.state = 'no-power';interruptedJob = true;continue;}
      const watts = job.workJ/job.duration, seconds = Math.min(dt,job.duration-job.elapsed,s.energyJ/watts);
      const joules = Math.min(job.workJ-job.paidJ,seconds*watts);
      if (!(seconds > 0) || !G.spend(s,joules,job.recipe === 'laser'?'reconfiguration':'assembly')) {job.state = 'no-power';interruptedJob = true;continue;}
      job.elapsed = Math.min(job.duration,job.elapsed+seconds);job.paidJ += joules;
      job.state = ready(s,job.station)?'output-wait':'processing';
    }
    const order = c.order;
    if (!order) return;
    const w = order.continuity, reason = Object.hasOwn(ACTIVITY,options.reason)?options.reason:options.working === true?'processing':'idle';
    if (options.powered === false || interruptedJob || ['power','blocked','starved','manual','stopped'].includes(reason)) {
      resetContinuity(c,options.powered === false || interruptedJob?'power':reason);return;
    }
    if (c.completed) return;
    if (w.lastDelivery === null) return;
    if (c.clock-w.lastDelivery > CONFIG.recentDeliverySeconds+EPS) {resetContinuity(c,'Esperando una entrega nueva.');return;}
    const activeCycle = options.activeCycle === true;
    const charging = reason === 'charging' && activeCycle && finite(options.chargedJ) && options.chargedJ > 0;
    const working = charging || options.working === true &&
      (['processing','transport'].includes(reason) || reason === 'returning' && activeCycle);
    if (working) w.wait = 0;
    else w.wait += dt;
    const controlled = activeCycle && ['waiting','returning','charging'].includes(reason);
    if (w.wait > (controlled?CONFIG.controlledWaitSeconds:CONFIG.idleGraceSeconds)+EPS) {resetContinuity(c,'La cadena dejó de avanzar.');return;}
    w.state = working?reason:controlled?'waiting':'idle';w.reason = ACTIVITY[w.state];
    // The display explicitly reports useful activity. A normal bounded wait
    // preserves the streak but cannot complete it by leaving idle motors on.
    if (working) w.seconds = Math.min(CONFIG.continuitySeconds,w.seconds+dt);
    if (w.seconds+EPS >= CONFIG.continuitySeconds && w.deliveries >= CONFIG.continuityDeliveries) order.sustained = true;
    maybeComplete(c);
  }
  function status(s) {
    const c = ensure(s), total = Math.min(quota,c.order?.receivedIds.length || 0);
    let phase = 'arm-demo';
    if (s.received < G.CONFIG.quota) phase = 'first-line';
    else if (c.completed) phase = 'complete';
    else if (!c.arm.demo.length) phase = 'arm-demo';
    else if (c.arm.wired.length < CONFIG.armTransfers) phase = 'arm-power';
    else if (c.drone.delivered.length < CONFIG.droneTransfers) phase = 'drone';
    else if (c.stabilized.length < CONFIG.droneTransfers) phase = 'second-cooler';
    else phase = c.order?'order':'assembler';
    return {phase,armDemo:c.arm.demo.length,armWired:c.arm.wired.length,droneDelivered:c.drone.delivered.length,
      stabilized:c.stabilized.length,lot:Math.min(CONFIG.batches,Math.floor(total/CONFIG.batchSize)+1),
      lotCount:total === quota?CONFIG.batchSize:total%CONFIG.batchSize,total,target:quota,
      continuity:c.order?.continuity.seconds || 0,continuityTarget:CONFIG.continuitySeconds,
      continuityLabel:'Actividad continua útil',continuityMode:'useful-activity',deliveryWindow:CONFIG.recentDeliverySeconds,
      continuityState:c.order?.continuity.state || 'waiting',waitingSeconds:c.order?.continuity.wait || 0,
      continuityReason:c.order?.continuity.reason || '',sustained:!!c.order?.sustained,completed:c.completed,
      reserveReturn:!!c.opportunities.reserveReturn,
      returnReservePercent:c.opportunities.reserveReturn?100*c.opportunities.reserveReturn.storedJ/c.opportunities.reserveReturn.capacityJ:null,
      clearOutputs:c.opportunities.clearOutputs.length,clearOutputsTarget:CONFIG.clearOutputsTarget};
  }

  function validate(s) {
    const c = s.chain;if (!c) return s;
    check(c.version === 1 && finite(c.clock) && c.clock >= 0 && Number.isSafeInteger(c.serial) && c.serial >= 0 &&
      Number.isSafeInteger(c.epoch) && c.epoch >= 0 && typeof c.completed === 'boolean','estado inválido.');
    const roots = new Set(s.records.map(r => r.origin)), lists = [c.arm?.demo,c.arm?.wired,c.drone?.delivered,c.stabilized];
    check(lists.every(list => Array.isArray(list) && new Set(list).size === list.length && list.every(id => roots.has(id))), 'hito sin procedencia.');
    check(c.arm.toolId === undefined || c.arm.toolId === null || positive(c.arm.toolId) && G.record(s,c.arm.toolId), 'brazo sin identidad.');
    check(c.traces && typeof c.traces === 'object' && !Array.isArray(c.traces),'faltan las trazas.');
    for (const [origin,t] of Object.entries(c.traces)) check(roots.has(Number(origin)) &&
      ['manual','firstLine','arm','drone','second','feed'].every(key => typeof t[key] === 'boolean') &&
      finite(t.lastAt) && t.lastAt >= 0 && t.lastAt <= c.clock+EPS && [null,'arm','drone'].includes(t.lastMethod),'traza inválida.');
    check(c.jobs && Object.keys(c.jobs).length === 2 && Object.keys(STATIONS).every(k => Object.hasOwn(c.jobs,k)), 'faltan estaciones.');
    const used = new Set(), outputIds = new Set(), processes = new Set();
    for (const station of Object.keys(STATIONS)) {
      const job = c.jobs[station];if (job === null) continue;
      check(positive(job?.id) && job.id <= c.serial && !processes.has(job.id) && job.station === station && job.recipe === STATIONS[station] &&
        unique(job.inputIds) && Array.isArray(job.inputs) && job.inputIds.length === job.inputs.length &&
        job.inputs.every((p,i) => p.id === job.inputIds[i]) && Array.isArray(job.previous) && job.previous.length === job.inputIds.length &&
        job.previous.every((r,i) => r.id === job.inputIds[i] && r.place === 'world' && r.group === null), 'reserva inválida.');
      processes.add(job.id);
      check(close(job.duration,job.recipe === 'laser'?CONFIG.laserSeconds:CONFIG.rotorSeconds) &&
        close(job.workJ,job.recipe === 'laser'?CONFIG.laserJ:CONFIG.rotorJ) && finite(job.elapsed) && job.elapsed >= 0 && job.elapsed <= job.duration+EPS &&
        finite(job.paidJ) && job.paidJ >= 0 && job.paidJ <= job.workJ+EPS && close(job.paidJ,job.elapsed*job.workJ/job.duration) &&
        finite(job.startedAt) && job.startedAt >= 0 && job.startedAt <= c.clock+EPS &&
        ['processing','no-power','output-wait'].includes(job.state), 'trabajo o pago inválido.');
      check(recipePlan(s,job.recipe,job.inputs,job.outputs,station), 'la receta reservada perdió material.');
      for (const id of job.inputIds) {check(!used.has(id),'entrada reservada dos veces.');used.add(id);}
      for (const p of job.outputs) {check(!outputIds.has(p.id),'salida reservada dos veces.');outputIds.add(p.id);}
    }
    check(s.records.filter(r => r.place === 'machine').every(r => used.has(r.id)), 'materia sin proceso.');
    check(Array.isArray(c.products) && c.products.length <= CONFIG.maxProducts && new Set(c.products.map(p => p?.id)).size === c.products.length,
      'registro de productos inválido.');
    const productParts = new Set();
    for (const p of c.products) {
      check(typeof p?.id === 'string' && /^rotor:[1-9]\d*$/.test(p.id) && Number(p.id.slice(6)) <= c.serial &&
        unique(p.partIds) && p.partIds.length === 2 && unique(p.origins) && p.origins.length === 2 &&
        finite(p.madeAt) && p.madeAt >= 0 && p.madeAt <= c.clock+EPS && Number.isSafeInteger(p.orderEpoch) && p.orderEpoch >= 0 && p.orderEpoch <= c.epoch &&
        typeof p.received === 'boolean' && (p.received ? finite(p.receivedAt) && p.receivedAt >= p.madeAt && p.receivedAt <= c.clock+EPS : p.receivedAt === null),
        'producto o recepción inválidos.');
      for (let i=0;i<2;i++) {
        const r = G.record(s,p.partIds[i]);
        check(r?.kind === 'coupler' && r.origin === p.origins[i] && !productParts.has(r.id),'rotor sin sus dos orígenes.');
        productParts.add(r.id);
      }
    }
    if (c.opportunities !== undefined) {
      const o=c.opportunities,r=o?.reserveReturn;
      check(o && Array.isArray(o.clearOutputs) && o.clearOutputs.length <= CONFIG.clearOutputsTarget &&
        new Set(o.clearOutputs).size === o.clearOutputs.length && o.clearOutputs.every(id=>c.products.some(p=>p.id===id && p.received)), 'objetivo opcional sin recepciones.');
      check(r === null || r && positive(r.origin) && c.drone.delivered.includes(r.origin) && finite(r.storedJ) && finite(r.capacityJ) &&
        r.capacityJ > 0 && r.storedJ >= r.capacityJ*CONFIG.returnReserveFraction && r.storedJ <= r.capacityJ+EPS &&
        finite(r.at) && r.at >= 0 && r.at <= c.clock+EPS, 'reserva de retorno opcional inválida.');
    }
    if (c.order === null) check(c.epoch === 0 && !c.completed && c.products.every(p => !p.received),'pedido ausente.');
    else {
      const o = c.order,w = o.continuity;
      check(positive(o.epoch) && o.epoch === c.epoch && finite(o.startedAt) && o.startedAt >= 0 && o.startedAt <= c.clock+EPS &&
        Array.isArray(o.receivedIds) && new Set(o.receivedIds).size === o.receivedIds.length && o.receivedIds.length <= CONFIG.maxProducts &&
        o.receivedIds.every(id => c.products.some(p => p.id === id && p.received && p.orderEpoch === o.epoch && p.madeAt+EPS >= o.startedAt)) &&
        c.products.every(p => !p.received || o.receivedIds.includes(p.id)) && typeof o.sustained === 'boolean','pedido duplicado o anterior a su apertura.');
      check(w && finite(w.seconds) && w.seconds >= 0 && w.seconds <= CONFIG.continuitySeconds+EPS && finite(w.wait) && w.wait >= 0 &&
        Number.isSafeInteger(w.deliveries) && w.deliveries >= 0 && w.deliveries <= o.receivedIds.length &&
        (w.lastDelivery === null || finite(w.lastDelivery) && w.lastDelivery >= o.startedAt && w.lastDelivery <= c.clock+EPS) &&
        typeof w.reason === 'string' && w.reason.length < 200 && (w.state === undefined || Object.hasOwn(ACTIVITY,w.state)) &&
        (!o.sustained || w.seconds+EPS >= CONFIG.continuitySeconds && w.deliveries >= CONFIG.continuityDeliveries),
        'continuidad sin entregas.');
      check(!c.completed || o.receivedIds.length >= quota && o.sustained,'victoria sin pedido completo.');
    }
    return s;
  }
  return Object.freeze({CONFIG,ACTIVITY,ensure,interrupt,laserBacklog,prepare,tick,ready,commit,rollback,abort,noteTransfer,noteReturn,observeArm,markManual,reintroduce,cool,
    beginOrder,receiveRotor,status,validate,productEligible,snapshot:s => G.snapshot(s)});
});
