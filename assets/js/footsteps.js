/* Optional, cached footfalls. Three nearby groups, six short sources at most. */
(function(root){
 'use strict';
 const RANGE=6,NEAR=1.8,MAX_GROUPS=3,MAX_VOICES=6,FADE=.18;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function spatial(position,listener,yaw){
  const x=position.x-listener[0],y=position.y-listener[1],z=position.z-listener[2],distance=Math.hypot(x,y,z);
  const t=clamp((distance-NEAR)/(RANGE-NEAR),0,1);
  return {distance,gain:(1-t)*(1-t)*(1+2*t),pan:clamp((x*Math.cos(yaw)-z*Math.sin(yaw))/Math.max(.3,Math.hypot(x,z)),-1,1)};
 }
 function create({host=root,manifest='assets/audio/footsteps/qbits/steps.json',random=Math.random}={}){
  let context=null,master=null,loading=null,buffers=[],enabled=true,volume=.55,paused=false,last=-1,clock=.05;
  let listener=[0,1.68,0],yaw=0;
  const channels=[],live=new Set(),stats={missing:0};
  host.document?.addEventListener?.('visibilitychange',()=>{if(host.document.hidden)reset();});
  function ensureContext(){
   if(context)return context;
   // Share the guide's context; each bank retains its independent mixer.
   context=host.QBitsGuideAudio?.getContext?.()||null;
   if(!context){const Context=host.AudioContext||host.webkitAudioContext;if(!Context)return null;context=new Context();}
   master=context.createGain();master.gain.value=volume;master.connect(context.destination);return context;
  }
  async function request(url,json=false){
   const controller=new host.AbortController(),timer=host.setTimeout(()=>controller.abort(),6000);
   try{
    const response=await host.fetch(url,{signal:controller.signal,cache:'no-cache'});
    if(!response.ok)throw Error('Missing footstep');
    if(json)return await response.json();
    if(Number(response.headers?.get('content-length'))>524288)throw Error('Footstep too large');
    const data=await response.arrayBuffer();if(data.byteLength>524288)throw Error('Footstep too large');return data;
   }finally{host.clearTimeout(timer);}
  }
  function preload(){
   if(loading)return loading;
   loading=(async()=>{
    if(!host.fetch||!ensureContext())return;
    const config=await request(manifest,true),base=new URL(manifest,host.document.baseURI);
    const names=[...new Set((Array.isArray(config.clips)?config.clips:[]).slice(0,8).filter(n=>typeof n==='string'&&/^[a-zA-Z0-9_-]+\.(wav|ogg|mp3)$/i.test(n)))];
    const loaded=await Promise.all(names.map(async name=>{
     try{
      const buffer=await context.decodeAudioData(await request(new URL(name,base).href));
      if(!Number.isFinite(buffer.duration)||buffer.duration<.015||buffer.duration>2)throw Error('Invalid footstep duration');
      return buffer;
     }catch{stats.missing++;return null;}
    }));buffers=loaded.filter(Boolean);
   })().catch(()=>{});return loading;
  }
  function unlock(){
   try{const ctx=ensureContext();if(ctx?.state==='suspended')ctx.resume()?.catch?.(()=>{});}catch{}
   return preload();
  }
  function ramp(param,value,tau=.06){
   const now=context.currentTime;
   // Holding the current value avoids jumps when a previous fade is interrupted.
   if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(now);
   else{const current=param.value;param.cancelScheduledValues(now);param.setValueAtTime(current,now);}
   param.setTargetAtTime(value,now,tau);
  }
  function newChannel(){
   const gain=context.createGain(),pan=context.createStereoPanner?.();gain.gain.value=0;
   if(pan){gain.connect(pan);pan.connect(master);}else gain.connect(master);
   const channel={gain,pan,key:null,position:null,wanted:false,voices:0,nextAt:0,releaseAt:0,target:0,panning:0};
   channels.push(channel);return channel;
  }
  function update(point,angle,candidates,dt=.05){
   if(paused||!enabled||!volume||!buffers.length||!context||context.state!=='running'||host.document?.hidden)return;
   clock+=dt;if(clock<.05)return;clock=0;
   listener=[...point];yaw=angle;const now=context.currentTime,nearest=[];
   // Bounded insertion instead of sorting every cube or making audio nodes for it.
   for(const item of candidates){
    const p=item.position,dx=p.x-listener[0],dy=p.y-listener[1],dz=p.z-listener[2],d2=dx*dx+dy*dy+dz*dz;
    if(d2>=RANGE*RANGE)continue;
    const current=channels.find(c=>c.key===item.key&&c.wanted),score=d2*(current ? .8 : 1);
    const i=nearest.findIndex(n=>score<n.score);
    if(i<0){if(nearest.length<MAX_GROUPS)nearest.push({...item,score});}
    else{nearest.splice(i,0,{...item,score});if(nearest.length>MAX_GROUPS)nearest.pop();}
   }
   for(const c of channels){
    if(c.key&&!nearest.some(n=>n.key===c.key)&&c.wanted){c.wanted=false;c.releaseAt=now+FADE;c.target=0;ramp(c.gain.gain,0);}
    if(!c.wanted&&now>=c.releaseAt&&!c.voices){c.key=null;c.position=null;}
   }
   for(const item of nearest){
    let c=channels.find(c=>c.key===item.key);
    if(!c){
     c=channels.find(c=>!c.key&&!c.voices)||(channels.length<MAX_GROUPS*2?newChannel():null);
     if(!c)continue;
     c.key=item.key;c.nextAt=0;c.gain.gain.cancelScheduledValues(now);c.gain.gain.setValueAtTime(0,now);
     if(c.pan){c.pan.pan.cancelScheduledValues(now);c.pan.pan.setValueAtTime(spatial(item.position,listener,yaw).pan,now);}
    }
    c.position=item.position;c.wanted=true;c.releaseAt=0;
    const sound=spatial(c.position,listener,yaw);c.target=sound.gain*.32;c.panning=sound.pan;
    ramp(c.gain.gain,c.target);if(c.pan)ramp(c.pan.pan,sound.pan,.025);
   }
  }
  function step(key){
   if(paused||!enabled||!volume||!buffers.length||!context||context.state!=='running'||host.document?.hidden||live.size>=MAX_VOICES)return false;
   const c=channels.find(c=>c.key===key&&c.wanted),now=context.currentTime;
   if(!c||c.voices>=2||now<c.nextAt||spatial(c.position,listener,yaw).distance>=RANGE)return false;
   let i=Math.floor(random()*(buffers.length-(last>=0&&buffers.length>1?1:0)));
   if(buffers.length>1&&last>=0&&i>=last)i++;
   const buffer=buffers[i],rate=Math.pow(2,((random()*2-1)*.45)/12),duration=Math.min(.45,buffer.duration/rate);
   const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;source.playbackRate.value=rate;
   gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.9+random()*.1,now+.003);
   gain.gain.setValueAtTime(.9,now+Math.max(.004,duration-.018));gain.gain.linearRampToValueAtTime(0,now+duration);
   source.connect(gain);gain.connect(c.gain);const voice={source,gain,stopping:false};live.add(voice);c.voices++;
   source.onended=()=>{if(!live.delete(voice))return;c.voices--;source.disconnect();gain.disconnect();};
   source.start(now);source.stop(now+duration);c.nextAt=now+.12;last=i;return true;
  }
  function reset(){
   clock=.05;
   if(!context)return;
   for(const c of channels){c.wanted=false;c.key=null;c.position=null;c.target=0;c.releaseAt=0;ramp(c.gain.gain,0,.004);}
   for(const voice of live){if(voice.stopping)continue;voice.stopping=true;
    try{ramp(voice.gain.gain,0,.002);voice.source.stop(context.currentTime+.008);}catch{voice.source.onended();}
   }
  }
  function setPaused(value){const next=!!value;if(next&&!paused)reset();paused=next;}
  function configure(settings={}){
   enabled=settings.footsteps!==false;volume=Number.isFinite(settings.footstepVolume)?clamp(settings.footstepVolume,0,100)/100:.55;
   if(master)ramp(master.gain,volume,.01);if(!enabled||!volume)reset();
  }
  return {preload,unlock,update,step,reset,setPaused,configure,getState:()=>({...stats,loaded:buffers.length,active:live.size,selected:channels.filter(c=>c.wanted).length,channels:channels.length,enabled,volume})};
 }
 if(typeof module==='object'&&module.exports)module.exports={create,spatial};
 else root.QBitsFootsteps=create();
})(typeof window==='object'?window:globalThis);
