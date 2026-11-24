const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {machine,tick}=require('./flight-mechanism-fixture.cjs');

function loadAtEntry(t,conveyor){
 const surface=t.conveyorSurfacePoses(conveyor)[0];
 const point=surface.p.vadd(surface.q.vmult(t.V(-surface.half.x+.08,surface.half.y+.048,0)));
 return t.addQubit([point.x,point.y,point.z]);
}

test('a moving airborne conveyor carries a real Q-bit along its own lane while spending battery',()=>{
 const {t,mechanism:conveyor,base,flight}=machine('conveyor');
 assert(t.startFlight(flight),flight.status);tick(t,6);
 assert(t.startConveyor(conveyor),conveyor.status);
 const payload=loadAtEntry(t,conveyor),start=base.body.position.clone();
 const energy=t.externalBatterySummary(base).storedJ,ids=t.groups.flatMap(g=>g.parts.map(p=>p.id));
 t.configureFlight(flight,{speed:.3,heading:0});
 let arrived=false,maxLateral=0;
 for(let i=0;i<540;i++){
  t.stepPhysics(1/120);
  assert(flight.enabled,flight.status);assert(conveyor.running,conveyor.status);
  assert.equal(base.body.type,1,'the carrier remains a free Cannon body');
  const hit=t.rotorPart(conveyor.baseId),local=hit.q.inverse().vmult(payload.body.position.vsub(hit.p));
  maxLateral=Math.max(maxLateral,Math.abs(local.z-.27));
  assert(payload.body.position.y>.8,'the load stays supported in the air');
  if(local.x>.35){arrived=true;break;}
 }
 assert(arrived,'contact traction must reach the exit of the moving lane');
 assert(maxLateral<.04,'carrier translation must not pull the lane out from under its load');
 assert(base.body.position.z<start.z-.65,'the carrier translates while the Q-bit moves across it');
 assert(t.bounds(base).min.y>.5);
 assert(t.externalBatterySummary(base).storedJ<energy);
 assert.deepEqual(t.groups.flatMap(g=>g.parts.map(p=>p.id)),ids);
});

test('contact traction and its energy cost are independent of common carrier motion and react on a free chassis',()=>{
 // Expose the production contact drive to inspect one force transaction after
 // real Cannon contacts exist. This hook does not replace any controller.
 const file=path.join(__dirname,'../assets/js/game.js'),source=fs.readFileSync(file,'utf8'),at=source.lastIndexOf('})();');
 const gameSource=source.slice(0,at)+'window.__contactDrive=conveyorDriveSurface;'+source.slice(at);
 const {t,sandbox,mechanism:conveyor,base,flight}=machine('conveyor',{gameSource});
 assert(t.startFlight(flight));tick(t,6);assert(t.startConveyor(conveyor));
 const payload=loadAtEntry(t,conveyor);tick(t,.4);
 assert(t.conveyorContactLoads(conveyor).some(item=>item.body===payload.body),'a real surface contact is required');
 const charge=base.parts.filter(t.isExternalBattery).map(part=>[part,part.mood.energy]);
 const sample=(translation,spin)=>{
  for(const [part,energy]of charge)part.mood.energy=energy;
  const carrier=base.body,load=payload.body;
  for(const body of [carrier,load]){body.force.set(0,0,0);body.torque.set(0,0,0);}
  carrier.velocity.copy(translation);carrier.angularVelocity.copy(spin);
  carrier.getVelocityAtWorldPoint(load.position,load.velocity);load.angularVelocity.copy(spin);
  const before=t.externalBatterySummary(base).storedJ;
  sandbox.__contactDrive(conveyor,1/120);
  assert(load.force.norm()>.001,'surface drive applies finite contact traction');
  assert(load.force.vadd(carrier.force).norm()<1e-10,'the free carrier takes the opposite force');
  const moment=load.position.cross(load.force).vadd(carrier.position.cross(carrier.force)).vadd(carrier.torque).vadd(load.torque);
  assert(moment.norm()<1e-10,'the force pair adds no net moment to the complete assembly');
  return {force:load.force.clone(),spent:before-t.externalBatterySummary(base).storedJ};
 };
 const rest=sample(t.V(),t.V());
 for(const [v,w]of [[t.V(.5,0,-.4),t.V()],[t.V(.5,.1,-.4),t.V(0,.3,0)]]){
  const moving=sample(v,w);
  assert(moving.force.distanceTo(rest.force)<1e-10,'common rigid motion does not change relative belt traction');
  assert(Math.abs(moving.spent-rest.spent)<1e-10,'moving the carrier does not create a free belt-energy source');
 }
});
