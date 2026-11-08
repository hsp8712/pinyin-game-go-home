import { MODES, SCENES, CHARACTERS, ITEM_MAP, RATINGS, itemsFor, defaultSelection } from './data.js';
import { emptyStore, createGame, draw, grade, undoGrade, disableChallenge, summarize, loadStore, saveStore, keepRecent, shuffle } from './engine.js';
import { scenery, pathPoint } from './scenery.js';
import { mascot, illustration } from './mascot.js';

const app = document.querySelector('#app');
let store, storageError = '';
try { store = loadStore(localStorage); } catch { store = emptyStore(); storageError = '无法读取本机进度。当前仍可练习，但暂不能保证续玩；原数据不会被自动覆盖。'; }
let loadFailed = !!storageError;
let page = 'home', homeScene = 'home', range = 'week', statsKind = 'all';
let challengeConsent = false;
let movement = null, fallbackFullscreen = false, popoverPosition = null, popoverTimer;
const reducedMotion = () => store.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
let draft = initialDraft(), chosenStats = new Set(), modal = null, toastTimer;
function initialDraft(mode = 'initial') { return { mode, selected: defaultSelection(mode), distance: 3, order: 'balanced', scene: homeScene || 'home', character: 'rabbit', challenge: false }; }
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const current = () => store.games.find(g => g.id === store.currentId);
const sceneOf = game => SCENES.find(s => s.id === (game?.config.scene || homeScene)) || SCENES[0];
const doneCount = game => Object.values(game.positions).filter(p => p === game.config.distance).length;
const button = (text, action, classes = '', attrs = '') => `<button type="button" class="btn ${classes}" data-action="${action}" ${attrs}>${text}</button>`;
function persist() {
  if (loadFailed) return;
  try { store = keepRecent(store); saveStore(localStorage, store); storageError = ''; }
  catch { storageError = '本机保存失败。可以继续当前练习，但关闭页面后可能无法恢复，请检查浏览器存储空间与权限。'; }
}
function put(game) {
  store.games = store.games.map(g => g.id === game.id ? game : g);
  persist();
}
function announce(text) { document.querySelector('#announcer').textContent = text; }
function toast(text) {
  clearTimeout(toastTimer); document.querySelector('.toast')?.remove();
  const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = text; (document.querySelector('#adventure-root') || document.body).append(el);
  toastTimer = setTimeout(() => el.remove(), 4000);
}
function go(next) { cancelMovement(); closePosition(); if (next !== 'game') { fallbackFullscreen = false; syncFullscreen(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } page = next; modal = null; render(); window.scrollTo({ top: 0, behavior: 'instant' }); document.querySelector('#main')?.focus({ preventScroll: true }); }
function openSetup(mode = 'initial', selected = null) {
  draft = initialDraft(mode); challengeConsent = false;
  if (selected) draft.selected = [...selected];
  go('setup');
}
function header() {
  return `<header class="header"><button class="brand" data-action="home" aria-label="拼音回家大冒险，返回首页"><span class="brand-icon">ā</span><span><strong>拼音回家大冒险</strong><small>A LITTLE PINYIN ADVENTURE</small></span></button><nav class="nav" aria-label="主要导航"><button data-action="home" class="${['home', 'setup'].includes(page) ? 'active' : ''}">冒险小天地</button><button data-action="stats" class="${page === 'stats' ? 'active' : ''}">练习记录</button><button class="settings" data-action="settings" aria-label="设置与使用说明">⚙</button></nav></header>`;
}
function storageNotice() {
  return storageError ? `<div class="notice" role="alert">${esc(storageError)}${loadFailed ? ' <button class="btn small" data-action="reset-storage">重新启用保存</button>' : ''}</div>` : '';
}
function footer() { return `<footer class="footer"><span>一小步，一点点，慢慢长大。 ♡</span><span>手机 · 平板 · 电脑均可玩　 /　 进度仅保存在当前设备与浏览器</span></footer>`; }
function modeCards() { return `<div class="mode-grid">${MODES.map(m => `<button class="mode-card" data-action="mode" data-mode="${m.id}"><span class="mode-mark ${m.color}" aria-hidden="true">${m.mark}</span><span class="card-arrow" aria-hidden="true">↗</span><strong>${m.name}</strong><small>${m.subtitle}</small></button>`).join('')}</div>`; }
function home() {
  const game = current(), resume = game?.status === 'active';
  return `<section class="hero"><div><div class="eyebrow">LET’S GO ON A LITTLE ADVENTURE</div><h1>陪拼音朋友，<span class="accent">一起回家。</span></h1><p class="hero-description">读一读，走一走，让每一次开口都变成小小的进步。<br>和爸爸妈妈一起，开启今天的拼音冒险吧！</p></div><div class="hero-note"><span>${illustration('leaf')}</span><div>不用着急，慢慢来<br>每一步都值得鼓励</div></div></section>
  <div class="scene-tabs" role="group" aria-label="选择冒险场景">${SCENES.map(s => `<button class="scene-tab ${homeScene === s.id ? 'active' : ''}" data-action="home-scene" data-id="${s.id}" aria-pressed="${homeScene === s.id}"><span aria-hidden="true">${s.icon}</span>${s.name}</button>`).join('')}<span class="right-note">三个小世界，同样的小快乐</span></div>
  <section class="adventure-frame" aria-label="冒险预览"><div class="adventure-heading"><strong>${sceneOf().name}</strong><small>${sceneOf().label}</small></div><span class="scene-badge">✦ 今天也有新进步</span>${scenery(homeScene, null, true)}<div class="start-strip"><div class="strip-label">小伙伴们，准备好出发了吗？<small>自由选拼音 · 大人陪着读 · 随时可以休息</small></div><div class="actions">${resume ? button('继续上次冒险 ↗', 'resume', 'soft') : ''}${button('开启新冒险 <span aria-hidden="true">→</span>', 'new', 'primary')}</div></div></section>
  <div class="section-heading"><h2>今天，想练习什么？</h2><small>从熟悉的小伙伴开始</small></div>${modeCards()}
  <div class="gentle-note"><span aria-hidden="true">♡</span>读对了向前走，需要帮助也没关系。我们陪你慢慢来。</div>`;
}
function setup() {
  const available = itemsFor(draft.mode);
  const groups = [...new Set(available.map(e => e.group))];
  return `<section class="page-title"><button class="back-button" data-action="home">← 返回冒险小天地</button><div class="eyebrow">PACK YOUR LITTLE BACKPACK</div><h1>准备一场小冒险</h1><p>大人选好今天的拼音，再让孩子挑选喜欢的小世界。</p></section>
  <div class="setup-layout"><section class="panel"><h2 class="panel-title"><span class="step-dot">1</span>把拼音装进背包</h2><div class="mode-switch" role="group" aria-label="学习模式">${MODES.map(m => `<button class="chip ${draft.mode === m.id ? 'active' : ''}" data-action="setup-mode" data-mode="${m.id}" aria-pressed="${draft.mode === m.id}">${m.name}</button>`).join('')}</div><div class="selection-toolbar"><span>已选 <strong>${draft.selected.length}</strong> / 20 个</span><div class="actions">${button('分类全选', 'select-all', 'text small')}${button('随机选 4 个', 'select-random', 'text small')}${button('清空', 'select-clear', 'text small')}</div></div>
  ${groups.map(group => `<h3 class="group-title">${esc(group)} <button class="btn text small" data-action="select-group" data-group="${esc(group)}" aria-label="选择${esc(group)}">选择本组</button></h3><div class="item-grid">${available.filter(e => e.group === group).map(e => `<button class="item-choice ${draft.selected.includes(e.id) ? 'selected' : ''}" data-action="select-item" data-id="${esc(e.id)}" aria-pressed="${draft.selected.includes(e.id)}" aria-label="选择拼音 ${esc(e.text)}">${esc(e.text)}</button>`).join('')}</div>`).join('')}
  <p class="hint">独立完成或自己改对前进 2 格，提示后完成前进 1 格，暂未完成默认原地休息。</p><p class="hint">建议从一小组熟悉的拼音开始。不同声调分别练习，每局最多 20 个。</p></section>
  <aside class="sticky-side"><section class="panel"><h2 class="panel-title"><span class="step-dot">2</span>安排今天的旅程</h2><div class="config-row"><div>路程长度<small>短一点也能收获成就感</small></div><div class="stepper"><button data-action="distance-minus" aria-label="减少一格" ${draft.distance <= 3 ? 'disabled' : ''}>−</button><output>${draft.distance} 格</output><button data-action="distance-plus" aria-label="增加一格" ${draft.distance >= 10 ? 'disabled' : ''}>＋</button></div></div><div class="config-row"><span>抽取方式</span><strong>均衡随机 · 落后优先</strong></div><p class="hint">每轮随机练习全部拼音；落后 3 格时穿插追赶机会，不额外加步数。</p><hr class="divider"><label class="check-row"><input id="challenge" type="checkbox" ${draft.challenge ? 'checked' : ''}><span>开启后退挑战<small class="hint" style="display:block;margin-top:3px">暂未完成时后退 1 格。请先说明规则，并确认孩子愿意参与。</small></span></label>${draft.challenge ? '<label class="check-row" style="margin-top:12px"><input id="challenge-consent" type="checkbox" ' + (challengeConsent ? 'checked' : '') + '><span>已向孩子说明，孩子愿意尝试</span></label>' : ''}</section>
  <section class="panel"><h2 class="panel-title"><span class="step-dot">3</span>小朋友，选你喜欢的！</h2><div class="pick-scene">${SCENES.map(s => `<button data-action="setup-scene" data-id="${s.id}" class="${draft.scene === s.id ? 'active' : ''}" aria-pressed="${draft.scene === s.id}"><span class="scene-icon" aria-hidden="true">${s.icon}</span><span>${s.name}<small>${s.label}</small></span></button>`).join('')}</div><h3 class="micro-title">谁陪你一起出发？</h3><div class="characters">${CHARACTERS.map(c => `<button class="character ${draft.character === c.id ? 'active' : ''}" data-action="character" data-id="${c.id}" aria-pressed="${draft.character === c.id}"><span aria-hidden="true">${mascot(c.id)}</span>${c.name}</button>`).join('')}</div><div class="summary-box">本局 <strong>${draft.selected.length}</strong> 个拼音 · 路程 <strong>${draft.distance}</strong> 格<br><small>不用赶路，随时可以休息</small></div>${button('准备好啦，出发 →', 'start', 'primary wide', !draft.selected.length ? 'disabled' : '')}${!draft.selected.length ? '<p class="hint error" role="status">先选择至少 1 个拼音，再出发吧。</p>' : ''}</section></aside></div>`;
}
function fullscreenButton() {
  const expanded = !!document.fullscreenElement || fallbackFullscreen;
  return button(expanded ? '↙ 退出全屏' : '⛶ 全屏地图', 'fullscreen', 'soft small', `aria-pressed="${expanded}"`);
}
function mapControls(game) {
  if (movement) return `<div class="map-feedback"><div class="feedback" role="status">${esc(game.feedback)}</div><p>${movement.event.from === movement.event.to ? '小伙伴休息一下，继续加油。' : movement.event.to < movement.event.from ? '小伙伴沿着原路退一步，慢慢来。' : '看，小伙伴正在沿着小路前进！'}</p></div>`;
  const reading = game.phase === 'reading', entry = ITEM_MAP[game.current];
  if (!reading) return `<div class="map-ready">${game.feedback ? `<div class="feedback" role="status">${esc(game.feedback)}</div>` : '<p>拼音朋友们在等你出发</p>'}${button('✦ 抽一个拼音', 'draw', 'primary')}<small>读一读，陪小伙伴走一段路</small></div>`;
  return `<div class="reading-card"><div class="reading-friend"><div class="pinyin-card">${esc(entry.text)}</div><div class="reading-guidance"><p class="lead">${game.config.mode === 'tone' ? '留意声调，慢慢读出来。' : '看清拼音，大声读一读。'}</p>${entry.parts ? `<details class="hint"><summary>看看拼读结构</summary><p>${esc(entry.parts)}</p></details>` : ''}<div class="child-actions">${button('↻ 我再试一次', 'retry', 'text')}${button('♡ 请帮帮我', 'help', 'text')}</div></div></div><div class="parent-controls"><div class="parent-label"><span>陪练大人来记录</span><button data-action="rules">怎么判断？</button></div><div class="rating-grid">${RATINGS.map(r => `<button class="rating" data-action="grade" data-rating="${r.id}"><span class="rating-icon" aria-hidden="true">${r.icon}</span><span><strong>${r.title}</strong><small>${r.id === 'pending' ? game.challenge ? '后退 1 格' : '原地休息' : `前进 ${r.step} 格`}</small></span></button>`).join('')}</div><p class="hint">${game.challenge ? '已开启后退挑战 · 随时可以关闭' : '读错也没关系，已有进度会留下来。'}</p></div></div>`;
}
function gameView() {
  const game = current();
  if (!game) return home();
  if (game.status === 'complete' && !movement) return `<section id="adventure-root" class="adventure-stage">${storageNotice()}<div class="map-toolbar"><span>旅程完成</span>${fullscreenButton()}</div>${victory(game)}</section>`;
  const scene = sceneOf(game);
  const displayGame = movement ? { ...game, current: movement.event.item, positions: { ...game.positions, [movement.event.item]: movement.event.from } } : game;
  return `<section id="adventure-root" class="adventure-stage" aria-label="沉浸式冒险地图">${storageNotice()}<div class="map-scene" data-phase="${movement ? 'moving' : game.phase}">${scenery(scene.id, displayGame)}<div class="map-toolbar"><div><strong>${scene.name}</strong><small>均衡随机 · 落后优先</small></div><div class="actions">${button('☁ 休息一下', 'pause', 'soft small')}${fullscreenButton()}</div></div><div class="progress-row"><span>已到达 <strong>${doneCount(game)} / ${game.config.selected.length}</strong></span><div class="progress-track"><div class="progress-fill" style="width:${doneCount(game) / game.config.selected.length * 100}%"></div></div><span>路程 ${game.config.distance} 格</span></div><div class="map-controls">${mapControls(game)}</div><div id="map-popover" class="map-popover" hidden></div><div class="game-tools">${button('↶ 撤销上一步', 'undo', 'text small', game.undo && !movement ? '' : 'disabled')}${button('查看玩法', 'rules', 'text small')}${game.challenge ? button('关闭后退挑战', 'disable-challenge', 'text small') : ''}</div></div></section>`;
}
function closePosition() {
  clearTimeout(popoverTimer);
  popoverPosition = null;
  const popover = document.querySelector('#map-popover');
  if (popover) { popover.hidden = true; delete popover.dataset.pinned; }
  document.querySelectorAll('[data-position]').forEach(el => el.setAttribute('aria-expanded', 'false'));
}
function showPosition(position, trigger) {
  if (movement) return;
  clearTimeout(popoverTimer);
  const popover = document.querySelector('#map-popover');
  if (!popover) return;
  popoverPosition = position;
  const game = current();
  popover.innerHTML = `<div class="popover-heading"><strong>${position === game.config.distance ? '已经到达的小伙伴' : `第 ${position} 格的小伙伴`}</strong>${button('收起 ×', 'close-position', 'text small')}</div><div class="position-items">${game.config.selected.filter(id => game.positions[id] === position).map(id => `<span class="position-item ${game.current === id ? 'current' : ''}">${esc(ITEM_MAP[id].text)}</span>`).join('')}</div>`;
  popover.hidden = false;
  const scene = routeViewport(), rect = trigger.getBoundingClientRect();
  const canvas = popover.parentElement.getBoundingClientRect();
  popover.style.maxHeight = `${scene.height - 16}px`;
  const width = popover.offsetWidth;
  let left, top;
  if (rect.right - scene.left + width + 16 <= scene.width) {
    left = rect.right - scene.left + 8;
    top = Math.max(8, Math.min(rect.top - scene.top, scene.height - popover.offsetHeight - 8));
  } else if (rect.left - scene.left >= width + 16) {
    left = rect.left - scene.left - width - 8;
    top = Math.max(8, Math.min(rect.top - scene.top, scene.height - popover.offsetHeight - 8));
  } else {
    const above = rect.top - scene.top - 8, below = scene.bottom - rect.bottom - 8;
    popover.style.maxHeight = `${Math.max(60, Math.max(above, below) - 8)}px`;
    left = Math.max(8, Math.min(rect.left - scene.left, scene.width - width - 8));
    top = below >= above ? rect.bottom - scene.top + 8 : rect.top - scene.top - popover.offsetHeight - 8;
    top = Math.max(8, Math.min(top, scene.height - popover.offsetHeight - 8));
  }
  popover.style.left = `${left + scene.left - canvas.left}px`; popover.style.top = `${top + scene.top - canvas.top}px`;
  document.querySelectorAll('[data-position]').forEach(el => el.setAttribute('aria-expanded', String(Number(el.dataset.position) === position)));
}
const mapResizeObserver = new ResizeObserver(layoutMap);
function routeViewport() {
  const scene = document.querySelector('.map-scene');
  if (!scene) return null;
  const box = scene.getBoundingClientRect(), style = getComputedStyle(scene);
  const top = parseFloat(style.getPropertyValue('--map-top'));
  const controls = scene.querySelector('.map-controls');
  const dock = Math.max(parseFloat(style.getPropertyValue('--dock-space')), controls.offsetHeight + parseFloat(getComputedStyle(controls).bottom) + 20);
  return { left: box.left, right: box.right, top: box.top + top, bottom: box.bottom - dock, width: box.width, height: Math.max(1, box.height - top - dock), y: top };
}
function layoutMap() {
  const viewport = routeViewport();
  const route = document.querySelector('.route-world');
  if (!route || !viewport) return;
  // SVG viewport geometry uses numeric attributes so its viewBox scales uniformly.
  route.setAttribute('y', viewport.y);
  route.setAttribute('height', viewport.height);
}
function observeMap() {
  mapResizeObserver.disconnect();
  const scene = document.querySelector('.map-scene');
  if (scene) { layoutMap(); mapResizeObserver.observe(scene); }
}
function syncFullscreen() {
  const stage = document.querySelector('#adventure-root');
  stage?.classList.toggle('fallback-fullscreen', fallbackFullscreen);
  document.documentElement.classList.toggle('map-expanded', fallbackFullscreen);
  const control = stage?.querySelector('[data-action="fullscreen"]');
  if (control) { const expanded = !!document.fullscreenElement || fallbackFullscreen; control.textContent = expanded ? '↙ 退出全屏' : '⛶ 全屏地图'; control.setAttribute('aria-pressed', String(expanded)); }
  observeMap();
}
async function toggleFullscreen() {
  if (document.fullscreenElement) { await document.exitFullscreen(); return; }
  if (fallbackFullscreen) { fallbackFullscreen = false; syncFullscreen(); return; }
  const stage = document.querySelector('#adventure-root');
  try { if (!stage?.requestFullscreen) throw new Error('Fullscreen unavailable'); await stage.requestFullscreen(); }
  catch { fallbackFullscreen = true; syncFullscreen(); }
}
function cancelMovement() {
  const previous = movement;
  movement = null;
  previous?.animation?.cancel();
}
async function scoreWithMovement(rating) {
  if (movement || current()?.phase !== 'reading') return;
  const next = grade(current(), rating);
  if (next === current()) return;
  const event = next.events.at(-1);
  const state = { event, animation: null };
  movement = state;
  put(next); render(); announce(next.feedback);
  const token = [...document.querySelectorAll('[data-token]')].find(el => el.dataset.token === event.item);
  try {
    if (!reducedMotion() && token) {
      const origin = pathPoint(event.from, next.config.distance, next.config.scene);
      const translation = token.getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/);
      const x = Number(translation[1]), y = Number(translation[2]);
      const steps = Math.abs(event.to - event.from), direction = Math.sign(event.to - event.from);
      const frames = steps ? Array.from({ length: steps + 1 }, (_, i) => {
        const point = pathPoint(event.from + i * direction, next.config.distance, next.config.scene);
        return { transform: `translate(${x + point.x - origin.x}px, ${y + point.y - origin.y}px)` };
      }) : [{ opacity: 1 }, { opacity: .6 }, { opacity: 1 }];
      token.parentElement.append(token);
      state.animation = token.animate(frames, { duration: Math.max(1, steps) * 300, easing: 'linear', fill: 'forwards' });
      await state.animation.finished;
    }
  } catch (error) { if (error.name !== 'AbortError') console.error(error); }
  finally {
    if (movement === state) {
      movement = null; state.animation?.cancel(); render();
      document.querySelector(next.status === 'complete' ? '[data-action="again"]' : '[data-action="draw"]')?.focus({ preventScroll: true });
    }
  }
}
function pauseView() {
  const game = current();
  if (!game) return home();
  const moved = game.config.selected.filter(id => game.positions[id] > 0);
  return `<section class="pause-view panel celebrate"><div class="big-icon" aria-hidden="true">${illustration('camp')}</div><div class="eyebrow" style="justify-content:center">A LITTLE REST ALONG THE WAY</div><h1>在这里扎营，休息一下</h1><p class="lead">今天已经走过的路，每一步都算数。<br>拼音朋友会在安全的营地等你，下次再一起出发。</p><div class="stat-cards"><div class="stat-card"><strong>${game.events.length}</strong><small>本局练习次数</small></div><div class="stat-card"><strong>${moved.length}</strong><small>取得进展的拼音</small></div><div class="stat-card"><strong>${doneCount(game)}</strong><small>已经到达</small></div></div>${moved.length ? `<div class="review-tags">${moved.map(id => `<span>${esc(id)}</span>`).join('')}</div>` : ''}<p class="hint">${storageError ? '暂时无法保证保存，请留意上方提示。' : '✓ 冒险已保存在当前设备和浏览器。'}</p><div class="actions">${button('继续冒险 →', 'resume', 'primary')}${button('返回首页', 'home')}</div></section>`;
}
function victory(game) {
  const corrected = [...new Set(game.events.filter(e => e.rating === 'corrected').map(e => e.item))];
  return `<section class="victory-view panel celebrate"><div class="big-icon" aria-hidden="true">${illustration(sceneOf(game).id === 'home' ? 'house' : 'camp')}</div><div class="eyebrow" style="justify-content:center">EVERY LITTLE STEP COUNTS</div><h1>${sceneOf(game).completion}</h1><div class="victory-star" aria-hidden="true">✧ ✦ ✧</div><p class="lead">你帮助所有拼音朋友完成了这段旅程。<br>愿意尝试、主动求助、自己改正，都值得被看见。</p><div class="review-tags">${game.config.selected.map(id => `<span>${esc(id)}</span>`).join('')}</div>${corrected.length ? `<div class="feedback">${corrected.map(esc).join('、')}：你发现并自己改对过，真是很棒的小进步！</div>` : ''}<div class="actions">${button('再玩一局 →', 'again', 'primary')}${button('返回首页', 'home')}</div><div class="actions">${button('家长查看本局记录', 'session-records', 'text small')}${button('↶ 撤销最后一次评分', 'undo', 'text small', game.undo ? '' : 'disabled')}</div><p class="hint">完成本局任务是一份进步，不代表已经完全掌握。</p></section>`;
}
function filteredGames() { return statsKind === 'session' && current() ? [current()] : store.games; }
function statsRows() { return summarize(filteredGames(), statsKind === 'session' || range === 'all' ? 0 : Date.now() - 7 * 86400000); }
function stats() {
  const allRows = statsRows();
  const rows = statsKind === 'weak' ? allRows.filter(r => r.weak) : allRows;
  const events = allRows.reduce((sum, r) => sum + r.total, 0);
  return `<section class="page-title"><button class="back-button" data-action="home">← 返回冒险小天地</button><div class="eyebrow">LITTLE STEPS, GROWING TOGETHER</div><h1>看见每一点进步</h1><p>给陪练大人的小记录：了解孩子需要怎样的帮助，再安排下一次练习。</p></section><div class="stat-cards"><div class="stat-card"><strong>${events}</strong><small>有效练习次数</small></div><div class="stat-card"><strong>${allRows.length}</strong><small>练习过的拼音</small></div><div class="stat-card"><strong>${allRows.reduce((n, r) => n + r.corrected, 0)}</strong><small>自己纠正的次数</small></div></div>
  <div class="stats-toolbar"><div class="filter-tabs" role="group" aria-label="记录时间范围"><button data-action="range" data-value="week" class="${range === 'week' && statsKind !== 'session' ? 'active' : ''}">最近 7 天</button><button data-action="range" data-value="all" class="${range === 'all' && statsKind !== 'session' ? 'active' : ''}">全部记录</button>${statsKind === 'session' ? '<button class="active" data-action="session-records">本局记录</button>' : ''}</div><div class="filter-tabs" role="group" aria-label="记录类型"><button data-action="stats-kind" data-value="all" class="${statsKind !== 'weak' ? 'active' : ''}">全部条目</button><button data-action="stats-kind" data-value="weak" class="${statsKind === 'weak' ? 'active' : ''}">待加强项</button></div></div>
  ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>选练</th><th>拼音</th><th>练习次数</th><th>独立完成</th><th>自己改对</th><th>提示后完成</th><th>暂未完成</th><th>需要帮助</th><th>最近练习</th></tr></thead><tbody>${rows.map(r => `<tr><td><input type="checkbox" data-stat-id="${esc(r.id)}" aria-label="选择 ${esc(r.id)} 加入练习" ${chosenStats.has(r.id) ? 'checked' : ''}></td><td class="pinyin-cell">${esc(r.id)}</td><td>${r.total}</td><td>${r.independent}</td><td>${r.corrected}</td><td>${r.assisted}</td><td>${r.pending}</td><td>${r.total < 3 ? '<span class="badge">记录较少</span>' : `<span class="badge ${r.helpRatio === 0 ? 'good' : ''}">${Math.round(r.helpRatio * 100)}%</span>`}</td><td>${new Date(r.latest).toLocaleDateString('zh-CN')}</td></tr>`).join('')}</tbody></table></div><div class="practice-footer">${statsKind === 'session' ? button('选择本局需帮助条目', 'select-session-help', 'soft small') : ''}${button(`用已选 ${chosenStats.size} 项开始新练习 →`, 'practice-selected', 'primary', chosenStats.size ? '' : 'disabled')}</div>` : `<div class="panel empty-state"><div class="big-icon" aria-hidden="true">${illustration('leaf')}</div><h2>${statsKind === 'weak' ? '暂时没有待加强项' : '小小的进步，从第一次开始'}</h2><p>${statsKind === 'weak' ? '记录至少 3 次且曾需要帮助的拼音，会出现在这里。' : '完成一次朗读并记录表现后，就能在这里看到练习记录。'}</p>${button('开始一场小冒险 →', 'new', 'primary')}</div>`}
  <div class="gentle-note" style="justify-content:flex-start;line-height:1.9">♡ 记录来自陪练者的手动判断，仅用于安排练习。需要帮助 = 提示后完成 + 暂未完成；自我纠正不计入。记录少于 3 次不参与待加强排序。</div><p class="hint" style="margin-bottom:28px">记录只保存在当前设备与浏览器，不跨设备同步。清理浏览器数据可能导致记录丢失。游戏到达不等于已经掌握。</p>`;
}
function render() {
  const focus = document.activeElement;
  const focusAction = focus?.dataset?.action;
  const focusId = focus?.dataset?.id;
  const focusMode = focus?.dataset?.mode;
  const focusGroup = focus?.dataset?.group;
  const focusStat = focus?.dataset?.statId;
  document.documentElement.classList.toggle('reduced-motion', !!store.reducedMotion);
  const content = page === 'setup' ? setup() : page === 'game' ? gameView() : page === 'pause' ? pauseView() : page === 'stats' ? stats() : home();
  // Preserve the fullscreen host and reuse each friend's SVG node across game updates.
  const existingStage = document.querySelector('#adventure-root');
  if (page === 'game' && existingStage) {
    closePosition();
    const template = document.createElement('template'); template.innerHTML = content;
    const replacement = template.content.querySelector('#adventure-root');
    if (replacement) {
      const oldTokens = new Map([...existingStage.querySelectorAll('[data-token]')].map(el => [el.dataset.token, el]));
      replacement.querySelectorAll('[data-token]').forEach(el => {
        const previous = oldTokens.get(el.dataset.token);
        if (!previous) return;
        for (const attribute of [...previous.attributes]) previous.removeAttribute(attribute.name);
        for (const attribute of el.attributes) previous.setAttribute(attribute.name, attribute.value);
        previous.innerHTML = el.innerHTML; el.replaceWith(previous);
      });
      existingStage.replaceChildren(...replacement.childNodes);
      syncFullscreen();
      if (modal) renderModal();
      return;
    }
  }
  app.innerHTML = `<div class="shell ${page === 'game' ? 'game-shell' : ''}">${header()}${page === 'game' ? '' : storageNotice()}<main id="main" tabindex="-1">${content}</main>${footer()}</div>`;
  syncFullscreen();
  if (focusAction && page !== 'pause') {
    const target = [...app.querySelectorAll('[data-action]')].find(el => el.dataset.action === focusAction && el.dataset.id === focusId && el.dataset.mode === focusMode && el.dataset.group === focusGroup);
    target?.focus({ preventScroll: true });
  } else if (focusStat) [...app.querySelectorAll('[data-stat-id]')].find(el => el.dataset.statId === focusStat)?.focus({ preventScroll: true });
  if (modal) renderModal();
}
let modalOpener = null;
function showModal(data) { modalOpener = document.activeElement; modal = data; renderModal(); }
function closeModal() { document.querySelector('.modal-backdrop')?.remove(); document.body.style.overflow = ''; modal = null; modalOpener?.focus(); }
function renderModal() {
  document.querySelector('.modal-backdrop')?.remove();
  const overlay = document.createElement('div'); overlay.className = 'modal-backdrop';
  let body = '';
  if (modal.type === 'rules') body = `<h2 id="modal-title">陪着读，比打分更重要</h2><p>孩子抽一个拼音并朗读，由大人记录一次最终表现。自己改对和独立完成，都前进两格。</p><ul><li>独立完成：没有针对本题的提示，自己读对。</li><li>自己改对：大人提示前，自行发现并修正。</li><li>提示后完成：接受提示、示范或跟读后完成。</li><li>暂未完成：暂时不会或选择稍后再来，默认原地休息。</li></ul><p>可以说“这次声调改对了”。需要帮助很正常，不用急着结束旅程。随时扎营休息，已有进度会留下。</p><div class="actions">${button('知道啦', 'close-modal', 'primary')}</div>`;
  else if (modal.type === 'settings') body = `<h2 id="modal-title">慢慢来，也很好</h2><label class="check-row"><input id="reduced-motion" type="checkbox" ${store.reducedMotion ? 'checked' : ''}><span>减少动画</span></label><p>手机、平板、电脑都能通过浏览器游玩。进度和练习记录仅保存在当前设备、当前浏览器，清理浏览器数据会丢失记录，设备之间不会同步。</p><p>无需登录，不录音，不使用麦克风。详细练习记录由家长入口查看，但此入口不是密码保护。</p><div class="actions">${button('查看玩法', 'rules', 'soft')}${button('完成', 'close-modal', 'primary')}</div>`;
  else if (modal.type === 'replace') body = `<h2 id="modal-title">开始一段新旅程？</h2><p>上一次冒险还没有结束。开始新局会替换当前进度，已经记录的练习表现仍会保留。</p><div class="actions">${button('保留原冒险', 'close-modal')}${button('开始新冒险', 'confirm-start', 'primary')}</div>`;
  else if (modal.type === 'reset') body = `<h2 id="modal-title">重新启用本机保存？</h2><p>原有保存数据目前无法读取。继续后会用当前内存中的进度替换原有数据，这个操作无法撤销。</p><div class="actions">${button('暂时保留原数据', 'close-modal')}${button('替换并启用保存', 'confirm-reset', 'primary')}</div>`;
  overlay.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">${body}</section>`;
  (document.querySelector('#adventure-root') || document.body).append(overlay); document.body.style.overflow = 'hidden';
  overlay.querySelector('button, input, [tabindex]')?.focus();
}
function startGame() {
  if (!draft.selected.length) return toast('请先选择至少 1 个拼音。');
  let game;
  try { game = createGame(draft); } catch (error) { return toast(error.message); }
  const old = current();
  if (old?.status === 'active') store.games = store.games.map(g => g.id === old.id ? { ...g, status: 'abandoned', undo: null } : g);
  store.games.push(game); store.currentId = game.id; persist(); closeModal(); go('game');
}
function updateSelection(ids) {
  const unique = [...new Set(ids)];
  if (unique.length > 20) toast('每局最多 20 个拼音，已保留前 20 个。');
  draft.selected = unique.slice(0, 20); render();
}
async function act(action, el) {
  if (action === 'fullscreen') return toggleFullscreen();
  if (action === 'close-position') { const token = document.querySelector('[data-position][aria-expanded="true"]'); token?.focus(); closePosition(); return; }
  if (action === 'home') { if (['game', 'pause'].includes(page)) persist(); return go('home'); }
  if (action === 'new') return openSetup();
  if (action === 'mode') return openSetup(el.dataset.mode);
  if (action === 'home-scene') { homeScene = el.dataset.id; return render(); }
  if (action === 'resume') { if (current()?.status === 'active') return go('game'); return go('home'); }
  if (action === 'stats') { range = 'week'; statsKind = 'all'; chosenStats.clear(); return go('stats'); }
  if (action === 'settings' || action === 'rules') { if (modal) closeModal(); return showModal({ type: action }); }
  if (action === 'close-modal') return closeModal();
  if (action === 'setup-mode') { draft.mode = el.dataset.mode; draft.selected = defaultSelection(draft.mode); return render(); }
  if (action === 'setup-scene') { draft.scene = el.dataset.id; return render(); }
  if (action === 'character') { draft.character = el.dataset.id; return render(); }
  if (action === 'distance-minus' || action === 'distance-plus') { draft.distance = Math.max(3, Math.min(10, draft.distance + (action === 'distance-minus' ? -1 : 1))); return render(); }
  if (action === 'select-item') {
    const id = el.dataset.id;
    if (draft.selected.includes(id)) draft.selected = draft.selected.filter(x => x !== id);
    else if (draft.selected.length === 20) return toast('背包装满啦！每局最多选择 20 个拼音。');
    else draft.selected.push(id);
    return render();
  }
  if (action === 'select-clear') return updateSelection([]);
  if (action === 'select-all') return updateSelection(itemsFor(draft.mode).map(e => e.id));
  if (action === 'select-group') return updateSelection([...draft.selected, ...itemsFor(draft.mode).filter(e => e.group === el.dataset.group).map(e => e.id)]);
  if (action === 'select-random') return updateSelection(shuffle(itemsFor(draft.mode).filter(e => e.group !== '轻声（可选）')).slice(0, 4).map(e => e.id));
  if (action === 'start') {
    if (draft.challenge && !challengeConsent) return toast('请先和孩子说明规则，确认孩子愿意参与。');
    if (current()?.status === 'active') return showModal({ type: 'replace' });
    return startGame();
  }
  if (action === 'confirm-start') return startGame();
  if (action === 'draw') {
    if (movement) return;
    put(draw(current())); render(); announce(`抽到拼音 ${current().current}，请慢慢读。`);
    document.querySelector('[data-action="retry"]')?.focus({ preventScroll: true }); return;
  }
  if (action === 'grade') return scoreWithMovement(el.dataset.rating);
  if (action === 'undo') { if (movement) return; put(undoGrade(current())); render(); document.querySelector('[data-action="retry"]')?.focus({ preventScroll: true }); return; }
  if (action === 'retry') return toast('慢慢来，再读一次。自己改对，也能前进两格。');
  if (action === 'help') return toast('请陪练大人示范或给一个提示。需要帮助很正常。');
  if (action === 'pause') { persist(); return go('pause'); }
  if (action === 'disable-challenge') { put(disableChallenge(current())); render(); return toast('后退挑战已关闭，本局不再扣除进度。'); }
  if (action === 'again') { challengeConsent = false; draft = { ...current().config, selected: [...current().config.selected], challenge: current().challenge }; return go('setup'); }
  if (action === 'range') { range = el.dataset.value; if (statsKind === 'session') statsKind = 'all'; chosenStats.clear(); return render(); }
  if (action === 'stats-kind') { statsKind = el.dataset.value; chosenStats.clear(); return render(); }
  if (action === 'session-records') { statsKind = 'session'; chosenStats.clear(); return go('stats'); }
  if (action === 'select-session-help') { chosenStats = new Set(statsRows().filter(r => r.assisted + r.pending > 0).map(r => r.id)); return render(); }
  if (action === 'practice-selected') { if (!chosenStats.size) return toast('先选择需要练习的条目。'); if (chosenStats.size > 20) return toast('每局最多 20 项，请减少选择。'); return openSetup('custom', [...chosenStats]); }
  if (action === 'reset-storage') return showModal({ type: 'reset' });
  if (action === 'confirm-reset') { loadFailed = false; persist(); closeModal(); return render(); }
}
document.addEventListener('click', event => {
  const position = event.target.closest('[data-position]');
  if (position) { const value = Number(position.dataset.position); if (popoverPosition === value && document.querySelector('#map-popover')?.dataset.pinned === 'true') closePosition(); else { showPosition(value, position); document.querySelector('#map-popover').dataset.pinned = 'true'; } return; }
  if (!event.target.closest('#map-popover')) closePosition();
  const el = event.target.closest('[data-action]');
  if (el && !el.disabled) act(el.dataset.action, el).catch(error => { console.error(error); toast('操作暂未完成，请重试。'); });
});
document.addEventListener('change', event => {
  const el = event.target;
  if (el.id === 'challenge-consent') challengeConsent = el.checked;
  if (el.id === 'challenge') { challengeConsent = false; draft.challenge = el.checked; render(); document.querySelector('#challenge')?.focus(); }
  if (el.id === 'reduced-motion') { store.reducedMotion = el.checked; persist(); document.documentElement.classList.toggle('reduced-motion', el.checked); }
  if (el.dataset.statId) { if (el.checked) chosenStats.add(el.dataset.statId); else chosenStats.delete(el.dataset.statId); render(); }
});
document.addEventListener('keydown', event => {
  const position = event.target.closest('[data-position]');
  if (position && ['Enter', ' '].includes(event.key)) { event.preventDefault(); showPosition(Number(position.dataset.position), position); document.querySelector('#map-popover [data-action]')?.focus(); return; }
  if (event.key === 'Escape' && !modal) {
    if (popoverPosition !== null) { closePosition(); return; }
    if (fallbackFullscreen) { fallbackFullscreen = false; syncFullscreen(); }
  }
  if (!modal) return;
  if (event.key === 'Escape') { event.preventDefault(); return closeModal(); }
  if (event.key === 'Tab') {
    const focusable = [...document.querySelector('.modal').querySelectorAll('button:not(:disabled), input, select, a[href], [tabindex="0"]')];
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
window.addEventListener('pagehide', () => { if (!loadFailed) persist(); });
window.addEventListener('storage', event => {
  if (event.key === 'pinyin-adventure-v1') {
    loadFailed = true; storageError = '另一标签页更改了练习记录。为避免覆盖，当前页面已暂停保存；请刷新以读取最新进度。'; render();
  }
});
render();

document.addEventListener('fullscreenchange', syncFullscreen);
document.addEventListener('pointerover', event => {
  if (event.target.closest('#map-popover')) clearTimeout(popoverTimer);
  const token = event.target.closest('[data-position]');
  if (token && event.pointerType !== 'touch') showPosition(Number(token.dataset.position), token);
});
document.addEventListener('pointerout', event => {
  if (!event.target.closest('[data-position], #map-popover') || event.relatedTarget?.closest?.('[data-position], #map-popover')) return;
  if (document.querySelector('#map-popover')?.dataset.pinned !== 'true') popoverTimer = setTimeout(closePosition, 180);
});
document.addEventListener('focusin', event => {
  const token = event.target.closest('[data-position]');
  if (token) showPosition(Number(token.dataset.position), token);
  else if (!event.target.closest('#map-popover')) closePosition();
});
