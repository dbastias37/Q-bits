/* Small teach-and-repeat panel. Simulation and validation live in the game adapter. */
(function(root){'use strict';
 const PHASES=['detect','grab','move','release','return'];
 const finite=n=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n));
 const number=(n,suffix='')=>finite(n)?Math.round(Number(n)*10)/10+suffix:'—';
 function create(hooks){
  const get=id=>document.querySelector('#arm-'+id),el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  let last=null,gripperKey=null,dirty=false,busy=false,targetStamp='',jogStep=15,motorAxis=0,axisStamp='',wasAxisLimited=false;
  function showFeedback(result,nearGrip=false){for(const id of ['feedback','check-result'])get(id).textContent='';const node=get(nearGrip?'check-result':'feedback');node.textContent=result?.message||'';node.dataset.error=String(result?.ok===false);}
  function act(type,payload={}){
   if(busy)return;busy=true;let result;
   try{result=hooks.action(type,payload);}catch{result={ok:false,message:'No se pudo aplicar. Revisa la selección y vuelve a intentarlo.'};}
   busy=false;if(result?.ok!==false&&['filter','convert','capturePiece','captureShape'].includes(type))dirty=false;refresh();showFeedback(result,type==='check'||type==='grab');return result;
  }
  function fields(){const mode=get('filter-mode').value;get('color-row').hidden=mode!=='color';get('piece-row').hidden=mode!=='piece';get('shape-row').hidden=!['shape','form'].includes(mode);get('shape-type-row').hidden=mode!=='shape';get('form-row').hidden=mode!=='form';}
  function motorFields(arm){
   const joint=arm?.joints?.[motorAxis];
   if(!joint)return;
   get('motor-rpm').value=joint.rpm??12;
   get('motor-torque').value=joint.maxTorque??4;
   get('motor-capacity').value=joint.capacity??64;
 }
 function refresh(){
   const s=hooks.snapshot()||{},arm=s.arm,gripper=s.gripper;last=s;
   get('blueprint').disabled=s.available===false;get('convert').disabled=!s.canConvert;get('register').hidden=!!arm;get('register').disabled=!s.canRegister;
   get('target').textContent=s.selectedLabel||'Selecciona el brazo o un Q-bit para adaptarlo.';
   get('status').textContent=arm?.status||(gripper?'Cubo de agarre preparado. Conéctalo al extremo de tus rotores.':'Construye el plano con piezas existentes. El brazo se habilita al completar el montaje.');
   const signal=arm?.signal||'off';
   get('indicator').hidden=!arm;get('indicator').dataset.state=signal;
   get('indicator-label').textContent={off:'Apagado',running:'Encendido',waiting:'Esperando objeto',blocked:'Trabado'}[signal];
   get('controls').hidden=!arm;get('gripper-controls').hidden=!gripper;get('gripper-id').textContent=gripper?'Cubo de agarre · '+(gripper.name||'#'+gripper.id):'';
   const key=gripper?.id??null;if(key!==gripperKey){
    dirty=false;gripperKey=key;targetStamp='';axisStamp='';motorAxis=0;wasAxisLimited=false;showFeedback(null);
    get('pick-height').value=Number((Math.min(gripper?.reachCm??5,5)*.6).toFixed(1));
    get('place-height').value=13;get('home-height').value=20;
   }
   const targets=s.targets||[],stamp=JSON.stringify(targets.map(t=>[t.id,t.label]));
   if(stamp!==targetStamp){const old=get('filter-piece').value;get('filter-piece').replaceChildren();const empty=el('option','Elige una pieza de la sala');empty.value='';get('filter-piece').append(empty);for(const target of targets){const opt=el('option',target.label||'Pieza #'+target.id);opt.value=String(target.id);get('filter-piece').append(opt);}get('filter-piece').value=old;targetStamp=stamp;}
   if(gripper&&!dirty){get('filter-mode').value=gripper.mode||'any';get('filter-color').value=/^#[0-9a-f]{6}$/i.test(gripper.color)?gripper.color:'#b36b4d';get('filter-piece').value=gripper.targetId==null?'':String(gripper.targetId);get('filter-shape').value=gripper.shape||'cube';get('capacity').value=gripper.capacity??4;get('reach').value=gripper.reachCm??5;}
   get('capacity-value').textContent=number(get('capacity').value,' u');get('reach-value').textContent=number(get('reach').value,' cm').replace('.',',');fields();
   get('shape-memory').textContent=gripper?.formSignature?'Forma aprendida · se comparan las piezas y su disposición.':'Sin forma aprendida · usa un tipo de pieza o aprende una estructura.';
   for(const id of ['filter-mode','filter-color','filter-piece','filter-shape','capacity','reach','apply-filter','capture-shape','capture-piece','grab'])get(id).disabled=!gripper||!!arm?.running;
   get('release').disabled=!gripper;get('capture-shape').disabled=!gripper||!!arm?.running||s.canCaptureShape===false;get('capture-piece').disabled=!gripper||!!arm?.running||s.canCapturePiece===false;
   get('check').disabled=!gripper;
   const moving=!!arm?.running,holding=!!arm?.holding;
   for(const pose of ['home','pick','place']){
    get('pose-'+pose).disabled=!arm||moving||holding||arm.posable===false;
    get(pose+'-height').disabled=get('pose-'+pose).disabled;
   }
   const axisLimited=!!arm?.canFit;
   if(axisLimited&&!wasAxisLimited)get('motors').open=true;
   wasAxisLimited=axisLimited;
   get('payload-limit').textContent=arm?.capacity==null?'':'Límite combinado '+number(arm.capacity,' u')+' · pinza '+number(gripper?.capacity,' u')+(axisLimited?' · un eje admite menos que la pinza.':'.');
   const motorStamp=JSON.stringify(arm?.joints?.map(j=>[j.name,j.rpm,j.maxTorque,j.capacity])||[]);
   if(motorStamp!==axisStamp){
    axisStamp=motorStamp;const axis=get('motor-axis');axis.replaceChildren();
    for(const [i,joint] of (arm?.joints||[]).entries()){const option=el('option',joint.name+' · '+number(joint.capacity,' u'));option.value=String(i);axis.append(option);}
    if(motorAxis>=(arm?.joints?.length||0))motorAxis=0;
    axis.value=String(motorAxis);motorFields(arm);
   }
   for(const id of ['motor-axis','motor-rpm','motor-torque','motor-capacity','apply-motor'])get(id).disabled=!arm||moving;
   get('fit-load').disabled=!arm||moving||!arm.canFit;
   get('goto-pick').disabled=!arm||moving||holding||!arm.pickReady;get('goto-place').disabled=!arm||moving||holding||!arm.placeReady;
   get('home-state').textContent=arm?.homeReady?'Guardada':'Opcional';
   get('goto-home').disabled=!arm?.homeReady||moving||holding;get('clear-home').disabled=!arm?.homeReady||moving;
   get('pick-state').textContent=arm?.pickReady?'Guardada':'Por enseñar';get('place-state').textContent=arm?.placeReady?'Guardada':'Por enseñar';
   get('repeat').checked=arm?.repeat!==false;get('repeat').disabled=!arm||!!arm.running;
   for(const id of ['teach-pick','teach-place'])get(id).disabled=!arm||!!arm.running;
   get('start').disabled=!arm||moving||holding||!arm.pickReady||!arm.placeReady;get('stop').disabled=!arm;
   get('jog-step').value=String(jogStep);get('jog-step').disabled=!arm||moving||holding;
   const joints=get('joints');joints.replaceChildren();for(const [i,joint]of (arm?.joints||[]).entries()){
    const row=el('div'),label=el('span',joint.name||['Base','Hombro','Codo','Muñeca'][i]||'Eje '+(i+1));row.className='arm-joint';
    const minus=el('button','−'+jogStep+'°'),plus=el('button','+'+jogStep+'°'),value=el('output',number(joint.angle,'°'));minus.type=plus.type='button';minus.setAttribute('aria-label','Girar '+label.textContent+' menos '+jogStep+' grados');plus.setAttribute('aria-label','Girar '+label.textContent+' más '+jogStep+' grados');minus.disabled=plus.disabled=moving||holding;
    minus.addEventListener('click',()=>act('jog',{joint:i,degrees:-jogStep}));plus.addEventListener('click',()=>act('jog',{joint:i,degrees:jogStep}));row.append(label,minus,value,plus);joints.append(row);
   }
   const pieces=arm?.pieces??gripper?.pieces;
   get('load').textContent=number(arm?.load??gripper?.load??0,' u')+' / '+number(arm?.capacity??gripper?.capacity,' u')+(pieces?' · '+pieces+(pieces===1?' pieza':' piezas'):'');
   get('energy').textContent=number(arm?.energy??gripper?.energy,' J');get('cycles').textContent=number(arm?.cycles??0);get('efficiency').textContent=arm?.efficiency==null?'—':number(arm.efficiency,' %');
   const phases={waiting:'detect',detect:'detect',grabbing:'grab',grab:'grab',moving:'move',move:'move',place:'move',releasing:'release',release:'release',returning:'return',return:'return',pick:'return'};
   for(const phase of PHASES){const node=get('phase-'+phase);node.dataset.active=String(!!arm?.running&&phases[arm.phase]===phase);node.setAttribute('aria-current',!!arm?.running&&phases[arm.phase]===phase?'step':'false');}
  }
  for(const type of ['blueprint','convert','register','start','stop','grab','release','check'])get(type).addEventListener('click',()=>act(type));
  for(const pose of ['home','pick','place'])get('pose-'+pose).addEventListener('click',()=>act('pose',{pose,heightCm:Number(get(pose+'-height').value)}));
  get('motor-axis').addEventListener('change',()=>{motorAxis=Number(get('motor-axis').value);motorFields(last?.arm);});
  get('apply-motor').addEventListener('click',()=>act('motor',{joint:motorAxis,rpm:Number(get('motor-rpm').value),maxTorque:Number(get('motor-torque').value),capacity:Number(get('motor-capacity').value)}));
  get('fit-load').addEventListener('click',()=>act('fitLoad'));
  get('goto-home').addEventListener('click',()=>act('goto',{pose:'home'}));
  get('clear-home').addEventListener('click',()=>act('clearHome'));
  get('goto-pick').addEventListener('click',()=>act('goto',{pose:'pick'}));get('goto-place').addEventListener('click',()=>act('goto',{pose:'place'}));
  get('teach-pick').addEventListener('click',()=>act('teach',{pose:'pick'}));get('teach-place').addEventListener('click',()=>act('teach',{pose:'place'}));
  get('repeat').addEventListener('change',()=>act('repeat',{value:get('repeat').checked}));
  get('jog-step').addEventListener('change',()=>{const requested=Number(get('jog-step').value);jogStep=[5,15,45,90].includes(requested)?requested:15;refresh();});
  get('capture-shape').addEventListener('click',()=>act('captureShape'));get('capture-piece').addEventListener('click',()=>act('capturePiece'));
  get('apply-filter').addEventListener('click',()=>{
   const target=get('filter-piece').value;act('filter',{mode:get('filter-mode').value,color:get('filter-color').value,shape:get('filter-shape').value,targetId:target===''?null:Number(target),capacity:Number(get('capacity').value),reachCm:Number(get('reach').value)});
  });
  for(const id of ['filter-mode','filter-color','filter-piece','filter-shape','capacity','reach'])get(id).addEventListener('input',()=>{
   dirty=true;fields();get('capacity-value').textContent=number(get('capacity').value,' u');
   get('reach-value').textContent=number(get('reach').value,' cm').replace('.',',');
  });
  get('filter-mode').addEventListener('change',()=>{dirty=true;fields();});
  const lists={forms:document.querySelector('#saved-shape-list'),mechanisms:document.querySelector('#saved-library-mechanisms')};
  function category(name){for(const type of ['forms','mechanisms']){const tab=document.querySelector('#saved-library-'+type+'-tab');tab.setAttribute('aria-selected',String(type===name));tab.tabIndex=type===name?0:-1;lists[type].hidden=type!==name;}hooks.onLibraryTab?.(name);}
  for(const type of ['forms','mechanisms']){const tab=document.querySelector('#saved-library-'+type+'-tab');tab.addEventListener('click',()=>category(type));tab.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const name=event.key==='Home'?'forms':event.key==='End'?'mechanisms':type==='forms'?'mechanisms':'forms';category(name);document.querySelector('#saved-library-'+name+'-tab').focus();}});}
  category('forms');return {refresh,category,get snapshot(){return last;}};
 }
 root.QBitsRobotArmPanel={create};
})(typeof window==='object'?window:globalThis);
