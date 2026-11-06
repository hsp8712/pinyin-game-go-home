import { ITEM_MAP, RATINGS, SCENES, CHARACTERS, MODES } from './data.js';
export const STORAGE_KEY = 'pinyin-adventure-v1';
export function emptyStore() { return { version: 1, currentId: null, games: [], reducedMotion: false }; }
export function shuffle(list, rng = Math.random) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function createGame(config, now = Date.now()) {
  const selected = [...new Set(config.selected)];
  if (selected.length < 1 || selected.length > 20 || selected.some(id => !ITEM_MAP[id])) throw new Error('请选择 1～20 个题库中的拼音');
  if (!Number.isInteger(config.distance) || config.distance < 3 || config.distance > 10) throw new Error('路程应为 3～10 格');
  if (!SCENES.some(s => s.id === config.scene) || !CHARACTERS.some(c => c.id === config.character) || !MODES.some(m => m.id === config.mode) || !['balanced', 'random'].includes(config.order)) throw new Error('游戏配置无效');
  return { id: globalThis.crypto.randomUUID(), createdAt: now, config: { ...config, selected }, positions: Object.fromEntries(selected.map(id => [id, 0])), queue: [], lastDraw: null, current: null, phase: 'ready', events: [], undo: null, status: 'active', challenge: !!config.challenge, challengeDisabled: false, feedback: '' };
}
export function draw(game, rng = Math.random) {
  if (game.status !== 'active' || game.phase !== 'ready') return game;
  const remaining = game.config.selected.filter(id => game.positions[id] < game.config.distance);
  if (!remaining.length) return game;
  let queue = game.queue.filter(id => remaining.includes(id));
  let current;
  if (game.config.order === 'random') current = remaining[Math.floor(rng() * remaining.length)];
  else {
    if (!queue.length) {
      queue = shuffle(remaining, rng);
      if (queue.length > 1 && queue[0] === game.lastDraw) [queue[0], queue[1]] = [queue[1], queue[0]];
    }
    [current, ...queue] = queue;
  }
  return { ...game, queue, current, lastDraw: current, phase: 'reading', feedback: '' };
}
export function grade(game, rating, now = Date.now()) {
  if (game.status !== 'active' || game.phase !== 'reading') return game;
  const rule = RATINGS.find(r => r.id === rating);
  if (!rule) return game;
  const undo = { positions: { ...game.positions }, queue: [...game.queue], lastDraw: game.lastDraw, current: game.current, phase: game.phase, status: game.status, eventsLength: game.events.length };
  const from = game.positions[game.current];
  const step = rating === 'pending' && game.challenge ? -1 : rule.step;
  const to = Math.max(0, Math.min(game.config.distance, from + step));
  const positions = { ...game.positions, [game.current]: to };
  const complete = Object.values(positions).every(p => p === game.config.distance);
  const event = { item: game.current, rating, at: now, from, to };
  return { ...game, positions, undo, current: null, phase: 'ready', status: complete ? 'complete' : 'active', events: [...game.events, event], feedback: rule.feedback, completedAt: complete ? now : null };
}
export function undoGrade(game) {
  if (!game.undo || game.status === 'abandoned') return game;
  const { eventsLength, ...state } = game.undo;
  return { ...game, ...state, events: game.events.slice(0, eventsLength), undo: null, feedback: '已撤销，可以重新记录这次表现。', completedAt: null };
}
export function disableChallenge(game) { return { ...game, challenge: false, challengeDisabled: true }; }
export function summarize(games, since = 0) {
  const rows = new Map();
  for (const game of games) for (const event of game.events) {
    if (event.at < since) continue;
    let row = rows.get(event.item);
    if (!row) { row = { id: event.item, total: 0, independent: 0, corrected: 0, assisted: 0, pending: 0, latest: 0 }; rows.set(event.item, row); }
    row.total++; row[event.rating]++; row.latest = Math.max(row.latest, event.at);
  }
  return [...rows.values()].map(row => ({ ...row, helpRatio: (row.assisted + row.pending) / row.total, weak: row.total >= 3 && row.assisted + row.pending > 0 }))
    .sort((a, b) => Number(b.weak) - Number(a.weak) || b.helpRatio - a.helpRatio || b.pending - a.pending || b.latest - a.latest);
}
export function saveStore(storage, store) { storage.setItem(STORAGE_KEY, JSON.stringify(store)); }
export function loadStore(storage) {
  const text = storage.getItem(STORAGE_KEY);
  if (!text) return emptyStore();
  const store = JSON.parse(text);
  if (store.version !== 1 || !Array.isArray(store.games)) throw new Error('进度格式无法读取');
  for (const game of store.games) {
    if (!game.config || !Array.isArray(game.config.selected) || !game.positions || !Array.isArray(game.events) || !Array.isArray(game.queue) || !['active', 'complete', 'abandoned'].includes(game.status)) throw new Error('进度不完整');
    for (const id of game.config.selected) if (!ITEM_MAP[id] || !Number.isInteger(game.positions[id]) || game.positions[id] < 0 || game.positions[id] > game.config.distance) throw new Error('进度不完整');
  }
  return store;
}
export function keepRecent(store) {
  const current = store.games.find(g => g.id === store.currentId && g.status === 'active');
  const history = store.games.filter(g => g !== current).slice(-100);
  return { ...store, games: current ? [...history, current] : history };
}
