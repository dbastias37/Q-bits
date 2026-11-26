const test=require('node:test');
const assert=require('node:assert/strict');
const Model=require('../assets/js/galpon-logistics.js');
const Power=require('../assets/js/propeller-power.js');
const Workshop=require('../assets/js/workshop.js');

const route=[{x:0,y:.5,z:0,action:'land',wait:1},{x:.25,y:.7,z:0,action:'grab',wait:20},{x:1.5,y:.7,z:1,action:'drop',wait:1}];
const input=()=>({points:route,units:25/6,payload:1,count:1,cells:1,energy:900,speed:.5,gravity:9.8});
const pose=()=>({pointIndex:1,position:[0,.7,0],quaternion:[0,0,0,1],beaconId:2,beaconPosition:[0,.045,-.35],sampleId:7});

test('conservative cargo budget covers loaded flight, reverse route, grip, motion and landing without spending charge',()=>{
 const s=input(),original=JSON.stringify(s),budget=Model.estimate(s);
 assert(budget.ok,budget.message);assert.equal(JSON.stringify(s),original);
 const oneWay=Model.estimate({...s,returnTrip:false});assert(budget.requiredJ>oneWay.requiredJ);assert.equal(budget.distance,oneWay.distance*2);
 const empty=Model.estimate({...s,payload:0});assert(budget.requiredJ>empty.requiredJ);
 const hover=Power.evaluate({count:1,mass:(25/6+1)*.25,gravity:9.8,height:.7,targetHeight:.7,cells:1,energy:900,enabled:true,spool:1},0);
 assert(budget.requiredJ>hover.inputWatts*budget.seconds);assert(budget.landingReserveJ>0);
 const deficient=Model.estimate({...s,energy:budget.requiredJ-.001});assert.equal(deficient.ok,false);assert.equal(deficient.reason,'energy');assert.match(deficient.message,/ida, carga, vuelta y aterrizaje/);
 assert(Model.estimate({...s,energy:budget.requiredJ}).ok);
});

test('longer and slower routes need more energy, and unavailable lift is never compensated by extra energy',()=>{
 const s=input(),budget=Model.estimate(s);
 assert(Model.estimate({...s,speed:.2}).requiredJ>budget.requiredJ);
 assert(Model.estimate({...s,points:route.map(p=>({...p,x:p.x*2,z:p.z*2}))}).requiredJ>budget.requiredJ);
 const overloaded=Model.estimate({...s,payload:100,energy:1000000});assert.equal(overloaded.ok,false);assert.equal(overloaded.reason,'load');
 assert.equal(Model.estimate({...s,cells:0}).reason,'battery');
 assert.equal(Model.estimate({...s,points:[]}).reason,'route');
});

test('saved cargo teaching keeps route, receiver, sample, local quaternion and beacon references in independent copies',()=>{
 const original={version:1,receiverId:8,routeId:'route-3',dockReceiverId:2,pick:pose(),place:{...pose(),pointIndex:2,sampleId:undefined}};
 delete original.place.sampleId;const parsed=Model.validConfig(original);assert.deepEqual(parsed,original);
 parsed.pick.position[0]=10;assert.equal(original.pick.position[0],0);
 assert.equal(Model.validConfig({...original,receiverId:0}),null);assert.equal(Model.validConfig({...original,routeId:'bad route'}),null);
 assert.equal(Model.validConfig({...original,pick:{...pose(),position:[0,Infinity,0]}}),null);
 assert.equal(Model.validConfig({...original,pick:{...pose(),quaternion:[0,0,0,2]}}),null);
 assert.equal(Model.validConfig({...original,pick:{...pose(),pointIndex:48}}),null);
 assert.equal(Model.validConfig({...original,dockReceiverId:-1}),null);
});

test('saved teaching refuses getters, inherited capabilities and unknown fields without executing user code',()=>{
 let touched=false;const hostile={version:1,receiverId:8,routeId:'route-3'};Object.defineProperty(hostile,'pick',{enumerable:true,get(){touched=true;return pose();}});
 assert.equal(Model.validConfig(hostile),null);assert.equal(touched,false);
 assert.equal(Model.validConfig(Object.assign(Object.create({receiverId:8}),{version:1,routeId:'route-3'})),null);
 assert.equal(Model.validConfig({version:1,receiverId:8,routeId:'route-3',energy:9000}),null);
 const v=[0,0,0];Object.defineProperty(v,'0',{enumerable:true,get(){touched=true;return 0;}});
 assert.equal(Model.pose({...pose(),position:v}),null);assert.equal(touched,false);
});

test('runtime checkpoints validate action phase, endpoint identity and navigation data without accepting duplicate followers',()=>{
 const record={version:1,receiverId:8,routeId:'route-3',points:route,loop:true,anchors:[{id:2,pose:[0,.045,-.35,0,0,0,1]},{id:3,pose:[1.5,.045,.65,0,0,0,1]}],previous:{height:.5,speed:.4,heading:0},trip:{index:2,phase:'wait',origin:[0,.15,0],depart:[.25,.7,0],remaining:.5,nextGrab:0,cornerSettled:0,direction:1}};
 const parsed=Model.validRuntime([record]);assert.deepEqual(parsed,[record]);parsed[0].trip.origin[0]=9;assert.equal(record.trip.origin[0],0);
 assert.deepEqual(Model.validRuntime(undefined),[]);assert.equal(Model.validRuntime([record,record]),null);
 assert.equal(Model.validRuntime([{...record,trip:{...record.trip,index:142}}]),null);
 assert.equal(Model.validRuntime([{...record,trip:{...record.trip,phase:'teleport'}}]),null);
 assert.equal(Model.validRuntime([{...record,trip:{...record.trip,direction:0}}]),null);
 assert.equal(Model.validRuntime([{...record,previous:{height:.5,speed:20,heading:0}}]),null);
 assert.equal(Model.validRuntime([{...record,anchors:[record.anchors[0],record.anchors[0]]}]),null);
});

test('real matter QR adaptation requires explicit scoped permission and preserves full-cube provenance and charge',()=>{
 const part={id:7,shape:'cube',weight:1,mood:{energy:.3,matter:{root:7,path:'',rootWeight:1}}},patch={trajectory:{role:'receiver',level:1}},before=JSON.stringify(part);
 assert(Workshop.planPartUpgrade(part,patch,null).error);assert(Workshop.planPartUpgrade(part,patch,null,{allowMatter:1}).error);
 const fitted=Workshop.planPartUpgrade(part,patch,null,{allowMatter:true});assert.equal(fitted.error,undefined);assert.equal(fitted.part.id,part.id);assert.equal(fitted.part.weight,1);assert.equal(fitted.part.mood.energy,.3);assert.deepEqual(fitted.part.mood.matter,part.mood.matter);assert.equal(JSON.stringify(part),before);
 for(const bad of [{...part,weight:1/6},{...part,shape:'pyramid'},{...part,mood:{...part.mood,matter:{root:7,path:'0',rootWeight:1}}},{...part,mood:{...part.mood,matter:{root:7,path:'',rootWeight:2}}}])assert(Workshop.planPartUpgrade(bad,patch,null,{allowMatter:true}).error);
});
