/* Workshop choices are a draft. Only the explicit apply button mutates the room. */
(function(root){'use strict';
 const TABS=['batteries','upgrades','bodies'];
 const defaults=tab=>({tab:TABS.includes(tab)?tab:'batteries',mode:'adapt',choice:tab==='upgrades'?'upgrade:sensor':tab==='bodies'?'body':'battery:1',tier:2,dimensions:{x:1,y:1,z:1}});
 function drawPreview(canvas,preview={}){
  const ctx=canvas?.getContext?.('2d');if(!ctx)return;
  const width=620,height=280;canvas.width=width;canvas.height=height;ctx.clearRect(0,0,width,height);
  const dims=(preview.size||[1,1,1]).map(n=>Math.max(.2,Number(n)||1)),[sx,sy,sz]=dims,scale=Math.min(120,440/((sx+sz)*.86),(height-66)/(sy+(sx+sz)*.34));
  const project=(x,y,z)=>[width/2+(x-z)*scale*.86,(height-46)/2+(x+z)*scale*.34-y*scale];
  const offset=[-sx/2,-sy/2,-sz/2],P=(x,y,z)=>project(x+offset[0],y+offset[1],z+offset[2]);
  const polygon=(points,fill,stroke='rgba(58,89,79,.32)')=>{ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=1.3;ctx.stroke();};
  const vessel=(x,y,z,color)=>{polygon([P(0,0,z),P(x,0,z),P(x,y,z),P(0,y,z)],color[0]);polygon([P(x,0,0),P(x,0,z),P(x,y,z),P(x,y,0)],color[1]);polygon([P(0,y,0),P(x,y,0),P(x,y,z),P(0,y,z)],color[2]);};
  const shadow=ctx.createRadialGradient(width/2,height*.78,2,width/2,height*.78,170);if(shadow?.addColorStop){shadow.addColorStop(0,'rgba(42,80,64,.12)');shadow.addColorStop(1,'rgba(42,80,64,0)');ctx.fillStyle=shadow;ctx.fillRect(60,height*.63,width-120,100);}
  if(preview.kind==='battery'){
   const charge=Math.max(0,Math.min(1,Number(preview.energy)||0));
   if(charge>0)vessel(sx,sy*charge,sz,['rgba(41,184,111,.67)','rgba(23,148,88,.70)','rgba(99,234,155,.80)']);
   vessel(sx,sy,sz,['rgba(220,247,236,.15)','rgba(189,226,211,.18)','rgba(249,255,252,.34)']);
   ctx.strokeStyle='rgba(250,255,252,.88)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(...P(0,0,sz));ctx.lineTo(...P(0,sy,sz));ctx.lineTo(...P(sx,sy,sz));ctx.stroke();
  }else if(preview.mesh?.vertices?.length&&preview.mesh?.faces?.length){
   const vertices=preview.mesh.vertices.map(([x,y,z])=>project(x,y,z)),faces=preview.mesh.faces.map(face=>({face,depth:face.reduce((n,i)=>n+preview.mesh.vertices[i].reduce((a,b)=>a+b,0),0)/face.length})).sort((a,b)=>a.depth-b.depth);
   for(const {face}of faces){const points=face.map(i=>vertices[i]);polygon(points,['#717d77','#4f5e56','#a1afa6'][face.length%3]);}
   if(preview.sensor){const p=vertices.reduce((a,b)=>[a[0]+b[0]/vertices.length,a[1]+b[1]/vertices.length],[0,0]);ctx.fillStyle='#69e6ac';ctx.beginPath();ctx.arc(p[0],p[1],7,0,Math.PI*2);ctx.fill();}
  }else{
   vessel(sx,sy,sz,preview.kind==='research'?['#bdd5c8','#8fac9e','#e5f0e9']:['#717d77','#4f5e56','#a1afa6']);
   ctx.strokeStyle='rgba(225,242,231,.32)';ctx.lineWidth=1;
   const line=(a,b)=>{ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();};
   for(let x=1;x<sx;x++){line(P(x,0,sz),P(x,sy,sz));line(P(x,sy,0),P(x,sy,sz));}
   for(let y=1;y<sy;y++){line(P(0,y,sz),P(sx,y,sz));line(P(sx,y,0),P(sx,y,sz));}
   for(let z=1;z<sz;z++){line(P(sx,0,z),P(sx,sy,z));line(P(0,sy,z),P(sx,sy,z));}
   if(preview.sensor){const p=P(sx,sy*.52,sz*.46);ctx.fillStyle='#69e6ac';ctx.beginPath();ctx.arc(p[0],p[1],7,0,Math.PI*2);ctx.fill();}
  }
  ctx.fillStyle='#61766b';ctx.textAlign='center';ctx.font='15px system-ui, sans-serif';ctx.fillText(preview.caption||'Vista previa del resultado',width/2,height-16);
 }
 function create(hooks){
  const screen=document.querySelector('#workshop-screen'),get=id=>document.querySelector('#workshop-'+id);
  let opened=false,draft=defaults('batteries'),lastModel=null,busy=false,lastTargetId,needsTrajectoryChoice=false;
  const element=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
  function choose(choice){lastTargetId=hooks.snapshot().target?.id??null;needsTrajectoryChoice=false;draft.choice=choice;get('feedback').textContent='';render();}
  function inspect(snapshot){
   const targetId=snapshot.target?.id??null;
   if(lastTargetId!==undefined&&lastTargetId!==targetId&&draft.tab==='upgrades'&&draft.mode==='adapt'&&['upgrade:trajectory','upgrade:receiver'].includes(draft.choice)){
    draft.choice='';delete draft.trajectoryTier;needsTrajectoryChoice=true;
   }
   lastTargetId=targetId;const model=hooks.inspect(draft,snapshot);
   if(needsTrajectoryChoice&&draft.tab==='upgrades'&&draft.mode==='adapt')return {...model,title:'Elige una adaptación',description:snapshot.target?.name||'Selecciona una pieza de la mesa',allowed:false,action:null,fields:[],facts:[],error:'La pieza de la mesa cambió. Elige la adaptación para esta pieza antes de aplicar.',help:'Elige Cubo de trayectoria para crear una cara o Receptor de trayectoria para seguir una existente.',preview:{...model.preview,sensor:false,caption:'Selecciona la adaptación de esta pieza'}};
   return model;
  }
  function render(keepFields=false){
   if(!opened)return;const snapshot=hooks.snapshot(),model=inspect(snapshot);lastModel=model;
   get('target').textContent=snapshot.target?.summary||'Mesa vacía · coloca una pieza para trabajar';get('credits').textContent=(snapshot.credits??0)+' créditos';
   for(const tab of TABS){const button=get('tab-'+tab);button.setAttribute('aria-selected',String(tab===draft.tab));button.tabIndex=tab===draft.tab?0:-1;}
   get('content').setAttribute('aria-labelledby','workshop-tab-'+draft.tab);
   const modes=get('modes');modes.replaceChildren();for(const mode of model.modes||[]){const button=element('button','workshop-mode',mode.label);button.type='button';button.setAttribute('aria-pressed',String(draft.mode===mode.id));button.addEventListener('click',()=>{get('feedback').textContent='';setMode(mode.id);});modes.append(button);}
   get('intro').textContent=model.intro||'';
   const options=get('options');options.replaceChildren();for(const option of model.options||[]){const button=element('button','workshop-choice');button.type='button';button.dataset.choice=option.id;button.setAttribute('aria-pressed',String(option.id===draft.choice));button.append(element('strong','',option.title),element('span','',option.subtitle||''));if(option.note)button.append(element('small','',option.note));button.addEventListener('click',()=>choose(option.id));options.append(button);}
   const fields=get('fields');if(!keepFields||needsTrajectoryChoice){fields.replaceChildren();for(const field of model.fields||[]){const label=element('label','workshop-field',field.label),input=element(field.options?'select':'input');input.id='workshop-field-'+field.id;label.htmlFor=input.id;
    if(field.options)for(const [value,text]of field.options){const option=element('option','',text);option.value=value;input.append(option);}else{input.type='range';input.min=field.min;input.max=field.max;input.step=field.step||1;}
    input.value=field.value;const output=element('output','',String(field.value));output.htmlFor=input.id;
    input.addEventListener(field.options?'change':'input',()=>{const value=Number(input.value);if(!Number.isFinite(value))return;if(field.id.startsWith('dimension-'))draft.dimensions[field.id.slice(10)]=value;else draft[field.id]=value;output.textContent=String(value);get('feedback').textContent='';render(true);});label.append(output,input);fields.append(label);
   }}
   get('preview-title').textContent=model.title||'Resultado';get('preview-description').textContent=model.description||'';get('preview').setAttribute('aria-label',model.title||'Vista previa');drawPreview(get('preview'),model.preview);
   const facts=get('facts');facts.replaceChildren();for(const [label,value]of model.facts||[]){const row=element('div','workshop-fact');row.append(element('dt','',label),element('dd','',String(value)));facts.append(row);}
   get('reason').textContent=model.error||model.note||'Listo para aplicar sobre la mesa.';get('reason').dataset.error=String(!!model.error);get('apply').textContent=model.applyLabel||'Aplicar';get('apply').disabled=busy||!model.allowed;
   get('help').textContent=model.help||'La vista previa no cambia las piezas. El resultado queda sobre la mesa.';
  }
  function open(tab='batteries'){
   const wasOpen=opened;opened=true;screen.hidden=false;if(!wasOpen||draft.tab!==tab){draft=defaults(tab);lastTargetId=undefined;needsTrajectoryChoice=false;const target=hooks.snapshot().target;if(tab==='bodies'&&target?.dimensions)draft.dimensions={...target.dimensions};if(tab==='batteries'&&target?.count>=1&&target.count<=3)draft.choice=target.battery?'battery:keep':'battery:'+target.count;}
   get('feedback').textContent='';render();get('tab-'+draft.tab).focus({preventScroll:true});
  }
  function close(){opened=false;screen.hidden=true;lastModel=null;busy=false;lastTargetId=undefined;needsTrajectoryChoice=false;}
  get('close').addEventListener('click',()=>hooks.onClose?.());get('return').addEventListener('click',()=>hooks.onClose?.());
  screen.addEventListener('click',event=>{if(event.target===screen)hooks.onClose?.();});
  for(const tab of TABS)get('tab-'+tab).addEventListener('click',()=>open(tab));
  get('apply').addEventListener('click',()=>{
   if(busy||!opened||!lastModel?.allowed)return;busy=true;
   const current=inspect(hooks.snapshot());if(!current.allowed||current.action?.kind!=='research'&&current.targetId!==lastModel.targetId){busy=false;render();get('feedback').textContent=current.error||'La pieza de la mesa cambió. Revisa el resultado antes de aplicar.';return;}
   let result;try{result=hooks.apply(JSON.parse(JSON.stringify(draft)),current);}catch(error){result={ok:false,message:'No se pudo aplicar. Revisa la pieza e inténtalo de nuevo.'};}
   busy=false;if(result?.choice)draft.choice=result.choice;render();get('feedback').dataset.error=String(!result?.ok);get('feedback').textContent=result?.message||(result?.ok?'Aplicado · el resultado queda sobre la mesa.':'No se pudo aplicar el cambio.');
  });
  screen.addEventListener('keydown',event=>{
   if(!opened)return;
   if(event.code==='Tab'){const scope=screen.closest?.('#panel')||screen,nodes=Array.from(scope.querySelectorAll('button,input,select')).filter(el=>!el.disabled&&!el.hidden&&el.getClientRects?.().length);if(!nodes.length)return;const at=nodes.indexOf(document.activeElement);if(event.shiftKey&&at<=0){event.preventDefault();nodes.at(-1).focus();}else if(!event.shiftKey&&at===nodes.length-1){event.preventDefault();nodes[0].focus();}}
   const tab=TABS.find(id=>get('tab-'+id)===event.target);if(tab&&['ArrowLeft','ArrowRight'].includes(event.code)){event.preventDefault();const next=TABS[(TABS.indexOf(tab)+(event.code==='ArrowRight'?1:2))%TABS.length];open(next);}
  });
  function setMode(mode){needsTrajectoryChoice=false;draft.mode=mode==='research'?'research':'adapt';draft.choice=draft.mode==='research'?'research:sensor':'upgrade:sensor';render();}
  return {open,close,refresh:render,choose,setMode,get isOpen(){return opened;},get draft(){return JSON.parse(JSON.stringify(draft));},get model(){return lastModel;}};
 }
 root.QBitsWorkshopPanel={create,drawPreview};
})(typeof window==='object'?window:globalThis);
