/* Conveyor controls: the game adapter owns construction, power and transport. */
(function(root){'use strict';
 const KINDS=['straight','left','right'];
 const finite=n=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n));
 const number=(n,suffix='',digits=1)=>finite(n)?String(Number(Number(n).toFixed(digits)))+suffix:'—';
 function create(hooks){
  const get=id=>document.querySelector('#conveyor-'+id);
  let last=null,busy=false,selectedId=null;
  function feedback(result){get('feedback').textContent=result?.message||'';get('feedback').dataset.error=String(result?.ok===false);}
  function act(type,payload={}){
   if(busy)return;busy=true;let result;
   try{result=hooks.action(type,payload);}catch{result={ok:false,message:'No se pudo aplicar. Revisa la cinta seleccionada y vuelve a intentarlo.'};}
   busy=false;refresh();feedback(result);return result;
  }
  function refresh(){
   const s=hooks.snapshot()||{},c=s.conveyor;last=s;
   const nextId=c?.id??null;if(nextId!==selectedId){selectedId=nextId;feedback(null);}
   for(const kind of KINDS){get('blueprint-'+kind).disabled=s.available===false;get('materials-'+kind).textContent=(s.supportsAvailable===true&&get('supports').checked?s.materialsWithSupports?.[kind]:null)||s.materials?.[kind]||'Requiere piezas existentes.';}
   get('supports-row').hidden=s.supportsAvailable!==true;get('supports').disabled=s.available===false||s.supportsAvailable!==true;
   get('extend').disabled=!c||s.available===false;if(!c)get('extend').checked=false;
   const extending=!!c&&get('extend').checked===true;get('orientation').disabled=s.available===false||extending;get('height').disabled=s.available===false||extending;
   get('target').textContent=s.selectedLabel||'Selecciona un tramo para cambiar su marcha.';
   get('status').textContent=c?.status||'Completa todas las piezas del plano para habilitar la cinta.';
   get('controls').hidden=!c;
   get('toggle').disabled=!c||s.available===false;get('toggle').textContent=c?.enabled?'Detener tramo':'Iniciar tramo';get('toggle').setAttribute('aria-pressed',String(!!c?.enabled));
   for(const direction of [1,-1]){const button=get(direction===1?'forward':'reverse');button.disabled=!c||s.available===false;button.setAttribute('aria-pressed',String(!!c&&c.direction===direction));}
   get('direction-note').textContent=c?.direction===-1?'Sentido inverso al indicado en el plano.':'Sentido indicado en el plano.';
   get('capacity').disabled=!c||s.available===false;if(c)get('capacity').value=c.capacity;
   get('load').textContent=c?number(c.load,' u')+' / '+number(c.capacity,' u'):'—';
   get('speed').textContent=c?number(c.speed,' m/s',2):'—';
   get('energy').textContent=c?number(c.energy,' J'):'—';
   get('connected').textContent=c&&finite(c.connected)?number(c.connected,'',0)+' '+(Number(c.connected)===1?'tramo':'tramos'):'—';
  }
  for(const kind of KINDS)get('blueprint-'+kind).addEventListener('click',()=>{
   if(get('blueprint-'+kind).disabled)return;
   const extend=!!last?.conveyor&&get('extend').checked===true,quarterTurns=extend?0:Number(get('orientation').value),height=extend?0:Number(get('height').value);
   if(![0,1,2,3].includes(quarterTurns)||!Number.isFinite(height)||height<0||height>6){feedback({ok:false,message:'Usa un giro de 0°, 90°, 180° o 270° y una altura entre 0 y 6 m.'});return;}
   act('blueprint',{kind,supports:last?.supportsAvailable===true&&get('supports').checked===true,quarterTurns,height,extend});
  });
  get('capacity').addEventListener('change',()=>{if(!get('capacity').disabled)act('capacity',{capacity:Number(get('capacity').value)});});
  get('extend').addEventListener('change',refresh);
  get('supports').addEventListener('change',refresh);
  get('toggle').addEventListener('click',()=>{if(!get('toggle').disabled&&last?.conveyor)act('toggle',{enabled:!last.conveyor.enabled});});
  get('forward').addEventListener('click',()=>{if(!get('forward').disabled&&last?.conveyor)act('direction',{direction:1});});
  get('reverse').addEventListener('click',()=>{if(!get('reverse').disabled&&last?.conveyor)act('direction',{direction:-1});});
  return {refresh,get snapshot(){return last;}};
 }
 root.QBitsConveyorPanel={create};
})(typeof window==='object'?window:globalThis);
