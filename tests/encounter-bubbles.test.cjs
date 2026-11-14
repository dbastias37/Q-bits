const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');

test('wrapped encounter bubbles stay inside the viewport and separate by their real height', () => {
  const {t} = createGame();
  for (const width of [320, 1280]) {
    const placed = [];
    // The longest Tengoku greeting wraps to about 69px; shorter greetings have different heights.
    for (const height of [69, 45, 69]) {
      const rect = t.placeEncounterBubble({x:11,y:65}, {width:width===320?210:240,height}, placed, width, 400);
      assert(rect, 'three greetings fit near the top without being cut off');
      assert(rect.left>=12 && rect.right<=width-12 && rect.top>=12 && rect.bottom<=388);
      for (const other of placed) assert(rect.top>=other.bottom+8 || rect.bottom<=other.top-8);
      placed.push(rect);
    }
    const right = t.placeEncounterBubble({x:width-11,y:200}, {width:240,height:69}, [], width, 400);
    assert.equal(right.right, width-12);
  }
  assert.equal(t.placeEncounterBubble({x:160,y:70}, {width:240,height:69}, [{left:12,right:308,top:12,bottom:88}], 320, 100), null);
});

test('encounter measurements are cached per bubble and viewport, including a newly added bubble', () => {
  const {t} = createGame();let reads=0;
  const bubble = () => ({node:{get offsetWidth(){reads++;return 240;},get offsetHeight(){reads++;return 69;}}});
  const bubbles=[bubble(),bubble()];
  t.measureEncounterBubbles(bubbles,1280,720);assert.equal(reads,4);
  for(let i=0;i<120;i++)t.measureEncounterBubbles(bubbles,1280,720);
  assert.equal(reads,4,'moving the camera does not force size reads');
  bubbles.push(bubble());t.measureEncounterBubbles(bubbles,1280,720);assert.equal(reads,6);
  t.measureEncounterBubbles(bubbles,320,720);assert.equal(reads,12,'width changes can reflow text');
  t.measureEncounterBubbles(bubbles,320,480);assert.equal(reads,18,'viewport resize invalidates the cache');
});

test('only the three newest encounter bubbles are retained', () => {
  const {t} = createGame();let removed=false;
  t.addEncounterBubble(1,'¡Hola!');t.encounterBubbles[0].node.remove=()=>{removed=true;};
  for(let id=2;id<=4;id++)t.addEncounterBubble(id,'¡Un gusto!');
  assert(removed);assert.equal(t.encounterBubbles.length,3);
  assert.deepEqual(Array.from(t.encounterBubbles,b=>b.id),[2,3,4]);
});
