/* The adapter owns the physical joint; this panel only edits explicit commands. */
(function(root){'use strict';
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const finite=n=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n));
 const format=(n,suffix='')=>finite(n)?String(Math.round(Number(n)*10)/10)+suffix:'—';
 const fields=['min','max','speed','mode','target'];
 function create({host,onApply,onAction,onMarch}){
  if(!host)throw new Error('Falta el panel de servos.');
  const get=id=>host.querySelector('#servo-'+id),listeners=[];
  let last=null,identity=null,dirty=false,busy=false;
  function listen(id,type,handler){const node=get(id);node.addEventListener(type,handler);listeners.push([node,type,handler]);}
  function feedback(result,fallback=''){
   get('feedback').textContent=result?.message||(result===false?'No se pudo aplicar. Revisa la unión y su energía.':fallback);
   get('feedback').dataset.error=String(result===false||result?.ok===false);
  }
  function point(degrees,radius=78){const angle=clamp(degrees,-90,90)*Math.PI/180;return [100+radius*Math.sin(angle),92-radius*Math.cos(angle)];}
  function diagram(){
   const minimum=Number(get('min').value),maximum=Number(get('max').value);
   if(Number.isFinite(minimum)&&Number.isFinite(maximum)&&minimum<=maximum){const a=point(minimum),b=point(maximum);get('arc').setAttribute('d',`M ${a[0]} ${a[1]} A 78 78 0 0 1 ${b[0]} ${b[1]}`);}
   const p=point(finite(last?.angle)?Number(last.angle):0,68);get('pointer').setAttribute('d',`M 100 92 L ${p[0]} ${p[1]}`);
   get('angle').textContent='Ángulo actual: '+format(last?.angle,'°');
   get('target-row').hidden=get('mode').value==='repeat';
  }
  function draft(){
   const data={};for(const key of fields)data[key]=key==='mode'?get(key).value:Number(get(key).value);
   const low=last?.angleMin??-90,high=last?.angleMax??90,slow=last?.speedMin??5,fast=last?.speedMax??540;
   if(fields.filter(k=>k!=='mode').some(k=>!finite(get(k).value))||data.min<low||data.max>high||data.min>=data.max||data.speed<slow||data.speed>fast||!['hold','once','repeat'].includes(data.mode)){
    feedback({ok:false,message:`Usa un recorrido de ${low}° a ${high}°, con inicio menor que final, y velocidad de ${slow} a ${fast} °/s.`});return null;
   }
   if(data.mode!=='repeat'&&(data.target<data.min||data.target>data.max)){feedback({ok:false,message:'La posición objetivo debe quedar dentro del recorrido.'});return null;}
   if(data.mode==='repeat')data.target=clamp(data.target,data.min,data.max);
   return data;
  }
  function accepted(result){return result!==false&&result?.ok!==false;}
  function apply(){
   if(!last||busy||get('apply').disabled)return false;
   const patch=draft();if(!patch)return false;
   busy=true;let result;try{result=onApply?.(patch);}catch{result={ok:false,message:'No se pudo aplicar la configuración. Inténtalo de nuevo.'};}finally{busy=false;}
   if(accepted(result))dirty=false;
   feedback(result,'Recorrido aplicado.');return accepted(result);
  }
  function action(type){
   if(!last||busy||get(type).disabled)return;
   if(type==='start'&&!apply())return;
   busy=true;let result;try{result=onAction?.(type);}catch{result={ok:false,message:'No se pudo ejecutar. Revisa el servo seleccionado.'};}finally{busy=false;}
   feedback(result,type==='start'?'Preparado. Cierra P para ver el movimiento.':type==='stop'?'Articulación detenida y bloqueada.':'Sentido invertido.');
  }
  function marchAction(action){
   if(!last||busy)return;let result;try{result=onMarch?.(action);}catch{result=false;}
   feedback(result,action.type==='start'?'Conjunto preparado. Cierra P para iniciar.':action.type==='stop'?'Todas las articulaciones detenidas.':'Inicio actualizado.');
  }
  function renderMarch(next){
   const march=next?.march,members=march?.members||[],list=get('march-members');list.replaceChildren();
   get('march-start').disabled=!members.length||!!march?.running;get('march-stop').disabled=!members.length;
   get('march-status').textContent=members.length+' articulaciones conectadas · '+(march?.status||'Selecciona un mecanismo con servos');
   for(const item of members){
    const row=document.createElement('div');row.className='servo-march-row';
    const label=document.createElement('label');label.textContent=item.label+' · '+format(item.angle,'°');
    const select=document.createElement('select');select.setAttribute('aria-label','Posición inicial de '+item.label);
    for(const [value,text]of [[1,'Desde mínimo ('+format(item.min,'°')+')'],[-1,'Desde máximo ('+format(item.max,'°')+') · opuesto']]){const option=document.createElement('option');option.value=String(value);option.textContent=text;select.appendChild(option);}
    select.disabled=!!march?.running;select.value=String(item.direction);select.addEventListener('change',()=>marchAction({type:'phase',id:item.id,direction:Number(select.value)}));label.appendChild(select);
    const button=document.createElement('button');button.type='button';button.textContent='Ajustar recorrido';button.addEventListener('click',()=>marchAction({type:'select',id:item.id}));row.append(label,button);list.appendChild(row);
   }
  }
  function render(snapshot){
   const next=snapshot||null,nextIdentity=next?(next.id??next):null,changed=identity!==nextIdentity;
   last=next;identity=nextIdentity;renderMarch(next);if(changed){dirty=false;feedback(null);}
   get('controls').hidden=!next;get('empty').hidden=!!next;
   get('title').textContent=next?.label||(next?.kind==='hinge'?'Servo bisagra':next?.kind==='pivot'?'Servo pivote':'Servos Q-bits');
   if(!next){for(const id of ['apply','start','stop','invert'])get(id).disabled=true;return;}
   const blocked=!!next.enabled||next.available===false;
   get('description').textContent=next.kind==='hinge'?'Dos triángulos que se abren lateralmente. Sus puntas permanecen siempre unidas.':'Una pirámide conecta la extremidad por su punta y orienta su giro desde la base.';
   if(!dirty)for(const key of fields)get(key).value=String(next[key]??({min:-40,max:40,speed:45,mode:'hold',target:0}[key]));
   for(const key of ['min','max','target']){get(key).min=String(next.angleMin??-90);get(key).max=String(next.angleMax??90);}
   get('speed').min=String(next.speedMin??5);get('speed').max=String(next.speedMax??540);
   for(const key of fields)get(key).disabled=blocked;
   get('apply').disabled=blocked;get('start').disabled=blocked||!!next.enabled;get('stop').disabled=!next.enabled;get('invert').disabled=blocked;
   get('start').setAttribute('aria-pressed',String(!!next.enabled));
   get('status').textContent=next.status||(next.enabled?'En marcha':'Detenido · articulación bloqueada');
   get('torque').textContent=format(next.torque,' N·m');get('capacity').textContent=format(next.capacity,' u');diagram();
  }
  for(const key of fields)listen(key,key==='mode'?'change':'input',()=>{dirty=true;feedback(null);diagram();});
  listen('apply','click',apply);for(const type of ['start','stop','invert'])listen(type,'click',()=>action(type));
  listen('march-start','click',()=>{if(!dirty||apply())marchAction({type:'start'});});listen('march-stop','click',()=>marchAction({type:'stop'}));
  render(null);
  return {render,get snapshot(){return last;},destroy(){for(const [node,type,fn]of listeners)node.removeEventListener(type,fn);listeners.length=0;}};
 }
 root.QBitsServoPanel={create};
})(typeof window==='object'?window:globalThis);
