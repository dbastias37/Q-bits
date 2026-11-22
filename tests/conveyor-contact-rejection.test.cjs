const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
function scene(){const {t}=createGame();t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight'),t.V()));const conveyor=t.conveyors[0],base=t.rotorPart(conveyor.baseId).g,load=t.addQubit([4,1,4]);return {t,conveyor,base,load};}
function contact(t,body,other,point,normal,reverse){return reverse?{bi:other,bj:body,ri:point.vsub(other.position),rj:point.vsub(body.position),ni:normal.negate()}:{bi:body,bj:other,ri:point.vsub(body.position),rj:point.vsub(other.position),ni:normal};}

test('conveyor load contacts retain top, side, reverse-order and rotated-surface rules without projecting rejected sides',()=>{
 const {t,conveyor,base,load}=scene();
 for(const angles of [[0,0,0],[.2,.7,-.1],[Math.PI/2,.1,.3]]){
  base.body.quaternion.setFromEuler(...angles);const surface=t.conveyorSurfacePoses(conveyor)[0],original=surface.inverse.vmult;let projections=0;surface.inverse.vmult=function(...args){projections++;return original.apply(this,args);};
  for(const reverse of [false,true])for(const [pointOffset,localNormal,expected]of [
   [[0,surface.half.y,0],[0,1,0],true],
   [[0,surface.half.y,0],[1,0,0],false],
   [[0,surface.half.y,0],[0,-1,0],false],
   [[surface.half.x+.007,surface.half.y,0],[0,1,0],false],
   [[0,surface.half.y+.013,0],[0,1,0],false],
   [[0,surface.half.y,surface.half.z+.007],[0,1,0],false]
  ]){
   const point=surface.p.vadd(surface.q.vmult(t.V(...pointOffset))),normal=surface.q.vmult(t.V(...localNormal)),entry=contact(t,base.body,load.body,point,normal,reverse);projections=0;
   const hit=t.conveyorSurfaceContact(conveyor,entry);assert.equal(!!hit,expected);
   if(localNormal[1]<=0)assert.equal(projections,0,'side and underside normals are rejected before local point projection');
   if(hit){assert.equal(hit.body,load.body);assert.equal(hit.surface,surface.surface);assert(hit.point.distanceTo(point)<1e-12);assert(hit.normal.distanceTo(normal)<1e-12);}
  }
 }
});
