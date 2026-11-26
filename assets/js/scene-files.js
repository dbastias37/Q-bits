(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.QBitsSceneFiles=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const FORMAT='qbits-scene',VERSION=1,MAX_BYTES=8*1024*1024;
  const KEY='qbits.editor.scene.v1',LIBRARY='qbits.editor.library.v1',PREFIX='qbits.editor.document.';
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  function fail(message){throw new Error(message);}
  function verifyData(data){
    const saves=root.QBitsSavedGames||(typeof require==='function'?require('./save-games.js'):null);
    if(!saves||!saves.validate||!saves.validate('lab',data).ok)
      fail('La escena no contiene un guardado válido del banco de pruebas.');
    return data;
  }
  function stable(value){
    if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
    if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
    return JSON.stringify(value);
  }
  function codeFor(data){
    const text=stable(data);
    // Stable 64-bit non-cryptographic checksum, for matching a scene in chat.
    let a=0xcbf29ce484222325n;
    for(let i=0;i<text.length;i++){
      const n=text.charCodeAt(i);
      a^=BigInt(n&255);a=BigInt.asUintN(64,a*0x100000001b3n);
      a^=BigInt(n>>>8);a=BigInt.asUintN(64,a*0x100000001b3n);
    }
    return 'QBSC1-'+a.toString(16).toUpperCase().padStart(16,'0');
  }
  function inventory(data){
    const snap=data.snapshot||{}, shapes={}, ids=new Set(), components=[];
    let pieces=0, activeGroups=0;
    function readPart(p){
      if(!p||typeof p!=='object'||!Number.isSafeInteger(p.id)||!p.shape||ids.has(p.id))return;
      ids.add(p.id);pieces++;shapes[p.shape]=(shapes[p.shape]||0)+1;
      const features=[];
      for(const k of ['workshop','trajectory','gripper','externalBattery','rotor','sensor'])
        if(p.mood&&p.mood[k])features.push(k);
      if(features.length)components.push({id:p.id,shape:p.shape,features});
    }
    for(const group of snap.groups||[]){
      activeGroups++;
      for(const p of group.parts||[])readPart(p);
    }
    for(const family of snap.families||[]){
      for(const item of family.items||[])for(const p of item.parts||[])readPart(p);
    }
    const systems={};
    for(const k of ['rotors','powerNetwork','conveyors','robotArms','trajectoryRuntime','families','cargo','machines'])
      if(own(snap,k))systems[k]=Array.isArray(snap[k])?snap[k].length:
        snap[k]&&typeof snap[k]==='object'?Object.keys(snap[k]).length:0;
    return {pieces,activeGroups,shapes,components,systems,uniqueIds:ids.size,
      notes:'Inventario descriptivo; el archivo de escena contiene también orientaciones, energía, conexiones y configuraciones.'};
  }
  function pack(name,data,notes=''){
    verifyData(data);
    const safeName=String(name||'Nueva escena').trim().slice(0,90)||'Nueva escena';
    const safeNotes=String(notes).slice(0,2000);
    const snapshot=JSON.parse(JSON.stringify(data));
    const doc={format:FORMAT,version:VERSION,name:safeName,notes:safeNotes,
      code:codeFor(snapshot),inventory:inventory(snapshot),data:snapshot};
    const text=JSON.stringify(doc);
    if(text.length>MAX_BYTES)fail('La escena excede el límite de 8 MB.');
    return doc;
  }
  function parse(input){
    if(typeof input!=='string'||input.length>MAX_BYTES)fail('Archivo vacío o demasiado grande.');
    let doc;try{doc=JSON.parse(input);}catch{fail('El archivo no es JSON válido.');}
    if(!doc||doc.format!==FORMAT||doc.version!==VERSION)fail('Formato o versión de escena incompatibles.');
    if(typeof doc.name!=='string'||typeof doc.code!=='string')fail('Faltan datos de la escena.');
    verifyData(doc.data);
    if(codeFor(doc.data)!==doc.code)fail('El código no coincide: el archivo puede estar modificado o dañado.');
    // Never trust the inventory supplied by a file; regenerate it.
    return pack(doc.name,doc.data,doc.notes||'');
  }
  function list(storage){
    let value;try{value=JSON.parse(storage.getItem(LIBRARY)||'[]');}catch{value=[];}
    if(!Array.isArray(value))return [];
    return value.filter(item=>item&&typeof item.code==='string'&&/^QBSC1-[0-9A-F]{16}$/.test(item.code)&&typeof item.name==='string')
      .slice(0,24).map(item=>({code:item.code,name:item.name,updatedAt:Number(item.updatedAt)||0}));
  }
  function save(storage,doc){
    const verified=parse(JSON.stringify(doc)),serialized=JSON.stringify(verified),code=verified.code;
    const items=list(storage).filter(item=>item.code!==code);
    // Store one complete copy per version; the active key is just its pointer.
    storage.setItem(PREFIX+code,serialized);
    items.unshift({code,name:verified.name,updatedAt:Date.now()});
    storage.setItem(LIBRARY,JSON.stringify(items.slice(0,24)));
    storage.setItem(KEY,code);
    return verified;
  }
  function select(storage,code){
    if(typeof code!=='string'||!/^QBSC1-[0-9A-F]{16}$/.test(code))fail('Identificador de escena inválido.');
    const raw=storage.getItem(PREFIX+code);
    if(!raw)fail('No existe esa escena guardada en este navegador.');
    const doc=parse(raw);if(doc.code!==code)fail('Identidad de escena incoherente.');
    storage.setItem(KEY,code);return doc;
  }
  function read(storage){
    const raw=storage.getItem(KEY);
    if(!raw)return null;
    // Backward-compatible with the first single-scene layout.
    if(raw[0]==='{')return parse(raw);
    if(!/^QBSC1-[0-9A-F]{16}$/.test(raw))fail('Selector de escena dañado.');
    const doc=storage.getItem(PREFIX+raw);
    if(!doc)fail('No existe la versión de escena indicada.');
    return parse(doc);
  }
  function explain(doc){
    const inv=doc.inventory;
    return ['Q-bits | Escena: '+doc.name,'Código: '+doc.code,
      'Piezas: '+inv.pieces+' | Grupos activos: '+inv.activeGroups,
      'Formas: '+Object.entries(inv.shapes).map(([k,v])=>k+' '+v).join(', '),
      'Sistemas: '+Object.entries(inv.systems).map(([k,v])=>k+' '+v).join(', '),
      'Componentes configurados: '+inv.components.map(c=>c.id+':'+c.features.join('+')).join('; '),
      'Notas: '+doc.notes,
      'Para reconstruir la escena exactamente, adjunta el archivo .qbits-scene.json; el código identifica y comprueba el archivo, pero no reemplaza sus datos.'].join('\n');
  }
  return Object.freeze({FORMAT,VERSION,KEY,LIBRARY,MAX_BYTES,pack,parse,save,read,list,select,inventory,codeFor,explain});
});
