const test=require('node:test');const assert=require('node:assert/strict');const createGame=require('./game-harness.cjs');
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle',progress:{}});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.setupWorkshop();return game;}
const node=(game,id)=>game.sandbox.document.querySelector('#workshop-'+id);
function bar(t,count){const p=t.getWorkshopBench().p,g=t.makeGroup(Array.from({length:count},(_,i)=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(p.x+(i-(count-1)/2)*.09,p.y+.055,p.z),q:t.Q()})));t.setSelected({g,part:g.parts[0]});return g;}
const click=node=>node.dispatchEvent({type:'click'});

test('large workshop drafts choices without mutating pieces and leaves the applied result on the bench',()=>{
 const game=lab(),{t}=game,g=bar(t,2),before=t.worldParts(g);assert(t.openWorkshopPanel());assert(t.storySuspended());assert.equal(node(game,'screen').hidden,false);const panel=t.getWorkshopPanel();
 panel.choose('battery:3');assert.equal(node(game,'apply').disabled,true);assert.match(node(game,'reason').textContent,/3 cubos/);assert(g.parts.every(p=>!t.isExternalBattery(p)));panel.choose('battery:2');assert.equal(node(game,'apply').disabled,false);assert.equal(panel.model.preview.size[0],2);
 click(node(game,'apply'));assert(g.parts.every(t.isExternalBattery));assert(panel.isOpen);assert.equal(panel.draft.choice,'battery:keep');assert.match(node(game,'feedback').textContent,/creada/);assert.equal(t.getHeld(),null);
 const after=t.worldParts(g);for(let i=0;i<after.length;i++){assert.equal(after[i].id,before[i].id);assert.equal(after[i].weight,before[i].weight);assert(after[i].p.distanceTo(before[i].p)<1e-12);}
 t.closeWorkshopPanel(false);t.openWorkshopPanel();assert.equal(panel.draft.choice,'battery:keep');assert.equal(node(game,'reason').dataset.error,'false');
});

test('body sliders update an exact preview and volume validation without replacing the focused slider',()=>{
 const game=lab(),{t}=game,g=bar(t,4),before=t.worldParts(g);t.openWorkshopPanel('bodies');const x=game.sandbox.document.querySelector('#workshop-field-dimension-x'),z=game.sandbox.document.querySelector('#workshop-field-dimension-z');
 x.value='2';x.dispatchEvent({type:'input'});assert.equal(game.sandbox.document.querySelector('#workshop-field-dimension-x'),x);assert.equal(t.getWorkshopPanel().model.allowed,false);
 z.value='2';z.dispatchEvent({type:'input'});assert.equal(t.getWorkshopPanel().model.allowed,true);assert.deepEqual(Array.from(t.getWorkshopPanel().model.preview.size),[2,1,2]);assert.deepEqual(Array.from(t.worldParts(g),p=>[p.p.x,p.p.y,p.p.z]),Array.from(before,p=>[p.p.x,p.p.y,p.p.z]));
 click(node(game,'apply'));assert.equal(t.getSelected().g.parts.length,4);assert.equal(t.getSelected().g.block.counts[0],2);assert.equal(t.getSelected().g.block.counts[2],2);assert(t.getWorkshopPanel().isOpen);
});

test('a stale preview revalidates the workpiece before applying instead of converting another object',()=>{
 const game=lab(),{t}=game,g=bar(t,1);t.openWorkshopPanel();assert.equal(node(game,'apply').disabled,false);g.body.position.x+=4;
 click(node(game,'apply'));assert(g.parts.every(p=>!t.isExternalBattery(p)));assert.equal(node(game,'apply').disabled,true);assert.match(node(game,'feedback').textContent,/mesa/);
});

test('a different bench target requires a new confirmation and non-cube previews retain their geometry',()=>{
 const game=lab(),{t}=game,g=bar(t,1);t.openWorkshopPanel();g.body.position.x+=4;const replacement=bar(t,1);click(node(game,'apply'));assert(!t.isExternalBattery(replacement.parts[0]));assert.match(node(game,'feedback').textContent,/cambió/);click(node(game,'apply'));assert(t.isExternalBattery(replacement.parts[0]));
 t.closeWorkshopPanel(false);replacement.body.position.x+=4;const p=t.getWorkshopBench().p,tri=t.makeGroup([{id:t.allocateUnitId(),shape:'tetra',weight:1,p:t.V(p.x,p.y+.055,p.z),q:t.Q()}]);t.setSelected({g:tri,part:tri.parts[0]});t.openWorkshopPanel('upgrades');const preview=t.getWorkshopPanel().model.preview;assert.equal(preview.mesh.vertices.length,4);assert.equal(preview.mesh.faces.length,4);assert.match(node(game,'preview-description').textContent,/T-bit/);
});

test('research and fitting remain separate explicit operations with real credit and availability checks',()=>{
 const game=lab(),{t,sandbox}=game,g=bar(t,1);t.openWorkshopPanel('upgrades');assert.equal(node(game,'apply').disabled,true);assert.match(node(game,'reason').textContent,/Investiga/);
 t.getWorkshopPanel().setMode('research');assert.equal(node(game,'apply').disabled,true);assert.match(node(game,'reason').textContent,/créditos/);t.story.progress.level1=true;t.closeWorkshopPanel(false);t.openWorkshopPanel('upgrades');const p=t.getWorkshopPanel();p.setMode('research');
 assert.equal(node(game,'apply').disabled,false);click(node(game,'apply'));assert(t.getWorkshopProfile().research.includes('sensor'));assert.equal(t.getWorkshopProfile().credits,4);assert.equal(sandbox.QBitsWorkshop.partState(t.rotorPart(g.parts[0].id).part).sensor,false);
 p.setMode('adapt');click(node(game,'apply'));assert(sandbox.QBitsWorkshop.partState(t.rotorPart(g.parts[0].id).part).sensor);assert.equal(t.getWorkshopProfile().credits,4);
});

test('the close button and E/Escape leave the workshop without applying pending choices',()=>{
 const game=lab(),{t,sandbox}=game,g=bar(t,1);t.canvas.requestPointerLock=()=>{sandbox.document.pointerLockElement=t.canvas;};
 for(const code of ['Escape','KeyE','KeyP']){t.openWorkshopPanel();sandbox.document.activeElement=node(game,'apply');t.onPhysicalKeyDown({code,repeat:false,preventDefault(){},target:node(game,'apply')});assert.equal(t.getWorkshopPanel().isOpen,false);assert(g.parts.every(p=>!t.isExternalBattery(p)));}
 t.openWorkshopPanel();click(node(game,'close'));assert.equal(t.getWorkshopPanel().isOpen,false);assert.equal(sandbox.document.pointerLockElement,t.canvas);
});
