const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const createGame=require('./game-harness.cjs');
const fixtures=require('./cpu-audit-fixtures.cjs');

// Frozen pre-optimization predicate: bounds ran before selecting the pad list.
// Install only this original function in the reference game; every other game
// system, geometry routine and preference uses the current production source.
const reference='function pressurePadReference(g){const bb=bounds(g);return activePressureButtons().some(b=>bb.min.y<(b.surface||0)+.025&&bb.min.x>=b.p.x-b.half-.006&&bb.max.x<=b.p.x+b.half+.006&&bb.min.z>=b.p.z-b.half-.006&&bb.max.z<=b.p.z+b.half+.006);}';
function lab(original=false,hz=120){
 const source=fs.readFileSync(path.join(__dirname,'../assets/js/game.js'),'utf8'),at=source.lastIndexOf('})();');
 assert(at>=0&&source.includes('function onCampaignPad(g)'));
 const hook=reference+(original?'onCampaignPad=pressurePadReference;':'')+
  'window.__pressurePadQuery={onCampaignPad,availableHaulers,boundsCalls:0};'+
  '{const originalBounds=bounds;bounds=function(...args){window.__pressurePadQuery.boundsCalls++;return originalBounds.apply(this,args);};}';
 const game=createGame({graphics:false,gameSource:source.slice(0,at)+hook+source.slice(at)}),{t,sandbox}=game;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 t.applyPreferences({physicsHz:hz,shadows:'off',music:false,guideVoice:false,footsteps:false,joinSounds:false});
 assert.equal(t.getPhysicsStep(),1/hz);
 t.setLook({camera:[0,1.7,0],yaw:0,pitch:0});
 return {...game,query:sandbox.__pressurePadQuery,f:fixtures(t)};
}
function pair(hz=120){return [lab(true,hz),lab(false,hz)];}
function pad(t,x=0,z=0,half=.2,surface=0){return {p:t.V(x,0,z),half,surface};}
function plain(value){return JSON.parse(JSON.stringify(value));}
function completeState(game){
 const {t,f}=game;
 return JSON.stringify({savedAndPhysical:f.state(),groups:t.groups.map(g=>({ids:g.parts.map(p=>p.id),duty:g.moodDuty,carried:g.moodCarried,hadTask:g.moodHadTask,lastPosition:g.moodLastPosition,moods:g.parts.map(p=>p.mood)})),puzzleActive:t.puzzle.active,puzzleButtons:t.puzzle.buttons,storyButtons:t.storyWorld.buttons});
}
function sameState(games,label){assert.equal(completeState(games[1]),completeState(games[0]),label);}
function samePad(games,expected,label,index=0){
 const values=games.map(game=>game.query.onCampaignPad(game.t.groups[index]));
 assert.equal(values[1],values[0],label+' matches the original predicate');
 if(expected!==undefined)assert.equal(values[1],expected,label);
}
function openMixedRing(t){
 const parts=[];
 for(let y=-3;y<=3;y++)for(let x=-3;x<=3;x++)if(Math.abs(x)===3||Math.abs(y)===3)parts.push({id:t.allocateUnitId(),shape:parts.length?'cube':'tetra',weight:1,p:t.V(x*.09,1.7+y*.09,-1.25),q:t.Q()});
 return t.makeGroup(parts);
}
function hitState(hit){return hit?JSON.stringify({id:hit.part.id,distance:hit.distance,point:hit.point,normal:hit.normal}):null;}

test('an empty pressure-pad list needs no geometry and preserves the original false result',()=>{
 const games=pair();
 for(const game of games){
  const {t,query}=game,g=openMixedRing(t);assert(g.parts.length>16);
  assert.equal(g.rotatedBoundsCache,undefined,'a mixed group starts without an orientation cache');
  assert.equal(g.localBoundsTree,undefined,'no earlier query may warm the large local tree');
  query.boundsCalls=0;
 }
 for(let i=0;i<5;i++)samePad(games,false,'empty query '+i);
 assert.equal(games[0].query.boundsCalls,5,'the oracle demonstrates the removed geometric work');
 assert.equal(games[1].query.boundsCalls,0,'absence of pads must not request any group bounds');
 assert(games[0].t.groups[0].localBoundsTree);
 assert.equal(games[1].t.groups[0].localBoundsTree,undefined);
 assert.equal(games[1].t.groups[0].rigidQueryLayout,undefined);
 assert.deepEqual(plain(games[1].t.getTickState()),plain(games[0].t.getTickState()));
 sameState(games,'skipping unused geometry changes neither saved nor physical state');
});

test('pad insertion, removal, replacement and puzzle precedence are observed immediately',()=>{
 const games=pair();for(const {t}of games)t.addQubit([0,.045,0]);
 samePad(games,false,'initial absence');
 for(const {t}of games)t.storyWorld.buttons.push(pad(t));
 samePad(games,true,'insertion in the existing array');
 for(const {t}of games)t.storyWorld.buttons.splice(0);
 samePad(games,false,'removal from the same array');
 for(const {t}of games)t.storyWorld.buttons=[pad(t,1)];
 samePad(games,false,'replacement with a distant button');
 for(const {t}of games)t.storyWorld.buttons[0].p.x=0;
 samePad(games,true,'button motion is not cached');
 for(const {t}of games){t.puzzle.active=true;t.puzzle.buttons=[];}
 samePad(games,false,'an active empty puzzle list takes precedence over campaign pads');
 for(const {t}of games)t.puzzle.buttons.push(pad(t));
 samePad(games,true,'puzzle insertion after its empty result');
 for(const {t}of games){t.storyWorld.buttons=[];t.puzzle.active=false;}
 samePad(games,false,'inactive puzzle buttons do not replace an empty story list');
 for(const {t}of games)t.puzzle.active=true;
 samePad(games,true,'reactivating the existing puzzle list');
 for(const {t}of games)t.puzzle.buttons=[pad(t,-1)];
 samePad(games,false,'replacing the active puzzle list');
 sameState(games,'button-list transitions preserve all gameplay state');
});

test('pad footprint margins, strict height, surface, half-size and current pose match the original',()=>{
 const games=pair();for(const {t}of games){t.addQubit([0,.045,0]);t.storyWorld.buttons=[pad(t,0,0,.039)];}
 samePad(games,true,'both horizontal footprint edges are inclusive');
 for(const [axis,delta]of [['x',1e-8],['x',-1e-8],['z',1e-8],['z',-1e-8]]){
  for(const {t}of games){t.groups[0].body.position.set(0,.045,0);t.groups[0].body.position[axis]=delta;}
  samePad(games,false,'outside '+axis+' margin '+delta);
 }
 for(const {t}of games){t.groups[0].body.position.set(0,.045,0);t.storyWorld.buttons[0].surface=-.025;}
 samePad(games,false,'minimum height equal to the threshold is excluded');
 for(const {t}of games)t.groups[0].body.position.y-=1e-8;
 samePad(games,true,'a height just below the threshold is admitted');
 for(const {t}of games){t.groups[0].body.position.y=.045;t.storyWorld.buttons[0].surface=0;t.groups[0].body.quaternion.setFromEuler(0,Math.PI/4,0);}
 samePad(games,false,'body rotation changes its real footprint');
 for(const {t}of games)t.storyWorld.buttons[0].half=.07;
 samePad(games,true,'growing the same pad admits the rotated footprint');
 for(const {t}of games){t.groups[0].route={};t.groups[0].haulJob={};}
 samePad(games,true,'this predicate retains its original treatment of routed and hauling groups');
 for(const {t}of games){t.groups[0].route=null;t.groups[0].haulJob=null;delete t.storyWorld.buttons[0].surface;}
 samePad(games,true,'missing surface retains the original zero default');
 sameState(games,'geometric probes do not mutate the body or material');
});

for(const hz of [60,120,240])test('moods, duty and energy match across pad transitions at '+hz+' Hz',()=>{
 const games=pair(hz);
 for(const {t}of games)for(const x of [0,1]){
  const g=t.addQubit([x,.045,0]);Object.assign(g.parts[0].mood,{energy:.5,idle:12,calm:0,fullTime:0,state:'excited',blend:[0,1,0]});
 }
 const advance=(count,label)=>{for(const {t}of games)for(let i=0;i<count;i++)t.updateMoods(t.getPhysicsStep());sameState(games,label);};
 advance(5,'empty-pad moods');
 const near=games[1].t.groups[0];assert.equal(near.moodDuty,false);assert(near.parts[0].mood.idle>12);assert(near.parts[0].mood.energy>.5);
 for(const {t}of games)t.storyWorld.buttons.push(pad(t));
 advance(5,'working on the newly inserted pad');
 assert.equal(near.moodDuty,true);assert.equal(near.parts[0].mood.idle,0);assert.equal(near.parts[0].mood.state,'neutral');assert.equal(games[1].t.groups[1].moodDuty,false);
 for(const {t}of games)t.storyWorld.buttons=[];
 advance(1,'retiring the final pad');assert.equal(near.moodDuty,false);assert(near.parts[0].mood.idle>0);
 for(const {t}of games){t.storyWorld.buttons=[pad(t)];t.puzzle.active=true;t.puzzle.buttons=[];}
 advance(1,'empty active puzzle overrides campaign duty');assert.equal(near.moodDuty,false);
 for(const {t}of games)t.puzzle.buttons.push(pad(t));
 advance(1,'puzzle-button duty still short-circuits campaign duty');assert.equal(near.moodDuty,true);assert.equal(near.parts[0].mood.idle,0);
});

test('the first spatial and placement queries remain correct after omitting unused bounds on a large open group',()=>{
 const games=pair();
 for(const {t}of games){openMixedRing(t);t.addQubit([0,1.7,-2]);}
 samePad(games,false,'no pads before any later query');
 const candidate=games[1].t.groups[0];assert.equal(candidate.localBoundsTree,undefined);assert.equal(candidate.partQueryCache,undefined);
 const hits=games.map(({t})=>t.aimQubit(4,t.V(0,0,-1)));
 assert.equal(hitState(hits[1]),hitState(hits[0]));
 for(let i=0;i<games.length;i++)assert.equal(hits[i].part.id,games[i].t.groups[1].parts[0].id,'the open center remains selectable through the group');
 assert(candidate.partQueryCache,'the selection index builds independently on demand');
 assert.equal(candidate.localBoundsTree,undefined,'selection does not rely on pad bounds initialization');
 const boxes=games.map(({t})=>plain(t.bounds(t.groups[0])));assert.deepEqual(boxes[1],boxes[0]);assert(candidate.localBoundsTree,'the first needed bounds query initializes its own local hierarchy');
 for(const {t}of games){
  const g=t.groups[0],back=t.groups[1];
  assert.equal(t.validPose(back,t.V(0,1.7,-1.25),t.Q()),true,'placement preserves the empty middle');
  assert.equal(t.validPose(back,t.V(-.27,1.7,-1.25),t.Q()),false,'placement still rejects a solid edge');
  g.body.position.x+=.12;g.body.quaternion.setFromEuler(.17,.31,-.08);
 }
 assert.deepEqual(plain(games[1].t.bounds(candidate)),plain(games[0].t.bounds(games[0].t.groups[0])),'later movement and rotation retain current bounds');
 for(const {t}of games){const g=t.groups[0],b=t.bounds(g);t.storyWorld.buttons=[pad(t,b.center.x,b.center.z,1,b.min.y)];}
 samePad(games,true,'a pad inserted after cold queries is immediately available');
 sameState(games,'queries preserve matter, full state and clocks');
});

test('available haulers preserve pad exclusions and order when active lists change',()=>{
 const games=pair();
 for(const {t}of games){t.addQubit([0,.045,0]);t.addQubit([1,.045,0]);t.story.campaign={crew:t.groups.flatMap(g=>g.parts.map(p=>p.id))};}
 const haulers=game=>game.query.availableHaulers({body:{position:game.t.V(0,.045,0)}}).map(g=>g.parts[0].id);
 const check=count=>{const a=haulers(games[0]),b=haulers(games[1]);assert.deepEqual(Array.from(b),Array.from(a));assert.equal(b.length,count);};
 check(2);
 for(const {t}of games)t.storyWorld.buttons.push(pad(t));
 check(1);assert.equal(haulers(games[1])[0],games[1].t.groups[1].parts[0].id);
 for(const {t}of games){t.puzzle.active=true;t.puzzle.buttons=[];}
 check(2);
 for(const {t}of games)t.puzzle.buttons.push(pad(t,1));
 check(1);assert.equal(haulers(games[1])[0],games[1].t.groups[0].parts[0].id);
 for(const {t}of games)t.puzzle.buttons=[];
 check(2);sameState(games,'hauler eligibility queries preserve full state');
});
