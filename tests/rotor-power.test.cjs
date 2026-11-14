const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const power = require('../assets/js/rotor-power.js');
const base = { enabled:true, rpm:30, actualRpm:0, actualTorque:0, maxTorque:.4, load:2, capacity:16, energyA:1, energyB:1 };
function near(a,b,eps=1e-12){assert(Math.abs(a-b)<eps,`${a} != ${b}`);}

test('rotor model is usable by the browser and CommonJS without changing inputs',()=>{
  const sandbox={};vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js/rotor-power.js'),'utf8'),sandbox);
  assert.equal(typeof sandbox.QBitsRotorPower.evaluate,'function');
  assert.equal(sandbox.QBitsRotorPower.DEFAULTS.capacity,power.DEFAULTS.capacity);
  const state=Object.freeze({...base});power.evaluate(state,1);
  assert.equal(state.energyA,1);
});

test('an energized unloaded rotor spends standby energy shared by its two Enganches',()=>{
  const result=power.evaluate(base,10);
  near(result.inputWatts,.06);near(result.drainPerSecond,.0015);
  near(result.energyA,.985);near(result.energyB,.985);
  near(result.spentJoules,.6);near(result.remainingSeconds,.985/.0015);
  assert.equal(result.mechanicalWatts,0);assert.equal(result.stopReason,null);
});

test('measured axle work increases draw and a powered stall still loses energy',()=>{
  const idle=power.evaluate(base,1);
  const stall=power.evaluate({...base,actualTorque:.4},1);
  const turning=power.evaluate({...base,actualTorque:.4,actualRpm:30},1);
  near(stall.mechanicalWatts,0);near(stall.heatWatts,.8);
  assert(stall.drainPerSide>idle.drainPerSide);
  assert(turning.drainPerSide>stall.drainPerSide);
  near(turning.mechanicalWatts,.4*Math.PI);
  near(turning.inputWatts,.06+.8+.4*Math.PI/.72);
  const guarded=power.evaluate({...base,stalled:true},1);
  near(guarded.drainPerSide,stall.drainPerSide);
  assert.equal(guarded.mechanicalWatts,0);
});

test('direction changes and external speed cannot create regenerative energy',()=>{
  const forward=power.evaluate({...base,actualTorque:.2,actualRpm:50},1);
  const reverse=power.evaluate({...base,actualTorque:-.2,actualRpm:-50},1);
  assert.deepEqual(forward,reverse);
  const opposite=power.evaluate({...base,actualTorque:.2,actualRpm:-50},1);
  assert.deepEqual(forward,opposite);
  assert(forward.energyA<1);
});

test('off and paused motors never spend energy, while a pause still previews demand',()=>{
  const state={...base,actualTorque:.3,actualRpm:80};
  const off=power.evaluate({...state,enabled:false},100);
  assert.equal(off.drainPerSide,0);assert.equal(off.inputWatts,0);assert.equal(off.remainingSeconds,null);
  for(const dt of [0,-1,NaN,Infinity]){
    const paused=power.evaluate(state,dt);
    assert.equal(paused.drainPerSide,0);assert.equal(paused.energyA,1);assert(paused.inputWatts>0);
  }
});

test('rated load includes both couplers and cuts power before an overload spends energy',()=>{
  const limit=power.evaluate({...base,load:16},1);
  assert.equal(limit.loadRatio,1);assert.equal(limit.stopReason,null);assert(limit.drainPerSide>0);
  const overloaded=power.evaluate({...base,load:16.01},1);
  assert.equal(overloaded.stopReason,'overload');assert.equal(overloaded.drainPerSide,0);
  assert.equal(overloaded.inputWatts,0);assert(overloaded.loadRatio>1);
  assert.equal(overloaded.load,16.01);assert.equal(overloaded.capacity,16);
});

test('the weaker Enganche stops the circuit exactly at exhaustion without overdrawing either side',()=>{
  const result=power.evaluate({...base,actualTorque:.4,actualRpm:120,energyA:.1,energyB:.8},1000);
  assert.equal(result.stopReason,'empty');near(result.energyA,0);near(result.energyB,.7);
  near(result.drainPerSide,.1);near(result.spentJoules,4);assert(result.suppliedSeconds<1000);
  assert.equal(result.remainingSeconds,0);
  const next=power.evaluate({...base,energyA:result.energyA,energyB:result.energyB},1);
  assert.equal(next.stopReason,'empty');assert.equal(next.drainPerSide,0);assert.equal(next.inputWatts,0);
});

test('energy use is independent of frame subdivision, including the final depletion step',()=>{
  const initial={...base,actualTorque:.25,actualRpm:60,energyA:.31,energyB:.86};
  const whole=power.evaluate(initial,12);
  let state={...initial},spent=0;
  for(let i=0;i<2880;i++){
    const result=power.evaluate(state,1/240);spent+=result.spentJoules;
    state={...state,energyA:result.energyA,energyB:result.energyB};
  }
  near(state.energyA,whole.energyA,1e-10);near(state.energyB,whole.energyB,1e-10);near(spent,whole.spentJoules,1e-10);
  assert.equal(whole.stopReason,'empty');
});

test('bad numerical input stays finite and reaction spikes cannot exceed the configured motor current',()=>{
  const capped=power.evaluate({...base,actualTorque:100,actualRpm:30},1);
  const rated=power.evaluate({...base,actualTorque:.4,actualRpm:30},1);
  assert.deepEqual(capped,rated);assert.equal(capped.torqueRatio,1);
  for(const state of [null,{}, {...base,actualRpm:Number.MAX_VALUE,load:-4,maxTorque:NaN,energyA:Infinity}, {...base,actualTorque:NaN,actualRpm:Infinity,capacity:NaN}]){
    const result=power.evaluate(state,1);
    for(const value of Object.values(result))if(typeof value==='number')assert(Number.isFinite(value));
    assert(result.energyA>=0&&result.energyA<=1);assert(result.energyB>=0&&result.energyB<=1);
  }
});
