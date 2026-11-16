const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../assets/js/join-audio.js');
function setup({missing=[],duration=.2,config=require('../assets/audio/joins/qbits/joins.json'),shared=true,unsupported=false}={}){
 const sources=[],gains=[],pans=[],requests=[],events={};let contexts=0,decodes=0,resumes=0;
 const param=()=>({value:0,setValueAtTime(v){this.value=v;},linearRampToValueAtTime(){},cancelScheduledValues(){},cancelAndHoldAtTime(){},setTargetAtTime(v){this.target=v;}});
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
 if(shared&&!unsupported){const ctx=new Context();host.QBitsGuideAudio={getContext:()=>ctx};}
 const audio=create({host,random:()=>.5});
 function tick(time){Context.instance.currentTime=time;for(const s of sources)if(!s.ended&&s.stopAt<=time){s.ended=true;s.onended();}}
 return {audio,host,sources,gains,pans,requests,events,tick,get context(){return Context.instance;},get contexts(){return contexts;},get decodes(){return decodes;},get resumes(){return resumes;}};
}
const ear=[0,1.68,0],near={x:1,y:1,z:0};
test('four optional joins decode once and share the existing context without autoplay',async()=>{
 const e=setup({missing:['join_03.wav']});await Promise.all([e.audio.preload(),e.audio.preload()]);
 assert.equal(e.requests.length,5);assert.equal(e.decodes,3);assert.equal(e.contexts,1);assert.equal(e.resumes,0);assert.equal(e.audio.getState().missing,1);
 assert.equal(e.audio.play(near,ear,0),false);await e.audio.unlock();assert.equal(e.resumes,1);assert.equal(e.requests.length,5);assert(e.audio.play(near,ear,0));
 const no=setup({unsupported:true});await no.audio.unlock();assert.equal(no.requests.length,0);
});
test('missing, corrupt, oversized-duration and failed banks remain silent without blocking',async()=>{
 const empty=setup({missing:['join_01.wav','join_02.wav','join_03.wav','join_04.wav']});await empty.audio.unlock();assert.equal(empty.audio.play(near,ear,0),false);
 const invalid=setup({config:{clips:['../secret.wav','https://other/a.wav','a.exe']}});await invalid.audio.unlock();assert.equal(invalid.requests.length,1);
 const long=setup({duration:3});await long.audio.unlock();assert.equal(long.audio.getState().loaded,0);
 const offline=setup();offline.host.fetch=async()=>{throw Error('offline');};await offline.audio.unlock();assert.equal(offline.audio.getState().loaded,0);
 const one=setup({config:{clips:['join_01.wav']}});await one.audio.unlock();assert(one.audio.play(near,ear,0));
});
test('joining chooses non-repeating clips, culls distant events and bounds overlap and duration',async()=>{
 const e=setup({duration:1.5});await e.audio.unlock();assert.equal(e.audio.play({x:20,y:0,z:0},ear,0),false);assert.equal(e.sources.length,0);assert.equal(e.gains.length,1);
 for(let i=0;i<3;i++){e.tick(i*.05);assert(e.audio.play(near,ear,0));assert.equal(e.audio.play(near,ear,0),false,'same-frame batch is one impact');}
 e.tick(.2);assert.equal(e.audio.play(near,ear,0),false);assert.equal(e.audio.getState().active,3);
 assert.notEqual(e.sources[0].buffer.asset,e.sources[1].buffer.asset);assert.notEqual(e.sources[1].buffer.asset,e.sources[2].buffer.asset);
 for(const s of e.sources)assert(s.stopAt-s.startAt<=.801);
 e.tick(1);assert.equal(e.audio.getState().active,0);assert(e.sources.every(s=>s.disconnected));assert.equal(e.sources.length,3,'no delayed queue');
});
test('the seam stays fixed while gain and stereo follow camera motion with ramps',async()=>{
 const e=setup({duration:.8});await e.audio.unlock();const point={...near};e.audio.play(point,ear,0);
 const spatialGain=e.sources[0].output.output,pan=e.pans[0];assert.equal(pan.pan.value,1);assert(spatialGain.gain.value>0);
 point.x=100;e.audio.update(ear,Math.PI,.05);assert.equal(pan.pan.target,-1);assert(spatialGain.gain.target>0,'source stores a position snapshot');
 e.audio.update([10,1.68,0],0,.05);assert.equal(spatialGain.gain.target,0);
});
test('pause, hidden tab, mute and scene stop fade tails and keep the cached bank',async()=>{
 const e=setup();await e.audio.unlock();
 for(const stop of [()=>e.audio.setPaused(true),()=>{e.host.document.hidden=true;e.events.visibilitychange();},()=>e.audio.configure({joinSounds:false}),()=>e.audio.stop()]){
  e.audio.setPaused(false);e.host.document.hidden=false;e.audio.configure({joinSounds:true,joinVolume:60});assert(e.audio.play(near,ear,0));
  stop();e.tick(e.context.currentTime+.02);assert.equal(e.audio.getState().active,0);
 }
 assert.equal(e.decodes,4);e.audio.configure({joinVolume:0});assert.equal(e.audio.play(near,ear,0),false);
});
