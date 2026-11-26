'use strict';
// Legal material fixtures for isolated Cannon tests; this setup does not
// certify the preceding player transport or narrative objectives.
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
const near=(a,b,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<epsilon,a+' != '+b);
function memory() {const values=new Map();return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v))};}

function fixture(storage=memory()) {
  const {t,sandbox}=createGame({graphics:false,storage}),G=sandbox.QBitsGalponProduction,C=sandbox.QBitsGalponChain,R=sandbox.QBitsReconfiguration;
  t.beginHangarGame({workers:4});t.story.ready=true;t.hideStoryDialogue();sandbox.document.pointerLockElement=t.canvas;
  const s=t.story.galpon,worker=s.initialIds[0];let slot=0,reconfiguration=0;
  function manufacture(shape='cube',position=null,credited=false) {
    const id=t.allocateUnitId();G.tick(s,1);assert(G.extract(s,id));assert(G.take(s,id,worker));assert(G.store(s,id,worker));
    assert(G.start(s,'converter',id,'cube'));G.tick(s,1);G.finish(s,'converter');G.tick(s,12);
    if(shape==='coupler'){assert(G.start(s,'former',id,'coupler'));G.tick(s,1);G.finish(s,'former');G.tick(s,12);}
    if(credited){G.tick(s,.5,{activeCoolingIds:[id]});assert(G.receive(s,[id],'family:1'));assert(G.markReleased(s,[id],'family:1'));}
    const p=position||t.V(-5.2+(slot%8)*.17,.07,2.4+Math.floor(slot++/8)*.17);
    const g=t.hangarMakePart(G.record(s,id),p);assert(g);return g;
  }
  const credited=Array.from({length:12},()=>manufacture('cube',null,true));
  C.ensure(s);t.initHangarChainWorld();t.hideStoryDialogue();const w=t.getHangarChainWorld();
  function certify(g) {
    const ids=g.parts.map(p=>p.id);assert(C.reintroduce(s,ids));
    assert(C.noteTransfer(s,{ids,method:'arm',zone:'table',toolId:worker,powered:true,kind:'wired',repeated:true}));
    assert(C.noteTransfer(s,{ids,method:'drone',zone:'second-cooler',toolId:worker,powered:true,returned:true}));
    C.cool(s,ids,.5,{second:true,powered:true});
    assert(C.noteTransfer(s,{ids,method:'arm',zone:'feed',toolId:worker,powered:true}));return g;
  }
  function bodySteps(n=90) {for(let i=0;i<n;i++)t.world.step(1/120);t.invalidateConveyorContacts();}
  function place(g,p) {g.body.position.copy(p);g.body.quaternion.set(0,0,0,1);g.body.velocity.set(0,0,0);g.body.angularVelocity.set(0,0,0);g.body.aabbNeedsUpdate=true;g.body.wakeUp();}
  function reconfigure(subject,action) {
    const sources=Array.isArray(subject)?subject:[subject],inputs=sources.map(g=>t.worldParts(g)[0]);
    const plan=R.plan(action,inputs);assert(!plan.error,plan.error);
    const lane=reconfiguration++;
    const outputs=plan.outputs.map((p,i)=>({...p,id:p.shape==='cube'?p.mood.matter.root:t.allocateUnitId(),
      p:t.V(-5.2+i*.13,t.unitGroundHeight(p.shape)+.005,1.2+lane*.14),q:t.Q()}));
    assert(G.reconfigure(s,action,inputs,outputs));assert(G.spend(s,G.CONFIG.formingJ,'reconfiguration'));
    sources.forEach(g=>t.removeGroup(g));const made=outputs.map(p=>t.makeGroup([p]));assert(made.every(Boolean));return made;
  }
  function build(kind) {
    const recipe=t.hangarChainRecipe(kind),needed={};for(const group of recipe.groups)for(const p of group.parts)needed[p.shape]=(needed[p.shape]||0)+1;
    for(const [shape,count]of Object.entries(needed)) {
      if(shape==='tetra') {
        let blades=0;
        while(blades<count)for(const pyramid of reconfigure(manufacture(),'divide')) {
          reconfigure(pyramid,'subdivide');blades+=2;if(blades>=count)break;
        }
      }else for(let i=0;i<count;i++)manufacture(shape);
    }
    assert(t.buildHangarChainMechanism(kind),w.message);
    return kind==='arm'?t.robotArms.find(a=>w.arms.includes(a.gripperId)):kind==='drone'?t.groups.find(g=>g.parts.some(p=>p.mood.gripper)&&t.propellerModules([g]).length):t.conveyors.find(c=>c.baseId===w.belts[kind]);
  }
  function source() {
    if(w.sourceId)return t.powerReservoirs.find(r=>r.id===w.sourceId);
    const r=t.createGalponPowerReservoir(t.hangarChainLayout().source,{enabled:true});assert(r);w.sourceId=r.id;return r;
  }
  function cableTo(id) {
    const r=source(),from={kind:'reservoir',id:r.id},to={kind:'part',id};
    const a=t.powerPort(from),b=t.powerPort(to),materials=Array.from({length:8},()=>manufacture()).flatMap(g=>t.worldParts(g));
    const result=t.connectPowerCable(from,to,[t.V(b.x,a.y,a.z),t.V(b.x,a.y,b.z)],materials);
    assert(result.ok,result.error);return result.cable;
  }
  function factory() {
    const belt=build('feedA'),second=build('feedB');cableTo(belt.baseId);cableTo(second.baseId);
    assert(t.hangarChainPlaceAssembler(),w.message);assert(t.hangarChainPowered('assembler'));
    return belt;
  }
  function feedRotor() {
    const a=certify(manufacture('cube',t.V(-4,.07,1.7))),b=certify(manufacture('cube',t.V(-4,.07,1.7))),part=t.worldParts(b)[0],plan=R.plan('divide',[part]);assert(!plan.error);
    const records=plan.outputs.map((p,i)=>({...p,id:t.allocateUnitId(),p:t.V(w.assembler.p[0]+.5+(i%3-1)*.12,.55+t.unitGroundHeight('pyramid')+.003,w.assembler.p[2]+.38+(Math.floor(i/3)-.5)*.11),q:t.Q()}));
    assert(G.reconfigure(s,'divide',[part],records));assert(G.spend(s,G.CONFIG.formingJ,'reconfiguration'));t.removeGroup(b);
    const pyramids=records.map(p=>t.makeGroup([p]));assert(pyramids.every(Boolean));
    place(a,t.V(w.assembler.p[0]-.5,.55+t.unitGroundHeight('cube')+.003,w.assembler.p[2]+.31));bodySteps();
    assert.equal(t.hangarChainFeedParts('cube').length,1,JSON.stringify({input:plain(a.body.position),sleep:a.body.sleepState,intake:plain(w.intakes[0].position),contacts:(t.conveyorContactIndex().get(a.body)||[]).map(c=>({a:c.bi.id,b:c.bj.id,n:plain(c.ni)}))}));
    assert.equal(t.hangarChainFeedParts('pyramid').length,6,JSON.stringify({pyramids:pyramids.map(g=>({id:g.parts[0].id,p:plain(g.body.position),sleep:g.body.sleepState,contacts:(t.conveyorContactIndex().get(g.body)||[]).map(c=>({a:c.bi.id,b:c.bj.id,n:plain(c.ni)}))})),intake:plain(w.intakes[1].position)}));
    return {a,b,pyramids,origins:[a.parts[0].id,b.parts[0].id]};
  }
  return {t,sandbox,s,w,G,C,R,storage,manufacture,credited,certify,bodySteps,place,reconfigure,build,source,cableTo,factory,feedRotor};
}

module.exports={fixture,memory,plain,near};
