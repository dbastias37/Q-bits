(() => {
  'use strict';
  const $=selector=>document.querySelector(selector);
  const readings = [
    ['charge','Carga','1.260 / 1.800','Batería','La primera cifra indica cuánto queda. La segunda es lo que almacena esa batería al llenarse.'],
    ['torque','Torque','3,20 N·m','Fuerza de giro','Los dos engranajes identifican la fuerza que puede hacer el eje al girar con peso.'],
    ['speed','Velocidad','0,30 m/s','Avance','El velocímetro marca cuánto avanza el dron por segundo. En un rotor, la velocidad se mide en vueltas por minuto.'],
    ['height','Altura','0,50 m','Sobre el piso','La flecha nace en la línea de suelo. La altura del dron se mide desde esa referencia.']
  ];
  for(const [id,label,value,title,info] of readings) {
    const button=document.createElement('button'), icon=document.createElement('i');
    icon.className='instrument-icon';icon.dataset.icon=id;icon.setAttribute('aria-hidden','true');
    button.append(icon,label);button.setAttribute('aria-pressed','false');$('#metrics').append(button);
    button.onclick=()=>{
      for(const other of $('#metrics').children)other.setAttribute('aria-pressed',String(other===button));
      $('#example-val').replaceChildren(value);
      if(id==='charge')$('#example-val').append(icon.cloneNode());
      $('#example-label').textContent=label;$('#explanation h3').textContent=title;$('#explanation p').textContent=info;
    };
  }
  $('#metrics button').click();

  // Axonometric drawing of a Q-bit chassis with four couplers and triangular blades.
  const svg=$('#drone');
  const project=([x,y,z])=>[(x-z)*.82,(x+z)*.39-y];
  function poly(points,color) {
    const node=document.createElementNS(svg.namespaceURI,'polygon');
    node.setAttribute('points',points.map(p=>project(p).join(',')).join(' '));
    node.setAttribute('fill',color);node.setAttribute('stroke','#c6d7b9');node.setAttribute('stroke-width','.7');svg.append(node);
  }
  function block(x,z,w,d,y,h) {
    const a=[x-w,y,z-d],b=[x+w,y,z-d],c=[x+w,y,z+d],e=[x-w,y,z+d];
    const low=p=>[p[0],p[1]-h,p[2]];
    poly([b,c,low(c),low(b)],'#4a5c50');poly([c,e,low(e),low(c)],'#293c34');poly([a,b,c,e],'#869a82');
  }
  function rotor(x,z) {
    block(x,z,5,5,6,9);
    for(const sign of [-1,1])poly([[x,7,z],[x+sign*23,10,z-3],[x+sign*20,7,z+5]],'#a9be9b');
  }
  block(0,0,36,4,-2,4);block(0,0,4,36,-2,4);
  rotor(-36,0);rotor(0,-36);block(0,0,10,10,8,15);
  rotor(36,0);rotor(0,36);

  const canvas=$('#model'),orbit=$('#orbit'),plane=$('#plane');
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true});
  const context=gl?null:canvas.getContext('2d');
  if(!gl&&!context){$('#no-gl').hidden=false;plane.hidden=true;$('.view-controls').hidden=true;return;}
  // Project the same mesh on demand when hardware acceleration is unavailable.
  function drawCanvas(frame){
    const {positions,triangles}=window.QBitsGraphiteModel;
    const m=frame.pose,points=[],faces=[];
    for(let i=0;i<positions.length;i+=3){
      const x=positions[i]*frame.width,y=positions[i+1]*frame.height,z=positions[i+2]*frame.depth;
      const w=1+m[3]*x+m[7]*y+m[11]*z;
      points.push([frame.x+(m[0]*x+m[4]*y+m[8]*z)/w,frame.y+(m[1]*x+m[5]*y+m[9]*z)/w,m[2]*x+m[6]*y+m[10]*z]);
    }
    for(let i=0;i<triangles.length;i+=3){
      const ids=triangles.slice(i,i+3),[a,b,c]=ids.map(j=>points[j]);
      const u=b.map((v,j)=>v-a[j]),v=c.map((n,j)=>n-a[j]);
      const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      const light=.64+.33*(-.4*normal[0]-.6*normal[1]+.68*normal[2])/(Math.hypot(...normal)||1);
      const color=[57,63,60].map(n=>Math.round(n*light));
      faces.push({points:[a,b,c],depth:(a[2]+b[2]+c[2])/3,color:'rgb('+color.join(',')+')'});
    }
    context.setTransform(canvas.width/frame.viewWidth,0,0,canvas.height/frame.viewHeight,0,0);
    context.clearRect(0,0,frame.viewWidth,frame.viewHeight);
    for(const face of faces.sort((a,b)=>a.depth-b.depth)){
      context.beginPath();const [a,b,c]=face.points;
      context.moveTo(a[0],a[1]);context.lineTo(b[0],b[1]);context.lineTo(c[0],c[1]);context.closePath();
      context.fillStyle=context.strokeStyle=face.color;context.lineWidth=.5;context.fill();context.stroke();
    }
  }
  function compile(type,source){
    const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));
    return s;
  }
  const draw=gl?window.QBitsTabletView.renderer(gl,compile,(...args)=>gl.drawArrays(...args)):drawCanvas;
  let yaw=-.32,pitch=-.24;
  function paint(){
    const {width:w,height:h}=orbit.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2);
    if(canvas.width!==Math.round(w*dpr))canvas.width=Math.round(w*dpr);
    if(canvas.height!==Math.round(h*dpr))canvas.height=Math.round(h*dpr);
    const width=Math.min(w*.84,(h-78)*1.56),height=width*.605;
    const cx=Math.cos(pitch),sx=Math.sin(pitch),cy=Math.cos(yaw),sy=Math.sin(yaw);
    const pose=[cy,sx*sy,-cx*sy,0,0,cx,sx,0,sy,-sx*cy,cx*cy,0,0,0,0,1];
    for(const i of [0,4,8])pose[i+3]=-pose[i+2]/(width*2.4);
    const x=w*.5,y=h*.48;
    if(gl){gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);}
    draw({width,height,depth:width,viewWidth:w,viewHeight:h,x,y,pose,alloy:false,graphite:true});
    Object.assign(plane.style,{width:width+'px',height:height+'px',left:x-width/2+'px',top:y-height/2+'px',transform:'matrix3d('+pose.join(',')+')'});
  }
  function orient(dx,dy){
    yaw+=dx;pitch=Math.max(-1.45,Math.min(1.45,pitch+dy));
    for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed','false');
    paint();
  }
  let drag=null;
  orbit.onpointerdown=e=>{if(e.button!==0)return;orbit.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY};};
  orbit.onpointermove=e=>{if(drag?.id!==e.pointerId)return;orient((e.clientX-drag.x)*.009,(drag.y-e.clientY)*.009);drag.x=e.clientX;drag.y=e.clientY;};
  orbit.onlostpointercapture=()=>{drag=null;};
  orbit.onkeydown=e=>{
    const dir={ArrowLeft:[-.15,0],ArrowRight:[.15,0],ArrowUp:[0,-.15],ArrowDown:[0,.15]}[e.key];
    if(dir){e.preventDefault();orient(...dir);}
  };
  for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>{
    [yaw,pitch]={persp:[-.32,-.24],front:[0,0],back:[Math.PI,0]}[button.dataset.view];
    for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b===button));
    paint();
  };
  new ResizeObserver(paint).observe(orbit);paint();
})();
