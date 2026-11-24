const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

function sampleFrames(hz,cap,{seconds=10,jitter=0}={}){
 const {t}=createGame(),draws=[];
 for(let frame=1;frame<=hz*seconds;frame++){
  // RAF callbacks can arrive on either side of their nominal refresh time.
  // The timestamps remain strictly increasing even in the 120 Hz / ±2 ms case.
  const time=frame*1000/hz+(frame%2?jitter:-jitter);
  if(t.visualFrameDue(time,cap))draws.push({frame,time});
 }
 return {t,draws};
}

function frameGaps(draws){return draws.slice(1).map((draw,i)=>draw.frame-draws[i].frame);}

for(const hz of [60,120])for(const jitter of [.6,1,2]){
 test(`${hz} FPS on ${hz} Hz does not discard alternating RAF callbacks with ±${jitter} ms jitter`,()=>{
  const {draws}=sampleFrames(hz,hz,{jitter});
  assert.equal(draws.length,hz*10,'a nominal refresh must not become a half-rate camera update');
  assert(frameGaps(draws).every(gap=>gap===1),'no extra display refresh may be skipped');
 });
}

for(const jitter of [.6,1,2]){
 test(`60 FPS on 120 Hz keeps a regular capped cadence with ±${jitter} ms jitter`,()=>{
  const {draws}=sampleFrames(120,60,{jitter});
  // A delayed first presentation may cost one frame, but cannot accumulate
  // drift or be compensated by a burst of consecutive 120 Hz presentations.
  assert(draws.length>=599&&draws.length<=600,`expected 599–600 draws, got ${draws.length}`);
  assert(frameGaps(draws).every(gap=>gap===2),'present every other refresh without bursts or long holes');
 });
}

test('a cap above the display refresh preserves every callback despite RAF jitter',()=>{
 for(const jitter of [.6,1,2]){
  const {draws}=sampleFrames(60,120,{jitter});
  assert.equal(draws.length,600);
  assert(frameGaps(draws).every(gap=>gap===1));
 }
});

test('non-divisible refresh rates preserve both the frame budget and distribution',()=>{
 for(const [hz,cap] of [[144,60],[165,120],[75,30]]){
  const {draws}=sampleFrames(hz,cap,{seconds:3});
  assert.equal(draws.length,cap*3,`${hz} Hz → ${cap} FPS`);
  const shortest=Math.floor(hz/cap),longest=Math.ceil(hz/cap);
  assert(frameGaps(draws).every(gap=>gap>=shortest&&gap<=longest),`${hz} Hz → ${cap} FPS must spread draws over adjacent refresh counts`);
  // A matching total alone could hide bursts followed by long stalls.
  for(let second=0;second<3;second++){
   const count=draws.filter(draw=>draw.frame>second*hz&&draw.frame<=(second+1)*hz).length;
   assert(Math.abs(count-cap)<=1,`${hz} Hz → ${cap} FPS exceeds the per-second budget: ${count}`);
  }
 }
});

for(const [hz,cap,jitter]of [[165,120,2],[144,120,2],[90,60,4]]){
 test(`${hz} Hz → ${cap} FPS with ±${jitter} ms jitter preserves the rate without accumulated bursts`,()=>{
  const {draws}=sampleFrames(hz,cap,{jitter});
  assert(Math.abs(draws.length-cap*10)<=1,`expected about ${cap*10} draws, got ${draws.length}`);
  for(let index=0,end=0;index<draws.length;index++){
   const draw=draws[index],budget=draw.time*cap/1000;
   assert(index+1<=budget+1,'presentation cannot run more than one frame ahead of its elapsed-time budget');
   while(end<draws.length&&draws[end].time<draw.time+1000-1e-7)end++;
   assert(end-index<=cap+1,'a rolling second cannot hide a catch-up burst above the cap');
  }
  const maximumGap=Math.ceil(hz/cap)*1000/hz+2*jitter;
  assert(draws.slice(1).every((draw,index)=>draw.time-draws[index].time<=maximumGap+1e-7),'small timestamp jitter cannot introduce long presentation holes');
 });
}

test('a long pause resumes with one draw and never replays missed frame debt',()=>{
 for(const cap of [30,60,120]){
  const {t}=sampleFrames(144,cap,{seconds:3});
  assert(t.visualFrameDue(15000,cap));
  for(const elapsed of [0,.1,.2,.5,1])assert.equal(t.visualFrameDue(15000+elapsed,cap),false,'do not render a catch-up burst');
  assert(t.visualFrameDue(15000+1000/cap,cap));
 }
});

test('uncapped presentation accepts every refresh at ideal and jittered times',()=>{
 for(const jitter of [0,.6,1,2]){
  const {draws}=sampleFrames(144,0,{seconds:3,jitter});
  assert.equal(draws.length,432);
  assert(frameGaps(draws).every(gap=>gap===1));
 }
});
