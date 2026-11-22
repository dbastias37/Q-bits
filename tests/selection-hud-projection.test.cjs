const test=require('node:test'),assert=require('node:assert/strict');
const HUD=require('../assets/js/selection-hud.js'),createGame=require('./game-harness.cjs');

// Record Canvas2D polygons, rather than counting internal cache operations.
function recorder(){
 const frames=[];let path=[];
 const ctx={globalAlpha:1,fillStyle:'',setTransform(){},clearRect(){frames.push([]);},beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},closePath(){},fill(){frames.at(-1).push({points:path.map(p=>p.slice()),color:this.fillStyle,alpha:this.globalAlpha});},stroke(){}};
 function node(tag){const attrs=new Map(),classes=new Set();return {tag,children:[],dataset:{},style:{},hidden:false,clientWidth:tag==='section'?370:70,clientHeight:76,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),toggle:(c,on)=>on?classes.add(c):classes.delete(c)},setAttribute:(k,v)=>attrs.set(k,String(v)),getAttribute:k=>attrs.get(k),append(...items){this.children.push(...items);for(const item of items)item.parent=this;},remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);},replaceChildren(...items){this.children=[];this.append(...items);},addEventListener(){},removeEventListener(){},getContext:()=>ctx};}
 const doc={createElement:node,body:node('body')};return {hud:HUD.create({document:doc,root:node('section')}),frames};
}
function reference(item,time,age,reduced=false){
 const mesh=HUD.geometry(item),motion=HUD.stateMotion(item,time,reduced),scale=HUD.scaleAt(age,false,reduced),sy=Math.sin(motion.turn),cy=Math.cos(motion.turn),sp=Math.sin(.45+motion.tilt),cp=Math.cos(.45+motion.tilt),zoom=70*.54*scale;
 const points=mesh.points.map(([x,y,z])=>{const xx=x*cy+z*sy,zz=z*cy-x*sy;return [xx,y*cp-zz*sp,y*sp+zz*cp];}),polygons=[];
 for(const face of mesh.faces){const p=face.indices.map(i=>points[i]),a=p[0],b=p[1],c=p[2],u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal);if(length<1e-9||normal[2]<=0)continue;
  const light=.56+.44*Math.max(0,(-.35*normal[0]+.65*normal[1]+.68*normal[2])/length),color=face.color.map(c=>Math.round(Math.max(0,Math.min(1,c*light+.012))*255));
  polygons.push({z:p.reduce((sum,p)=>sum+p[2],0)/p.length,points:p.map(p=>[35+p[0]*zoom+motion.x,76*.54-p[1]*zoom*motion.stretch+motion.y]),color:'rgb('+color.join(',')+')',alpha:Math.max(0,Math.min(1,age/.12))});
 }polygons.sort((a,b)=>a.z-b.z);return polygons;
}
function specimen(){
 const {t}=createGame(),shapes=['cube','pyramid','tetra','coupler'];
 return {id:1,revision:'original',count:shapes.length,mood:'neutral',energy:1,parts:shapes.map((shape,i)=>{const profile=t.unitProfile({shape}),q=t.Q();q.setFromEuler(.17*i,.31*i,-.13*i);return {id:i+1,p:[i*.067,i*.023,-i*.037],q:[q.x,q.y,q.z,q.w],vertices:Array.from(profile.vertices,v=>[v.x,v.y,v.z]),faces:Array.from(profile.faces,f=>Array.from(f)),color:[.15+i*.09,.17+i*.06,.18+i*.03]};})};
}
function sameFrame(actual,expected){
 assert.equal(actual.length,expected.length,'the same front-facing polygons must be drawn');
 for(let i=0;i<expected.length;i++){assert.equal(actual[i].color,expected[i].color,'face illumination is preserved');assert.equal(actual[i].alpha,expected[i].alpha);assert.equal(actual[i].points.length,expected[i].points.length);for(let j=0;j<expected[i].points.length;j++)for(let k=0;k<2;k++)assert(Math.abs(actual[i].points[j][k]-expected[i].points[j][k])<1e-9,'projected silhouette/paint order is preserved');}
}

test('cached thumbnail projection preserves polygons, shading, motion and entry animation for all real piece shapes',()=>{
 const original=specimen(),before=JSON.stringify(original);
 for(const mood of ['neutral','excited','restless'])for(const reduced of [false,true]){const {hud,frames}=recorder(),item={...original,mood,agitation:.9,shaking:mood==='restless'};let clock=0;
  for(let i=0;i<40;i++){clock+=.05;hud.update([item],.05,{active:true,reducedMotion:reduced});sameFrame(frames.at(-1),reference(item,clock,clock,reduced));}
  hud.dispose();
 }assert.equal(JSON.stringify(original),before,'rendering never rewrites saved material');
});

test('thumbnail projection rebuilds on geometry revision while selection identity and animation remain continuous',()=>{
 const {hud,frames}=recorder(),item=specimen();let clock=0;
 for(let i=0;i<18;i++){clock+=.05;if(i===9){item.revision='extended';item.parts=[...item.parts,{...item.parts[0],id:5,p:[-.24,.11,.15]}];item.count=5;}
  hud.update([item],.05,{active:true});sameFrame(frames.at(-1),reference(item,clock,clock));
 }assert.equal(hud.visibleCount,1);assert.equal(hud.focusedId,item.id);hud.dispose();
});
