'use strict';
// Native construction driver for the contiguous galpón benchmark. It does not
// manufacture fixtures, mutate the ledger/energy, credit lessons, or move bodies.
// All material comes through the existing workers, converter and former.
const assert=require('node:assert/strict');

function factoryDriver({t,sandbox,advance,mark=()=>{}}){
 const V=(x,y,z)=>t.V(x,y,z),el=id=>sandbox.document.querySelector('#'+id);
 const state=()=>t.getHangarChainWorld();
 function inputReady(){
  t.closeTrajectoryPanel(false);t.closeWorkshopPanel(false);t.hideStoryDialogue();t.resumeGame();
  t.setSelected(null);t.setMultiSelection([]);t.resetGameInputs();
 }
 function summary(){
  const w=state(),s=t.story.galpon,stock=t.hangarChainStock();
  return {seconds:s.elapsed,energyJ:s.energyJ,extracted:s.extracted,records:s.records.length,
   stock:Object.fromEntries(Object.entries(stock).map(([shape,groups])=>[shape,groups.length])),
   feeds:Object.fromEntries(Object.entries(w.belts).map(([kind,id])=>{const c=t.conveyors.find(c=>c.baseId===id);return [kind,c&&{baseId:c.baseId,running:c.running,status:c.status}];})),
   assembler:{...w.assembler},laser:w.laser&&{...w.laser},chain:sandbox.QBitsGalponChain.status(s)};
 }
 function waitForStock(needed,seconds,label){
  for(let elapsed=0;elapsed<=seconds;elapsed++){
   const stock=t.hangarChainStock();
   if(Object.entries(needed).every(([shape,count])=>stock[shape]?.length>=count))return stock;
   if(elapsed===seconds)assert.fail('Native production did not finish '+label+': '+JSON.stringify({needed,...summary(),production:t.hangarWorldStatus()}));
   if(elapsed&&elapsed%30===0)mark('esperando '+label,{needed,stock:Object.fromEntries(Object.entries(stock).map(([shape,list])=>[shape,list.length]))});
   advance(1);
  }
 }
 function buildFeed(kind,productionTimeout){
  const w=state(),existing=t.conveyors.find(c=>c.baseId===w.belts[kind]);if(existing)return existing;
  el('galpon-chain-plan').value=kind;assert(t.hangarChainAction('prepare'),w.message);
  waitForStock({cube:18,coupler:12},productionTimeout,'material real de '+kind);
  const before=new Set(t.conveyors),energy=t.story.galpon.energyJ;
  assert(t.buildHangarChainMechanism(kind),w.message);
  const belt=t.conveyors.find(c=>!before.has(c)&&c.baseId===w.belts[kind]);assert(belt,'native blueprint did not create its one feed belt');
  assert(t.story.galpon.energyJ<=energy-60+1e-6,'the 30-part blueprint must pay its 60 J assembly work');
  mark('alimentador '+kind+' montado con producción real',{baseId:belt.baseId,assemblyJ:energy-t.story.galpon.energyJ});return belt;
 }
 function source(){
  const supply=t.powerReservoirs.find(r=>r.id===state().sourceId);assert(supply?.missionOwned,'the arm demonstration must reveal the existing source first');
  if(!supply.enabled){
   t.openPowerReservoirMenu(supply);const on=t.getCommandState().items.find(item=>item.label==='Encender salida');assert(on&&!on.disabled);on.run();
   const close=t.getCommandState().items.find(item=>item.label==='Cerrar');assert(close);close.run();
  }
  assert(supply.enabled);return supply;
 }
 function cablePlan(supply,belt){
  const from={kind:'reservoir',id:supply.id},to={kind:'part',id:belt.baseId};
  const existing=t.powerCables.find(c=>[c.from,c.to].some(e=>e.kind===from.kind&&e.id===from.id)&&[c.from,c.to].some(e=>e.kind===to.kind&&e.id===to.id));
  if(existing){assert(t.refreshPowerCable(existing),existing.status);return {existing,from,to};}
  const a=t.powerPort(from),b=t.powerPort(to);assert(a&&b,'both physical power ports must exist');
  for(const height of [1.2,1.55]){
   const points=[V(a.x,height,a.z),V(b.x,height,a.z),V(b.x,height,b.z)],path=[a,...points,b],metres=t.powerCableLength(path);
   if(!t.powerCableBlocked({from,to},path)&&metres<=16+1e-6)return {from,to,points,metres,count:Math.ceil(metres/2),height};
  }
  assert.fail('Neither raised native cable path clears the feed '+belt.baseId);
 }
 function connectFeed(plan){
  if(plan.existing)return plan.existing;
  const stock=t.hangarChainStock().cube;assert(stock.length>=plan.count,'the cable requires its existing cooled cubes');
  const materials=stock.slice(0,plan.count).flatMap(g=>t.worldParts(g)),ids=materials.map(p=>p.id),massBefore=sandbox.QBitsGalponProduction.stats(t.story.galpon).mass;
  const result=t.connectPowerCable(plan.from,plan.to,plan.points,materials);assert(result.ok,result.error);
  assert(ids.every(id=>sandbox.QBitsGalponProduction.record(t.story.galpon,id)?.place==='cable'),'all cable material keeps its ledger custody');
  assert.equal(sandbox.QBitsGalponProduction.stats(t.story.galpon).mass,massBefore);
  mark('alimentador conectado a la reserva existente',{baseId:plan.to.id,cableId:result.cable.id,metres:result.cable.length,height:plan.height,materialIds:ids});
  return result.cable;
 }
 function setup({productionTimeout=600}={}){
  assert(t.story.scene==='galpon'&&t.story.galpon?.chain&&state(),'continue the real B world before factory setup');
  inputReady();assert(t.hangarWorldAction('work'));
  const supply=source(),feeds={feedA:buildFeed('feedA',productionTimeout),feedB:buildFeed('feedB',productionTimeout)},w=state();
  if(!w.assembler.placed)assert(t.hangarChainPlaceAssembler(),w.message);
  assert.equal(w.assembler.id,1,'the mission owns exactly one reusable assembler');
  const plans=Object.values(feeds).map(belt=>cablePlan(supply,belt));
  const required=plans.reduce((n,plan)=>n+(plan.count||0),0)+(w.laser?0:1);
  if(required){assert(t.hangarWorldAction('cube'));waitForStock({cube:required},productionTimeout,'cubos reales para cables y láser');}
  const cables=plans.map(connectFeed);
  if(!w.laser){
   t.stopConveyor(feeds.feedB);const hit=t.rotorPart(feeds.feedB.baseId);t.setSelected({g:hit.g,part:hit.part});
   assert(t.hangarChainMountLaser(),w.message);mark('láser anclado con un cubo real',{partId:w.laser.part,beltId:w.laser.belt});
  }
  assert.equal(w.laser.belt,feeds.feedB.baseId,'the industrial cutter belongs to feed B');
  for(const belt of Object.values(feeds))assert(t.startConveyor(belt),belt.status);
  t.setSelected(null);assert(t.hangarChainAction('feed'));advance(.25);
  assert(t.hangarChainPowered('laser'),'the laser needs its mounted belt and existing power source');
  assert(t.hangarChainPowered('assembler'),'both real feed connections must align with the assembler');
  assert.doesNotThrow(()=>sandbox.QBitsGalponProduction.validate(t.story.galpon));
  const result={feeds,cables,laserId:w.laser.part,assemblerId:w.assembler.id,summary:summary()};
  mark('fábrica preparada sin abrir ni acreditar el pedido',result.summary);return result;
 }
 function order(){
  const ok=t.hangarChainAction('order');
  mark(ok?'pedido abierto por los hitos reales':'pedido todavía pendiente de sus hitos',{message:state().message,chain:sandbox.QBitsGalponChain.status(t.story.galpon)});
  return ok;
 }
 return {setup,order,summary,waitForStock};
}

module.exports={factoryDriver};

// Optional standalone verification against a real durable checkpoint. This
// loader preserves the same world and uses the driver's public operations.
if(require.main===module){
 const fs=require('node:fs'),path=require('node:path'),createGame=require('./game-harness.cjs');
 const args=Object.fromEntries(process.argv.slice(2).map(value=>value.replace(/^--/,'').split('=')));
 const output=path.resolve(args.output||'/tmp/qbits-native-factory');assert(args.checkpoint,'pass --checkpoint=/path/to/a/real/checkpoint.json');
 fs.mkdirSync(output,{recursive:true});const checkpoint=JSON.parse(fs.readFileSync(args.checkpoint,'utf8')),entries=new Map(checkpoint.entries);
 const storage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,String(value))};
 const game=createGame({storage}),{t,sandbox,api}=game,hz=Number(args.hz||60);assert([60,120,240].includes(hz));
 const result={scope:'Native factory setup continuing a real checkpoint: workers/conversion/forming, both 30-part blueprints, actual cable material and one laser head. No fixture grants or process cargo repositioning.',events:[]};let driver;
 const mark=(event,extra={})=>{const row={event,seconds:t.story.galpon.elapsed,energyJ:t.story.galpon.energyJ,...extra};result.events.push(row);console.error(JSON.stringify(row));};
 const advance=(seconds,done=()=>false)=>{
  for(let frame=0;frame<Math.ceil(seconds*60);frame++){if(t.navigationJobs.size)t.runNavigationJobs();for(let i=0;i<hz/60;i++)t.stepSimulation(1/hz);if(frame%60===59&&done())return true;}return done();
 };
 const persist=name=>{
  const saved=t.saveCurrentGame();assert(saved.ok,saved.error);fs.writeFileSync(path.join(output,name+'.json'),JSON.stringify({entries:[...entries],observed:driver?.summary()},null,2)+'\n');
 };
 (async()=>{
  let ready=false;const prepared=api.prepare().then(()=>ready=true);for(let i=0;i<30&&!ready;i++){game.frame(i*17);await Promise.resolve();await Promise.resolve();}await prepared;
  api.menu();t.applyPreferences({physicsHz:hz});sandbox.document.querySelector('#main-galpon').click();sandbox.document.querySelector('#galpon-continue').click();assert.equal(t.story.scene,'galpon');
  driver=factoryDriver({t,sandbox,advance,mark});result.initial=driver.summary();
  result.factory=driver.setup({productionTimeout:Number(args.timeout||600)}).summary;result.orderOpened=driver.order();persist('07-fabrica-native');
  fs.writeFileSync(path.join(output,'benchmark.json'),JSON.stringify(result,null,2)+'\n');console.error('Native factory setup complete:',output);
 })().catch(error=>{result.failure=error.stack;try{result.final=driver?.summary();persist('failed');}catch{}fs.writeFileSync(path.join(output,'benchmark.json'),JSON.stringify(result,null,2)+'\n');console.error(error);process.exitCode=1;});
}
