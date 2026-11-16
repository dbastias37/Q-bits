const test=require('node:test'),assert=require('node:assert/strict'),Furniture=require('../assets/js/furniture-models.js'),createGame=require('./game-harness.cjs');
const near=(a,b,epsilon=1e-8)=>assert(Math.abs(a-b)<epsilon,`${a} != ${b}`);
function lab(){const game=createGame();Object.assign(game.t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});game.t.setupWorkshop();return game;}

test('minimal furniture retains the desk L profile and all fifteen open source hexagons',()=>{
 const desk=Furniture.desk(),shelf=Furniture.shelf();assert.equal(desk.parts.length,5);assert.deepEqual(desk.surfaceHalf,[.7,0,.4]);near(desk.bounds.min[1],-.6);near(desk.bounds.max[1],0);
 assert.equal(shelf.cells.length,15);assert.equal(shelf.parts.length,61);assert.equal(shelf.attribution.license,'CC BY-SA 4.0');assert.match(shelf.attribution.scope,/only/);
 const columns=new Map();for(const cell of shelf.cells){const x=cell.p[0].toFixed(4);columns.set(x,(columns.get(x)||0)+1);}assert.deepEqual([...columns.values()],[2,2,3,3,3,2]);
 const keys=shelf.parts.map(part=>part.p.map(v=>v.toFixed(6)).join(','));assert.equal(new Set(keys).size,keys.length,'shared walls must be emitted once');
 for(const model of [desk,shelf])for(const part of model.parts){assert(part.half.every(v=>v>0));near(Math.hypot(...part.q),1);assert(part.color.every(v=>v>=0&&v<=1));}
});

test('desk surfaces and visible solids agree with Cannon, leaving the space below the worktop open',()=>{
 const {t}=lab(),bench=t.getWorkshopBench(),count=t.world.bodies.length;assert.equal(bench.walls.length,5);assert.equal(bench.wall,bench.walls[0]);assert.equal(t.setupWorkshop(),bench);assert.equal(t.world.bodies.length,count);
 for(const [i,wall]of bench.walls.entries()){const part=bench.model.parts[i];near(wall.body.position.x,bench.p.x+part.p[0]);near(wall.body.position.y,bench.p.y+part.p[1]);near(wall.body.position.z,bench.p.z+part.p[2]);for(const [axis,j]of ['x','y','z'].map((axis,j)=>[axis,j]))near(wall.body.shapes[0].halfExtents[axis],part.half[j]);}
 for(const x of [-.5,0,.5]){const g=t.addQubit([bench.p.x+x,.70,bench.p.z+.2]);for(let i=0;i<300;i++)t.world.step(1/240);near(g.body.position.y,.645,.003);t.removeGroup(g);}
 const under=t.addQubit([bench.p.x,.2,bench.p.z+.2]);assert(t.validPose(under,under.body.position,under.body.quaternion),'the old solid bench block must not fill the open knee space');
});

test('oriented shelf segments collide exactly where they render, without blocking the empty hex centres',()=>{
 const {t,sandbox}=createGame(),model=Furniture.shelf(),turn=t.Q();turn.setFromAxisAngle(t.V(0,1,0),.7);const origin=t.V(3,.8,-2);
 const walls=model.parts.map(part=>t.storyWall(origin.vadd(turn.vmult(t.V(...part.p))),t.V(...part.half),{q:turn.mult(new sandbox.CANNON.Quaternion(...part.q)),color:part.color.slice(0,3)})),dir=turn.vmult(t.V(0,0,-1));
 for(const cell of model.cells){const from=origin.vadd(turn.vmult(t.V(cell.p[0],cell.p[1],1)));assert(walls.every(w=>t.rayPuzzleBox(from,dir,w,2)===null),'each original hexagonal cavity remains open');}
 for(const wall of walls){const from=wall.p.vadd(turn.vmult(t.V(0,0,1)));assert.notEqual(t.rayPuzzleBox(from,dir,wall,2),null);for(const axis of ['x','y','z','w'])near(wall.q[axis],wall.body.quaternion[axis]);}
});

test('removing the workshop removes every physical segment and keeps the old bench handle compatible',()=>{
 const {t}=lab(),bench=t.getWorkshopBench();t.removeWorkshop();assert.equal(t.getWorkshopBench(),null);assert(bench.walls.every(w=>!t.world.bodies.includes(w.body)&&!t.storyWorld.walls.includes(w)));t.removeWorkshop();
});
