(function(root,factory){'use strict';const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.QBitsContacts=model;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function create(){return {latched:false,clearSeconds:0};}
 function step(state,contact,dt,paused=false){
  state=state&&typeof state==='object'?state:create();
  if(paused||!Number.isFinite(dt)||dt<=0)return {state,fire:false};
  if(contact)return {state:{latched:true,clearSeconds:0},fire:!state.latched};
  const clearSeconds=Math.min(.08,(Number.isFinite(state.clearSeconds)?state.clearSeconds:0)+dt);
  return {state:{latched:clearSeconds<.08&&!!state.latched,clearSeconds},fire:false};
 }
 return Object.freeze({create,step});
});
