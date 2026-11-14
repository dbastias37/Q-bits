/* Q-bits · a hold-to-select fan with shared, geometry-accurate previews. */
(() => {
'use strict';
const PI=Math.PI, GAP=.032, CLOSE_MS=240;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function layout(width,height,count=3){
 const radius=Math.max(50,Math.min(340,(width-28)/2,height*.38));
 const cx=width/2,cy=height*.51+radius*.1;
 return {width,height,count,cx,cy,radius,inner:radius*.43,step:PI/count};
}
function hitTest(x,y,width,height,count=3){
 const g=layout(width,height,count),dx=x-g.cx,dy=y-g.cy,r=Math.hypot(dx,dy);
 if(r<g.inner||r>g.radius||dy>=0)return -1;
 let angle=Math.atan2(dy,dx);if(angle<0)angle+=2*PI;
 const index=Math.min(count-1,Math.floor((angle-PI)/g.step)),offset=angle-PI-index*g.step;
 return index>=0&&offset>GAP&&offset<g.step-GAP?index:-1;
}
function arcPoints(g,index){
 const start=PI+index*g.step+GAP,end=PI+(index+1)*g.step-GAP,points=[];
 for(let n=0;n<=24;n++){const a=start+(end-start)*n/24;points.push([g.cx+Math.cos(a)*g.radius,g.cy+Math.sin(a)*g.radius]);}
 for(let n=24;n>=0;n--){const a=start+(end-start)*n/24;points.push([g.cx+Math.cos(a)*g.inner,g.cy+Math.sin(a)*g.inner]);}
 return points;
}
function create({profiles}){
 if(!Array.isArray(profiles)||!profiles.length)throw new Error('The radial selector needs unit profiles.');
 const root=document.createElement('div');root.id='unit-radial';root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-label','Selector de piezas');root.setAttribute('aria-modal','true');
 const head=document.createElement('div');head.className='radial-heading';head.textContent='Piezas';
 const stage=document.createElement('div');stage.className='radial-stage';stage.setAttribute('role','listbox');stage.setAttribute('aria-label','Tipo de pieza');
 const models=document.createElement('canvas');models.className='radial-models';models.setAttribute('aria-hidden','true');
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('radial-lines');svg.setAttribute('aria-hidden','true');
 const connector=document.createElementNS('http://www.w3.org/2000/svg','path');connector.classList.add('radial-connector');
 const cancel=document.createElement('div');cancel.className='radial-cancel';cancel.setAttribute('aria-hidden','true');cancel.innerHTML='<span>×</span><small>Cancelar</small>';
 const detail=document.createElement('div');detail.className='radial-description';detail.setAttribute('aria-live','polite');detail.setAttribute('aria-atomic','true');
 const detailTitle=document.createElement('strong'),detailText=document.createElement('p');detail.append(detailTitle,detailText);
 const help=document.createElement('p');help.className='radial-help';help.textContent='Suelta Q para elegir · N para crear';
 const cursor=document.createElement('i');cursor.className='radial-cursor';cursor.setAttribute('aria-hidden','true');
 let opened=false,hover=-1,selected=null,frameId=0,lastTime=0,hideAt=0,detailTime=0,virtual=false,g=layout(1,1,profiles.length),pointer={x:0,y:0},context=null;
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 const commonSize=Math.max(...profiles.flatMap(p=>[0,1,2].map(axis=>Math.max(...p.vertices.map(v=>v[axis]))-Math.min(...p.vertices.map(v=>v[axis])))))||1;
 const items=profiles.map((profile,index)=>{
  const panel=document.createElement('div');panel.className='radial-sector';panel.id='radial-option-'+profile.id;panel.setAttribute('role','option');panel.setAttribute('aria-label',profile.title+' · '+profile.subtitle);panel.setAttribute('aria-selected','false');
  const outline=document.createElementNS('http://www.w3.org/2000/svg','path');outline.classList.add('radial-outline');svg.appendChild(outline);
  const label=document.createElement('div');label.className='radial-label';label.setAttribute('aria-hidden','true');const title=document.createElement('strong'),sub=document.createElement('small');title.textContent=profile.title;sub.textContent=profile.subtitle;label.append(title,sub);
  stage.appendChild(panel);stage.appendChild(label);
  const center=[0,1,2].map(axis=>(Math.min(...profile.vertices.map(v=>v[axis]))+Math.max(...profile.vertices.map(v=>v[axis])))/2);
  const vertices=profile.vertices.map(v=>v.map((n,axis)=>n-center[axis]));
  return {profile,vertices,panel,outline,label,index,angle:index*.65+.4,speed:.34,x:0,y:0};
 });
 svg.appendChild(connector);stage.append(models,svg,cancel,detail,cursor);root.append(head,stage,help);document.body.appendChild(root);
 function updateLayout(){
  g=layout(window.innerWidth,window.innerHeight,profiles.length);const dpr=Math.min(window.devicePixelRatio||1,2);
  models.width=Math.max(1,Math.round(g.width*dpr));models.height=Math.max(1,Math.round(g.height*dpr));context=models.getContext('2d');if(context)context.setTransform(dpr,0,0,dpr,0,0);
  svg.setAttribute('viewBox','0 0 '+g.width+' '+g.height);
  root.style.setProperty('--radial-label-size',clamp(g.radius*.035,8,11)+'px');
  for(const item of items){
   const points=arcPoints(g,item.index);item.panel.style.clipPath='polygon('+points.map(p=>(p[0]/g.width*100)+'% '+(p[1]/g.height*100)+'%').join(',')+')';item.outline.setAttribute('d','M'+points.map(p=>p.map(n=>n.toFixed(2)).join(',')).join('L')+'Z');
   const angle=PI+(item.index+.5)*g.step;item.x=g.cx+Math.cos(angle)*g.radius*.74;item.y=g.cy+Math.sin(angle)*g.radius*.74;
   item.label.style.left=item.x+'px';item.label.style.top=(item.y+g.radius*.155)+'px';item.label.style.width=g.radius*.55+'px';
  }
  cancel.style.left=g.cx+'px';cancel.style.top=(g.cy-g.inner*.25)+'px';
  detail.style.top=(g.cy+g.radius*.19)+'px';detail.style.width=Math.min(350,g.width-48)+'px';
  head.style.top=Math.max(20,g.cy-g.radius-53)+'px';help.style.top=Math.min(g.height-28,g.cy+g.radius*.57+24)+'px';
  pointer.x=clamp(pointer.x,0,g.width);pointer.y=clamp(pointer.y,0,g.height);positionCursor();
 }
 function positionCursor(){cursor.style.transform='translate3d('+pointer.x+'px,'+pointer.y+'px,0)';}
 function setHover(index){
  if(index===hover)return;hover=index;detailTime=0;detail.style.opacity='0';detail.style.filter='blur(4px)';connector.setAttribute('d','');
  for(const item of items){const active=item.index===index;item.panel.classList.toggle('hovered',active);item.outline.classList.toggle('hovered',active);item.label.classList.toggle('hovered',active);}
  cancel.classList.toggle('active',index<0);cursor.classList.toggle('over-unit',index>=0);
  if(index>=0){const profile=profiles[index];detailTitle.textContent=profile.title+' · '+profile.subtitle;detailText.textContent=profile.description;stage.setAttribute('aria-activedescendant',items[index].panel.id);}
  else {detailTitle.textContent='';detailText.textContent='';stage.removeAttribute('aria-activedescendant');}
 }
 function moveTo(x,y){if(!opened)return;pointer.x=clamp(x,0,g.width);pointer.y=clamp(y,0,g.height);positionCursor();setHover(hitTest(pointer.x,pointer.y,g.width,g.height,profiles.length));}
 function chooseNext(delta){if(!opened)return;const index=hover<0?(delta<0?items.length-1:0):(hover+delta+items.length)%items.length;const item=items[index];moveTo(item.x,item.y);}
 function renderModel(item,dt){
  const active=item.index===hover,target=active?1.75:.34;item.speed+=(target-item.speed)*(1-Math.exp(-dt*7));if(!reduced.matches)item.angle=(item.angle+item.speed*dt)%(PI*2);
  const scale=g.radius*.23,ca=Math.cos(item.angle),sa=Math.sin(item.angle),tilt=.30,ct=Math.cos(tilt),st=Math.sin(tilt);
  const vertices=item.vertices.map(v=>{const x=(ca*v[0]+sa*v[2])/commonSize,z=(-sa*v[0]+ca*v[2])/commonSize,y=v[1]/commonSize;return [x,ct*y-st*z,st*y+ct*z];});
  const faces=item.profile.faces.map(face=>({face,z:face.reduce((sum,k)=>sum+vertices[k][2],0)/face.length})).sort((a,b)=>a.z-b.z);
  const supplied=item.profile.color||[.24,.26,.27],color=supplied.map(c=>c<=1?c*255:c);
  context.save();context.translate(item.x,item.y);context.shadowColor='rgba(18,25,22,.09)';context.shadowBlur=9;context.shadowOffsetY=4;
  for(const entry of faces){
   const p=entry.face.map(k=>vertices[k]),a=p[0],b=p[1],c=p[2],u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal)||1;
   if(normal[2]<0)continue;const light=.62+.40*Math.max(0,(-normal[0]*.36+normal[1]*.68+normal[2]*.64)/length);
   context.beginPath();p.forEach((point,k)=>{const perspective=1+point[2]*.08,x=point[0]*scale*perspective,y=-point[1]*scale*perspective;if(k===0)context.moveTo(x,y);else context.lineTo(x,y);});context.closePath();
   context.fillStyle='rgb('+color.map(n=>Math.round(clamp(n*light,0,255))).join(',')+')';context.fill();context.shadowColor='transparent';context.lineWidth=.7;context.strokeStyle='rgba(255,255,255,.14)';context.stroke();
  }
  context.restore();
 }
 function renderDescription(dt){
  if(hover<0)return;detailTime+=dt;const progress=reduced.matches?1:1-Math.pow(1-clamp(detailTime/.26,0,1),3),item=items[hover],sign=item.x<g.cx?-1:1;
  const points=[[item.x+sign*g.radius*.12,item.y+g.radius*.13],[g.cx+sign*g.radius*.53,g.cy+g.radius*.13],[g.cx+sign*Math.min(156,(g.width-56)/2),g.cy+g.radius*.13]];
  const lengths=[Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1]),Math.hypot(points[2][0]-points[1][0],points[2][1]-points[1][1])];let left=(lengths[0]+lengths[1])*progress,path='M'+points[0].join(',');
  for(let i=0;i<2;i++){const fraction=clamp(left/Math.max(.001,lengths[i]),0,1);path+='L'+[points[i][0]+(points[i+1][0]-points[i][0])*fraction,points[i][1]+(points[i+1][1]-points[i][1])*fraction].join(',');left-=lengths[i];if(left<=0)break;}
  connector.setAttribute('d',path);const opacity=clamp((progress-.8)/.2,0,1);detail.style.opacity=String(opacity);detail.style.filter='blur('+((1-opacity)*4)+'px)';
 }
 function render(time){
  frameId=0;if(!opened&&time>=hideAt){root.hidden=true;context?.clearRect(0,0,g.width,g.height);return;}
  const dt=lastTime?Math.min(.05,Math.max(0,(time-lastTime)/1000)):0;lastTime=time;
  if(context){context.clearRect(0,0,g.width,g.height);for(const item of items)renderModel(item,dt);}renderDescription(dt);frameId=requestAnimationFrame(render);
 }
 function open(selectedId,{virtualPointer=false}={}){
  if(opened)return;opened=true;selected=selectedId;virtual=virtualPointer;root.hidden=false;root.classList.remove('visible');root.classList.toggle('virtual-pointer',virtual);root.setAttribute('aria-hidden','false');updateLayout();
  for(const item of items){const chosen=item.profile.id===selected;item.panel.classList.toggle('selected',chosen);item.panel.setAttribute('aria-selected',String(chosen));item.outline.classList.toggle('selected',chosen);}
  pointer={x:g.cx,y:g.cy-g.inner*.25};hover=-2;setHover(-1);positionCursor();lastTime=0;hideAt=0;
  // Force the entry state once; subsequent animation uses only composited properties.
  void root.offsetWidth;root.classList.add('visible');if(!frameId)frameId=requestAnimationFrame(render);
 }
 function close(){if(!opened)return;opened=false;root.classList.remove('visible');root.setAttribute('aria-hidden','true');hideAt=performance.now()+(reduced.matches?0:CLOSE_MS);if(!frameId)frameId=requestAnimationFrame(render);}
 window.addEventListener('resize',()=>{if(opened){updateLayout();moveTo(g.cx,g.cy-g.inner*.25);}});
 root.addEventListener('pointermove',event=>{if(opened&&!virtual)moveTo(event.clientX,event.clientY);});
 root.addEventListener('contextmenu',event=>event.preventDefault());
 return {open,close,moveTo,moveBy(dx=0,dy=0){moveTo(pointer.x+(Number.isFinite(dx)?dx:0),pointer.y+(Number.isFinite(dy)?dy:0));},chooseNext,get hovered(){return hover<0?null:profiles[hover].id;},get isOpen(){return opened;},
   getState:()=>({open:opened,hovered:hover<0?null:profiles[hover].id,x:pointer.x,y:pointer.y,figures:items.map(item=>({id:item.profile.id,angle:item.angle,speed:item.speed,x:item.x,y:item.y}))})};
}
window.QBitsRadial={create,hitTest,layout};
})();
