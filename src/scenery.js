import { mascot } from './mascot.js';
import { ITEM_MAP } from './data.js';
const tree = (x, y, size = 1, color = '#7a9e77') => `<g transform="translate(${x} ${y}) scale(${size})"><path d="M-5 0h10l-2-65h-6z" fill="#9f815f"/><path d="M0-130c-21 0-31 23-24 37-23 7-23 42 0 48 7 15 45 16 52-1 23-6 20-40-2-47 5-17-6-37-26-37z" fill="${color}"/><path d="M0-92v73m0-40-13-10M0-48l14-13" fill="none" stroke="#ffffff" stroke-opacity=".22" stroke-width="3" stroke-linecap="round"/></g>`;
export function pathPoint(index, distance, scene) {
  const t = index / distance;
  return { x: 105 + t * 665, y: scene === 'mountain' ? 335 - t * 180 : 302 + Math.sin(t * Math.PI * 1.8) * 27 - t * 68 };
}
export function scenery(scene = 'home', game = null, preview = false) {
  const distance = game?.config.distance || 5;
  const points = Array.from({ length: distance + 1 }, (_, i) => pathPoint(i, distance, scene));
  const road = points.map(p => `${p.x},${p.y}`).join(' ');
  const completed = game ? Object.values(game.positions).filter(p => p === distance).length : 0;
  const animal = mascot(game?.config.character || 'rabbit');
  const colors = ['#f3b67e', '#bdcbb2', '#d0c0df', '#f2d87e'];
  const tokens = game ? game.config.selected : ['b', 'p', 'm', 'f'];
  const groups = new Map();
  tokens.forEach((id, i) => {
    const pos = game ? game.positions[id] : [0, 1, 2, 3][i];
    if (!groups.has(pos)) groups.set(pos, []);
    groups.get(pos).push({ id, i });
  });
  const tokenMarkup = [...groups.entries()].map(([pos, entries]) => {
    const p = points[pos];
    // Draw the selected friend last so it stays above its neighbours.
    const ordered = [...entries].sort((a, b) => Number(a.id === game?.current) - Number(b.id === game?.current));
    return ordered.map(({ id, i }) => {
      const slot = entries.findIndex(e => e.id === id);
      const crowded = entries.length > 3;
      const selected = game?.current === id;
      const x = p.x + (crowded ? Math.min(slot, 3) * 7 - 10 : (slot - (entries.length - 1) / 2) * 34);
      const y = p.y - 45 - (crowded ? Math.min(slot, 3) * 5 : slot % 2 * 15);
      return `<g class="board-token ${selected ? 'active-token' : ''}" data-token="${id}" transform="translate(${x} ${y})" ${game ? `data-position="${pos}" role="button" tabindex="0" aria-expanded="false" aria-controls="map-popover" aria-label="${ITEM_MAP[id]?.text || id}，第 ${pos} 格，共 ${entries.length} 个拼音，展开查看"` : ''}>
      ${selected ? '<circle r="34" fill="#fff" opacity=".8"/>' : ''}<rect x="-24" y="-27" width="48" height="48" rx="17" fill="${colors[i % 4]}" stroke="#fffdf7" stroke-width="3"/>
      <text y="7" text-anchor="middle" fill="#3e5142" font-size="${id.length > 2 ? 18 : 25}" font-family="Arial, sans-serif">${ITEM_MAP[id]?.text || id}</text>
      ${entries.length > 1 && (selected || slot === entries.length - 1) ? `<circle cx="21" cy="-23" r="12" fill="#29594a"/><text x="21" y="-19" text-anchor="middle" fill="white" font-size="12">${entries.length}</text>` : ''}
    </g>`;
    }).join('');
  }).join('');
  const last = points[distance];
  // In a game, extend the artwork beyond the route viewport. The outer SVG clips
  // the scene while the grass continues behind the floating controls.
  const ground = game ? 2400 : 440;
  const left = game ? -2000 : 0, right = game ? 2900 : 900;
  const artwork = `<svg class="${game ? 'route-world' : 'landscape'}" ${game ? 'width="100%" height="440" y="104"' : ''} viewBox="0 0 900 440" role="${preview ? 'img' : 'group'}" aria-label="${preview ? '拼音朋友沿森林小路走向温暖小屋' : '冒险路线，悬停、聚焦或点击拼音可查看同格伙伴'}">
  <defs><linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="440"><stop stop-color="#e5eee6"/><stop offset="1" stop-color="#f1f2da"/></linearGradient><linearGradient id="grass" gradientUnits="userSpaceOnUse" x1="0" y1="200" x2="0" y2="600"><stop stop-color="#c6d8ad"/><stop offset="1" stop-color="#dce4bb"/></linearGradient><pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="3" cy="4" r="1" fill="#718864" opacity=".15"/></pattern></defs>
  <rect x="${left}" y="${game ? -2000 : 0}" width="${right - left}" height="${ground + (game ? 2000 : 0)}" fill="url(#sky)"/>
  <circle cx="700" cy="76" r="37" fill="#f5d58b"/><circle cx="700" cy="76" r="52" fill="#f5d58b" opacity=".16"/>
  <g fill="#fffdf3" opacity=".78"><path d="M103 74c-9-23-45-23-48 4-22-6-33 20-11 25h99c23-3 18-28-3-27-9-17-28-15-37-2z"/><path d="M498 44c-6-17-31-17-35 1-17-3-22 15-7 18h75c15-5 7-21-6-17-5-12-18-13-27-2z"/></g>
  ${scene === 'mountain' ? '<path d="M0 230 210 55 367 209 535 24 820 269 900 190V440H0" fill="#adc1ad"/><path d="m465 85 70-61 88 76-60-18-30 20-29-25z" fill="#edf1e4"/>' : '<path d="M0 204Q155 61 337 191Q503 98 705 173Q814 123 900 162V440H0Z" fill="#b8cfb1"/>'}
  <path d="M${left} 277H0Q154 181 330 233Q497 175 666 206Q818 171 900 232H${right}V${ground}H${left}Z" fill="url(#grass)"/>
  ${scene === 'river' ? `<path d="M350 159Q507 219 397 280T442 440L442 ${ground}H634V440Q493 331 593 262T523 159Z" fill="#9eced0"/><g stroke="#d9ece3" stroke-width="3" fill="none" opacity=".7"><path d="M415 236h42m49 62h30m-73 70h43m31 41h40"/></g>` : ''}
  <rect x="${left}" y="300" width="${right - left}" height="${ground - 300}" fill="url(#dots)"/>
  ${tree(35, 321, 1.25, '#6e9774')}${tree(112, 245, .74, '#8ca883')}${tree(207, 224, .57, '#8da982')}${tree(854, 290, 1.2, '#769873')}${tree(796, 202, .62, '#90a982')}${tree(326, 195, .4, '#91ad85')}
  <g class="route-path"><polyline points="${road}" fill="none" stroke="#b6bb91" stroke-width="43" stroke-linecap="round" stroke-linejoin="round" opacity=".35" transform="translate(0 4)"/>
  <polyline points="${road}" fill="none" stroke="${scene === 'river' ? '#d7cfac' : '#ede1ba'}" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="${road}" fill="none" stroke="#fff9e7" stroke-opacity=".8" stroke-width="2" stroke-dasharray="3 10" stroke-linecap="round"/>
  ${points.map((p, i) => `<circle cx="${p.x}" cy="${p.y}" r="${i === 0 || i === distance ? 17 : 12}" fill="${i === distance ? '#e5ba73' : '#f8f1da'}" stroke="#b7b491" stroke-width="1.5"/><text x="${p.x}" y="${p.y + 4}" fill="#6b7960" text-anchor="middle" font-size="11" font-weight="bold">${i === 0 ? 'A' : i === distance ? 'B' : i}</text>`).join('')}
  </g>
  ${scene === 'home' ? `<g transform="translate(${last.x - 5} ${last.y - 38})"><rect x="-47" y="-58" width="94" height="67" rx="5" fill="#f4e8c7"/><path d="m-61-53 60-57 62 57z" fill="#b97958"/><path d="m-61-53 60-57 62 57" fill="none" stroke="#945f49" stroke-width="5" stroke-linejoin="round"/><rect x="-9" y="-29" width="23" height="38" rx="10" fill="#8b9c76"/><rect x="-33" y="-36" width="17" height="20" rx="3" fill="${completed ? '#ffd77c' : '#c4d4b5'}"/><rect x="24" y="-36" width="17" height="20" rx="3" fill="${completed ? '#ffd77c' : '#c4d4b5'}"/><path d="M-25-36v20m-8-10h17M32-36v20m-8-10h17" stroke="#f4e8c7" stroke-width="2"/><rect x="25" y="-98" width="13" height="30" rx="2" fill="#c39a77"/></g>` : scene === 'river' ? `<g transform="translate(${last.x} ${last.y - 30})"><path d="m-55 0 55-85 55 85z" fill="#d6a76e"/><path d="m-24 0 24-55L24 0z" fill="#7b8d6a"/><path d="M-65 0H65" stroke="#8c9c78" stroke-width="4"/></g>` : `<g transform="translate(${last.x} ${last.y - 28})"><path d="M0 0v-79" stroke="#897d62" stroke-width="5"/><path d="M3-79h48l-15 15 15 15H3z" fill="#d79c67"/></g>`}
  <g fill="#88a476"><path d="m44 392 3-13 5 13 4-19 5 19m216-30 4-15 4 15 5-12 3 12m284 52 5-18 5 18 5-12 3 12m252-59 4-15 4 15 4-10 3 10"/></g>
  <g fill="#f9efd1"><circle cx="221" cy="355" r="4"/><circle cx="626" cy="326" r="4"/><circle cx="733" cy="369" r="4"/></g><g fill="#d6ac76"><circle cx="222" cy="355" r="1.6"/><circle cx="626" cy="326" r="1.6"/><circle cx="733" cy="369" r="1.6"/></g>
  <g transform="translate(44 322) scale(.8)">${animal}</g>
  ${game ? '<g fill="#88a476" opacity=".45"><path d="m105 510 4-13 5 13 5-18 4 18m620 15 5-18 5 18 5-12 3 12m-550 80 5-16 5 16 4-10 3 10m570 100 4-15 4 15 5-11 3 11"/></g>' : ''}
  ${tokenMarkup}
  ${preview ? '<g transform="translate(389 385)"><rect x="-67" y="-19" width="134" height="30" rx="15" fill="#fffdf4" opacity=".8"/><text text-anchor="middle" y="1" font-size="11" fill="#68795c">每一步，都是小进步</text></g>' : ''}
  </svg>`;
  return game ? `<svg class="landscape" width="100%" height="100%" role="group" aria-label="冒险风景与拼音路线">${artwork}</svg>` : artwork;
}
