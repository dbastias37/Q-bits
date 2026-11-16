/* One cached voice bank for the guide. Text revelation is the only audio clock. */
(function(root){
 'use strict';
 function create({host=root,manifest='assets/audio/dialogue/guide/voice.json',random=Math.random}={}){
  let context=null,master=null,loading=null,buffers=[],ending=null,last=-1;
  let text='',cursor=0,letters=0,finished=false,voiced=false,paused=false,enabled=true,volume=.35;
  let nextAt=0,played=false;
  const live=new Set(),stats={loaded:0,missing:0};
  function ensureContext(){
   if(context)return context;
   const Context=host.AudioContext||host.webkitAudioContext;
   if(!Context)return null;
   context=new Context();master=context.createGain();master.gain.value=volume;master.connect(context.destination);
   return context;
  }
  async function request(url,json=false){
   const controller=new host.AbortController();
   const timer=host.setTimeout(()=>controller.abort(),6000);
   try{
    const response=await host.fetch(url,{signal:controller.signal,cache:'no-cache'});
    if(!response.ok)throw new Error('Missing voice asset');
    if(json)return await response.json();
    if(Number(response.headers?.get('content-length'))>524288)throw new Error('Voice clip too large');
    const data=await response.arrayBuffer();
    if(data.byteLength>524288)throw new Error('Voice clip too large');
    return data;
   }finally{host.clearTimeout(timer);}
  }
  function preload(){
   if(loading)return loading;
   loading=(async()=>{
    if(!host.fetch||!ensureContext())return;
    const config=await request(manifest,true),base=new URL(manifest,host.document.baseURI);
    const names=Array.isArray(config.clips)?config.clips.slice(0,8):[];
    const valid=name=>typeof name==='string'&&/^[a-zA-Z0-9_-]+\.(wav|ogg|mp3)$/i.test(name);
    const files=[...new Set(names.filter(valid))].map(name=>({name,end:false}));
    if(valid(config.end))files.push({name:config.end,end:true});
    await Promise.all(files.map(async file=>{
     try{
      const data=await request(new URL(file.name,base).href),buffer=await context.decodeAudioData(data);
      if(!Number.isFinite(buffer.duration)||buffer.duration<.008||buffer.duration>2)throw new Error('Invalid voice duration');
      if(file.end)ending=buffer;else buffers.push(buffer);
      stats.loaded++;
     }catch{stats.missing++;}
    }));
   })().catch(()=>{});
   return loading;
  }
  function unlock(){
   // Resume is invoked directly in a click/keyboard gesture, before awaiting fetches.
   try{const ctx=ensureContext();if(ctx?.state==='suspended')ctx.resume()?.catch?.(()=>{});}catch{}
   return preload();
  }
  function silence(){
   for(const entry of live){
    if(entry.stopping)continue;entry.stopping=true;
    try{
     const now=context.currentTime;
     entry.gain.gain.cancelScheduledValues(now);entry.gain.gain.setTargetAtTime(0,now,.002);entry.source.stop(now+.008);
    }catch{entry.source.disconnect();entry.gain.disconnect();live.delete(entry);}
   }
  }
  function stop(){silence();voiced=false;finished=true;}
  function begin(value,{voice=true}={}){
   silence();text=String(value);cursor=0;letters=0;finished=false;voiced=voice;played=false;nextAt=0;
  }
  function play(buffer,end=false){
   if(!buffer||!context||context.state!=='running'||paused||!enabled||volume===0||host.document?.hidden||live.size>=(end?2:1))return false;
   const now=context.currentTime,rate=end?1:Math.pow(2,((random()*2-1)*.65)/12);
   const duration=Math.min(buffer.duration/rate,end ? .22 : .12),source=context.createBufferSource(),gain=context.createGain();
   source.buffer=buffer;source.playbackRate.value=rate;
   gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(1,now+.004);
   gain.gain.setValueAtTime(1,now+Math.max(.004,duration-.009));gain.gain.linearRampToValueAtTime(0,now+duration);
   source.connect(gain);gain.connect(master);
   const entry={source,gain};live.add(entry);
   source.onended=()=>{live.delete(entry);source.disconnect();gain.disconnect();};
   source.start(now);source.stop(now+duration);return true;
  }
  function reveal(count,{skip=false}={}){
   count=Math.min(text.length,Math.max(cursor,Math.floor(Number(count)||0)));
   const delta=count-cursor;
   if(skip){cursor=count;stop();return;}
   if(!delta||finished)return;
   // Never catch up a long frame with a burst. Only newly visible characters count.
   const chunk=text.slice(cursor,count);cursor=count;
   if(!voiced||paused||!enabled||volume===0||host.document?.hidden||!context||context.state!=='running'||delta>8){letters=0;if(count===text.length)finished=true;return;}
   const now=context.currentTime;
   if(count===text.length){
    finished=true;
    if(played&&ending)play(ending,true);
    else if(/[\p{L}\p{N}]/u.test(chunk)&&now>=nextAt)blip(now);
    return;
   }
   if(/[,;:.!?…]/.test(chunk)){letters=0;nextAt=Math.max(nextAt,now+(/[.!?…]/.test(chunk)?.18:.09));return;}
   letters+=(chunk.match(/[\p{L}\p{N}]/gu)||[]).length;
   if(letters>=3&&now>=nextAt){letters=0;blip(now);}
  }
  function blip(now){
   if(!buffers.length)return;
   let i=Math.floor(random()*buffers.length);
   if(buffers.length>1&&i===last)i=(i+1)%buffers.length;
   if(play(buffers[i])){last=i;played=true;nextAt=now+.09;}
  }
  function setPaused(value){paused=!!value;if(paused)silence();}
  function configure(settings={}){
   enabled=settings.guideVoice!==false;
   volume=Number.isFinite(settings.guideVolume)?Math.max(0,Math.min(100,settings.guideVolume))/100:.35;
   if(master){master.gain.cancelScheduledValues(context.currentTime);master.gain.setTargetAtTime(volume,context.currentTime,.01);}
   if(!enabled||!volume)silence();
  }
  return {preload,unlock,begin,reveal,stop,setPaused,configure,getState:()=>({...stats,clips:buffers.length,hasEnd:!!ending,active:live.size,enabled,volume})};
 }
 if(typeof module==='object'&&module.exports)module.exports={create};
 else root.QBitsGuideAudio=create();
})(typeof window==='object'?window:globalThis);
