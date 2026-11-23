(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports=factory(require('./trajectory-drive.js'));
  else root.QBitsTrajectoryController=factory(root.QBitsTrajectoryDrive);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Drive) {
  'use strict';
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
  const finite=(n,fallback)=>Number.isFinite(n)?n:fallback;
  const vector=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
  const fail=message=>({ok:false,message});

  /**
   * Adapter callbacks own all activation, physics, collision and cargo actions.
   * Only an explicit start enables motors. Following writes transient requests
   * already consumed by the game's original torque/energy controllers.
   */
  function create(adapter,options={}) {
    const owners=new Map();
    const interval=1/20,startDistance=Math.max(.1,finite(options.startDistance,.6));
    const stuckLimit=Math.max(1,finite(options.stuckTime,8));
    const speed=Math.max(.01,finite(options.speed,.25));

    function stop(drive,reason='Recorrido detenido') {
      if (!drive || drive.stopped) return false;
      drive.stopped=true;drive.message=reason;
      if (drive.description?.march) {
        delete drive.description.march.trajectoryScales;
        adapter.stopMarch?.(drive.description.march,reason);
      }
      for (const rotor of drive.started || []) {
        delete rotor.trajectoryDrive;
        if (!drive.description?.march && rotor.enabled) adapter.configureRotor(rotor,{enabled:false});
      }
      for (const group of drive.component || []) if (owners.get(group)===drive) owners.delete(group);
      return true;
    }
    function finish(drive,message,done=false) {
      stop(drive,message);return done?{done:true,message}:{error:true,message};
    }
    function command(drive,value) {
      if (drive.description.kind==='walk') drive.description.march.trajectoryScales=Drive.gaitScales(drive.description,value);
      else for (const request of Drive.wheelCommands(drive.description,value)) {
        const previous=request.rotor.trajectoryDrive;
        if (previous) {previous.rpm=request.rpm;previous.direction=request.direction;}
        else request.rotor.trajectoryDrive={rpm:request.rpm,direction:request.direction};
      }
    }
    function start(node,route) {
      if (!Drive || !node?.g || !node.part || !adapter.validGroup(node.g)) return fail('El receptor ya no está disponible.');
      if (route?.mode && route.mode!=='ground') return fail('Este controlador sigue recorridos terrestres.');
      if (route?.valid===false) return fail(route.reason||'Revisa el recorrido.');
      const points=route?.polyline?.points || route?.points;
      if (!Array.isArray(points)||points.length<2||points.length>48||points.some(p=>!vector(p)||!['pass','wait','drop'].includes(p.action||'pass')||!Number.isFinite(p.wait??0)||(p.wait??0)<0||(p.wait??0)>60)) return fail('Revisa los puntos: Aterrizar requiere un dron.');
      let length=0;for(let i=1;i<points.length;i++)length+=distance(points[i-1],points[i]);
      if (length<.02) return fail('Separa el inicio y el fin del recorrido.');
      const component=adapter.component(node.g);
      if (!Array.isArray(component)||!component.includes(node.g)||component.some(g=>!adapter.validGroup(g)||adapter.held?.(g))) return fail('Suelta el mecanismo antes de iniciar.');
      if (component.some(g=>owners.has(g))) return fail('Este mecanismo ya sigue un recorrido.');
      if (distance(node.g.body.position,points[0])>startDistance) return fail('Coloca el mecanismo cerca del cubo de inicio.');
      const rotors=adapter.rotors(component);
      if (!Array.isArray(rotors)||rotors.some(r=>r.enabled)) return fail('Detén el mecanismo antes de asignarle el recorrido.');
      const drive={node,component,started:[],description:null,stopped:false,routeId:route.id,revision:route.revision,points,loop:!!route.loop,index:0,direction:1,phase:'follow',clock:0,stuck:0,bestDistance:Infinity,bestHeading:Infinity,settled:0,waitRemaining:0,message:'En recorrido'};
      const describeOptions={...adapter.describeOptions};
      const facing=adapter.forward?.(node);if(facing)describeOptions.forward=facing;
      try {
        let march=adapter.march?.(component)||null;
        if (!march && rotors.some(r=>r.servo)) {
          drive.started=rotors.filter(r=>r.servo);
          if (!adapter.startMarch?.(node.g)) {stop(drive);return fail('No se pudo iniciar la marcha: revisa energía, fuerza y apoyos.');}
          march=adapter.march?.(component)||null;
          if (!march) {
            // An incomplete adapter must not leave the newly enabled servos on.
            for(const r of rotors)if(r.enabled)adapter.configureRotor(r,{enabled:false});
            return fail('No se reconoce una marcha de cuatro apoyos.');
          }
        }
        if (march) {drive.description={march};drive.started=march.members.slice();}
        const description=Drive.describe(component,rotors,march,describeOptions);
        if (description.kind==='unsupported') {stop(drive,description.reason);return fail(description.reason);}
        drive.description=description;
        if (distance(description.chassis.body.position,points[0])>startDistance) {stop(drive);return fail('Coloca el chasis cerca del cubo de inicio.');}
        if (description.kind==='wheels') {
          for(const item of description.motors) {
            drive.started.push(item.rotor);
            if (!adapter.configureRotor(item.rotor,{enabled:true})) {stop(drive,'No se pudo iniciar: revisa energía y carga.');return fail('No se pudo iniciar: revisa energía y carga.');}
          }
        }
        drive.tolerance=description.kind==='walk'?.08:.065;
        drive.passTolerance=description.kind==='walk'?.12:.09;
        drive.stamps=component.map(g=>({g,body:g.body,parts:g.parts,count:g.parts.length}));
        drive.joints=drive.started.map(r=>({r,a:r.aId,b:r.bId,constraint:r.constraint}));
        drive.graph=new Set(rotors);drive.groupSet=new Set(component);
        drive.topologyVersion=adapter.topologyVersion?.();
        for(const group of component)owners.set(group,drive);
        command(drive,{brake:true});return {ok:true,message:'Recorrido iniciado.',drive};
      } catch (error) {
        stop(drive,'No se pudo iniciar el recorrido.');return fail('No se pudo iniciar el recorrido.');
      }
    }
    function advance(drive) {
      const last=drive.points.length-1,terminal=drive.direction>0?drive.index===last:drive.index===0;
      if (terminal && !drive.loop) return finish(drive,'Recorrido terminado.',true);
      if (terminal) drive.direction*=-1;
      drive.index+=drive.direction;drive.phase='follow';drive.bestDistance=Infinity;drive.bestHeading=Infinity;drive.stuck=0;drive.settled=0;drive.actionTime=0;
      return {message:drive.direction>0?'En recorrido':'Regresando por el recorrido'};
    }
    function reach(drive) {
      const point=drive.points[drive.index],terminal=drive.direction>0?drive.index===drive.points.length-1:drive.index===0;
      if ((point.action||'pass')==='pass' && !terminal) return advance(drive);
      drive.phase='settle';drive.settled=0;drive.actionTime=0;command(drive,{brake:true});return {message:'Deteniendo el mecanismo'};
    }
    function step(drive,route,dt) {
      if (!drive||drive.stopped) return {error:true,message:drive?.message||'Recorrido detenido.'};
      if (!Number.isFinite(dt)||dt<=0) return {};
      drive.clock+=dt;if(drive.clock+1e-9<interval)return {};
      const elapsed=drive.clock;drive.clock=0;
      if (!route || route.valid===false || route.id!==drive.routeId || route.revision!==drive.revision) return finish(drive,'El recorrido cambió: vuelve a iniciarlo.');
      if (adapter.topologyVersion) {
        const version=adapter.topologyVersion();
        if (version!==drive.topologyVersion) {
          // The game's topology cache also changes when an unrelated cube is
          // created. Revalidate only this mechanism instead of stopping every
          // follower in the room or traversing its graph on every decision.
          const current=adapter.component(drive.node.g),joints=adapter.rotors(current);
          if (current.length!==drive.component.length||current.some(g=>!drive.groupSet.has(g))||joints.length!==drive.graph.size||joints.some(r=>!drive.graph.has(r))) return finish(drive,'El mecanismo cambió: vuelve a iniciarlo.');
          drive.topologyVersion=version;
        }
      }
      if (drive.stamps.some(s=>!adapter.validGroup(s.g)||s.g.body!==s.body||s.g.parts!==s.parts||s.g.parts.length!==s.count||adapter.held?.(s.g)) || drive.joints.some(s=>s.r.aId!==s.a||s.r.bId!==s.b||s.r.constraint!==s.constraint)) return finish(drive,'Mecanismo movido o modificado: vuelve a iniciarlo.');
      if (drive.started.some(r=>!r.enabled)) {
        const reason=drive.started.find(r=>r.stopReason)?.stopReason;
        return finish(drive,reason==='empty'?'Sin energía: recarga antes de iniciar.':reason==='overload'?'La carga supera la capacidad del mecanismo.':'El mecanismo se detuvo.');
      }
      const body=drive.description.chassis.body,position=body.position,target=drive.points[drive.index];
      if (!vector(position)) return finish(drive,'Revisa la posición del mecanismo.');
      if (drive.phase==='wait') {
        command(drive,{brake:true});drive.waitRemaining=Math.max(0,drive.waitRemaining-elapsed);
        return drive.waitRemaining<=0?advance(drive):{message:'Esperando en el punto'};
      }
      if (drive.phase==='settle') {
        command(drive,{brake:true});drive.actionTime+=elapsed;
        const stable=Math.hypot(body.velocity.x,body.velocity.z)<.06&&Math.abs(body.angularVelocity.y)<.3;
        drive.settled=stable?drive.settled+elapsed:0;
        if (drive.settled<.15) return drive.actionTime>3?finish(drive,'El mecanismo no pudo detenerse en el punto.'):{};
        if (target.action==='drop') {
          const result=adapter.drop?.(drive.node);
          if (!result?.ok) return finish(drive,result?.message||'No se pudo soltar la carga.');
        }
        if ((target.action==='wait'||target.action==='drop')&&(target.wait||0)>0) {drive.phase='wait';drive.waitRemaining=target.wait;return {message:'Esperando en el punto'};}
        return advance(drive);
      }
      const terminal=drive.direction>0?drive.index===drive.points.length-1:drive.index===0;
      const stopAtPoint=terminal||(target.action||'pass')!=='pass',arrival=stopAtPoint?drive.tolerance:drive.passTolerance;
      const dist=distance(position,target);
      let reached=dist<=arrival;
      if (!reached&&!stopAtPoint) {
        const previous=drive.points[drive.index-drive.direction];
        if (previous) {
          const x=target.x-previous.x,z=target.z-previous.z,squared=x*x+z*z;
          const past=squared>1e-8&&((position.x-target.x)*x+(position.z-target.z)*z)>=0;
          const lateral=squared>1e-8?Math.abs((position.x-previous.x)*z-(position.z-previous.z)*x)/Math.sqrt(squared):Infinity;
          reached=past&&lateral<=arrival;
        }
      }
      if (reached) return reach(drive);
      const blocked=adapter.blocked?.(drive,target);
      if (blocked) return finish(drive,typeof blocked==='string'?blocked:'Recorrido bloqueado: despeja el camino.');
      const guidance=Drive.steer({position,forward:Drive.forward(drive.description),target,speed,maxSpeed:speed,stopRadius:arrival,final:stopAtPoint,slowRadius:.14},drive.guidance||(drive.guidance={}));
      if (dist<drive.bestDistance-.008 || Math.abs(guidance.headingError)<drive.bestHeading-.035) {drive.bestDistance=Math.min(drive.bestDistance,dist);drive.bestHeading=Math.abs(guidance.headingError);drive.stuck=0;}
      else drive.stuck+=elapsed;
      if (drive.stuck>stuckLimit) return finish(drive,'El mecanismo no avanza: revisa fuerza, apoyos y espacio.');
      command(drive,guidance);return {message:drive.direction>0?'En recorrido':'Regresando por el recorrido'};
    }
    return Object.freeze({start,step,stop});
  }
  return Object.freeze({create});
});
