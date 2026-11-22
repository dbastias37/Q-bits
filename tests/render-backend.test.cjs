const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/js/graphics.js'),'utf8'),sandbox);
const api=sandbox.window.QBitsGraphics,attributes=[[0,0],[1,12],[2,0],[3,12]];
function fakeGL(mode){
 const states=new Map([[null,{pointers:new Map(),enabled:new Set()}]]),calls=[];let current=null,buffer=null,next=0;
 const create=()=>{const vao={id:++next};states.set(vao,{pointers:new Map(),enabled:new Set()});calls.push('create');return vao;};
 const bind=vao=>{assert(states.has(vao));current=vao;calls.push('bind');};
 const remove=vao=>{states.delete(vao);if(current===vao)current=null;calls.push('delete');};
 const gl={ARRAY_BUFFER:1,FLOAT:2,bindBuffer(_,value){buffer=value;},vertexAttribPointer(location,size,type,normalized,stride,offset){states.get(current).pointers.set(location,{buffer,size,type,normalized,stride,offset});calls.push('pointer');},enableVertexAttribArray(location){states.get(current).enabled.add(location);},disableVertexAttribArray(location){states.get(current).enabled.delete(location);},getExtension:()=>mode==='extension'?{createVertexArrayOES:create,bindVertexArrayOES:bind,deleteVertexArrayOES:remove}:null};
 if(mode==='core')Object.assign(gl,{createVertexArray:create,bindVertexArray:bind,deleteVertexArray:remove});
 return {gl,calls,states,get current(){return current;},snapshot(){return JSON.stringify([...states.get(current).pointers]);}};
}
test('renderer prefers WebGL 2 with identical context options and falls back to WebGL 1',()=>{
 const calls=[],gl2={},gl1={};
 let result=api.context({getContext(type,options){calls.push({type,options});return type==='webgl2'?gl2:gl1;}});
 assert.equal(result.gl,gl2);assert.equal(result.version,2);assert.equal(calls.length,1);
 calls.length=0;result=api.context({getContext(type,options){calls.push({type,options});return type==='webgl2'?null:gl1;}});
 assert.equal(result.gl,gl1);assert.equal(result.version,1);assert.deepEqual(calls.map(x=>x.type),['webgl2','webgl']);
 assert.equal(calls[0].options,calls[1].options);assert.equal(calls[0].options.antialias,true);assert.equal(calls[0].options.depth,true);
 result=api.context({getContext(type){if(type==='webgl2')throw Error('unsupported');return gl1;}});assert.equal(result.gl,gl1);
 result=api.context({getContext(){return null;}});assert.equal(result.gl,null);assert.equal(result.version,0);
});
for(const mode of ['core','extension'])test(mode+' vertex arrays reuse layouts and isolate screen effects',()=>{
 const f=fakeGL(mode),bindings=api.geometryBindings(f.gl,attributes),buffer={};assert(bindings.supported);
 bindings.bind(buffer);const ordinary=f.current,ordinaryState=f.snapshot();assert.equal(f.calls.filter(x=>x==='pointer').length,4);
 bindings.bind(buffer,true);const batched=f.current;assert.notEqual(batched,ordinary);
 assert.equal(f.states.get(batched).pointers.get(2).stride,48);assert.equal(f.states.get(batched).pointers.get(2).offset,24);
 bindings.bind(buffer,'outline');const outline=f.current;assert.equal(f.states.get(outline).pointers.get(2).stride,36);assert.equal(f.states.get(outline).pointers.get(3).offset,24);
 bindings.unbind();assert.equal(f.current,null);f.gl.bindBuffer(1,{effect:true});f.gl.vertexAttribPointer(0,2,2,false,0,0);f.gl.disableVertexAttribArray(1);
 const pointerCount=f.calls.filter(x=>x==='pointer').length;
 for(let i=0;i<10;i++){bindings.bind(buffer);assert.equal(f.snapshot(),ordinaryState);bindings.bind(buffer,true);assert.equal(f.current,batched);bindings.bind(buffer,'outline');assert.equal(f.current,outline);}
 assert.equal(f.calls.filter(x=>x==='pointer').length,pointerCount);assert.equal(f.states.get(ordinary).enabled.size,4);
 bindings.release(buffer);assert.equal(f.states.size,1);assert.equal(f.current,null);assert.equal(f.calls.filter(x=>x==='delete').length,3);
 bindings.bind(buffer);assert.notEqual(f.current,ordinary);assert.equal(f.calls.filter(x=>x==='create').length,4);
});
test('renderer keeps every attribute layout when vertex arrays are unavailable',()=>{
 const f=fakeGL('none'),bindings=api.geometryBindings(f.gl,attributes),buffer={};assert(!bindings.supported);
 bindings.bind(buffer);assert.equal(f.states.get(null).pointers.get(2).offset,0);
 bindings.bind(buffer,true);assert.equal(f.states.get(null).pointers.get(2).offset,24);assert.equal(f.states.get(null).pointers.get(3).offset,36);
 bindings.bind(buffer,'outline');assert.equal(f.states.get(null).pointers.get(0).stride,36);assert.equal(f.states.get(null).pointers.get(3).offset,24);
 bindings.unbind();bindings.release(buffer);assert.equal(f.states.size,1);
});
test('failed vertex array allocation retains the regular rendering path',()=>{
 const f=fakeGL('core');f.gl.createVertexArray=()=>null;
 const bindings=api.geometryBindings(f.gl,attributes);bindings.bind({},true);
 assert.equal(f.current,null);assert.equal(f.states.get(null).pointers.size,4);assert.equal(f.states.get(null).pointers.get(3).offset,36);
});
