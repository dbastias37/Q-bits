/* One cached voice bank for the guide. Text revelation is the only audio clock. */
(function(root){
 'use strict';
 function create({host=root,manifest='assets/audio/dialogue/guide/voice.json',random=Math.random}={}){
  let context=null,master=null,loading=null,buffers=[],endings=[],last=-1,lastEnd=-1;
  let text='',cursor=0,letters=0,finished=false,voiced=false,paused=false,enabled=true,volume=.35;
  let nextAt=0,played=false,wordIndex=0,words=[],wordGroups=[],baseNames=[];
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
    baseNames=names.slice(0,2).filter(valid);
    wordGroups=(Array.isArray(config.wordGroups)?config.wordGroups:[]).slice(0,8)
     .filter(group=>group&&Array.isArray(group.clips)&&(group.maxLetters===null||Number.isFinite(group.maxLetters)&&group.maxLetters>0))
     .map(group=>({max:group.maxLetters===null?Infinity:group.maxLetters,names:group.clips.filter(valid)})).sort((a,b)=>a.max-b.max);
    const files=[...new Set(names.filter(valid))].map(name=>({name,end:false}));
    const endNames=Array.isArray(config.ends)?config.ends.slice(0,3):[config.end];
    for(const name of new Set(endNames.filter(valid)))files.push({name,end:true});
    await Promise.all(files.map(async file=>{
     try{
      const data=await request(new URL(file.name,base).href),buffer=await context.decodeAudioData(data);
      if(!Number.isFinite(buffer.duration)||buffer.duration<.008||buffer.duration>2)throw new Error('Invalid voice duration');
      if(file.end)endings.push(buffer);else buffers.push({name:file.name,buffer});
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
  function begin(value,{voice=true,timing=null}={}){
   silence();text=String(value);cursor=0;letters=0;finished=false;voiced=voice;played=false;nextAt=0;wordIndex=0;
   const Timing=host.QBitsDialogueTiming||(typeof require==='function'?require('./dialogue-timing.js'):null);
   words=(timing?.words||Timing?.words(text)||[]).map(word=>({...word,clip:null}));
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
   while(wordIndex+1<words.length&&words[wordIndex+1].start<count)wordIndex++;
   if(!voiced||paused||!enabled||volume===0||host.document?.hidden||!context||context.state!=='running'||delta>8){letters=0;if(count===text.length)finished=true;return;}
   const now=context.currentTime;
   if(count===text.length){
    finished=true;
    if(played&&endings.length)playEnding();
    else if(/[\p{L}\p{N}]/u.test(chunk)&&now>=nextAt)blip(now);
    return;
   }
   if(/[,;:.!?…]/.test(chunk)){letters=0;nextAt=Math.max(nextAt,now+(/[.!?…]/.test(chunk)?.18:.09));return;}
   letters+=(chunk.match(/[\p{L}\p{N}]/gu)||[]).length;
   if(letters>=3&&now>=nextAt){letters=0;blip(now);}
  }
  function playEnding(){
   let i=0;
   if(endings.length>1){
    i=Math.floor(random()*(endings.length-(lastEnd>=0?1:0)));
    if(lastEnd>=0&&i>=lastEnd)i++;
   }
   if(play(endings[i],true))lastEnd=i;
  }
  function blip(now){
   if(!buffers.length)return;
   const word=words[wordIndex];
   if(!word)return;
   let clip=word.clip;
   if(!clip){
    const group=wordGroups.find(group=>word.length<=group.max);
    let pool=group?buffers.filter(item=>group.names.includes(item.name)):buffers;
    if(!pool.length)pool=buffers.filter(item=>baseNames.includes(item.name));
    if(!pool.length)pool=buffers;
    const alternatives=pool.filter(item=>item!==last);
    if(alternatives.length)pool=alternatives;
    clip=pool[Math.floor(random()*pool.length)];word.clip=clip;
   }
   if(play(clip.buffer)){last=clip;played=true;nextAt=now+.09;}
  }
  function setPaused(value){paused=!!value;if(paused)silence();}
  function configure(settings={}){
   enabled=settings.guideVoice!==false;
   volume=Number.isFinite(settings.guideVolume)?Math.max(0,Math.min(100,settings.guideVolume))/100:.35;
   if(master){master.gain.cancelScheduledValues(context.currentTime);master.gain.setTargetAtTime(volume,context.currentTime,.01);}
   if(!enabled||!volume)silence();
  }
  return {preload,unlock,begin,reveal,stop,setPaused,configure,getState:()=>({...stats,clips:buffers.length,hasEnd:endings.length>0,ends:endings.length,active:live.size,enabled,volume})};
 }
 if(typeof module==='object'&&module.exports)module.exports={create};
 else root.QBitsGuideAudio=create();
})(typeof window==='object'?window:globalThis);
