const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),createGame=require('./game-harness.cjs');
const source=fs.readFileSync(path.join(__dirname,'../assets/js/game.js'),'utf8');
// The previous vector implementation is the visual reference. Compare exact
// Float32 vertex uploads, including clipping, rotation and nondefault widths.
const legacy=`function drawWideLines(points,color,width=1){
 const basis=cameraBasis(),h=previewViewport?.height||canvas.clientHeight,data=[];
 const oldProject=p=>{const b=cameraBasis(),r=sub(p,V(...camera)),depth=r.dot(b.forward);if(depth<=.04)return null;const h=previewViewport?.height||canvas.clientHeight,w=previewViewport?.width||canvas.clientWidth;return {x:w/2+r.dot(b.right)*heldFocus.focal*h/2/depth,y:h/2-r.dot(b.up)*heldFocus.focal*h/2/depth,depth};};
 for(let i=0;i+1<points.length;i+=2){const a=points[i],b=points[i+1],pa=oldProject(a),pb=oldProject(b);if(!pa||!pb)continue;
  const dx=pb.x-pa.x,dy=pb.y-pa.y,len=Math.hypot(dx,dy);if(len<.01)continue;
  const axis=add(mul(basis.right,-dy/len),mul(basis.up,-dx/len));
  const oa=mul(axis,width*pa.depth/(heldFocus.focal*h)),ob=mul(axis,width*pb.depth/(heldFocus.focal*h));
  const aa=add(a,oa),ab=sub(a,oa),ba=add(b,ob),bb=sub(b,ob);
  for(const v of [aa,ab,ba,ba,ab,bb])data.push(v.x,v.y,v.z,0,1,0);
 }
 drawWorldTriangles(data,color);
}
`;
function fixture(gameSource){const uploads=[],gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,getUniformLocation:()=>0,createBuffer:()=>({}),createProgram:()=>({}),createShader:()=>({}),bufferData:(_,data)=>uploads.push(Array.from(data)),isContextLost:()=>false},{get:(o,k)=>k in o?o[k]:/^[A-Z_]+$/.test(k)?0:()=>{}});const game=createGame({gl,gameSource});uploads.length=0;return {...game,uploads};}
test('optimized selection strokes upload exactly the same triangles as the previous renderer',()=>{
 const reference=source.replace(/function drawWideLines\([\s\S]*?(?=function drawSelectionMarker)/,legacy);assert.notEqual(source,reference);
 const a=fixture(reference),b=fixture(source);
 for(const [yaw,pitch]of [[0,0],[.4,-.3],[-1,.1]])for(const width of [1,2.5,6])for(const game of [a,b]){
  const {t}=game;t.setLook({camera:[.2,1.4,2.2],yaw,pitch});t.drawWideLines([[-1,.2,0],[1,.3,0],[.1,.4,-1],[.1,.4,1],[0,1,4],[1,2,4]].map(p=>t.V(...p)),[.1,.5,.7,.85],width);
 }
 assert(a.uploads.length>3);assert.deepEqual(b.uploads,a.uploads);
});

test('batched rigid outlines preserve the per-piece triangles and style while reducing selected draws',()=>{
 const a=fixture(source),b=fixture(source);
 for(const chosen of [false,true]){for(const game of [a,b]){
  const {t}=game;t.clearNarrativeScene();t.setLook({camera:[.2,1.4,2.2],yaw:.15,pitch:-.3});Object.assign(t.getVisuals(),{style:'cel',outlineWidth:3});
  const g=t.makeGroup(Array.from({length:16},(_,i)=>{const q=t.Q();q.setFromEuler(i*.13,i*.07,-i*.1);return {id:t.allocateUnitId(),shape:['cube','tetra','pyramid','coupler'][i%4],weight:1,p:t.V(i%4*.14,.3+Math.floor(i/4)*.14,i%3*.12),q};}));
  g.body.quaternion.setFromEuler(.2,-.3,.1);game.uploads.length=0;
  if(game===a)for(const pose of t.poses(g))t.drawUnitOutline(pose,.85,chosen);else t.drawRigidOutline(g,.85,chosen);
 }
 const aa=a.uploads.flat(),bb=b.uploads.flat();assert.equal(bb.length,aa.length);for(let i=0;i<aa.length;i++)assert(Math.abs(aa[i]-bb[i])<2e-7,'triangle component '+i);
 assert.equal(b.uploads.length,chosen?1:8);assert.equal(a.uploads.length,16);
 }
});
