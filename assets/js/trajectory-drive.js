(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QBitsTrajectoryDrive = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Navigation supplies bounded motor requests. This module never writes a
  // body's pose/velocity, invents thrust, or changes torque, load or energy.
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const finite = (n, fallback) => Number.isFinite(n) ? n : fallback;
  const point = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
  const flat = p => {
    const length = point(p) ? Math.hypot(p.x, p.z) : 0;
    return length > 1e-9 ? {x:p.x / length, y:0, z:p.z / length} : null;
  };
  const dot = (a, b) => a.x * b.x + a.z * b.z;
  const subtract = (a, b) => ({x:a.x - b.x, y:(a.y || 0) - (b.y || 0), z:a.z - b.z});
  const rollingDirection = axis => flat({x:-axis.z, z:axis.x});

  function rotate(q, p, inverse = false) {
    if (!q) return {...p};
    const sign = inverse ? -1 : 1, x=q.x*sign, y=q.y*sign, z=q.z*sign, w=q.w;
    const tx=2*(y*p.z-z*(p.y||0)), ty=2*(z*p.x-x*p.z), tz=2*(x*(p.y||0)-y*p.x);
    return {x:p.x+w*tx+y*tz-z*ty, y:(p.y||0)+w*ty+z*tx-x*tz, z:p.z+w*tz+x*ty-y*tx};
  }
  function forward(description) {
    return flat(rotate(description?.chassis?.body?.quaternion, description?.localForward || {x:1,y:0,z:0}));
  }
  function unsupported(reason) { return {kind:'unsupported', reason, motors:[]}; }

  /** Inspect once on start/topology changes, not once per frame. */
  function describe(component, rotors, march, access = {}) {
    if (!Array.isArray(component) || !component.length || !Array.isArray(rotors) ||
        typeof access.groupsOf !== 'function' || typeof access.partOf !== 'function' ||
        typeof access.endpoint !== 'function') return unsupported('Revisa las uniones del mecanismo');
    const members=new Set(component), links=new Map(component.map(g=>[g, []])),pairs=new Map();
    const joints=rotors.filter(r=>{
      const pair=access.groupsOf(r);
      if (pair.length!==2 || !pair.every(g=>members.has(g))) return false;
      pairs.set(r,pair);return true;
    });
    for (const r of joints) for (const g of pairs.get(r)) links.get(g).push(r);

    if (march?.walk && Array.isArray(march.members)) {
      const chassis=component.find(g=>links.get(g).filter(r=>r.servo).length>=4);
      if (!chassis) return unsupported('La marcha necesita cuatro apoyos sobre un chasis');
      const hips=links.get(chassis).filter(r=>r.servo), branches=[];
      for (const hip of hips) {
        const leg=pairs.get(hip).find(g=>g!==chassis), knee=links.get(leg).find(r=>r!==hip);
        const foot=knee ? pairs.get(knee).find(g=>g!==leg) : leg;
        // The gait may also include an upper auxiliary joint. Only the four
        // recognized load-bearing branches receive differential commands.
        if (!march.walk.feet.has(foot?.body)) continue;
        const a=access.partOf(hip.aId), end=access.endpoint(a, hip.servo, 'a'), arm=subtract(foot.body.position,end.point);
        const sign=a.g===chassis ? 1 : -1;
        const tangent={x:(end.axis.y*arm.z-end.axis.z*arm.y)*sign, z:(end.axis.x*arm.y-end.axis.y*arm.x)*sign};
        branches.push({hip,knee,point:end.point,tangent});
      }
      if (branches.length!==4) return unsupported('Revisa los cuatro apoyos de marcha');
      const natural=flat(branches[0].tangent),facing=flat(access.forward) || natural;
      if (!facing || !natural) return unsupported('No se reconoce el frente de la marcha');
      if (dot(facing,natural)<.94) return unsupported('Orienta el receptor hacia el avance de las patas');
      const right={x:-facing.z,z:facing.x}, motors=[];
      for (const leg of branches) {
        const side=Math.sign(dot(subtract(leg.point,chassis.body.position),right));
        if (!side) return unsupported('Los apoyos necesitan dos lados distintos');
        for (const rotor of [leg.hip,leg.knee].filter(Boolean)) motors.push({rotor,side});
      }
      if (!motors.some(m=>m.side<0) || !motors.some(m=>m.side>0)) return unsupported('Los apoyos necesitan dos lados distintos');
      return {kind:'walk',chassis,localForward:rotate(chassis.body.quaternion,facing,true),motors,march};
    }

    const wheelJoints=joints.filter(r=>!r.servo && r.mount==='wheel' && !r.virtualConveyor);
    const baseCounts=new Map();
    for (const r of wheelJoints) {const base=pairs.get(r)[r.moving==='a'?1:0];baseCounts.set(base,(baseCounts.get(base)||0)+1);}
    const chassis=component.reduce((best,g)=>{
      const count=baseCounts.get(g)||0;
      return count>best.count ? {g,count} : best;
    },{g:null,count:0}).g;
    if (!chassis) return unsupported('Añade ruedas motorizadas o una marcha de cuatro apoyos');
    const wheels=[],chassisBottom=access.boundsOf?.(chassis).min.y;
    for (const rotor of wheelJoints) {
      const pair=pairs.get(rotor), moving=pair[rotor.moving==='a'?0:1], base=pair[rotor.moving==='a'?1:0];
      if (base!==chassis || links.get(moving).length!==1) continue;
      const endpoint=access.endpoint(access.partOf(rotor.moving==='a'?rotor.aId:rotor.bId),null,rotor.moving);
      if (!endpoint || Math.abs(endpoint.axis.y)>.25) continue;
      const rolling=rollingDirection(endpoint.axis);if (!rolling) continue;
      // Hanging horizontal tools are not driving wheels. Their geometry must
      // extend below the chassis when the game can provide physical bounds.
      if (access.boundsOf && access.boundsOf(moving).min.y >= chassisBottom-.004) continue;
      wheels.push({rotor,moving,point:endpoint.point,rolling,radius:Math.max(.01,finite(access.radiusOf?.(rotor,moving),.09))});
    }
    if (wheels.length<2) return unsupported('Se necesitan ruedas motorizadas a ambos lados');
    const natural=wheels[0].rolling, facing=flat(access.forward) || {x:natural.x*wheels[0].rotor.direction,y:0,z:natural.z*wheels[0].rotor.direction};
    const right={x:-facing.z,z:facing.x},motors=[];
    for (const wheel of wheels) {
      const along=dot(wheel.rolling,facing),side=Math.sign(dot(subtract(wheel.point,chassis.body.position),right));
      if (Math.abs(along)<.94 || !side) return unsupported('Alinea los ejes de las ruedas con el frente');
      motors.push({rotor:wheel.rotor,side,forwardDirection:along>0?1:-1,radius:wheel.radius});
    }
    if (!motors.some(m=>m.side<0) || !motors.some(m=>m.side>0)) return unsupported('Se necesitan ruedas motorizadas a ambos lados');
    return {kind:'wheels',chassis,localForward:rotate(chassis.body.quaternion,facing,true),motors};
  }

  /** Positive turn is a positive yaw about world up (the right wheels speed up). */
  function steer(options = {}, out = {}) {
    const {position,target}=options, facing=flat(options.forward),stopRadius=Math.max(.005,finite(options.stopRadius,.045));
    Object.assign(out,{throttle:0,turn:0,brake:true,arrived:false,distance:Infinity,headingError:0});
    if (!point(position) || !point(target) || !facing || options.blocked) return out;
    const delta=subtract(target,position),distance=Math.hypot(delta.x,delta.z);out.distance=distance;
    if (distance<=stopRadius) {out.arrived=true;return out;}
    const direction={x:delta.x/distance,z:delta.z/distance};
    const error=Math.atan2(facing.z*direction.x-facing.x*direction.z,clamp(dot(facing,direction),-1,1));
    const maxSpeed=Math.max(.005,finite(options.maxSpeed,.25)),speed=clamp(finite(options.speed,maxSpeed),0,maxSpeed);
    let throttle=speed/maxSpeed*Math.max(0,Math.cos(error));
    if (options.final) throttle*=clamp((distance-stopRadius)/Math.max(.02,finite(options.slowRadius,.18)),0,1);
    const turn=clamp(error*finite(options.turnGain,.8),-1,1)*speed/maxSpeed;
    Object.assign(out,{throttle,turn,brake:speed===0,arrived:false,headingError:error});return out;
  }

  /** Commands are transient: preserve each player's configured RPM as a cap. */
  function wheelCommands(description, command) {
    if (description?.kind!=='wheels') return [];
    const throttle=command?.brake?0:clamp(finite(command?.throttle,0),0,1),turn=command?.brake?0:clamp(finite(command?.turn,0),-1,1);
    const denominator=Math.max(1,Math.abs(throttle-turn),Math.abs(throttle+turn));
    return description.motors.map(m=>{
      const demand=(throttle+m.side*turn)/denominator;
      return {rotor:m.rotor,rpm:clamp(finite(m.rotor.rpm,0),0,360)*Math.abs(demand),direction:m.forwardDirection*(demand<0?-1:1)};
    });
  }

  // Grounded diagonal gaits cannot reverse an individual side without also
  // changing support phases. Keep all strides forward and shorten the inside
  // pair; this steers in an arc, never pretends to pivot a walker in place.
  function gaitScales(description, command) {
    if (description?.kind!=='walk') return new Map();
    const throttle=command?.brake?0:clamp(finite(command?.throttle,0),0,1),turn=clamp(finite(command?.turn,0),-1,1);
    const outer=command?.brake?0:Math.max(throttle,Math.abs(turn)*.6);
    // Planar legs scrub laterally while yawing. A stronger stride differential
    // than wheels avoids overrunning a gentle corner, without reversing the
    // loaded diagonals or increasing any configured joint range.
    const bend=clamp(turn*2,-1,1);
    return new Map(description.motors.map(m=>[m.rotor,outer*(1-Math.max(0,-m.side*bend)*.85)]));
  }

  return Object.freeze({describe,forward,steer,wheelCommands,gaitScales});
});
