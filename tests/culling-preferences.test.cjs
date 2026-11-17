const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../assets/js/preferences.js');
const createGame = require('./game-harness.cjs');

function storage(raw = {}) {
  const data = new Map(Object.entries(raw));
  return {getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value)};
}

test('old preferences acquire culling without losing existing settings; only boolean values override it', () => {
  const old = P.defaults();
  delete old.culling;
  old.resolution = 75;
  old.profiles.neon.cableColor = '#ff00cc';
  const migrated = P.load(storage({[P.KEY]: JSON.stringify(old)}));
  assert.equal(migrated.culling, true);
  assert.equal(migrated.resolution, 75);
  assert.equal(migrated.profiles.neon.cableColor, '#ff00cc');
  assert.equal(P.sanitize({...old, culling: false}).culling, false);
  for (const value of [undefined, null, 'false', 0, 1, {}, []]) {
    assert.equal(P.sanitize({...old, culling: value}).culling, true);
  }
});

test('culling is shared across styles and survives quality changes, save and reload', () => {
  const store = storage(), tx = P.transaction(store);
  tx.draft.culling = false;
  tx.draft.style = 'neon';
  P.setQuality(tx.draft, 'high');
  assert.equal(P.effective(tx.draft).culling, false);
  tx.save();
  const loaded = P.load(store);
  assert.equal(loaded.culling, false);
  loaded.style = 'psx';
  P.setQuality(loaded, 'low');
  assert.equal(P.effective(loaded).culling, false);
  tx.draft.culling = true;
  tx.discard();
  assert.equal(tx.draft.culling, false);
});

function settingsFixture() {
  const game = createGame(), {t, sandbox} = game, document = sandbox.document;
  sandbox.localStorage = storage();
  const tabs = ['look', 'performance', 'game', 'audio', 'keyboard', 'mando', 'subtitles'].map(name => {
    const node = document.createElement('button');
    node.dataset.settingsTab = name;
    return node;
  });
  document.querySelector('#settings-screen').querySelectorAll = query => query === '[data-settings-tab]' ? tabs : [];
  Object.assign(t.story, {ready: true, mode: 'pause'});
  t.initSettingsScreen();
  const settings = t.getSettingsScreen();
  settings.open('pause');
  tabs[1].dispatchEvent({type: 'click'});
  return {...game, settings, document, click: id => document.querySelector('#' + id).dispatchEvent({type: 'click'})};
}

test('the culling checkbox only applies on save and discard preserves the live value', () => {
  const {t, settings, document, click} = settingsFixture();
  const initialQuality = settings.draft.quality;
  let input = document.querySelector('#pref-culling');
  assert.equal(input.checked, true);
  input.checked = false;
  input.dispatchEvent({type: 'change'});
  assert.equal(settings.draft.culling, false);
  assert.equal(settings.draft.quality, initialQuality);
  assert.equal(t.getVisuals().culling, true);
  click('settings-save');
  assert.equal(t.getVisuals().culling, false);
  input = document.querySelector('#pref-culling');
  input.checked = true;
  input.dispatchEvent({type: 'change'});
  settings.requestClose();
  assert.equal(document.querySelector('#settings-confirm').hidden, false);
  click('settings-discard');
  assert.equal(settings.isOpen, false);
  assert.equal(t.getVisuals().culling, false);
});

test('restoring performance includes culling without changing visual style or applying before save', () => {
  const {t, settings, document, click} = settingsFixture();
  const input = document.querySelector('#pref-culling');
  input.checked = false;
  input.dispatchEvent({type: 'change'});
  click('settings-save');
  const style = settings.draft.style;
  click('settings-reset');
  assert.equal(settings.draft.culling, true);
  assert.equal(settings.draft.style, style);
  assert.equal(t.getVisuals().culling, false);
  click('settings-save');
  assert.equal(t.getVisuals().culling, true);
});
