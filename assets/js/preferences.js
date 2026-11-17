/* Preferences: independent per-style profiles; edits are transactions. */
(function(root){
 'use strict';
 const KEY='qbits.preferences.v1';
 const C=root.QBitsControls||(typeof require==='function'?require('./controls.js'):null),S=root.QBitsSubtitles||(typeof require==='function'?require('./subtitles.js'):null);
 const styles={
  clean:{dither:0,bits:8,jitter:0,warp:0,cel:0,bloom:false,bloomStrength:20,outlineColor:'#58abc0',cableColor:'#b56e24',pathColor:'#58abc0',outlineWidth:2.5,pathWidth:2.5},
  psx:{dither:55,bits:5,jitter:45,warp:60,cel:0,bloom:false,bloomStrength:15,outlineColor:'#63b7c4',cableColor:'#b56e24',pathColor:'#63b7c4',outlineWidth:2,pathWidth:2.5},
  neon:{dither:35,bits:6,jitter:0,warp:0,cel:0,bloom:true,bloomStrength:45,outlineColor:'#00e6c2',cableColor:'#b56e24',pathColor:'#25d9ff',outlineWidth:3,pathWidth:3},
  cel:{dither:0,bits:8,jitter:0,warp:0,cel:4,bloom:false,bloomStrength:15,outlineColor:'#263a43',cableColor:'#b56e24',pathColor:'#53adbc',outlineWidth:3.5,pathWidth:3}
 };
 const quality={low:{resolution:65,shadows:'off',lighting:0,anisotropy:1,filter:'linear',fps:30,sampling:1},balanced:{resolution:100,shadows:'soft',lighting:35,anisotropy:4,filter:'trilinear',fps:60,sampling:1},high:{resolution:100,shadows:'sharp',lighting:75,anisotropy:8,filter:'trilinear',fps:0,sampling:1.5}};
 const copy=x=>JSON.parse(JSON.stringify(x));
 function defaults(){return {version:1,style:'clean',quality:'balanced',...quality.balanced,textureScale:1,physicsHz:240,culling:true,markers:true,markerMotion:true,music:true,volume:30,guideVoice:true,guideVolume:35,footsteps:true,footstepVolume:55,joinSounds:true,joinVolume:60,grabSpeed:1,invertObjectDistance:false,invertPieceRotation:false,controls:C.defaults(),subtitles:S.defaults(),profiles:copy(styles)};}
 const limit=(v,a,b,f)=>typeof v==='number'&&Number.isFinite(v)?Math.max(a,Math.min(b,v)):f;
 const pick=(v,opts,f)=>opts.includes(v)?v:f;
 function sanitize(raw){
  const d=defaults(),s=raw&&typeof raw==='object'?raw:{};
  d.style=pick(s.style,Object.keys(styles),d.style);d.quality=pick(s.quality,[...Object.keys(quality),'custom'],d.quality);
  for(const [k,a,b]of [['resolution',50,150],['lighting',0,100],['volume',0,100],['guideVolume',0,100],['footstepVolume',0,100],['joinVolume',0,100]])d[k]=limit(s[k],a,b,d[k]);
  for(const [k,opts]of Object.entries({shadows:['off','soft','sharp'],anisotropy:[1,2,4,8,16],filter:['nearest','linear','trilinear'],fps:[0,30,60,120],sampling:[1,1.5,2],textureScale:[.25,.5,1,2,4],grabSpeed:[1,2,3.5],physicsHz:[240,120,60]}))d[k]=pick(s[k],opts,d[k]);
  for(const k of ['culling','markers','markerMotion','music','guideVoice','footsteps','joinSounds','invertObjectDistance','invertPieceRotation'])if(typeof s[k]==='boolean')d[k]=s[k];
  for(const name of Object.keys(styles)){
   const p=s.profiles?.[name]||{},out=d.profiles[name];
   for(const k of ['dither','jitter','warp','bloomStrength'])out[k]=limit(p[k],0,100,out[k]);
   out.bits=Math.round(limit(p.bits,3,8,out.bits));out.cel=Math.round(limit(p.cel,0,8,out.cel));
   for(const k of ['outlineWidth','pathWidth'])out[k]=limit(p[k],1,6,out[k]);
   for(const k of ['outlineColor','pathColor','cableColor'])if(/^#[a-f0-9]{6}$/i.test(p[k]))out[k]=p[k].toLowerCase();
   if(typeof p.bloom==='boolean')out.bloom=p.bloom;
  }
  d.controls=C.sanitize(s.controls);d.subtitles=S.sanitize(s.subtitles);
  return d;
 }
 function load(storage){try{const raw=storage.getItem(KEY);if(raw)return sanitize(JSON.parse(raw));const d=defaults(),m=JSON.parse(storage.getItem('qbits.music.v1'));if(m){d.volume=limit(m.volume*100,0,100,30);d.music=!m.muted;}return d;}catch{return defaults();}}
 function transaction(storage){let saved=load(storage),draft=copy(saved);return {
  get saved(){return copy(saved);},get draft(){return draft;},get dirty(){return JSON.stringify(draft)!==JSON.stringify(saved);},
  begin(){draft=copy(saved);return draft;},replace(v){draft=sanitize(v);},discard(){draft=copy(saved);},
  save(){const next=sanitize(draft);storage.setItem(KEY,JSON.stringify(next));saved=next;draft=copy(next);return copy(saved);}
 };}
 function effective(s){return {...s,...s.profiles[s.style]};}
 function setQuality(s,name){if(!quality[name])return;Object.assign(s,quality[name],{quality:name});}
 function rgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);}
 const api={KEY,styles,quality,defaults,sanitize,load,transaction,effective,setQuality,rgb};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.QBitsPreferences=api;
})(typeof window==='object'?window:globalThis);

