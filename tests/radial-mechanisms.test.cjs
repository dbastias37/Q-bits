const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');

function setup({locked=false, reordered=false}={}) {
  const game=createGame(),{t,sandbox}=game;
  const profiles=['cube','tetra','pyramid','coupler','rotor'].map((id,index)=>{
    const mesh=t.unitProfile(index<3?id:'pyramid');
    return {id,title:id,subtitle:'Geometría',description:'Descripción del mecanismo y de su comportamiento.',
      locked:index===4&&locked,lockedDescription:'Completa La primera unión para desbloquear el rotor.',
      section:index<3?'pieces':'mechanisms',vertices:mesh.vertices.map(v=>[v.x,v.y,v.z]),faces:mesh.faces};
  });
  if(reordered)profiles.unshift(profiles.pop());
  const menu=sandbox.QBitsRadial.create({profiles});
  return {...game,menu};
}
function aim(menu,id){const item=menu.getState().figures.find(item=>item.id===id);menu.moveTo(item.x,item.y);}

test('three upper sectors and two lower crystal panels keep matching pointer regions at varied sizes',()=>{
  const {menu,sandbox}=setup();
  for(const [width,height]of [[1280,720],[320,568],[600,420],[1920,1080]]){
    sandbox.innerWidth=width;sandbox.innerHeight=height;menu.open('cube');sandbox.dispatchEvent({type:'resize'});
    const g=sandbox.QBitsRadial.layout(width,height,3,2),figures=menu.getState().figures;
    for(let i=0;i<figures.length;i++){
      const item=figures[i];
      assert.equal(sandbox.QBitsRadial.hitTest(item.x,item.y,width,height,3,2),i,item.id);
      aim(menu,item.id);assert.equal(menu.hovered,item.id);
      assert(item.x>0&&item.x<width&&item.y>0&&item.y<height);
    }
    assert(g.cards.every(card=>card.top>g.cy));
    assert(g.cards[0].left+g.cards[0].width<g.cards[1].left,'separate lower hit areas');
    assert(g.cards.every(card=>card.top+card.height<g.detailTop),'description stays below glass');
    assert(g.helpTop>=g.detailTop+60&&g.helpTop<height);
    menu.moveTo(g.cx,g.cy-g.inner*.25);assert.equal(menu.hovered,null,'cancel remains clear');
    menu.moveTo(g.cx,g.cards[0].top+g.cards[0].height/2);assert.equal(menu.hovered,null,'gap is not selectable');
    menu.close();
  }
});

test('locked mechanisms describe their unlock but cannot be chosen and arrows skip them',()=>{
  const {menu,sandbox}=setup({locked:true});menu.open('cube');aim(menu,'rotor');
  assert.equal(menu.hovered,null);assert.equal(menu.getState().highlighted,'rotor');
  const root=sandbox.document.querySelector('#unit-radial'),stage=root.children.find(child=>child.className==='radial-stage');
  const detail=stage.children.find(child=>child.className==='radial-description');
  assert.match(detail.children[0].textContent,/Bloqueado/);assert.match(detail.children[1].textContent,/primera unión/);
  assert.equal(sandbox.document.querySelector('#radial-option-rotor').getAttribute('aria-disabled'),'true');
  menu.chooseNext(1);assert.equal(menu.hovered,'cube');
  for(const id of ['tetra','pyramid','coupler','cube']){menu.chooseNext(1);assert.equal(menu.hovered,id);}
  aim(menu,'rotor');assert.equal(menu.setLocked('rotor',false),true);assert.equal(menu.hovered,'rotor');
  assert.equal(sandbox.document.querySelector('#radial-option-rotor').getAttribute('aria-disabled'),'false');
  menu.chooseNext(-1);assert.equal(menu.hovered,'coupler');
  assert.equal(menu.setLocked('unknown',true),false);
});

test('profile order does not change the upper/lower visual categories or their selection IDs',()=>{
  const {menu}=setup({reordered:true});menu.open('cube');
  for(const id of ['cube','tetra','pyramid','coupler','rotor']){aim(menu,id);assert.equal(menu.hovered,id);}
  aim(menu,'cube');for(const id of ['tetra','pyramid','rotor','coupler','cube']){menu.chooseNext(1);assert.equal(menu.hovered,id);}
});

test('glass panels have distinct rear contours and sidewall meshes while figure hover accelerates',()=>{
  const {menu,sandbox,frame}=setup();menu.open('cube');
  const root=sandbox.document.querySelector('#unit-radial'),stage=root.children.find(child=>child.className==='radial-stage');
  const backs=stage.children.filter(child=>child.className==='radial-crystal-back');
  const panels=stage.children.filter(child=>child.className==='radial-sector');
  const depth=stage.children.find(child=>child.classList.contains('radial-depth'));
  assert.equal(backs.length,5);assert.equal(panels.length,5);assert.equal(depth.children.length,5);
  for(let i=0;i<5;i++){
    assert.notEqual(backs[i].style.clipPath,panels[i].style.clipPath,'rear surface is offset from polished face');
    assert((depth.children[i].getAttribute('d').match(/Z/g)||[]).length>=8,'sidewall joins every contour edge');
  }
  const start=performance.now();aim(menu,'rotor');for(let i=0;i<30;i++)frame(start+i*50);
  const state=menu.getState();assert(state.figures.find(item=>item.id==='rotor').speed>state.figures.find(item=>item.id==='coupler').speed*2);
});
