import test from 'node:test';
import assert from 'node:assert/strict';
import { ENTRIES, itemsFor, defaultSelection, MODES } from '../src/data.js';
import { createGame, draw, grade, undoGrade, disableChallenge, summarize, emptyStore, saveStore, loadStore, keepRecent, STORAGE_KEY } from '../src/engine.js';
const config = (extra = {}) => ({ mode: 'initial', selected: ['b', 'p', 'm', 'f'], distance: 3, scene: 'home', character: 'rabbit', order: 'balanced', challenge: false, ...extra });
const game = extra => createGame(config(extra), 1000);
const answer = (g, rating = 'independent', at = 1000) => grade(draw(g, () => .5), rating, at);

test('default session has four items, zero positions and no challenge', () => {
  const g = game(); assert.equal(g.config.selected.length, 4); assert.deepEqual(Object.values(g.positions), [0, 0, 0, 0]); assert.equal(g.challenge, false);
});
test('every mode has valid canonical, selectable content', () => {
  for (const m of MODES) { assert.ok(itemsFor(m.id).length >= 4); assert.equal(defaultSelection(m.id).length, 4); }
  assert.ok(ENTRIES.some(e => e.text === 'ü')); assert.ok(ENTRIES.some(e => e.text === 'lǜ'));
  for (const mode of MODES.filter(m => m.id !== 'custom')) {
    const ids = itemsFor(mode.id).map(e => e.id); assert.equal(ids.length, new Set(ids).size);
  }
});
test('invalid count, distance and unknown items cannot start', () => {
  for (const cfg of [{ selected: [] }, { selected: ENTRIES.slice(0, 21).map(e => e.id) }, { selected: ['invalid'] }, { distance: 2 }, { distance: 11 }, { distance: 3.5 }, { scene: 'invalid' }]) assert.throws(() => game(cfg));
});
test('selection deduplicates canonical items across modes', () => assert.deepEqual(game({ selected: ['mā', 'mā'] }).config.selected, ['mā']));
test('balanced draw covers every remaining item exactly once per round', () => {
  let g = game(); const drawn = [];
  for (let i = 0; i < 4; i++) { g = draw(g, () => .2); drawn.push(g.current); g = grade(g, 'pending'); }
  assert.equal(new Set(drawn).size, 4); assert.equal(g.queue.length, 0);
});
test('balanced round avoids immediately repeating the previous last item', () => {
  let g = game({ selected: ['b', 'p'] }); g = { ...g, lastDraw: 'b' };
  assert.equal(draw(g, () => .99).current, 'p');
});
test('legacy random config now uses balanced draws', () => {
  let g = game({ order: 'random' }); const drawn = [];
  assert.equal(g.config.order, 'balanced');
  for (let i = 0; i < 4; i++) { g = draw(g, () => 0); drawn.push(g.current); g = grade(g, 'pending'); }
  assert.equal(new Set(drawn).size, 4);
});
test('drawing while reading never changes the selected item', () => { const g = draw(game()); assert.equal(draw(g), g); });
test('independent completion and self correction both advance two', () => {
  for (const r of ['independent', 'corrected']) { const g = answer(game({ selected: ['b'] }), r); assert.equal(g.positions.b, 2); }
});
test('assisted completion advances one; pending preserves progress by default', () => {
  let g = answer(game({ selected: ['b'] }), 'assisted'); assert.equal(g.positions.b, 1);
  g = answer(g, 'pending'); assert.equal(g.positions.b, 1); assert.equal(g.events.length, 2);
});
test('challenge retreats one and clamps at the start', () => {
  let g = answer(game({ selected: ['b'], challenge: true }), 'pending'); assert.equal(g.positions.b, 0); assert.equal(g.events[0].rating, 'pending');
  g = answer(g); g = answer(g, 'pending'); assert.equal(g.positions.b, 1);
});
test('end boundary clamps, completion occurs only once and prevents more scoring', () => {
  let g = answer(game({ selected: ['b'] })); g = answer(g); assert.equal(g.positions.b, 3); assert.equal(g.status, 'complete');
  assert.equal(draw(g), g); assert.equal(grade(g, 'independent'), g);
});
test('arrived items leave the draw pool including an old queued entry', () => {
  let g = game({ selected: ['b', 'p'] });
  g = { ...g, positions: { b: 3, p: 0 }, queue: ['b', 'p'] };
  for (let i = 0; i < 4; i++) { g = draw(g, () => 0); assert.equal(g.current, 'p'); g = grade(g, 'pending'); }
  assert.equal(g.status, 'active');
});
test('duplicate score submission is ignored', () => { const g = answer(game()); assert.equal(grade(g, 'independent'), g); assert.equal(g.events.length, 1); });
test('undo restores reading item, position, queue and event count after completion', () => {
  let g = answer(game({ selected: ['b'] })); const before = draw(g); g = grade(before, 'corrected'); assert.equal(g.status, 'complete');
  g = undoGrade(g); assert.equal(g.status, 'active'); assert.equal(g.phase, 'reading'); assert.equal(g.current, 'b'); assert.deepEqual(g.positions, before.positions); assert.deepEqual(g.queue, before.queue); assert.equal(g.events.length, 1); assert.equal(g.undo, null);
});
test('undo remains available after next draw and restores the scored item', () => {
  let g = game(); const before = draw(g, () => 0); g = grade(before, 'assisted'); g = draw(g, () => 0); g = undoGrade(g); assert.equal(g.current, before.current); assert.equal(g.events.length, 0);
});
test('closing challenge is not undone by undoing a score', () => {
  let g = answer(game({ selected: ['b'], challenge: true })); g = disableChallenge(g); g = undoGrade(g);
  assert.equal(g.challenge, false); assert.equal(g.challengeDisabled, true); g = grade(g, 'pending'); assert.equal(g.positions.b, 0);
});
test('statistics exclude self correction from help and require at least three samples', () => {
  let g = game({ selected: ['b'], distance: 10 }); g = answer(g, 'corrected', 10); g = answer(g, 'assisted', 20);
  let row = summarize([g])[0]; assert.equal(row.weak, false); assert.equal(row.helpRatio, .5);
  g = answer(g, 'pending', 30); row = summarize([g])[0]; assert.equal(row.weak, true); assert.equal(row.helpRatio, 2 / 3); assert.equal(row.corrected, 1);
  assert.equal(summarize([undoGrade(g)])[0].total, 2);
});
test('statistics aggregate across modes but distinguish tones and filter time', () => {
  const a = answer(game({ mode: 'tone', selected: ['mā'] }), 'pending', 10);
  const b = answer(game({ mode: 'syllable', selected: ['mā'] }), 'assisted', 20);
  const c = answer(game({ mode: 'tone', selected: ['má'] }), 'corrected', 30);
  const rows = summarize([a, b, c]); assert.equal(rows.length, 2); assert.equal(rows.find(r => r.id === 'mā').total, 2);
  assert.equal(summarize([a, b, c], 25).length, 1);
});
test('weak rows sort by help ratio, then pending count, then recency', () => {
  const make = (id, ratings, at) => { let g = game({ selected: [id], distance: 10 }); for (const r of ratings) g = answer(g, r, at); return g; };
  const rows = summarize([make('b', ['pending', 'pending', 'pending'], 1), make('p', ['assisted', 'assisted', 'assisted'], 3), make('m', ['corrected', 'assisted', 'pending'], 4), make('f', ['pending', 'pending', 'pending'], 2)]);
  assert.deepEqual(rows.map(r => r.id), ['f', 'b', 'p', 'm']);
});
test('save and restore preserves drawn item, queue, phase and challenge', () => {
  const memory = new Map(); const storage = { setItem: (k, v) => memory.set(k, v), getItem: k => memory.get(k) || null };
  const g = draw(game({ challenge: true })); const s = { ...emptyStore(), currentId: g.id, games: [g] };
  saveStore(storage, s); const restored = loadStore(storage); assert.deepEqual(restored, s);
  memory.set(STORAGE_KEY, '{broken'); assert.throws(() => loadStore(storage));
});
test('storage failures propagate for a visible warning', () => { assert.throws(() => saveStore({ setItem() { throw new Error('QuotaExceeded'); } }, emptyStore())); });
test('history keeps one hundred historical sessions plus current active session', () => {
  const active = game(); const games = Array.from({ length: 110 }, () => ({ ...game(), status: 'abandoned' }));
  const result = keepRecent({ ...emptyStore(), currentId: active.id, games: [active, ...games] });
  assert.equal(result.games.length, 101); assert.equal(result.games.at(-1).id, active.id); assert.equal(result.games[0].id, games[10].id);
});

test('catch-up starts at three spaces, chooses the lowest and preserves the normal queue', () => {
  const base = { ...game({ distance: 10 }), positions: { b: 0, p: 1, m: 2, f: 2 }, queue: ['f', 'm', 'p', 'b'] };
  assert.equal(draw(base, () => 0).current, 'f');
  const lagging = { ...base, positions: { ...base.positions, f: 3 } };
  const bonus = draw(lagging, () => 0);
  assert.equal(bonus.current, 'b'); assert.equal(bonus.catchUpLast, true); assert.deepEqual(bonus.queue, lagging.queue);
  const normal = draw(grade(bonus, 'pending'), () => 0);
  assert.equal(normal.current, 'f'); assert.equal(normal.catchUpLast, false);
  assert.equal(draw(grade(normal, 'pending'), () => 0).current, 'b');
});
test('tied catch-up candidates are random and avoid immediate repeat when possible', () => {
  const base = { ...game({ distance: 10 }), positions: { b: 0, p: 0, m: 3, f: 4 } };
  assert.equal(draw(base, () => 0).current, 'b');
  assert.equal(draw(base, () => .99).current, 'p');
  assert.equal(draw({ ...base, lastDraw: 'b' }, () => 0).current, 'p');
});
test('constant catch-up pressure cannot starve the regular queue', () => {
  let g = { ...game({ distance: 10 }), positions: { b: 0, p: 4, m: 4, f: 4 }, queue: ['p', 'm', 'f', 'b'] };
  const normal = [];
  for (let i = 0; i < 8; i++) { g = draw(g, () => .5); if (!g.catchUpLast) normal.push(g.current); g = grade(g, 'pending'); }
  assert.deepEqual(normal, ['p', 'm', 'f', 'b']);
});
test('undo and storage preserve catch-up scheduling; old saves acquire defaults', () => {
  let g = { ...game({ distance: 10 }), positions: { b: 0, p: 4, m: 4, f: 4 } };
  g = draw(g); const before = g; g = grade(g, 'assisted');
  const restored = undoGrade(g); assert.equal(restored.catchUpLast, true); assert.deepEqual(restored.queue, before.queue);
  const store = { ...emptyStore(), currentId: g.id, games: [g] };
  const storage = { getItem: () => JSON.stringify(store) };
  assert.equal(loadStore(storage).games[0].catchUpLast, true);
  delete g.catchUpLast; delete g.undo.catchUpLast; g.config.order = 'random';
  const migrated = loadStore(storage).games[0];
  assert.equal(migrated.config.order, 'balanced'); assert.equal(migrated.catchUpLast, false); assert.equal(migrated.undo.catchUpLast, false);
  assert.deepEqual(migrated.positions, g.positions); assert.deepEqual(migrated.events, g.events);
});
