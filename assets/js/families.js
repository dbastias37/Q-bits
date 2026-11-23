(function(root){
 'use strict';
 const VERSION=1,CAPACITY=100,SPLIT_SIZE=10,MAX_NAME_LENGTH=40;
 const MAX_JSON_BYTES=2*1024*1024,MAX_JSON_DEPTH=24,MAX_STRING_LENGTH=512000,MAX_INPUT_PARTS=2000;
 const DEFAULT_NAME='Familia',DEFAULT_COLOR='#202327',SHAPES=['cube','pyramid','tetra','coupler'];
 const organizers=root.QBitsOrganizers||(typeof module==='object'&&module.exports?require('./organizers.js'):null);
 const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
 const positiveId=value=>Number.isSafeInteger(value)&&value>0;
 const vector=(value,size)=>Array.isArray(value)&&value.length===size&&value.every(n=>Number.isFinite(n)&&Math.abs(n)<=1000);
 const quaternion=value=>vector(value,4)&&Math.abs(Math.hypot(...value)-1)<=.001;
 const pairValid=pair=>pair&&positiveId(pair.aId)&&positiveId(pair.bId)&&pair.aId!==pair.bId;
 const pairKey=pair=>pair.aId+':'+pair.bId;
 function error(message,code='INVALID_FAMILY_ITEMS'){const failure=new Error(message);failure.code=code;return failure;}
 function sanitizeName(value,fallback=DEFAULT_NAME){
  const clean=text=>typeof text==='string'?Array.from(text.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200b\u202a-\u202e\u2066-\u2069\ufeff]/g,' ').replace(/\s+/g,' ').trim()).slice(0,MAX_NAME_LENGTH).join(''):'';
  return clean(value)||clean(fallback)||DEFAULT_NAME;
 }
 function sanitizeColor(value,fallback=DEFAULT_COLOR){
  const clean=color=>{if(typeof color!=='string')return null;const text=color.trim().toLowerCase();if(/^#[0-9a-f]{6}$/.test(text))return text;if(/^#[0-9a-f]{3}$/.test(text))return '#'+text.slice(1).split('').map(c=>c+c).join('');return null;};
  return clean(value)||clean(fallback)||DEFAULT_COLOR;
 }
 // Count actual material, not item snapshots: one intact rotor still owns two
 // pieces. These small readers assume validated data and never clone inventory.
 function count(items){let total=0;for(const item of items||[])for(const group of item.groups||[])total+=(group.parts||[]).length;return total;}
 function weight(items){let total=0;for(const item of items||[])for(const group of item.groups||[])for(const part of group.parts||[])total+=part.weight;return total;}
 function stats(items){let total=0,mass=0,batteries=0;const ids=new Set();for(const item of items||[])for(const group of item.groups||[])for(const part of group.parts||[]){total++;mass+=part.weight;ids.add(part.id);if(part.mood?.externalBattery)batteries++;}return {count:total,weight:mass,ids,batteries};}
 function plainObject(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const prototype=Object.getPrototypeOf(value);
  return prototype===null||Object.getPrototypeOf(prototype)===null&&Object.getOwnPropertyDescriptor(prototype,'constructor')?.value?.name==='Object';
 }
 // Compute UTF-8 JSON size without serializing an unbounded graph first. This
 // rejects cycles, getters, non-JSON values and deep input before any copy.
 function stringBytes(value){
  let size=2;
  for(let i=0;i<value.length;i++){
   const c=value.charCodeAt(i);
   if(c===34||c===92||c===8||c===9||c===10||c===12||c===13)size+=2;
   else if(c<32)size+=6;
   else if(c<128)size++;
   else if(c<2048)size+=2;
   else if(c>=0xd800&&c<=0xdbff&&i+1<value.length&&value.charCodeAt(i+1)>=0xdc00&&value.charCodeAt(i+1)<=0xdfff){size+=4;i++;}
   else size+=c>=0xd800&&c<=0xdfff?6:3;
  }
  return size;
 }
 function jsonSafe(value,maximum=MAX_JSON_BYTES,familyRecord=false){
  let bytes=0,nodes=0;const ancestors=new Set();
  const visit=(entry,depth)=>{
   if(depth>MAX_JSON_DEPTH||++nodes>250000)return false;
   if(entry===null){bytes+=4;return bytes<=maximum;}
   if(typeof entry==='string'){if(entry.length>MAX_STRING_LENGTH)return false;bytes+=stringBytes(entry);return bytes<=maximum;}
   if(typeof entry==='number'){if(!Number.isFinite(entry))return false;bytes+=String(entry).length;return bytes<=maximum;}
   if(typeof entry==='boolean'){bytes+=entry?4:5;return bytes<=maximum;}
   if(typeof entry!=='object'||ancestors.has(entry))return false;
   const array=Array.isArray(entry);if(!array&&!plainObject(entry))return false;
   const keys=Reflect.ownKeys(entry);if(keys.some(key=>typeof key!=='string'))return false;
   if(array&&(entry.length>250000||keys.length!==entry.length+1))return false;
   if(!array&&keys.length>512)return false;
   bytes+=2+Math.max(0,(array?entry.length:keys.length)-1);if(bytes>maximum)return false;ancestors.add(entry);
   for(const key of keys){
    if(array&&key==='length')continue;
    if(['__proto__','constructor','prototype'].includes(key)){ancestors.delete(entry);return false;}
    const descriptor=Object.getOwnPropertyDescriptor(entry,key);
    if(!descriptor?.enumerable||!own(descriptor,'value')||array&&(!/^\d+$/.test(key)||String(Number(key))!==key||Number(key)>=entry.length)){ancestors.delete(entry);return false;}
    if(!array){bytes+=stringBytes(key)+1;if(bytes>maximum){ancestors.delete(entry);return false;}}
    const before=bytes;
    if(!visit(descriptor.value,depth+1)||familyRecord&&depth===0&&key==='items'&&bytes-before>MAX_JSON_BYTES-2048){ancestors.delete(entry);return false;}
   }
   ancestors.delete(entry);return true;
  };
  try{return visit(value,0);}catch{return false;}
 }
 function signatureValid(value){return typeof value==='string'&&value.length>0&&value.split(',').length<=MAX_INPUT_PARTS&&value.split(',').every(part=>{const ids=part.split('-');return ids.length===2&&ids.every(id=>/^\d+$/.test(id)&&positiveId(Number(id)))&&ids[0]!==ids[1];});}
 function familySignaturePairs(value){
  if(typeof value!=='string'||!value.length)return null;
  const entries=value.split(',');if(entries.length>MAX_INPUT_PARTS)return null;
  const pairs=new Set(),endpoints=new Set();let previous=null;
  for(const entry of entries){
   const match=/^([1-9]\d*)-([1-9]\d*)$/.exec(entry);if(!match)return null;
   const aId=Number(match[1]),bId=Number(match[2]);
   if(!positiveId(aId)||!positiveId(bId)||aId===bId||endpoints.has(aId)||endpoints.has(bId)||previous&&(aId<previous.aId||aId===previous.aId&&bId<=previous.bId))return null;
   endpoints.add(aId);endpoints.add(bId);pairs.add(aId+':'+bId);previous={aId,bId};
  }
  return pairs;
 }
 function contactKeyValid(key){
  if(typeof key!=='string')return false;const fields=key.split(':');if(fields.length<2||!fields.slice(0,2).every(id=>/^\d+$/.test(id)&&positiveId(Number(id)))||fields[0]===fields[1])return false;
  if(fields.length===2)return true;if(fields.length===3)return ['start','stop'].includes(fields[2]);
  return fields[2]==='group'&&signatureValid(fields[3])&&(fields.length===4||fields.length===5&&['start','stop'].includes(fields[4]));
 }
 function rotorOptionsValid(joint){
  return Number.isFinite(joint.rpm)&&joint.rpm>=1&&joint.rpm<=(joint.driveRating===2?360:120)&&(joint.driveRating===undefined||joint.driveRating===2)&&[1,-1].includes(joint.direction)&&['a','b'].includes(joint.moving)&&typeof joint.enabled==='boolean'&&(joint.mount===undefined||['wheel','fixed'].includes(joint.mount))&&(joint.maxTorque===undefined||Number.isFinite(joint.maxTorque)&&joint.maxTorque>=.02&&joint.maxTorque<=(joint.driveRating===2?32:4))&&(joint.capacity===undefined||Number.isFinite(joint.capacity)&&joint.capacity>=2&&joint.capacity<=(joint.driveRating===2?16000:MAX_INPUT_PARTS));
 }
 function referencesValid(item,parts){
  const joints=new Set(item.joints.map(pairKey));
  // Sensor targets and gripper target filters may intentionally point outside
  // the stored item. Keep those references, but never activate stored modules.
  for(const part of parts.values()){
   const mood=part.mood;
   if(mood.blend!==undefined&&(!vector(mood.blend,3)||mood.blend.some(n=>n<0||n>1)))return false;
   if(mood.workshop?.ownerId!==undefined&&mood.workshop.ownerId!==part.id)return false;
   if(mood.sensorLink!==undefined){const link=mood.sensorLink;if(!plainObject(link)||!pairValid(link)||link.kind!==undefined&&(!['set','machine'].includes(link.kind)||!signatureValid(link.signature))||link.signature!==undefined&&!signatureValid(link.signature))return false;}
   if(mood.sensorMachine!==undefined){const machine=mood.sensorMachine;if(!plainObject(machine)||typeof machine.name!=='string'||!Array.isArray(machine.members)||machine.members.length>MAX_INPUT_PARTS||!machine.members.every(pairValid)||new Set(machine.members.map(pairKey)).size!==machine.members.length)return false;}
  }
  if(item.sets!==undefined){
   if(!Array.isArray(item.sets)||item.sets.length>item.joints.length)return false;const assigned=new Set();
   for(const set of item.sets){if(!plainObject(set)||typeof set.name!=='string'||!set.name.trim()||!Array.isArray(set.members)||!set.members.length||set.members.length>item.joints.length)return false;
    const original=set.familySignature===undefined?null:familySignaturePairs(set.familySignature);
    if(set.familySignature!==undefined&&(!original||set.members.some(pair=>!original.has(pairKey(pair)))))return false;
    for(const pair of set.members){if(!pairValid(pair)||!joints.has(pairKey(pair))||assigned.has(pairKey(pair)))return false;assigned.add(pairKey(pair));}
   }
  }
  if(item.contacts!==undefined){
   const contacts=item.contacts;if(!plainObject(contacts)||!Array.isArray(contacts.sensors)||!Array.isArray(contacts.rotors)||contacts.sensors.length>parts.size||contacts.rotors.length>MAX_INPUT_PARTS)return false;
   const seen=new Set(),valid=entry=>plainObject(entry)&&typeof entry.latched==='boolean'&&Number.isFinite(entry.clearSeconds)&&entry.clearSeconds>=0&&entry.clearSeconds<=.08;
   for(const entry of contacts.sensors){if(!valid(entry)||!parts.has(entry.id)||seen.has(entry.id))return false;seen.add(entry.id);}
   seen.clear();for(const entry of contacts.rotors){if(!valid(entry)||!contactKeyValid(entry.key)||!joints.has(entry.key.split(':').slice(0,2).join(':'))||seen.has(entry.key))return false;seen.add(entry.key);}
  }
  return true;
 }
 function itemValid(item){
  if(!plainObject(item)||item.version!==VERSION||!Array.isArray(item.groups)||!item.groups.length||item.groups.length>CAPACITY||!Array.isArray(item.joints)||item.joints.length!==item.groups.length-1)return false;
  const parts=new Map(),owners=new Map();
  for(let index=0;index<item.groups.length;index++){
   const group=item.groups[index];if(!plainObject(group)||!quaternion(group.q)||!Array.isArray(group.parts)||!group.parts.length||group.parts.length>CAPACITY)return false;
   for(const part of group.parts){if(!plainObject(part)||!positiveId(part.id)||parts.has(part.id)||!SHAPES.includes(part.shape)||!Number.isFinite(part.weight)||part.weight<=0||part.weight>1000||!vector(part.p,3)||!quaternion(part.q)||!plainObject(part.mood)||typeof part.mood.name!=='string'||!Number.isFinite(part.mood.energy)||part.mood.energy<0||part.mood.energy>1)return false;parts.set(part.id,part);owners.set(part.id,index);}
  }
  if(parts.size>CAPACITY)return false;
  const links=item.groups.map(()=>[]),used=new Set();
  for(const joint of item.joints){if(!plainObject(joint)||!pairValid(joint)||!rotorOptionsValid(joint)||!parts.has(joint.aId)||!parts.has(joint.bId)||used.has(joint.aId)||used.has(joint.bId)||owners.get(joint.aId)===owners.get(joint.bId))return false;used.add(joint.aId);used.add(joint.bId);links[owners.get(joint.aId)].push(owners.get(joint.bId));links[owners.get(joint.bId)].push(owners.get(joint.aId));}
  const seen=new Set([0]),queue=[0];for(const at of queue)for(const next of links[at])if(!seen.has(next)){seen.add(next);queue.push(next);}if(seen.size!==item.groups.length)return false;
  // Fail closed for complex equipment if the shared validator is unavailable.
  if(!organizers?.validItem)return !item.joints.length&&item.robotArms===undefined&&item.conveyors===undefined&&referencesValid(item,parts)&&[...parts.values()].every(part=>!part.mood.externalBattery&&!part.mood.gripper);
  try{return organizers.validItem(item)&&referencesValid(item,parts);}catch{return false;}
 }
 function assertItems(items,{capacity=CAPACITY,usedIds,maximumBytes=MAX_JSON_BYTES}={},jsonAlreadyChecked=false){
  if(!Number.isInteger(capacity)||capacity<0||capacity>MAX_INPUT_PARTS||!Array.isArray(items)||items.length>MAX_INPUT_PARTS||usedIds!==undefined&&(!usedIds||typeof usedIds.has!=='function')||!jsonAlreadyChecked&&!jsonSafe(items,maximumBytes))throw error('La familia contiene datos inválidos.');
  const ids=new Set();let total=0;
  for(const item of items){if(!itemValid(item))throw error('La familia contiene una pieza o mecanismo inválido.');
   for(const group of item.groups)for(const part of group.parts){if(ids.has(part.id)||usedIds?.has(part.id))throw error('Una pieza está repetida o pertenece a otro inventario.','DUPLICATE_FAMILY_ID');ids.add(part.id);if(++total>capacity)throw error('La familia supera su capacidad de '+capacity+' piezas.','FAMILY_CAPACITY');}
  }
  return {count:total,ids};
 }
 function validateItems(items,options={}){try{assertItems(items,options);return true;}catch{return false;}}
 function validFamily(record,options={}){
  try{
   if(!jsonSafe(record,MAX_JSON_BYTES,true)||!plainObject(record)||record.version!==VERSION||!positiveId(record.id)||typeof record.name!=='string'||sanitizeName(record.name)!==record.name||typeof record.color!=='string'||sanitizeColor(record.color)!==record.color||!vector(record.p,3)||!quaternion(record.q)||!vector(record.v,3)||!vector(record.w,3)||!Array.isArray(record.items)||!record.items.length)return false;
   // The full record traversal has already checked this inventory with its
   // enclosing depth and 2 KiB reserved for changing names and body poses.
   // This private argument cannot be supplied via
   // public validation options; semantic and global-ID checks still run once.
   assertItems(record.items,{capacity:CAPACITY,usedIds:options.usedIds},true);return true;
  }catch{return false;}
 }
 function cloneItems(items){assertItems(items,{capacity:MAX_INPUT_PARTS,maximumBytes:MAX_JSON_BYTES*Math.ceil(MAX_INPUT_PARTS/CAPACITY)});return JSON.parse(JSON.stringify(items));}
 function checkLimit(limit){if(!Number.isInteger(limit)||limit<1||limit>CAPACITY)throw error('Usa una capacidad entre 1 y '+CAPACITY+' piezas.','INVALID_FAMILY_LIMIT');}
 function partition(items,capacity=CAPACITY){
  checkLimit(capacity);assertItems(items,{capacity:MAX_INPUT_PARTS,maximumBytes:MAX_JSON_BYTES*Math.ceil(MAX_INPUT_PARTS/CAPACITY)});
  const batches=[];let batch=[],size=0;
  for(const item of items){const amount=count([item]);if(amount>capacity)throw error('Divide el mecanismo antes de crear lotes de '+capacity+' piezas.','OVERSIZED_FAMILY_ITEM');
   if(size+amount>capacity){batches.push(batch);batch=[];size=0;}batch.push(item);size+=amount;
  }
  if(batch.length)batches.push(batch);
  // Validate every result before copying any: no partial transfer can escape.
  for(const entries of batches)assertItems(entries,{capacity});
  return batches.map(entries=>JSON.parse(JSON.stringify(entries)));
 }
 function split(items,limit=SPLIT_SIZE){
  checkLimit(limit);assertItems(items);if(items.some(item=>count([item])>limit))throw error('Divide el mecanismo antes de separar un lote de '+limit+' piezas.','OVERSIZED_FAMILY_ITEM');
  let end=0,size=0;for(const item of items){const amount=count([item]);if(size+amount>limit)break;size+=amount;end++;}
  const copied=JSON.parse(JSON.stringify(items));return {taken:copied.slice(0,end),remaining:copied.slice(end)};
 }
 function merge(leftItems,rightItems,capacity=CAPACITY){
  checkLimit(capacity);assertItems(leftItems,{capacity});assertItems(rightItems,{capacity});const combined=leftItems.concat(rightItems);assertItems(combined,{capacity});return JSON.parse(JSON.stringify(combined));
 }
 const api={VERSION,CAPACITY,SPLIT_SIZE,MAX_NAME_LENGTH,MAX_JSON_BYTES,MAX_JSON_DEPTH,sanitizeName,sanitizeColor,count,weight,stats,cloneItems,validateItems,validFamily,partition,split,merge};
 root.QBitsFamilies=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
