const test=require('node:test'),assert=require('node:assert/strict');
const Timing=require('../assets/js/dialogue-timing.js');
function at(timing,count){let a=0,b=timing.duration;for(let i=0;i<50;i++){const mid=(a+b)/2;if(timing.countAt(mid)>=count)b=mid;else a=mid;}return b;}
test('commas breathe, sentence ends pause longer and ellipses make one deliberate pause',()=>{
 const cases=[['Hola, ven',5,7,.16,.25],['Hola. Ven',5,7,.30,.39],['Hola... ven',7,9,.44,.53],['¿Hola? Ven',6,8,.28,.37],['Hola! Ven',5,7,.26,.35]];
 for(const [text,punctuation,next,min,max] of cases){
  const timeline=Timing.create(text),gap=at(timeline,next)-at(timeline,punctuation);
  assert(gap>=min&&gap<max,`${text}: ${gap}`);
  const during=at(timeline,punctuation)+min/2;assert.equal(timeline.countAt(during),punctuation);
 }
});
test('word length affects pace gently, with varying letter intervals and no random frame jitter',()=>{
 const short=Timing.create('sol'),long=Timing.create('extraordinario');
 const a=at(short,2)-at(short,1),b=at(long,2)-at(long,1);
 assert(b>a);assert(a>.02&&b<.05);
 const spans=Array.from({length:10},(_,i)=>at(long,i+2)-at(long,i+1));
 assert(Math.max(...spans)-Math.min(...spans)>.001);
 const second=Timing.create('extraordinario');assert.equal(long.duration,second.duration);
 assert.equal(long.countAt(0),0);assert.equal(long.countAt(long.duration),14);
});
test('accents, digits and emoji reveal whole code points and empty text completes safely',()=>{
 const text='Sí, energi\u0301a 123 🚀',timing=Timing.create(text);
 assert.equal(timing.words[0].length,2);assert.equal(timing.words[1].length,7);
 assert.equal(timing.countAt(timing.duration),text.length);
 for(let time=0;time<=timing.duration;time+=.001){const visible=text.slice(0,timing.countAt(time));assert(!/[\uD800-\uDBFF]$/.test(visible));}
 assert.equal(Timing.create('').duration,0);assert.equal(Timing.create('').countAt(10),0);
});
