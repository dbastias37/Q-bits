const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

test('frame caps preserve refresh-time remainder and recover after a long pause',()=>{
 for(const [hz,cap] of [[144,60],[165,120],[75,30],[60,60],[144,0]]){
  const {t}=createGame();
  let draws=0;
  for(let i=1;i<=hz*3;i++)if(t.visualFrameDue(i*1000/hz,cap))draws++;
  assert.equal(draws,(cap||hz)*3);
  assert(t.visualFrameDue(15000,cap));
  if(cap)assert.equal(t.visualFrameDue(15000,cap),false);
 }
});
