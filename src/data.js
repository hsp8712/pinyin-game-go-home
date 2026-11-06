export const MODES = [
  { id: 'initial', name: '声母', subtitle: '认识拼音小伙伴', mark: 'b', color: 'peach' },
  { id: 'final', name: '韵母', subtitle: '把每个音读清楚', mark: 'ā', color: 'mint' },
  { id: 'whole', name: '整体认读音节', subtitle: '整体记住，轻松读', mark: 'zhi', color: 'lavender' },
  { id: 'tone', name: '声调', subtitle: '听见声音的高低', mark: 'ǎ', color: 'yellow' },
  { id: 'syllable', name: '音节拼读', subtitle: '拼一拼，读出来', mark: 'mā', color: 'blue' },
  { id: 'custom', name: '自选练习', subtitle: '装满自己的小背包', mark: '＋', color: 'pink' },
];
export const SCENES = [
  { id: 'home', name: '带拼音回家', icon: '⌂', label: '森林入口 → 温暖小屋', destination: '回家', completion: '小屋的灯亮啦！' },
  { id: 'river', name: '带拼音过河', icon: '≈', label: '河岸 → 对岸营地', destination: '过河', completion: '朋友们在营地集合啦！' },
  { id: 'mountain', name: '带拼音爬山', icon: '△', label: '山脚 → 山顶观景台', destination: '登顶', completion: '山顶的小旗升起来啦！' },
];
export const CHARACTERS = [ { id: 'rabbit', name: '小兔', emoji: '🐰' }, { id: 'bear', name: '小熊', emoji: '🐻' }, { id: 'fox', name: '小狐狸', emoji: '🦊' } ];
const entries = [];
function add(mode, group, words) {
  for (const text of words.split(' ')) entries.push({ id: text.normalize('NFC'), text, mode, group });
}
add('initial', '声母', 'b p m f d t n l g k h j q x zh ch sh r z c s y w');
add('final', '单韵母', 'a o e i u ü');
add('final', '复韵母', 'ai ei ui ao ou iu ie üe er');
add('final', '前鼻韵母', 'an en in un ün');
add('final', '后鼻韵母', 'ang eng ing ong');
add('whole', '整体认读音节', 'zhi chi shi ri zi ci si yi wu yu ye yue yuan yin yun ying');
add('tone', '四声', 'mā má mǎ mà bā bá bǎ bà yī yí yǐ yì wū wú wǔ wù ā á ǎ à');
add('tone', '轻声（可选）', 'ma ba ne');
const syllables = [
  ['ba', 'b · a', '两拼音节'], ['pa', 'p · a', '两拼音节'], ['mo', 'm · o', '两拼音节'],
  ['fo', 'f · o', '两拼音节'], ['da', 'd · a', '两拼音节'], ['te', 't · e', '两拼音节'],
  ['ni', 'n · i', '两拼音节'], ['lu', 'l · u', '两拼音节'], ['ge', 'g · e', '两拼音节'],
  ['ke', 'k · e', '两拼音节'], ['he', 'h · e', '两拼音节'], ['ji', 'j · i', '两拼音节'],
  ['qi', 'q · i', '两拼音节'], ['xi', 'x · i', '两拼音节'], ['mā', 'm · ā', '带调音节'],
  ['bà', 'b · à', '带调音节'], ['nǐ', 'n · ǐ', '带调音节'], ['hǎo', 'h · ǎo', '带调音节'],
  ['lǜ', 'l · ǜ', '带调音节'], ['xué', 'x · üé', '带调音节'], ['guā', 'g · u · ā', '三拼音节'],
  ['huā', 'h · u · ā', '三拼音节'], ['duǒ', 'd · u · ǒ', '三拼音节'],
  ['xiǎo', 'x · i · ǎo', '三拼音节'], ['jiā', 'j · i · ā', '三拼音节'],
  ['guo', 'g · u · o', '三拼音节'], ['kuai', 'k · u · ai', '三拼音节'],
];
for (const [text, parts, group] of syllables) entries.push({ id: text, text, parts, mode: 'syllable', group });
export const ENTRIES = entries;
export const ITEM_MAP = Object.fromEntries(entries.map(e => [e.id, e]));
export function itemsFor(mode) { return mode === 'custom' ? [...new Map(entries.map(e => [e.id, e])).values()] : entries.filter(e => e.mode === mode); }
export function defaultSelection(mode) { return itemsFor(mode).filter(e => e.group !== '轻声（可选）').slice(0, 4).map(e => e.id); }
export const RATINGS = [
  { id: 'independent', title: '独立完成', step: 2, icon: '✦', feedback: '这次你自己读对了！' },
  { id: 'corrected', title: '自己改对了', step: 2, icon: '↻', feedback: '你发现并改对了！' },
  { id: 'assisted', title: '提示后完成', step: 1, icon: '♡', feedback: '一起练过，继续前进！' },
  { id: 'pending', title: '暂未完成', step: 0, icon: '☁', feedback: '先休息，稍后再试。' },
];
