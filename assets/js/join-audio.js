/* Four optional joining impacts, independent of voice and walking sounds. */
(function(root){
 'use strict';
 function create({host=root,manifest='assets/audio/joins/qbits/joins.json',random=Math.random}={}){
  const spatial=host.QBitsFootsteps?.spatial||(typeof require==='function'?require('./footsteps.js').spatial:null);
  const live=new Set(),stats={missing:0};
  let context=null,master=null,loading=null,buffers=[],last=-1,nextAt=0,paused=false,enabled=true,volume=.6,clock=0;
  function ensureContext(){
   if(context)return context;
   context=host.QBitsGuideAudio?.getContext?.()||null;
   if(!context){const Context=host.AudioContext||host.webkitAudioContext;if(!Context)return null;context=new Context();}
   master=context.createGain();master.gain.value=volume;master.connect(context.destination);return context;
  }
  async function request(url,json=false){
   const controller=new host.AbortController(),timer=host.setTimeout(()=>controller.abort(),6000);
   try{
    const response=await host.fetch(url,{signal:controller.signal,cache:'no-cache'});
    if(!response.ok)throw Error('Missing join sound');
    if(json)return await response.json();
    if(Number(response.headers?.get('content-length'))>524288)throw Error('Join clip too large');
    const data=await response.arrayBuffer();if(data.byteLength>524288)throw Error('Join clip too large');return data;
   }finally{host.clearTimeout(timer);}
  }
  function preload(){
   if(loading)return loading;
   loading=(async()=>{
    if(!host.fetch||!ensureContext())return;
    const config=await request(manifest,true),base=new URL(manifest,host.document.baseURI);
    const names=[...new Set((Array.isArray(config.clips)?config.clips:[]).slice(0,4).filter(n=>typeof n==='string'&&/^[a-zA-Z0-9_-]+\.(wav|ogg|mp3)$/i.test(n)))];
    const loaded=await Promise.all(names.map(async name=>{
     try{const buffer=await context.decodeAudioData(await request(new URL(name,base).href));
      if(!Number.isFinite(buffer.duration)||buffer.duration<.015||buffer.duration>2)throw Error('Invalid join duration');return buffer;
     }catch{stats.missing++;return null;}
    }));buffers=loaded.filter(Boolean);
   })().catch(()=>{});return loading;
  }
  function unlock(){
   try{const ctx=ensureContext();if(ctx?.state==='suspended')ctx.resume()?.catch?.(()=>{});}catch{}
   return preload();
  }
  function ramp(param,value,tau=.025){
   const now=context.currentTime;
   if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(now);
   else{const current=param.value;param.cancelScheduledValues(now);param.setValueAtTime(current,now);}
   param.setTargetAtTime(value,now,tau);
  }
  function play(point,listener,yaw){
   if(!spatial||!point||!['x','y','z'].every(k=>Number.isFinite(point[k]))||!Array.isArray(listener)||listener.length!==3||!listener.every(Number.isFinite)||!Number.isFinite(yaw))return false;
   if(paused||!enabled||!volume||host.document?.hidden||!buffers.length||!context||context.state!=='running'||live.size>=3||context.currentTime<nextAt)return false;
   const sound=spatial(point,listener,yaw);if(sound.gain<=0)return false;
   let i=Math.floor(random()*(buffers.length-(buffers.length>1&&last>=0?1:0)));
   if(buffers.length>1&&last>=0&&i>=last)i++;
   const buffer=buffers[i],rate=Math.pow(2,((random()*2-1)*.25)/12),duration=Math.min(.8,buffer.duration/rate),now=context.currentTime;
   const source=context.createBufferSource(),envelope=context.createGain(),gain=context.createGain(),pan=context.createStereoPanner?.();
   source.buffer=buffer;source.playbackRate.value=rate;
   envelope.gain.setValueAtTime(0,now);envelope.gain.linearRampToValueAtTime(1,now+.003);
   envelope.gain.setValueAtTime(1,now+Math.max(.003,duration-.02));envelope.gain.linearRampToValueAtTime(0,now+duration);
   gain.gain.value=sound.gain*.32;source.connect(envelope);envelope.connect(gain);
   if(pan){pan.pan.value=sound.pan;gain.connect(pan);pan.connect(master);}else gain.connect(master);
   // The seam is a snapshot: deleting/welding either original body cannot move it.
   const voice={source,envelope,gain,pan,point:{x:point.x,y:point.y,z:point.z},stopping:false};live.add(voice);
   source.onended=()=>{if(!live.delete(voice))return;source.disconnect();envelope.disconnect();gain.disconnect();pan?.disconnect();};
   source.start(now);source.stop(now+duration);last=i;nextAt=now+.04;return true;
  }
  function update(listener,yaw,dt){
   if(!live.size||paused)return;clock+=dt;if(clock<.05)return;clock=0;
   for(const voice of live){if(voice.stopping)continue;const sound=spatial(voice.point,listener,yaw);ramp(voice.gain.gain,sound.gain*.32);if(voice.pan)ramp(voice.pan.pan,sound.pan);}
  }
  function stop(){
   nextAt=0;clock=0;
   for(const voice of live){if(voice.stopping)continue;voice.stopping=true;
    try{ramp(voice.envelope.gain,0,.002);voice.source.stop(context.currentTime+.008);}catch{voice.source.onended();}
   }
  }
  function setPaused(value){const next=!!value;if(next&&!paused)stop();paused=next;}
  function configure(settings={}){
   enabled=settings.joinSounds!==false;volume=Number.isFinite(settings.joinVolume)?Math.max(0,Math.min(100,settings.joinVolume))/100:.6;
   if(master)ramp(master.gain,volume,.01);if(!enabled||!volume)stop();
  }
  host.document?.addEventListener?.('visibilitychange',()=>{if(host.document.hidden)stop();});
  return {preload,unlock,play,update,stop,setPaused,configure,getState:()=>({...stats,loaded:buffers.length,active:live.size,enabled,volume})};
 }
 if(typeof module==='object'&&module.exports)module.exports={create};
 else root.QBitsJoinAudio=create();
})(typeof window==='object'?window:globalThis);
