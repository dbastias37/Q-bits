/* Subtitle appearance is independent from dialogue progression and gameplay. */
(function(root){
 'use strict';
 const base={
  npc:{enabled:true,color:'#34423a',size:16,background:'#fbfdfb',opacity:93},
  qbits:{enabled:true,color:'#385444',size:15,background:'#fbfffc',opacity:96}
 };
 const copy=value=>JSON.parse(JSON.stringify(value));
 const color=(value,fallback)=>typeof value==='string'&&/^#[a-f0-9]{6}$/i.test(value)?value.toLowerCase():fallback;
 const number=(value,min,max,fallback)=>typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
 function defaults(){return copy(base);}
 function sanitize(raw){
  const result=defaults();
  for(const channel of ['npc','qbits']){
   const input=raw?.[channel]||{},out=result[channel];
   if(typeof input.enabled==='boolean')out.enabled=input.enabled;
   out.color=color(input.color,out.color);out.background=color(input.background,out.background);
   out.size=number(input.size,12,32,out.size);out.opacity=number(input.opacity,0,100,out.opacity);
  }
  return result;
 }
 function background(channel){
  const hex=color(channel?.background,base.qbits.background),rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  return 'rgba('+rgb.join(',')+','+number(channel?.opacity,0,100,96)/100+')';
 }
 function styleObject(channel){return {color:color(channel?.color,base.qbits.color),fontSize:number(channel?.size,12,32,15)+'px',backgroundColor:background(channel)};}
 function apply(preferences,element=root.document?.body){
  const settings=sanitize(preferences?.subtitles||preferences);
  if(!element)return settings;
  for(const name of ['npc','qbits']){
   const channel=settings[name],style=styleObject(channel);
   element.dataset[name+'Subtitles']=channel.enabled?'on':'off';
   element.style.setProperty('--subtitle-'+name+'-color',style.color);
   element.style.setProperty('--subtitle-'+name+'-size',style.fontSize);
   element.style.setProperty('--subtitle-'+name+'-background',style.backgroundColor);
  }
  // The original black-screen invocation has a deliberately different theme.
  // Preserve it only while all NPC visual values are the defaults; explicit
  // customization applies there too, with its own readable text background.
  element.dataset.npcSubtitleCustom=String(['color','size','background','opacity'].some(key=>settings.npc[key]!==base.npc[key]));
  return settings;
 }
 const api={defaults,sanitize,apply,styleObject};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.QBitsSubtitles=api;
})(typeof window==='object'?window:globalThis);
