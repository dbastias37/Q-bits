const test=require('node:test'),assert=require('node:assert/strict');
const {create,spatial}=require('../assets/js/footsteps.js');
const manifest=require('../assets/audio/footsteps/qbits/steps.json');
function setup({missing=[],duration=.3,config=manifest,unsupported=false,shared=false}={}){
 const sources=[],gains=[],pans=[],requests=[],events={};let contexts=0,decodes=0,resumes=0;
 const param=()=>({value:0,events:[],setValueAtTime(v,t){this.value=v;this.events.push(['value',v,t]);},linearRampToValueAtTime(v,t){this.events.push(['linear',v,t]);},setTargetAtTime(v,t,tau){this.target=v;this.events.push(['target',v,t,tau]);},cancelScheduledValues(){},cancelAndHoldAtTime(){}});
 const node=()=>({connect(output){this.output=output;},disconnect(){this.disconnected=true;}});
 class Context{
  constructor(){contexts++;this.state='suspended';this.currentTime=0;this.destination={};Context.instance=this;}
  createGain(){const n={...node(),gain:param()};gains.push(n);return n;}
  createStereoPanner(){const n={...node(),pan:param()};pans.push(n);return n;}
  createBufferSource(){const n={...node(),playbackRate:param(),start(t){this.startAt=t;},stop(t){this.stopAt=t;}};sources.push(n);return n;}
  resume(){resumes++;this.state='running';return Promise.resolve();}
  decodeAudioData(data){decodes++;return Promise.resolve({duration,asset:data.asset});}
 }
 const host={AudioContext:unsupported?undefined:Context,AbortController,setTimeout,clearTimeout,
  document:{baseURI:'https://qbits.test/',hidden:false,addEventListener:(type,fn)=>events[type]=fn},
  fetch:async url=>{requests.push(String(url));return {ok:!missing.some(n=>String(url).endsWith(n)),headers:{get:()=>null},json:async()=>config,arrayBuffer:async()=>{const b=new ArrayBuffer(10);b.asset=String(url).split('/').pop();return b;}};}};
 if(shared){const context=new Context();host.QBitsGuideAudio={getContext:()=>context};}
 const audio=create({host,random:()=>.5});
 function tick(time){const c=Context.instance;c.currentTime=time;for(const s of sources)if(!s.ended&&s.stopAt<=time){s.ended=true;s.onended();}}
 return {audio,host,sources,gains,pans,requests,events,tick,get context(){return Context.instance;},get contexts(){return contexts;},get decodes(){return decodes;},get resumes(){return resumes;}};
}
const candidate=(key,x,z=0)=>({key,position:{x,y:.045,z}}),ear=[0,1.68,0];
test('distance falls smoothly to zero at six metres and pan follows camera rotation',()=>{
 const p={x:1,y:0,z:0};assert.equal(spatial(p,[0,0,0],0).gain,1);assert.equal(spatial(p,[0,0,0],0).pan,1);
 assert.equal(spatial(p,[0,0,0],Math.PI).pan,-1);
 assert(Math.abs(spatial({x:0,y:0,z:-1},[0,0,0],0).pan)<1e-8);
 let previous=1;for(let d=1.8;d<=7;d+=.05){const gain=spatial({x:d,y:0,z:0},[0,0,0],0).gain;assert(gain<=previous);previous=gain;}
 assert.equal(spatial({x:6,y:0,z:0},[0,0,0],0).gain,0);
 assert.equal(spatial({x:0,y:7,z:0},[0,0,0],0).gain,0,'height contributes to range');
});
test('eight clips decode once, share context, missing clips stay optional, preload never resumes',async()=>{
 const e=setup({missing:['step_02.wav','step_08.wav'],shared:true});await Promise.all([e.audio.preload(),e.audio.preload()]);
 assert.equal(e.contexts,1);assert.equal(e.resumes,0);assert.equal(e.decodes,6);assert.equal(e.requests.length,9);assert.equal(e.audio.getState().missing,2);
 await e.audio.unlock();await e.audio.unlock();assert.equal(e.contexts,1);assert.equal(e.requests.length,9);assert.equal(e.resumes,1);
 const unsupported=setup({unsupported:true});await unsupported.audio.unlock();assert.equal(unsupported.requests.length,0);
 const invalid=setup({config:{clips:['../bad.wav','https://remote/clip.wav','a.exe']}});await invalid.audio.preload();assert.equal(invalid.requests.length,1);
 const long=setup({duration:3});await long.audio.preload();assert.equal(long.audio.getState().loaded,0);
 const offline=setup();offline.host.fetch=async()=>{throw Error('offline');};await offline.audio.unlock();assert.equal(offline.audio.getState().loaded,0);
});
test('distant groups allocate no channels or sources; only the closest three get impacts',async()=>{
 const e=setup();await e.audio.unlock();
 const far=Array.from({length:3000},(_,i)=>candidate('far'+i,10+i));e.audio.update(ear,0,far);
 for(const g of far)e.audio.step(g.key);
 assert.equal(e.audio.getState().channels,0);assert.equal(e.sources.length,0);assert.equal(e.gains.length,1);
 const near=[candidate('c',3),candidate('b',2),candidate('d',4),candidate('a',1)];e.audio.update(ear,0,near);
 assert.equal(e.audio.step('d'),false);assert.equal(e.audio.step('a'),true);assert.equal(e.audio.step('b'),true);assert.equal(e.audio.step('c'),true);
 assert.equal(e.audio.getState().selected,3);
 assert(e.sources[0].output.output.gain.target>e.sources[2].output.output.gain.target);
 assert.notEqual(e.sources[0].buffer.asset,e.sources[1].buffer.asset);
});
test('group replacement fades old channels, fades in new ones and resists tiny priority changes',async()=>{
 const e=setup();await e.audio.unlock();const a=candidate('a',1),b=candidate('b',2),c=candidate('c',3),d=candidate('d',3.05);
 e.audio.update(ear,0,[a,b,c,d]);e.audio.step('c');const old=e.sources.at(-1).output.output;
 d.position.x=2.98;e.tick(.15);e.audio.update(ear,0,[a,b,c,d]);assert.equal(e.audio.step('d'),false,'hysteresis holds similar distances');
 d.position.x=.4;e.tick(.2);e.audio.update(ear,0,[a,b,c,d]);assert.equal(old.gain.target,0);
 assert.equal(e.audio.step('d'),true);const next=e.sources.at(-1).output.output;
 assert(next.gain.events.some(e=>e[0]==='value'&&e[1]===0));assert(next.gain.events.some(e=>e[0]==='target'&&e[1]>0&&e[3]===.06));
 assert.equal(e.audio.step('c'),false);assert.equal(e.audio.getState().selected,3);
 e.tick(1);e.audio.update(ear,Math.PI,[d]);assert.equal(e.pans.at(-1).pan.target,-1);
});
test('voice and channel budgets hold under crowds and rapid turns, with no queued catch-up',async()=>{
 const e=setup({duration:1});await e.audio.unlock();const near=[candidate(1,.2),candidate(2,.4),candidate(3,.6)];
 e.audio.update(ear,0,near);for(const g of near)e.audio.step(g.key);
 e.tick(.13);for(const g of near)e.audio.step(g.key);assert.equal(e.audio.getState().active,6);
 for(let i=0;i<40;i++){const next=[candidate(i+10,.2),candidate(i+100,.4),candidate(i+200,.6)];e.audio.update(ear,0,next);for(const g of next)e.audio.step(g.key);assert(e.audio.getState().active<=6);assert(e.audio.getState().channels<=6);}
 for(const source of e.sources)assert(source.stopAt-source.startAt<=.451);
 e.tick(2);assert.equal(e.audio.getState().active,0);assert.equal(e.sources.length,6,'no timer backlog');
 e.audio.update(ear,0,near);assert.equal(e.audio.step(1),true);
});
test('pause, tab hide, mute and scene reset cancel tails without clearing cached buffers',async()=>{
 const e=setup();await e.audio.unlock();const a=candidate('a',1);
 for(const stop of [()=>e.audio.setPaused(true),()=>{e.host.document.hidden=true;e.events.visibilitychange();},()=>e.audio.configure({footsteps:false}),()=>e.audio.reset()]){
  e.audio.setPaused(false);e.host.document.hidden=false;e.audio.configure({footsteps:true,footstepVolume:55});e.audio.update(ear,0,[a]);assert(e.audio.step('a'));
  const before=e.sources.length;stop();assert.equal(e.audio.step('a'),false);e.tick(e.context.currentTime+.02);assert.equal(e.audio.getState().active,0);assert.equal(e.sources.length,before);
 }
 assert.equal(e.decodes,8);e.audio.configure({footstepVolume:0});e.audio.update(ear,0,[a]);assert.equal(e.audio.step('a'),false);
});
