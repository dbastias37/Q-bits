const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../assets/js/guide-audio.js');
function setup({missing=[],duration=.08,unsupported=false,config={clips:['blip_01.wav','blip_02.wav'],end:'end.wav'}}={}){
 const requests=[],sources=[];let decoded=0,resumed=0;
 const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(){}});
 class Context{
  constructor(){this.state='suspended';this.currentTime=0;this.destination={};Context.instance=this;}
  createGain(){return {gain:param(),connect(){},disconnect(){}};}
  createBufferSource(){const source={playbackRate:param(),connect(){},disconnect(){},start(at){this.startAt=at;},stop(at){this.stopAt=at;}};sources.push(source);return source;}
  resume(){resumed++;this.state='running';return Promise.resolve();}
  decodeAudioData(){decoded++;return Promise.resolve({duration,id:decoded});}
 }
 const host={AudioContext:unsupported?undefined:Context,AbortController,setTimeout,clearTimeout,document:{baseURI:'https://qbits.test/',hidden:false},
  async fetch(url){requests.push(String(url));return {ok:!missing.some(name=>String(url).endsWith(name)),headers:{get:()=>null},json:async()=>config,arrayBuffer:async()=>new ArrayBuffer(10)};}};
 const voice=create({host,random:()=>.5});
 function tick(time){const ctx=Context.instance;ctx.currentTime=time;for(const source of sources)if(source.onended&&source.stopAt<=time&&!source.ended){source.ended=true;source.onended();}}
 return {voice,host,requests,sources,tick,get context(){return Context.instance;},get decoded(){return decoded;},get resumed(){return resumed;}};
}
test('one bank is loaded/decoded once; missing clips are optional and unsupported audio stays silent',async()=>{
 const e=setup({missing:['blip_02.wav','end.wav']});await Promise.all([e.voice.preload(),e.voice.preload()]);
 assert.equal(e.requests.length,4);assert.equal(e.decoded,1);assert.equal(e.voice.getState().clips,1);
 e.voice.begin('Hola mundo');e.voice.reveal(3);assert.equal(e.sources.length,0,'preload never unlocks autoplay');
 await e.voice.unlock();assert.equal(e.resumed,1);assert.equal(e.requests.length,4);
 e.voice.begin('Hola mundo');e.voice.reveal(3);assert.equal(e.sources.length,1);
 const no=setup({unsupported:true});await no.voice.unlock();no.voice.begin('Hola');no.voice.reveal(3);assert.equal(no.sources.length,0);
});
test('typing uses bounded voices, no immediate sample repeats, punctuation silence and one ending',async()=>{
 const e=setup();await e.voice.unlock();e.voice.begin('Hola, amigo.');
 e.voice.reveal(3);assert.equal(e.sources.length,1);
 e.tick(.05);e.voice.reveal(5);assert.equal(e.sources.length,1,'comma pauses');
 e.tick(.12);e.voice.reveal(8);assert.equal(e.sources.length,1);
 e.tick(.23);e.voice.reveal(10);assert.equal(e.sources.length,2);
 assert.notEqual(e.sources[0].buffer.id,e.sources[1].buffer.id);
 e.tick(.26);e.voice.reveal(12);assert.equal(e.sources.length,3);assert(e.voice.getState().active<=2);
 e.voice.reveal(12);assert.equal(e.sources.length,3,'end occurs once');
 for(const source of e.sources)assert(source.stopAt-source.startAt<=.221);
 e.tick(1);assert.equal(e.voice.getState().active,0);
});
test('skip, scene replacement, pause, mute and hidden tab cancel without replaying a backlog',async()=>{
 const e=setup();await e.voice.unlock();e.voice.begin('Hola mundo, qué tal.');e.voice.reveal(3);
 e.voice.reveal(19,{skip:true});e.tick(.01);assert.equal(e.voice.getState().active,0);assert.equal(e.sources.length,1);
 e.tick(.3);e.voice.reveal(19);assert.equal(e.sources.length,1);
 e.voice.begin('Un diálogo nuevo');e.voice.reveal(4);e.voice.setPaused(true);e.tick(.31);assert.equal(e.voice.getState().active,0);
 e.voice.setPaused(false);e.voice.reveal(4);assert.equal(e.sources.length,2);
 e.voice.configure({guideVoice:false});e.voice.reveal(6);assert.equal(e.sources.length,2);
 e.voice.configure({guideVoice:true,guideVolume:0});e.voice.reveal(9);assert.equal(e.sources.length,2);
 e.voice.configure({guideVolume:35});e.host.document.hidden=true;e.voice.reveal(12);assert.equal(e.sources.length,2);
 e.host.document.hidden=false;e.voice.begin('Línea silenciosa',{voice:false});e.voice.reveal(3);assert.equal(e.sources.length,2);
 e.voice.begin('Texto largo que se muestra de golpe');e.voice.reveal(28);assert.equal(e.sources.length,2);
});
test('empty bank, bad filenames, oversized duration and network errors never block dialogue',async()=>{
 const e=setup({missing:['blip_01.wav','blip_02.wav','end.wav']});await e.voice.unlock();e.voice.begin('Hola');e.voice.reveal(4);assert.equal(e.sources.length,0);
 const long=setup({duration:4});await long.voice.preload();assert.equal(long.voice.getState().loaded,0);
 const invalid=setup({config:{clips:['../secret.wav','https://other.test/a.wav','x.exe']}});await invalid.voice.preload();assert.equal(invalid.requests.length,1);
 const network=setup();network.host.fetch=async()=>{throw Error('offline');};await network.voice.unlock();assert.equal(network.voice.getState().clips,0);
});
