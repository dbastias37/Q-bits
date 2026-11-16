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
  decodeAudioData(data){decoded++;return Promise.resolve({duration,id:decoded,asset:data.asset});}
 }
 const host={AudioContext:unsupported?undefined:Context,AbortController,setTimeout,clearTimeout,document:{baseURI:'https://qbits.test/',hidden:false},
  async fetch(url){requests.push(String(url));return {ok:!missing.some(name=>String(url).endsWith(name)),headers:{get:()=>null},json:async()=>config,arrayBuffer:async()=>{const data=new ArrayBuffer(10);data.asset=String(url).split('/').pop();return data;}};}};
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

test('six blips and three endings load once; exactly one non-repeating ending plays per completed message',async()=>{
 const config={clips:Array.from({length:6},(_,i)=>`blip_0${i+1}.wav`),ends:['end_01.wav','end_02.wav','end_03.wav']};
 const e=setup({config});await e.voice.unlock();assert.equal(e.voice.getState().clips,6);assert.equal(e.voice.getState().ends,3);
 const ends=[];
 for(let i=0;i<5;i++){
  e.tick(i);e.voice.begin('Hola.');e.voice.reveal(3);e.tick(i+.1);e.voice.reveal(5);
  assert.equal(e.sources.length,(i+1)*2);ends.push(e.sources.at(-1).buffer.id);
  e.voice.reveal(5);assert.equal(e.sources.length,(i+1)*2);
 }
 assert(ends.every((id,i)=>!i||id!==ends[i-1]));assert.equal(e.requests.length,10);
 const sparse=setup({config,missing:['end_01.wav','end_03.wav']});await sparse.voice.unlock();
 assert.equal(sparse.voice.getState().ends,1);sparse.voice.begin('Hola.');sparse.voice.reveal(3);sparse.tick(.1);sparse.voice.reveal(5);assert.equal(sparse.sources.length,2);
});


test('word length selects the configured family, keeps its voice inside a word and falls back to bases',async()=>{
 const config=require('../assets/audio/dialogue/guide/voice.json'),e=setup({config});await e.voice.unlock();
 for(const [i,word,expected]of [[0,'sol',['blip_01.wav','blip_02.wav']],[1,'mueve',['blip_03.wav','blip_04.wav']],[2,'energía',['blip_05.wav']],[3,'extraordinario',['blip_06.wav']]]){
  e.tick(i);e.voice.begin(word+' cubo');e.voice.reveal(3);
  assert(expected.includes(e.sources.at(-1).buffer.asset),word);
  if(word.length>6){const chosen=e.sources.at(-1).buffer;e.tick(i+.11);e.voice.reveal(6);assert.equal(e.sources.at(-1).buffer,chosen,'same variant throughout the word');}
 }
 const sparse=setup({config,missing:['blip_05.wav','blip_06.wav']});await sparse.voice.unlock();
 sparse.voice.begin('extraordinario cubo');sparse.voice.reveal(3);assert(['blip_01.wav','blip_02.wav'].includes(sparse.sources.at(-1).buffer.asset));
});
