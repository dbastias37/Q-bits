/* Q-bits · a hold-to-select fan with shared, geometry-accurate previews. */
(() => {
'use strict';
const PI=Math.PI, GAP=.032, CLOSE_MS=240;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
// Contours are clockwise in screen coordinates. Circular fillets share the
// drawing and hit-test boundary; neither the hover nor the material moves it.
function appendArc(points,cx,cy,r,start,end,steps){
 for(let i=0;i<=steps;i++){const angle=start+(end-start)*i/steps,p=[cx+Math.cos(angle)*r,cy+Math.sin(angle)*r],last=points[points.length-1];if(!last||Math.hypot(p[0]-last[0],p[1]-last[1])>.001)points.push(p);}
}
function roundedRect(left,top,width,height,radius){
 const r=Math.min(radius,width/2,height/2),points=[];
 for(const [x,y,start]of [[left+width-r,top+r,-PI/2],[left+width-r,top+height-r,0],[left+r,top+height-r,PI/2],[left+r,top+r,PI]])appendArc(points,x,y,r,start,start+PI/2,8);
 return points;
}
function insetContour(points,distance){
 return points.map((point,i)=>{
  const before=points[(i+points.length-1)%points.length],after=points[(i+1)%points.length],ax=point[0]-before[0],ay=point[1]-before[1],bx=after[0]-point[0],by=after[1]-point[1],al=Math.hypot(ax,ay)||1,bl=Math.hypot(bx,by)||1;
  const nx=-ay/al-by/bl,ny=ax/al+bx/bl,nl=Math.hypot(nx,ny)||1,dot=Math.max(.5,(nx/nl)*(-by/bl)+(ny/nl)*(bx/bl));
  return [point[0]+nx/nl*distance/dot,point[1]+ny/nl*distance/dot];
 });
}
function layout(width,height,count=3,mechanismCount=0){
 const columns=Math.min(2,mechanismCount),rows=columns?Math.ceil(mechanismCount/columns):0;
 const radius=mechanismCount?Math.max(45,Math.min(320,(width-28)/2,(height-206)/(1+rows*.54))):Math.max(50,Math.min(340,(width-28)/2,height*.38));
 const cx=width/2,top=mechanismCount?Math.max(12,(height-(radius*(1+rows*.54)+182))/2):0;
 const cy=mechanismCount?top+30+radius:height*.51+radius*.1;
 const rowTop=cy+36,cardWidth=radius*.88,cardHeight=radius*.54,gap=Math.max(12,radius*.08),cards=[];
 for(let i=0;i<mechanismCount;i++){
  const row=Math.floor(i/columns),n=Math.min(columns,mechanismCount-row*columns),left=cx-(n*cardWidth+(n-1)*gap)/2+(i%columns)*(cardWidth+gap),y=rowTop+row*(cardHeight+16),corner=Math.min(24,cardHeight*.18);
  cards.push({left,top:y,width:cardWidth,height:cardHeight,corner,points:roundedRect(left,y,cardWidth,cardHeight,corner)});
 }
 const detailTop=mechanismCount?rowTop+rows*cardHeight+(rows-1)*16+26:cy+radius*.19;
 const g={width,height,count,mechanismCount,cx,cy,radius,inner:radius*.43,step:PI/Math.max(1,count),cards,detailTop,headTop:mechanismCount?top:Math.max(20,cy-radius-53),helpTop:mechanismCount?Math.min(height-22,detailTop+82):Math.min(height-28,cy+radius*.57+24),thickness:clamp(radius*.045,5,14)};
 g.sectors=Array.from({length:count},(_,index)=>arcPoints(g,index));return g;
}
function polygonContains(x,y,points){
 let inside=false;
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j];
  if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
function hitLayout(x,y,g){
 for(let i=0;i<g.cards.length;i++)if(polygonContains(x,y,g.cards[i].points))return g.count+i;
 for(let i=0;i<g.sectors.length;i++)if(polygonContains(x,y,g.sectors[i]))return i;
 return -1;
}
function hitTest(x,y,width,height,count=3,mechanismCount=0){return hitLayout(x,y,layout(width,height,count,mechanismCount));}
function arcPoints(g,index){
 const start=PI+index*g.step+GAP,end=PI+(index+1)*g.step-GAP,points=[];
 const radius=Math.min(17,g.radius*.055,(g.radius-g.inner)*.16,g.inner*Math.sin((end-start)/2)*.3);
 const outerAngle=Math.asin(radius/(g.radius-radius)),innerAngle=Math.asin(radius/(g.inner+radius));
 const fillet=(r,angle,a,b)=>appendArc(points,g.cx+Math.cos(angle)*r,g.cy+Math.sin(angle)*r,radius,a,b,7);
 appendArc(points,g.cx,g.cy,g.radius,start+outerAngle,end-outerAngle,24);
 fillet(g.radius-radius,end-outerAngle,end-outerAngle,end+PI/2);
 fillet(g.inner+radius,end-innerAngle,end+PI/2,end-innerAngle+PI);
 appendArc(points,g.cx,g.cy,g.inner,end-innerAngle,start+innerAngle,24);
 fillet(g.inner+radius,start+innerAngle,start+innerAngle+PI,start+PI*1.5);
 fillet(g.radius-radius,start+outerAngle,start-PI/2,start+outerAngle);
 // The closing segment is implicit, so avoid a duplicate end vertex.
 if(Math.hypot(points[0][0]-points[points.length-1][0],points[0][1]-points[points.length-1][1])<.001)points.pop();
 return points;
}
function create({profiles}){
 if(!Array.isArray(profiles)||!profiles.length)throw new Error('The radial selector needs unit profiles.');
 const root=document.createElement('div');root.id='unit-radial';root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-label','Selector de piezas');root.setAttribute('aria-modal','true');
 const head=document.createElement('div');head.className='radial-heading';head.textContent='Piezas';
 const mechanismHead=document.createElement('div');mechanismHead.className='radial-mechanism-heading';mechanismHead.textContent='Mecanismos';
 const stage=document.createElement('div');stage.className='radial-stage';stage.setAttribute('role','listbox');stage.setAttribute('aria-label','Tipo de pieza');
 const models=document.createElement('canvas');models.className='radial-models';models.setAttribute('aria-hidden','true');
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('radial-lines');svg.setAttribute('aria-hidden','true');
 const depthSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');depthSvg.classList.add('radial-depth');depthSvg.setAttribute('aria-hidden','true');
 const defs=document.createElementNS('http://www.w3.org/2000/svg','defs');
 function gradient(id,stops){const grad=document.createElementNS('http://www.w3.org/2000/svg','linearGradient');grad.setAttribute('id',id);grad.setAttribute('x1','0%');grad.setAttribute('y1','0%');grad.setAttribute('x2','100%');grad.setAttribute('y2','100%');for(const [offset,color]of stops){const stop=document.createElementNS('http://www.w3.org/2000/svg','stop');stop.setAttribute('offset',offset);stop.setAttribute('stop-color',color);grad.appendChild(stop);}defs.appendChild(grad);}
 gradient('radial-glass-cut',[['0%','#f5ffff'],['18%','#afc5c8'],['35%','#eefaff'],['53%','#748f96'],['74%','#d8edf0'],['91%','#6d8d96'],['100%','#f8ffff']]);
 gradient('radial-glass-polish',[['0%','#ffffff'],['20%','#e6f4f5'],['39%','#91adb6'],['57%','#ffffff'],['78%','#95b1ba'],['93%','#faffff'],['100%','#ffffff']]);svg.appendChild(defs);
 const connector=document.createElementNS('http://www.w3.org/2000/svg','path');connector.classList.add('radial-connector');
 const cancel=document.createElement('div');cancel.className='radial-cancel';cancel.setAttribute('aria-hidden','true');cancel.innerHTML='<span>×</span><small>Cancelar</small>';
 const detail=document.createElement('div');detail.className='radial-description';detail.setAttribute('aria-live','polite');detail.setAttribute('aria-atomic','true');
 const detailTitle=document.createElement('strong'),detailText=document.createElement('p');detail.append(detailTitle,detailText);
 const help=document.createElement('p');help.className='radial-help';help.textContent='Suelta Q para elegir · clic para crear';
 const cursor=document.createElement('i');cursor.className='radial-cursor';cursor.setAttribute('aria-hidden','true');
 let opened=false,hover=-1,selected=null,frameId=0,lastTime=0,hideAt=0,detailTime=0,virtual=false,g=layout(1,1,profiles.length),pointer={x:0,y:0},context=null;
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 let glassFrom=0,glassTo=0,glassChangedAt=0;
 function getGlassOpacity(time=performance.now()){const progress=reduced.matches?1:clamp((time-glassChangedAt)/CLOSE_MS,0,1);return glassFrom+(glassTo-glassFrom)*progress;}
 function fadeGlass(to){const now=performance.now();glassFrom=getGlassOpacity(now);glassTo=to;glassChangedAt=now;}
 const mainCount=profiles.filter(p=>p.section!=='mechanisms').length,mechanismCount=profiles.length-mainCount;
 let mainIndex=0,mechanismIndex=0;mechanismHead.hidden=!mechanismCount;
 root.classList.toggle('has-mechanisms',mechanismCount>0);
 const items=profiles.map((profile,index)=>{
  const mechanism=profile.section==='mechanisms',sectionIndex=mechanism?mechanismIndex++:mainIndex++;
  const back=document.createElement('div');back.className='radial-crystal-back';
  const edge=document.createElementNS('http://www.w3.org/2000/svg','path');edge.classList.add('radial-crystal-edge');depthSvg.appendChild(edge);
  const rim=document.createElementNS('http://www.w3.org/2000/svg','path');rim.classList.add('radial-crystal-rim');svg.appendChild(rim);
  const panel=document.createElement('div');panel.className='radial-sector';panel.id='radial-option-'+profile.id;panel.setAttribute('role','option');panel.setAttribute('aria-label',profile.title+' · '+profile.subtitle);panel.setAttribute('aria-selected','false');panel.setAttribute('aria-disabled',String(!!profile.locked));panel.classList.toggle('locked',!!profile.locked);panel.classList.toggle('mechanism',mechanism);
  const bevel=document.createElementNS('http://www.w3.org/2000/svg','path');bevel.classList.add('radial-crystal-bevel');svg.appendChild(bevel);
  const outline=document.createElementNS('http://www.w3.org/2000/svg','path');outline.classList.add('radial-outline');svg.appendChild(outline);
  const label=document.createElement('div');label.className='radial-label';label.setAttribute('aria-hidden','true');const title=document.createElement('strong'),sub=document.createElement('small');title.textContent=profile.title;sub.textContent=profile.locked?'Bloqueado':profile.subtitle;label.append(title,sub);
  stage.appendChild(back);stage.appendChild(panel);stage.appendChild(label);
  const center=[0,1,2].map(axis=>(Math.min(...profile.vertices.map(v=>v[axis]))+Math.max(...profile.vertices.map(v=>v[axis])))/2);
  const vertices=profile.vertices.map(v=>v.map((n,axis)=>n-center[axis]));
  const modelSize=Math.max(...[0,1,2].map(axis=>Math.max(...profile.vertices.map(v=>v[axis]))-Math.min(...profile.vertices.map(v=>v[axis]))))||1;
  return {profile,vertices,modelSize,panel,back,edge,rim,bevel,outline,label,sub,mechanism,sectionIndex,index,angle:index*.65+.4,speed:.34,x:0,y:0};
 });
 const slots=[...items.filter(item=>!item.mechanism),...items.filter(item=>item.mechanism)];
 svg.appendChild(connector);stage.append(depthSvg,models,svg,cancel,detail,cursor);root.append(head,mechanismHead,stage,help);document.body.appendChild(root);
 function updateLayout(){
  g=layout(window.innerWidth,window.innerHeight,mainCount,mechanismCount);const dpr=Math.min(window.devicePixelRatio||1,2);
  models.width=Math.max(1,Math.round(g.width*dpr));models.height=Math.max(1,Math.round(g.height*dpr));context=models.getContext('2d');if(context)context.setTransform(dpr,0,0,dpr,0,0);
  svg.setAttribute('viewBox','0 0 '+g.width+' '+g.height);depthSvg.setAttribute('viewBox','0 0 '+g.width+' '+g.height);
  root.style.setProperty('--radial-label-size',clamp(g.radius*.035,8,11)+'px');
  const path=points=>'M'+points.map(p=>p.map(n=>n.toFixed(2)).join(',')).join('L')+'Z';
  const clip=points=>'polygon('+points.map(p=>(p[0]/g.width*100)+'% '+(p[1]/g.height*100)+'%').join(',')+')';
  for(const item of items){
   const card=item.mechanism?g.cards[item.sectionIndex]:null,points=card?card.points:g.sectors[item.sectionIndex],dx=g.thickness*.38,dy=g.thickness;
   const rear=points.map(([x,y])=>[x+dx,y+dy]);item.points=points;
   item.panel.style.clipPath=clip(points);item.back.style.clipPath=clip(rear);item.outline.setAttribute('d',path(points));item.rim.setAttribute('d',path(rear));item.bevel.setAttribute('d',path(insetContour(points,2.6)));
   let sides='';for(let i=0;i<points.length;i++){const next=(i+1)%points.length;sides+=path([points[i],points[next],rear[next],rear[i]]);}
   item.edge.setAttribute('d',sides);
   const angle=PI+(item.sectionIndex+.5)*g.step;item.x=card?card.left+card.width/2:g.cx+Math.cos(angle)*g.radius*.74;item.y=card?card.top+card.height*.31:g.cy+Math.sin(angle)*g.radius*.74;
   item.label.style.left=item.x+'px';item.label.style.top=(card?card.top+card.height*.65:item.y+g.radius*.155)+'px';item.label.style.width=(card?card.width-12:g.radius*.55)+'px';
  }
  cancel.style.left=g.cx+'px';cancel.style.top=(g.cy-g.inner*.25)+'px';
  detail.style.top=g.detailTop+'px';detail.style.width=Math.min(350,g.width-48)+'px';
  head.style.top=g.headTop+'px';mechanismHead.style.top=(g.cy+11)+'px';help.style.top=g.helpTop+'px';
  pointer.x=clamp(pointer.x,0,g.width);pointer.y=clamp(pointer.y,0,g.height);positionCursor();
 }
 function positionCursor(){cursor.style.transform='translate3d('+pointer.x+'px,'+pointer.y+'px,0)';}
 function setHover(index){
  if(index===hover)return;hover=index;detailTime=0;detail.style.opacity='0';detail.style.filter='blur(4px)';connector.setAttribute('d','');
  for(const item of items){const active=item.index===index;item.panel.classList.toggle('hovered',active);item.edge.classList.toggle('hovered',active);item.rim.classList.toggle('hovered',active);item.outline.classList.toggle('hovered',active);item.label.classList.toggle('hovered',active);}
  cancel.classList.toggle('active',index<0);cursor.classList.toggle('over-unit',index>=0&&!profiles[index].locked);cursor.classList.toggle('over-locked',index>=0&&!!profiles[index].locked);
  if(index>=0){const profile=profiles[index];detailTitle.textContent=profile.title+' · '+profile.subtitle;detailText.textContent=profile.locked?(profile.lockedDescription||'Este mecanismo todavía no se ha desbloqueado.'):profile.description;detailTitle.textContent+=(profile.locked?' · Bloqueado':'');stage.setAttribute('aria-activedescendant',items[index].panel.id);}
  else {detailTitle.textContent='';detailText.textContent='';stage.removeAttribute('aria-activedescendant');}
 }
 function moveTo(x,y){if(!opened)return;pointer.x=clamp(x,0,g.width);pointer.y=clamp(y,0,g.height);positionCursor();const slot=hitLayout(pointer.x,pointer.y,g);setHover(slot<0?-1:slots[slot].index);}
 function chooseNext(delta){
  if(!opened)return;const available=slots.filter(item=>!item.profile.locked);if(!available.length){setHover(-1);return;}
  const current=available.findIndex(item=>item.index===hover),index=current<0?(delta<0?available.length-1:0):(current+(delta<0?-1:1)+available.length)%available.length,item=available[index];moveTo(item.x,item.y);
 }
 function setLocked(id,locked){const item=items.find(item=>item.profile.id===id);if(!item)return false;item.profile.locked=!!locked;item.panel.classList.toggle('locked',!!locked);item.panel.setAttribute('aria-disabled',String(!!locked));item.sub.textContent=locked?'Bloqueado':item.profile.subtitle;if(hover===item.index){hover=-2;setHover(item.index);}return true;}
 function renderModel(item,dt){
  const active=item.index===hover&&!item.profile.locked,target=active?1.75:.34;item.speed+=(target-item.speed)*(1-Math.exp(-dt*7));if(!reduced.matches)item.angle=(item.angle+item.speed*dt)%(PI*2);
  const scale=g.radius*.23,ca=Math.cos(item.angle),sa=Math.sin(item.angle),tilt=.30,ct=Math.cos(tilt),st=Math.sin(tilt);
  const vertices=item.vertices.map(v=>{const x=(ca*v[0]+sa*v[2])/item.modelSize,z=(-sa*v[0]+ca*v[2])/item.modelSize,y=v[1]/item.modelSize;return [x,ct*y-st*z,st*y+ct*z];});
  const faces=item.profile.faces.map(face=>({face,z:face.reduce((sum,k)=>sum+vertices[k][2],0)/face.length})).sort((a,b)=>a.z-b.z);
  const supplied=item.profile.color||[.24,.26,.27],color=supplied.map(c=>c<=1?c*255:c);
  context.save();context.globalAlpha=item.profile.locked ? .35 : 1;context.translate(item.x,item.y);context.shadowColor='rgba(18,25,22,.09)';context.shadowBlur=9;context.shadowOffsetY=4;
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
  const detailEdge=g.cx+sign*Math.min(156,(g.width-56)/2),lineY=g.detailTop-9;
  const points=mechanismCount?[[item.x+sign*g.radius*.10,item.y+g.radius*.13],[item.x+sign*g.radius*.10,lineY],[detailEdge,lineY]]:[[item.x+sign*g.radius*.12,item.y+g.radius*.13],[g.cx+sign*g.radius*.53,g.cy+g.radius*.13],[g.cx+sign*Math.min(156,(g.width-56)/2),g.cy+g.radius*.13]];
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
  if(opened)return;fadeGlass(1);opened=true;selected=selectedId;virtual=virtualPointer;root.hidden=false;root.classList.remove('visible');root.classList.toggle('virtual-pointer',virtual);root.setAttribute('aria-hidden','false');updateLayout();
  for(const item of items){const chosen=item.profile.id===selected;item.panel.classList.toggle('selected',chosen);item.panel.setAttribute('aria-selected',String(chosen));item.outline.classList.toggle('selected',chosen);}
  pointer={x:g.cx,y:g.cy-g.inner*.25};hover=-2;setHover(-1);positionCursor();lastTime=0;hideAt=0;
  // Force the entry state once; subsequent animation uses only composited properties.
  void root.offsetWidth;root.classList.add('visible');if(!frameId)frameId=requestAnimationFrame(render);
 }
 function close(){if(!opened)return;fadeGlass(0);opened=false;root.classList.remove('visible');root.setAttribute('aria-hidden','true');hideAt=performance.now()+(reduced.matches?0:CLOSE_MS);if(!frameId)frameId=requestAnimationFrame(render);}
 window.addEventListener('resize',()=>{if(opened){updateLayout();moveTo(g.cx,g.cy-g.inner*.25);}});
 root.addEventListener('pointermove',event=>{if(opened&&!virtual)moveTo(event.clientX,event.clientY);});
 root.addEventListener('contextmenu',event=>event.preventDefault());
 return {open,close,moveTo,setGlassActive(active){root.classList.toggle('glass-native',!!active);},getGlassOpacity,get isGlassVisible(){return !root.hidden&&(opened||performance.now()<hideAt);},getGlassPanels(){return !root.hidden?items.map(item=>({points:item.points,thickness:g.thickness,hovered:item.index===hover,selected:item.profile.id===selected,locked:!!item.profile.locked})):[];},moveBy(dx=0,dy=0){moveTo(pointer.x+(Number.isFinite(dx)?dx:0),pointer.y+(Number.isFinite(dy)?dy:0));},chooseNext,setLocked,get hovered(){return hover<0||profiles[hover].locked?null:profiles[hover].id;},get isOpen(){return opened;},
   getState:()=>({open:opened,hovered:hover<0||profiles[hover].locked?null:profiles[hover].id,highlighted:hover<0?null:profiles[hover].id,x:pointer.x,y:pointer.y,figures:items.map(item=>({id:item.profile.id,angle:item.angle,speed:item.speed,x:item.x,y:item.y,section:item.mechanism?'mechanisms':'pieces',locked:!!item.profile.locked}))})};
}
window.QBitsRadial={create,hitTest,layout,arcPoints,roundedRect,polygonContains};
})();
