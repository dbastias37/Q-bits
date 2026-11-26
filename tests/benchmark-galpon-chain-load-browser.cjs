'use strict';
// An explicitly isolated load fixture, not a four-worker campaign playthrough.
// QBITS_CHROMIUM=/path/chromium node tests/benchmark-galpon-chain-load-browser.cjs
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.QBITS_PLAYWRIGHT||'playwright');
const {fixture,plain}=require('./galpon-chain-fixture.cjs');
const args=Object.fromEntries(process.argv.slice(2).map(value=>value.replace(/^--/,'').split('=')));
const root=path.join(__dirname,'..');
const output=path.resolve(args.output||path.join(root,'docs/mediciones/galpon-b-20261126/carga'));
const scope='Paid material and provenance fixtures prepare eight A belts, a parked arm/drone, two feed belts, power/cables, laser, assembler and 80 physically articulated/received rotors. The browser restores the actual save, then executes another conveyor/laser/assembler/receipt cycle. No complete A-to-80 autonomous transport run is claimed.';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.ttf':'font/ttf','.wav':'audio/wav','.mp3':'audio/mpeg','.json':'application/json'};
const write=(name,value)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n');

function prepareFixture(){
 const f=fixture(),{t,s,w,G,C,storage,manufacture,credited,certify,build,factory,feedRotor,bodySteps,place}=f;
 credited.slice(0,3).forEach(certify);assert(C.beginOrder(s));
 for(let section=0;section<8;section++){
  for(let i=0;i<18;i++)manufacture();for(let i=0;i<12;i++)manufacture('coupler');
  assert(t.buildHangarSegment(),t.hangarLineStatus().message);
 }
 build('arm');build('drone');factory();manufacture();assert(t.hangarChainMountLaser(),w.message);
 const initialBodies=t.world.bodies.length;let peakBodies=initialBodies;
 for(let i=0;i<80;i++){
  feedRotor();assert(t.hangarChainStartStation('assembler'),w.message);
  C.tick(s,2,{powered:true,working:true});assert(t.hangarChainFinishStation('assembler'),w.message);
  peakBodies=Math.max(peakBodies,t.world.bodies.length);bodySteps(100);
  assert(t.hangarChainReceiveProduct(s.chain.products.at(-1)),w.message);
  if(i%20===19)console.error('Prepared physical stored rotors:',i+1);
 }
 assert.equal(s.chain.products.filter(p=>p.received).length,80);assert.equal(t.families.length,2);
 assert.equal(t.families.reduce((sum,family)=>sum+family.count,0),160);
 // Only the initial placement of this next pair is a fixture. Everything
 // after restoring it in Chromium uses the running game and its contacts.
 const inputIds=['feedA','feedB'].map(key=>{
  const belt=t.conveyors.find(c=>c.baseId===w.belts[key]),g=certify(manufacture('cube',t.V(-4,.07,1.7))),port=t.conveyorPortWorld(belt,'entry');
  place(g,t.V(port.p.x+port.direction.x*.08,port.p.y+t.unitGroundHeight('cube')+.065,port.p.z+port.direction.z*.08));
  assert(t.startConveyor(belt));return g.parts[0].id;
 });
 t.story.hangarWorld.mode='stop';t.story.phase='cadena-completada';t.hideStoryDialogue();
 assert.doesNotThrow(()=>G.validate(s));const saved=t.saveCurrentGame();assert(saved.ok,saved.error);
 const before={products:80,storedParts:160,families:t.families.length,belts:t.conveyors.length,arms:t.robotArms.length,
  groups:t.groups.length,bodies:t.world.bodies.length,records:s.records.length,mass:G.stats(s).mass,energyJ:s.energyJ,
  identities:s.records.map(r=>r.id).sort((a,b)=>a-b),inputIds,peakPreparationBodies:peakBodies};
 return plain({scope,entries:[...storage.values],before});
}

const hooks=`
// Keep the browser's renderer and UI alive while the benchmark supplies an
// exact number of native substeps. This hook is injected by this test server;
// no shipped game file or physical state is changed by the clock wrapper.
const qaOriginalAdvanceSimulation=advanceSimulation;
window.galponLoadQA={manualClock:true,inputIds:[],events:[],lastJob:{laser:null,assembler:null},
 takeControl(ids){this.inputIds=ids;hideStoryDialogue();gameMode('playing');panel.hidden=true;return this.read();},
 view(eye,target){eye=[eye[0],openingFloorHeight()+posture.height,eye[2]];position.splice(0,3,...eye);camera.splice(0,3,...eye);yaw=Math.atan2(eye[0]-target[0],eye[2]-target[2]);pitch=Math.atan2(target[1]-eye[1],Math.hypot(target[0]-eye[0],target[2]-eye[2]));redraw=true;renderScene();},
 read(){const s=story.galpon,ext=gl.getExtension('WEBGL_debug_renderer_info');
  QBitsGalponProduction.validate(s);
  return {scene:story.scene,mode:story.mode,phase:story.phase,simulationSeconds:s.elapsed,worldTime:world.time,
   physicsSteps:tickStats.physics,logicSteps:tickStats.logic,energyJ:s.energyJ,spent:{...s.spent},
   mass:QBitsGalponProduction.stats(s).mass,records:s.records.length,identities:s.records.map(r=>r.id).sort((a,b)=>a-b),
   products:s.chain.products.length,received:s.chain.products.filter(p=>p.received).length,
   families:families.map(f=>({id:f.id,count:f.count,weight:f.weight,items:f.items.length,articulations:f.items.reduce((n,item)=>n+item.joints.length,0),position:[f.body.position.x,f.body.position.y,f.body.position.z]})),
   groups:groups.length,bodies:world.bodies.length,belts:conveyors.map(c=>({baseId:c.baseId,running:c.running,status:c.status})),
   jobs:Object.fromEntries(Object.entries(s.chain.jobs).map(([name,j])=>[name,j&&{id:j.id,state:j.state,elapsed:j.elapsed,inputIds:[...j.inputIds]}])),
   inputRecords:s.records.filter(r=>this.inputIds.includes(r.origin)).map(r=>({id:r.id,origin:r.origin,kind:r.kind,place:r.place,weight:r.weight})),
   chain:QBitsGalponChain.status(s),webgl:gl.getParameter(gl.VERSION),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
   drawSize:[gl.drawingBufferWidth,gl.drawingBufferHeight],glError:gl.getError()};
 },
 step(count){
  if(!Number.isInteger(count)||count<1||count>2400)throw Error('Invalid benchmark step count');
  if(simulationSuspended())throw Error('Mission logic is suspended');
  const before=this.read(),activity={laser:0,assembler:0},start=performance.now();let peakBodies=world.bodies.length,peakRecords=story.galpon.records.length;
  for(let i=0;i<count;i++){
   if(navigationJobs.size)runNavigationJobs();stepSimulation(1/120);
   peakBodies=Math.max(peakBodies,world.bodies.length);peakRecords=Math.max(peakRecords,story.galpon.records.length);
   for(const station of ['laser','assembler']){const job=story.galpon.chain.jobs[station];if(job?.state==='processing')activity[station]++;
    if(job?.id&&job.id!==this.lastJob[station]){this.events.push({station,id:job.id,simulationSeconds:story.galpon.elapsed});this.lastJob[station]=job.id;}}
  }
  const milliseconds=performance.now()-start,after=this.read();
  return {steps:count,hz:120,simulatedSeconds:count/120,milliseconds,millisecondsPerStep:milliseconds/count,
   physicsStepDelta:after.physicsSteps-before.physicsSteps,logicStepDelta:after.logicSteps-before.logicSteps,
   activitySteps:activity,peakBodies,peakRecords,sourceSpentJ:before.energyJ-after.energyJ,before,after};
 },
 renderMeasure(samples=12){
  const times=[];cullingLab.stats=true;let calls=0,triangles=0,lines=0;
  for(let i=0;i<samples+2;i++){gl.finish();const start=performance.now();renderScene();gl.finish();if(i>=2)times.push(performance.now()-start);calls=renderCounts.calls;triangles=renderCounts.triangles;lines=renderCounts.lines;}
  cullingLab.stats=false;updateCullingHud(true);const sorted=[...times].sort((a,b)=>a-b);
  return {samples,timesMs:times,medianMs:sorted[Math.floor(samples/2)],p95Ms:sorted[Math.ceil(.95*samples)-1],
   drawCalls:calls,triangles,lines,glError:gl.getError(),scope:'Native renderScene CPU submission plus gl.finish GPU fence; software renderer, not display FPS.'};
 },
 save(){const result=saveCurrentGame();if(!result.ok)throw Error(result.error);return {entries:Object.entries(localStorage).filter(([key])=>key.startsWith('qbits.')),observed:this.read()};}
};
advanceSimulation=function(dt){return window.galponLoadQA.manualClock?0:qaOriginalAdvanceSimulation(dt);};
`;

function notes(result){
 const m=result.measurements||[],render=result.renderMeasurements||[],before=result.loaded,after=result.final;
 return '# Carga de ochenta rotores · Chromium y WebGL2\n\n'+
  '**Alcance:** guardado preparado con fixtures de producción pagada y procedencia explícita. Los ochenta rotores fueron ensamblados con cuerpos y articulaciones Cannon, recibidos físicamente y agrupados antes de abrir el navegador. No es una partida completa desde cuatro trabajadores ni una prueba de los ochenta transportes del brazo y del dron.\n\n'+
  'El escenario incluye ocho tramos de A, brazo y dron estacionados, dos alimentadores, fuente y cables reales, láser, ensambladora y dos familias. Los dos siguientes cubos se colocan inicialmente sobre las entradas de los alimentadores como fixture. Desde la carga del guardado, el navegador conserva sus cuerpos y ejecuta contactos, tracción, división, reserva, articulación y recepción sin recolocarlos.\n\n'+
  '## Entorno y método\n\n'+
  '- Chromium: `'+result.browser+'`.\n- WebGL: `'+before?.webgl+'`.\n- Renderizador: `'+before?.renderer+'`.\n- Resolución del buffer: '+before?.drawSize.join(' × ')+'.\n'+
  '- La página conserva render y controles reales. Un hook de prueba evita pasos automáticos del reloj entre mediciones; se llama al `stepSimulation(1/120)` original, que ejecuta física y lógica del juego. No se altera el código distribuido.\n'+
  '- Los tiempos de simulación incluyen el registro ligero de actividad y máximos de cuerpos. El render se mide por separado, con dos calentamientos y doce muestras que esperan a `gl.finish()`. No son FPS de una pantalla ni resultados de una GPU del jugador.\n\n'+
  '## Simulación medida\n\n| Subpasos | Tiempo simulado | Tiempo de CPU | ms/paso | Pasos con láser / ensambladora | Pico de cuerpos |\n| ---: | ---: | ---: | ---: | ---: | ---: |\n'+
  m.map(v=>'| '+v.steps+' | '+v.simulatedSeconds.toFixed(2)+' s | '+v.milliseconds.toFixed(2)+' ms | '+v.millisecondsPerStep.toFixed(4)+' | '+v.activitySteps.laser+' / '+v.activitySteps.assembler+' | '+v.peakBodies+' |').join('\n')+'\n\n'+
  '## Render medido\n\n| Estado | Mediana | P95 | Llamadas | Triángulos |\n| --- | ---: | ---: | ---: | ---: |\n'+
  render.map(v=>'| '+v.label+' | '+v.medianMs.toFixed(2)+' ms | '+v.p95Ms.toFixed(2)+' ms | '+v.drawCalls+' | '+v.triangles+' |').join('\n')+'\n\n'+
  '## Conservación y resultado\n\n'+
  '- Recepciones almacenadas: '+before?.received+' → '+after?.received+'; '+after?.families.length+' familias al terminar.\n'+
  '- Piezas en las familias: '+before?.families.reduce((n,f)=>n+f.count,0)+' → '+after?.families.reduce((n,f)=>n+f.count,0)+'. Articulaciones guardadas finales: '+after?.families.reduce((n,f)=>n+f.articulations,0)+'.\n'+
  '- Identidades actuales: '+before?.records+' → '+after?.records+'; masa: '+before?.mass+' → '+after?.mass+' u. Se comprueba igualdad del conjunto de IDs antes y después del ciclo; las identidades temporales de las seis pirámides se retiran al recomponer.\n'+
  '- Cuerpos: '+before?.bodies+' → '+after?.bodies+'. La recepción incorpora el nuevo rotor en una familia existente y retira sus dos cuerpos dinámicos.\n'+
  '- Energía de la fuente: '+before?.energyJ.toFixed(3)+' → '+after?.energyJ.toFixed(3)+' J. La preparación de este fixture omite los transportes previos; su saldo no representa el presupuesto de una partida completa.\n'+
  '- Errores JavaScript observados: '+result.errors.length+'. Error GL final: '+after?.glError+'. Guardado final validado mediante la operación real del juego.\n\n'+
  '## Evidencia y reproducción\n\n'+
  '- [Resultados y estados](browser-load.json) · [Guardado inicial de 80](fixture-80.json) · [Guardado final](after-cycle.json).\n'+
  '- [Escena inicial](01-ochenta-almacenados.png) · [Estaciones trabajando](02-corte-en-marcha.png) · [Familias después del nuevo ciclo](03-familias-y-estaciones.png).\n\n'+
  '```sh\nQBITS_CHROMIUM=/ruta/chromium node tests/benchmark-galpon-chain-load-browser.cjs --output=/tmp/qbits-chain-load\n```\n\n'+
  'Requiere Playwright y Chromium con WebGL2. Este ensayo comprueba restauración, coste acotado y continuidad de una operación física con el inventario acumulado. La distribución sostenida entre mesa, enfriador y entradas, la autonomía energética de todas las rutas y la corrida integrada de ochenta entregas necesitan su propia evidencia.\n';
}

async function run(){
 fs.mkdirSync(output,{recursive:true});const prepared=args.checkpoint?JSON.parse(fs.readFileSync(args.checkpoint,'utf8')):prepareFixture();write('fixture-80.json',prepared);
 if(Object.hasOwn(args,'fixture-only'))return;
 const result={scope,fixture:prepared.before,errors:[],consoleErrors:[],captures:[],measurements:[],renderMeasurements:[],transitions:[]};
 const persist=()=>write('browser-load.json',result);
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
  if(file.endsWith('/assets/js/game.js')){const source=fs.readFileSync(file,'utf8'),at=source.lastIndexOf('})();');assert(at>=0);res.end(source.slice(0,at)+hooks+source.slice(at));}
  else fs.createReadStream(file).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,page;
 try{
  browser=await chromium.launch({executablePath:process.env.QBITS_CHROMIUM||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  result.browser=browser.version();const context=await browser.newContext({viewport:{width:1280,height:800}});
  await context.addInitScript(entries=>{if(!sessionStorage.getItem('qa-load-restored')){for(const [key,value]of entries)localStorage.setItem(key,value);sessionStorage.setItem('qa-load-restored','1');}},prepared.entries);
  page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',error=>result.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')result.consoleErrors.push(message.text());});
  const snap=async name=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:path.join(output,name+'.png')});result.captures.push(name+'.png');persist();};
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
  await page.locator('#boot-play').click({timeout:90000});await page.locator('#main-galpon').click({timeout:180000});await page.locator('#galpon-continue').click();
  await page.waitForFunction(()=>document.body.dataset.gameScene==='galpon'&&window.galponLoadQA);
  result.loaded=await page.evaluate(ids=>galponLoadQA.takeControl(ids),prepared.before.inputIds);
  assert.equal(result.loaded.received,80);assert.equal(result.loaded.belts.length,10);assert.deepEqual(result.loaded.identities,prepared.before.identities);assert.match(result.loaded.webgl,/WebGL 2/);
  await page.evaluate(()=>galponLoadQA.view([1.4,1.7,-3.9],[3.75,.5,-1.8]));await snap('01-ochenta-almacenados');
  for(let i=0;i<30;i++){
   const batch=await page.evaluate(()=>galponLoadQA.step(60));result.transitions.push(batch);
   if(batch.after.jobs.laser?.state==='processing'||batch.after.jobs.assembler?.state==='processing')break;
  }
  const active=await page.evaluate(()=>galponLoadQA.read());assert(active.jobs.laser||active.jobs.assembler,'The restored input pair did not reach a running station');
  await page.evaluate(()=>galponLoadQA.view([4.8,1.7,.9],[3.7,.55,-1.85]));await snap('02-corte-en-marcha');
  result.renderMeasurements.push({label:'Estaciones activas con 80 almacenados',...await page.evaluate(()=>galponLoadQA.renderMeasure())});
  for(const count of [120,600]){const measured=await page.evaluate(count=>galponLoadQA.step(count),count);result.measurements.push(measured);assert.equal(measured.physicsStepDelta,count);console.error('Browser simulation:',count,measured.milliseconds.toFixed(2)+' ms');persist();}
  for(let i=0;i<60;i++){
   if((await page.evaluate(()=>galponLoadQA.read())).received>=81)break;
   result.transitions.push(await page.evaluate(()=>galponLoadQA.step(120)));
  }
  result.final=await page.evaluate(()=>galponLoadQA.read());
  assert.equal(result.final.received,81);assert.equal(result.final.products,81);assert.equal(result.final.mass,result.loaded.mass);
  assert.deepEqual(result.final.identities,result.loaded.identities);assert.equal(result.final.families.length,2);
  assert.equal(result.final.families.reduce((sum,family)=>sum+family.count,0),162);
  assert.equal(result.final.families.reduce((sum,family)=>sum+family.articulations,0),81);
  assert(result.final.energyJ<result.loaded.energyJ);assert.equal(result.final.bodies,result.loaded.bodies-2);
  await page.evaluate(()=>galponLoadQA.view([1.4,1.7,-3.9],[3.75,.5,-1.8]));await snap('03-familias-y-estaciones');
  result.renderMeasurements.push({label:'81 recibidos en las mismas dos familias',...await page.evaluate(()=>galponLoadQA.renderMeasure())});
  result.events=await page.evaluate(()=>galponLoadQA.events);assert(result.events.some(e=>e.station==='laser'));assert(result.events.some(e=>e.station==='assembler'));
  const saved=await page.evaluate(()=>galponLoadQA.save());write('after-cycle.json',{scope,...saved});result.final=saved.observed;
  assert.equal(result.final.glError,0);assert(result.renderMeasurements.every(v=>v.glError===0));assert.deepEqual(result.errors,[]);
  fs.writeFileSync(path.join(output,'README.md'),notes(result));persist();console.error('Load benchmark passed:',output);
 }catch(error){result.failure=error.stack;if(page){try{result.last=await page.evaluate(()=>galponLoadQA.read());await page.screenshot({path:path.join(output,'failure.png')});}catch{}}throw error;}
 finally{persist();if(browser)await browser.close();server.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
