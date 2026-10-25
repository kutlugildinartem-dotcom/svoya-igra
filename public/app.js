'use strict';
/* =================== утилиты =================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const clone = o => JSON.parse(JSON.stringify(o));
const fmt = n => (n < 0 ? '−' : '') + Math.abs(Math.round(n || 0)).toLocaleString('ru-RU');
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const EMOJI_RE = /^[\s\p{Extended_Pictographic}‍️\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]+$/u;
const isEmojiOnly = s => !!s && EMOJI_RE.test(s.trim());
function setPath(o, path, v) { const ks = path.split('.'); for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; } o[ks[ks.length - 1]] = v; }

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } },
  del(k) { try { localStorage.removeItem(k); } catch { } },
};
const DB = {
  open() { return this._p || (this._p = new Promise((res, rej) => { const r = indexedDB.open('svoyak', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); },
  async get(k) { try { const db = await this.open(); return await new Promise((res, rej) => { const t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); } catch { return undefined; } },
  async set(k, v) { try { const db = await this.open(); await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); return true; } catch (e) { console.warn(e); return false; } },
  async del(k) { try { const db = await this.open(); await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); return true; } catch { return false; } },
};

/* =================== константы =================== */
const THEMES = [
  { id: 'dark', name: 'Тёмная', bg: '#0f1015' }, { id: 'light', name: 'Светлая', bg: '#f4f3ef' },
  { id: 'blue', name: 'Классика', bg: '#0f2470' }, { id: 'plum', name: 'Слива', bg: '#21182c' },
];
const ACCENTS = ['#7c6cff', '#ff6b5e', '#2ad1a3', '#f5c542', '#3ea6ff', '#ff5fa2', '#ff9f43'];
const PCOLORS = ['#ff6b5e', '#3ea6ff', '#2ad1a3', '#f5c542', '#b07cff', '#ff5fa2', '#ff9f43', '#7bd389'];
const TIMES = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120];
const DEFAULT_SETTINGS = { theme: 'dark', accent: '#7c6cff', buzzTime: 15, answerTime: 10, finalTime: 45, falseStart: true, sound: true, autoArm: false, autoJoin: true, hostRemote: false, hostName: '', hostPin: String(1000 + Math.floor(Math.random() * 9000)) };
const BADGES = { immune: ['∞', 'Бессмертие'], double: ['×2', 'Двойной удар'], shield: ['🛡', 'Щит'] };
const MOD_TYPES = {
  add: { label: 'Прибавить себе (минус — отнять)', amount: true },
  steal: { label: 'Забрать у игрока', amount: true, target: 'other' },
  give: { label: 'Отдать игроку', amount: true, target: 'other' },
  tax: { label: 'Все остальные теряют', amount: true },
  signflip: { label: 'Сменить знак счёта', target: 'any' },
  swap: { label: 'Обменяться счётом', target: 'other' },
  immune: { label: 'Бессмертие до конца раунда' },
  double: { label: '×2 за верные до конца раунда' },
  shield: { label: 'Щит от одного штрафа' },
  chooser: { label: 'Выбирает следующий вопрос' },
  custom: { label: 'Правило (следит ведущий)' },
};
const QTYPES = { normal: 'Обычный вопрос', cat: '🐱 Кот в мешке', auction: '🔨 Аукцион', closest: '🎯 Ближе всех (отвечают все)', vote: '🗳 Голосование (голосуют все, ведущий отмечает)' };
const QICONS = { cat: '🐱', auction: '🔨', closest: '🎯', vote: '🗳' };
const voteOptions = q => { const o = String(q.voteOptions || '').split(/\n|,/).map(s => s.trim()).filter(Boolean); return o.length ? o : ['Да', 'Нет']; };

/* =================== состояние =================== */
const makePlayer = i => ({ id: uid(), name: 'Игрок ' + (i + 1), color: PCOLORS[i % 8], score: 0, binding: null, badges: {} });
const S = {
  screen: 'setup',
  pack: null,
  settings: Object.assign({}, DEFAULT_SETTINGS, LS.get('svoyak-settings', {})),
  players: LS.get('svoyak-players', null) || [makePlayer(0), makePlayer(1), makePlayer(2)],
};
S.players.forEach(p => { p.badges = p.badges || {}; p.score = p.score || 0; });
let G = null;   // ход игры
let Q = null;   // открытый вопрос
let F = null;   // финал
let capture = null;  // назначение кнопки: { pid }
const falseUntil = {};
const phones = new Map();
const app = $('#app');

const player = id => S.players.find(p => p.id === id);
const round = () => S.pack.rounds[G.round];
const modById = id => S.pack.modifiers.find(m => m.id === id);
const qValue = (q, qi, ri = G ? G.round : 0) => Number(q.value) || (qi + 1) * (ri + 1) * 100;
const saveSettings = () => LS.set('svoyak-settings', S.settings);
function save() { LS.set('svoyak-players', S.players); if (G) LS.set('svoyak-save', { G, F: F ? Object.assign({}, F, { timer: null }) : null }); }

/* =================== звук =================== */
let AC;
function tone(f, d = 0.15, type = 'sine', v = 0.2, t0 = 0, f2) {
  AC = AC || new (window.AudioContext || window.webkitAudioContext)();
  const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime + t0;
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d + 0.05);
}
const bell = (f, t0 = 0, v = 0.22) => [[1, 1], [2.76, 0.35], [5.4, 0.15], [8.93, 0.06]].forEach(([m, k], i) => tone(f * m, 1.6 / (i + 1), 'sine', v * k, t0));
const SFX = {
  open: () => { tone(660, .09, 'triangle', .12); tone(990, .14, 'triangle', .1, .07); },
  buzz: () => tone(880, .22, 'square', .08, 0, 660),
  good: () => { bell(1318.5); bell(1975.5, .14, .18); },
  bad: () => { tone(185, .13, 'square', .11, 0, 160); tone(185, .16, 'square', .11, .19, 140); },
  tick: () => tone(1200, .04, 'square', .04),
  end: () => { tone(440, .18, 'triangle', .14); tone(330, .3, 'triangle', .14, .2); },
  mod: () => [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, .14, 'sine', .12, i * .05)),
  cat: () => { tone(700, .3, 'sine', .14, 0, 1100); tone(1100, .35, 'sine', .11, .25, 600); },
  bind: () => tone(1000, .08, 'triangle', .12),
  fstart: () => tone(150, .15, 'square', .08),
  fanfare: () => [523, 659, 784, 1047].forEach((f, i) => bell(f, i * .14, .16)),
};
function sfx(n) { if (!S.settings.sound) return; try { SFX[n] && SFX[n](); } catch { } }

/* =================== тема =================== */
function applyTheme() {
  const r = document.documentElement, st = S.settings;
  r.dataset.theme = st.theme;
  r.style.setProperty('--accent', st.accent);
  const c = st.accent.replace('#', ''), n = parseInt(c.length === 3 ? c.split('').map(x => x + x).join('') : c, 16);
  const lum = (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255;
  r.style.setProperty('--accent-ink', lum > 0.62 ? '#14151a' : '#ffffff');
  document.body.classList.toggle('remote', !!st.hostRemote);
}

/* =================== кнопки: клавиатура, геймпад, телефон =================== */
const KEYN = { Space: 'Пробел', Enter: 'Enter', ShiftLeft: 'Shift Л', ShiftRight: 'Shift П', ControlLeft: 'Ctrl Л', ControlRight: 'Ctrl П', AltLeft: 'Alt Л', AltRight: 'Alt П', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Backspace: '⌫', Tab: 'Tab' };
function keyName(code) { return KEYN[code] || code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ').replace(/^Audio/, '').replace(/^Media/, ''); }
function deviceLabel(b) {
  if (!b) return 'Назначить кнопку';
  if (b.startsWith('key:')) return '⌨ ' + keyName(b.slice(4));
  if (b.startsWith('gp:')) { const [, i, btn] = b.split(':'); return `🎮 ${+i + 1} · ${btn.startsWith('a') ? 'ось ' + btn.slice(1) : 'кнопка ' + (+btn + 1)}`; }
  if (b.startsWith('phone:')) { const ph = phones.get(b.slice(6)); return '📱 ' + (ph ? ph.name : 'телефон (не в сети)'); }
  return b;
}
function onDevice(dev, at) {
  if (capture) {
    const p = player(capture.pid);
    if (!p) { capture = null; return true; }
    S.players.forEach(o => { if (o.binding === dev) o.binding = null; });
    p.binding = dev;
    if (dev.startsWith('phone:')) { const ph = phones.get(dev.slice(6)); if (ph && /^Игрок \d+$/.test(p.name)) p.name = ph.name; }
    capture = null; sfx('bind'); save(); render();
    return true;
  }
  const p = S.players.find(o => o.binding === dev);
  if (p) { buzz(p.id, at); return true; }
  return false;
}
document.addEventListener('keydown', e => {
  const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  if (capture && !typing) {
    e.preventDefault();
    if (e.code === 'Escape') { capture = null; render(); return; }
    if (!e.repeat) onDevice('key:' + e.code);
    return;
  }
  if (typing) { if (e.code === 'Escape') t.blur(); return; }
  if (e.repeat) return;
  if (onDevice('key:' + e.code)) { e.preventDefault(); return; }
  hostKey(e);
});
const gpPrev = {};
function pollGamepads() {
  try {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const first = !gpPrev[gp.index], prev = gpPrev[gp.index] || (gpPrev[gp.index] = {});
      gp.buttons.forEach((b, i) => {
        const on = b.pressed || b.value > 0.5;
        if (on && !prev['b' + i] && !first) onDevice(`gp:${gp.index}:${i}`);
        prev['b' + i] = on;
      });
      gp.axes.forEach((v, i) => {
        const dir = v > 0.6 ? '+' : v < -0.6 ? '-' : '';
        if (dir && prev['a' + i] !== dir && !first) onDevice(`gp:${gp.index}:a${i}${dir}`);
        prev['a' + i] = dir;
      });
    }
  } catch { }
  requestAnimationFrame(pollGamepads);
}

/* =================== сеть: телефоны и пульт ведущего =================== */
const NET = { online: /^https?:$/.test(location.protocol), base: '', url: '', panels: 0, room: '', key: '', es: null };
function roomInit(fresh) {
  let r = fresh ? null : LS.get('svoyak-room', null);
  if (!r || !r.code || !r.key) {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    r = { code: Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''), key: uid() + uid() + uid() };
    LS.set('svoyak-room', r);
  }
  NET.room = r.code; NET.key = r.key;
  NET.url = NET.base ? `${NET.base}/p?room=${NET.room}` : '';
}
function connectNet() {
  if (!NET.online) return;
  if (!NET.room) roomInit(false);
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  fetch('/api/info').then(r => r.json()).then(i => {
    NET.base = local && i.urls && i.urls[0] ? i.urls[0] : location.origin;
    NET.url = `${NET.base}/p?room=${NET.room}`;
    refreshPhones();
  }).catch(() => { NET.online = false; refreshPhones(); });
  if (NET.es) NET.es.close();
  const es = NET.es = new EventSource(`/events?role=host&room=${NET.room}&key=${encodeURIComponent(NET.key)}`);
  es.onmessage = ev => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.type === 'roomtaken') { es.close(); roomInit(true); connectNet(); return; }
    onNet(m);
  };
  es.onopen = () => { pushState(true); syncClock(); if (Q && Q.q.media && Q.q.media.src) postMedia(Q.id, Q.q.media); };
}
/* сверка часов экрана с сервером (как NTP: берём замер с самым быстрым ответом) */
async function syncClock() {
  if (!NET.online || syncClock.busy) return;
  syncClock.busy = true;
  let best = Infinity;
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    try {
      const j = await (await fetch('/api/time', { cache: 'no-store' })).json(), t1 = Date.now(), rtt = t1 - t0;
      if (rtt < best) { best = rtt; NET.off = j.s + rtt / 2 - t1; }
    } catch { break; }
  }
  syncClock.busy = false;
}
setInterval(syncClock, 60000);
function postMedia(id, media) {
  if (!NET.online || !media || !media.src) return;
  fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: NET.room, key: NET.key, id, media }) }).catch(() => { });
}
function autoJoin(id, name) {
  if (!S.settings.autoJoin) return;
  const dev = 'phone:' + id;
  if (S.players.some(o => o.binding === dev)) return;
  let slot = S.players.find(o => !o.binding && /^Игрок \d+$/.test(o.name) && !(G && o.score));
  if (!slot && S.players.length < 8) { slot = makePlayer(S.players.length); const used = S.players.map(o => o.color); slot.color = PCOLORS.find(c => !used.includes(c)) || slot.color; S.players.push(slot); }
  if (!slot) return;
  slot.binding = dev; slot.name = name; sfx('bind'); save();
  if (S.screen === 'setup') renderSetup(); else if (S.screen === 'game') renderPlayers();
}
function onNet(m) {
  if (m.type === 'join') { phones.set(m.id, { name: m.name }); autoJoin(m.id, m.name); refreshPhones(); pushState(true); }
  else if (m.type === 'pick') {
    const p = S.players.find(o => o.binding === 'phone:' + m.id);
    if (p && G && G.phase === 'board' && !Q && G.chooser === p.id) openCell(String(m.k));
  }
  else if (m.type === 'leave') { phones.delete(m.id); refreshPhones(); }
  else if (m.type === 'panels') { NET.panels = m.n; refreshPhones(); if (m.n) pushState(true); }
  else if (m.type === 'cmd') { closeModal(); act(m.act, Object.assign({}, m.d, { remote: 1 })); }
  else if (m.type === 'buzz') {
    // время нажатия по часам сервера; если телефон ещё не сверил часы или они врут — берём время прихода на сервер
    const at = Number(m.at) && Math.abs(m.at - m.t) < 3000 ? Number(m.at) : m.t;
    onDevice('phone:' + m.id, at);
  }
  else if (m.type === 'fremove') {   // игрок убирает финальную тему со своего телефона — только в свою очередь
    const p = S.players.find(o => o.binding === 'phone:' + m.id);
    if (p && F && F.phase === 'remove' && F.theme == null && F.parts[F.turn % F.parts.length] === p.id) act('f-remove', { i: String(Number(m.i)) });
  }
  else if (m.type === 'vote') {
    const p = S.players.find(o => o.binding === 'phone:' + m.id);
    if (p && Q && Q.type === 'vote' && Q.view === 'question') { Q.votes[p.id] = String(m.choice || '').slice(0, 60); sfx('bind'); render(); }
  }
  else if ((m.type === 'bet' || m.type === 'answer') && F) {
    const p = S.players.find(o => o.binding === 'phone:' + m.id);
    if (!p || !F.parts.includes(p.id)) return;
    if (m.type === 'bet' && F.phase === 'bet') { setBet(p, m.value, true); sfx('bind'); render(); }
    if (m.type === 'answer' && F.phase === 'question') { F.answers[p.id] = String(m.text || '').slice(0, 200); sfx('bind'); render(); }
  }
}
function refreshPhones() {
  if (S.screen !== 'setup') return;
  const c = $('#phones-card'); if (c) c.innerHTML = phonesPanel();
  const h = $('#host-card'); if (h && !h.contains(document.activeElement)) h.innerHTML = hostPanel();
  drawQR();
  $$('[data-act="bind"]').forEach(b => { const p = player(b.dataset.id); if (p && !(capture && capture.pid === p.id)) b.textContent = deviceLabel(p.binding); });
}
let pushT, lastPush = '', lastHostPush = '';
function pushState(force) {
  if (!NET.online) return;
  clearTimeout(pushT);
  pushT = setTimeout(() => {
    const auth = `{"room":${JSON.stringify(NET.room)},"key":${JSON.stringify(NET.key)}`;
    const s = JSON.stringify(netState());
    if (s !== lastPush || force) { lastPush = s; post('/api/state', `${auth},"state":${s}}`); }
    const h = JSON.stringify(hostState());
    if (h !== lastHostPush || force) { lastHostPush = h; post('/api/hoststate', `${auth},"pin":${JSON.stringify(S.settings.hostPin)},"state":${h}}`); }
  }, 5);
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => { });
function netState() {
  let phase = 'idle';
  if (S.screen === 'game' && G) {
    if (Q) {
      if (Q.view === 'grab') phase = Q.phase === 'grab' ? 'grab' : 'wait';
      else if (Q.view === 'question') phase = Q.type === 'closest' ? 'closest' : Q.type === 'vote' ? 'voting' : Q.phase;
    } else if (G.phase === 'final' && F) {
      if (F.phase === 'remove') phase = 'final-remove';
      else if (F.phase === 'bet') phase = 'final-bet';
      else if (F.phase === 'question') phase = 'final-answer';
    }
  }
  const live = S.screen === 'game' && G;
  let q = null, board = null, title = '';
  if (live) {
    title = G.phase === 'final' ? 'Финал' : G.phase === 'results' ? 'Итоги' : `Раунд ${G.round + 1} · ${round().name}`;
    if (Q) {
      const shown = Q.view === 'question' || Q.view === 'answer', m = Q.modId ? modById(Q.modId) : null;
      q = {
        id: Q.id, view: Q.view, theme: Q.theme, value: fmt(Q.value), type: Q.type,
        text: shown ? Q.text : '',
        answer: Q.view === 'answer' ? (Q.q.answer || '—') : null,
        options: Q.type === 'vote' ? voteOptions(Q.q) : null,
        voted: Q.type === 'vote' ? Object.keys(Q.votes) : null,
        votes: Q.type === 'vote' && Q.view === 'answer' ? Q.votes : null,   // чужие голоса видны только после ответа
        marks: Q.type === 'vote' && Q.view === 'answer' ? Q.marks : null,
        media: shown && Q.q.media && Q.q.media.src ? Q.id : null,
        ansMedia: Q.view === 'answer' && Q.q.answerMedia && Q.q.answerMedia.src ? Q.id + 'a' : null,
        mod: m ? (Q.view === 'grab' ? '❓ Модификатор! Что внутри — узнаешь, если схватишь' : `${m.emoji} ${m.name}`) : null,
        modText: Q.view === 'mod-result' ? Q.modText : null,
      };
    } else if (G.phase === 'board') {
      board = round().themes.map((t, ti) => ({ name: t.name, cells: t.questions.map((qq, qi) => ({ k: ti + '-' + qi, v: fmt(qValue(qq, qi)), used: !!G.used[ti + '-' + qi] })) }));
    } else if (G.phase === 'final' && F && F.theme != null && F.phase !== 'remove') {
      const t = finalTheme();
      q = { id: 'final', view: F.phase === 'reveal' && F.showAnswer ? 'answer' : 'question', theme: 'Финал · ' + t.name, value: '', type: 'final', text: F.phase === 'bet' ? '' : t.text, answer: F.phase === 'reveal' && F.showAnswer ? t.answer : null, media: F.phase !== 'bet' && t.media && t.media.src ? 'final-' + F.theme : null };
    }
  }
  return {
    phase, capture: !!capture, title, q, board, chooser: live && G.phase === 'board' && !Q ? G.chooser : null,
    answering: Q ? Q.answering : null, only: Q ? Q.only : null, tried: Q ? Q.tried : [],
    players: S.players.map(p => ({ id: p.id, name: p.name, color: p.color, score: p.score, binding: p.binding })),
    final: F ? {
      parts: F.parts, bets: Object.keys(F.bets), answers: Object.keys(F.answers),
      turn: F.phase === 'remove' && F.theme == null ? F.parts[F.turn % F.parts.length] : null,
      themes: F.phase === 'remove' ? S.pack.final.themes.map((t, i) => ({ name: t.name, gone: F.removed.includes(i) })) : null,
    } : null,
  };
}
/* состояние для пульта ведущего: всё, что ему нужно видеть, и кнопки, которые он может нажать */
function hostState() {
  const st = {
    title: '', status: '', q: null, board: null, actions: [], inputs: [], live: S.screen === 'game' && !!G,
    step: G ? (G.round + 1) * 100 : 100, timer: null,
    players: S.players.map(p => ({ id: p.id, name: p.name, color: p.color, score: p.score, badges: Object.keys(BADGES).filter(b => p.badges[b]).map(b => BADGES[b][0]) })),
  };
  const A = (l, a, d, k) => st.actions.push({ l, a, d: d || {}, k: k || '' });
  const pl = (a, filter, prefix) => S.players.filter(filter || (() => true)).forEach(p => A((prefix || '') + p.name, a, { id: p.id }, 'pl:' + p.color));
  if (!st.live) { st.status = S.screen === 'editor' ? 'На экране открыт редактор' : 'Ждём начала игры на большом экране'; return st; }
  const fin = (S.pack.final && S.pack.final.themes) || [];
  st.title = G.phase === 'final' ? 'Финал' : G.phase === 'results' ? 'Итоги' : `Раунд ${G.round + 1} · ${round().name}`;
  const T = (Q && Q.timer) || (F && F.timer);
  if (T) st.timer = { end: T.end, total: T.total };
  if (Q) {
    const q = Q.q, m = Q.modId ? modById(Q.modId) : null;
    // модификатор скрыт от всех, включая ведущего, пока кто-нибудь его не схватит
    st.q = { theme: Q.theme, value: fmt(Q.value), text: Q.text, answer: q.answer || '—', type: Q.type, media: q.media && q.media.src ? q.media.kind : '', mod: m ? (Q.view === 'grab' ? '❓ Модификатор (сюрприз)' : m.emoji + ' ' + m.name) : '' };
    switch (Q.view) {
      case 'grab': st.status = Q.phase === 'grab' ? 'Модификатор! Кто рискнёт нажать первым?' : 'Сейчас появится модификатор'; pl('grab-give', null, 'Отдать: '); A('Никто → к вопросу', 'mod-skip'); break;
      case 'mod-target': st.status = `${player(Q.modOwner).name}: выбери игрока`; pl('mod-target', p => MOD_TYPES[m.type].target === 'any' || p.id !== Q.modOwner); break;
      case 'mod-result': st.status = Q.modText; A('К вопросу →', 'to-question', null, 'primary'); break;
      case 'cat-pick': st.status = 'Кот в мешке: кому отдаём?'; pl('cat-give', p => p.id !== G.chooser); break;
      case 'cat-reveal': st.status = 'Кот достался: ' + player(Q.only).name; A('Вопрос →', 'to-question', null, 'primary'); break;
      case 'auction':
        st.status = 'Аукцион: выбери победителя и ставку';
        S.players.forEach(p => A(p.name + ' · ' + fmt(p.score), 'auc-pick', { id: p.id }, (Q.auc.pid === p.id ? 'on ' : '') + 'pl:' + p.color));
        st.inputs.push({ id: 'auc', label: 'Ставка', value: Q.auc.bid, a: 'auc-bid' });
        if (Q.auc.pid) { A('Ва-банк', 'auc-allin'); A('Продано!', 'auc-sell', null, 'primary'); }
        break;
      case 'question':
        if (Q.type === 'vote') {
          st.status = `Голосование: проголосовали ${Object.keys(Q.votes).length} из ${S.players.length}`;
          st.info = S.players.map(p => `${p.name}: ${Q.votes[p.id] != null ? Q.votes[p.id] : '—'}`);
          A('Показать ответ', 'reveal', null, 'primary'); break;
        }
        if (Q.type === 'closest') { st.status = 'Все отвечают вслух по очереди, потом открой ответ'; A('Показать ответ', 'reveal', null, 'primary'); break; }
        if (Q.phase === 'reading') { st.status = Q.only ? 'Отвечает ' + player(Q.only).name : 'Прочитай вопрос вслух'; A(Q.only ? 'Старт' : 'Разрешить ответы', 'arm', null, 'primary'); A('Показать ответ', 'reveal'); }
        else if (Q.phase === 'armed') { st.status = 'Ждём кнопку…'; pl('pcard', p => !Q.tried.includes(p.id), 'Отвечает: '); A('Никто → ответ', 'reveal'); }
        else if (Q.phase === 'answering') { st.status = 'Отвечает ' + player(Q.answering).name; A('✓ Верно', 'right', null, 'good'); A('✗ Неверно', 'wrong', null, 'bad'); }
        break;
      case 'answer':
        st.status = Q.type === 'closest' ? 'Кто ближе всех? Отметь победителя' : Q.type === 'vote' ? (Q.voteDone ? 'Баллы начислены' : 'Отметь, кто проголосовал верно') : 'Ответ на экране';
        if (Q.type === 'closest') pl('closest-win', p => !(Q.won || []).includes(p.id), '🎯 ');
        if (Q.type === 'vote' && !Q.voteDone) {
          S.players.forEach(p => {
            const v = Q.votes[p.id], m = Q.marks[p.id] || 0;
            A(`✓ ${p.name}${v != null ? ` (${v})` : ''}`, 'vote-mark', { id: p.id, v: '1' }, 'vgood' + (m > 0 ? ' on' : ''));
            A(`✗ ${p.name}`, 'vote-mark', { id: p.id, v: '-1' }, 'vbad' + (m < 0 ? ' on' : ''));
          });
          A('Начислить баллы', 'vote-apply', null, 'primary');
        }
        A('К табло →', 'close-q', null, 'primary');
        break;
    }
  } else if (G.phase === 'intro') { st.status = 'Заставка раунда'; A('Поехали →', 'intro-go', null, 'primary'); }
  else if (G.phase === 'board') {
    const ch = player(G.chooser);
    st.status = (ch ? ch.name : 'Игрок') + ' выбирает вопрос';
    st.board = round().themes.map((t, ti) => ({ name: t.name, cells: t.questions.map((q, qi) => { const k = ti + '-' + qi; return { k, v: fmt(qValue(q, qi)), used: !!G.used[k], mark: QICONS[q.type] || '' }; }) }));   // где спрятаны модификаторы — не показываем даже ведущему
  } else if (G.phase === 'roundEnd') { st.status = 'Раунд окончен'; A(G.round >= S.pack.rounds.length - 1 ? 'В финал →' : 'Следующий раунд →', 'next-round', null, 'primary'); }
  else if (G.phase === 'final' && F) {
    if (F.phase === 'remove') { st.status = `${player(F.parts[F.turn % F.parts.length]).name} убирает тему · осталось ${fin.length - F.removed.length}`; fin.forEach((t, i) => { if (!F.removed.includes(i)) A('✕ ' + t.name, 'f-remove', { i: String(i) }); }); }
    else {
      const t = fin[F.theme];
      st.q = { theme: 'Финал · ' + t.name, value: '', text: t.text, answer: t.answer || '—', type: 'final', media: t.media && t.media.src ? t.media.kind : '' };
      if (F.phase === 'bet') { st.status = 'Собери ставки'; F.parts.forEach(pid => { const p = player(pid); st.inputs.push({ id: pid, label: `${p.name} (1–${fmt(Math.max(1, p.score))})`, value: F.bets[pid] != null ? F.bets[pid] : '', a: 'f-bet', secret: true }); }); A('Показать вопрос →', 'f-go', { force: 1 }, 'primary'); }
      else if (F.phase === 'question') { st.status = F.timer ? 'Идёт время' : F.started ? 'Время вышло' : 'Прочитай вопрос'; if (!F.started) A('Старт', 'f-start', null, 'primary'); A('Проверить ответы →', 'f-check'); }
      else {
        st.status = 'Проверка ответов';
        if (!F.showAnswer) A('Показать ответ на экране', 'f-show');
        F.parts.forEach(pid => { if (F.judged[pid]) return; const p = player(pid), b = fmt(F.bets[pid] || 0), a = F.answers[pid] ? ` «${F.answers[pid]}»` : ''; A(`✓ ${p.name} · ${b}${a}`, 'f-judge', { id: pid, v: '1' }, 'good'); A(`✗ ${p.name}`, 'f-judge', { id: pid, v: '-1' }, 'bad'); });
        if (F.parts.every(pid => F.judged[pid])) A('Итоги →', 'f-results', null, 'primary');
      }
    }
  } else if (G.phase === 'results') st.status = 'Игра окончена';
  return st;
}

/* =================== главный рендер =================== */
function render() {
  applyTheme();
  if (S.screen !== 'game' || !G || G.phase !== 'results') $$('.confetti').forEach(c => c.remove());
  if (S.screen === 'setup') renderSetup();
  else if (S.screen === 'editor') renderEditor();
  else renderGame();
  pushState();
}

/* =================== экран настройки =================== */
function renderSetup() {
  app.dataset.screen = 'setup';
  const saved = LS.get('svoyak-save', null);
  app.innerHTML = `
  <div class="setup">
    <header class="setup-head">
      <div class="logo">СВОЯ<span>ИГРА</span></div>
      <label class="pack-name">Игра: <select class="inp sm game-select" id="game-select">${GAMES.list.map(g => `<option value="${g.id}" ${g.id === S.packId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
      <div class="grow"></div>
      <button class="btn ghost" data-act="fullscreen">⛶ Полный экран</button>
      <button class="btn outline" data-act="editor">✎ Редактор вопросов</button>
    </header>
    <div class="setup-grid">
      <section class="card c-players">
        <h2>Игроки <span class="muted">${S.players.length} из 8</span></h2>
        <div class="players-list">${S.players.map(p => `
          <div class="prow ${capture && capture.pid === p.id ? 'capturing' : ''}" data-id="${p.id}" style="--c:${p.color}">
            <button class="dot" style="--c:${p.color}" data-act="color" data-id="${p.id}" title="Сменить цвет"></button>
            <input class="inp" value="${esc(p.name)}" data-pname="${p.id}" maxlength="20">
            <button class="btn sm ${p.binding ? 'outline' : ''}" data-act="bind" data-id="${p.id}">${capture && capture.pid === p.id ? 'Нажми кнопку…' : esc(deviceLabel(p.binding))}</button>
            <button class="icon" data-act="unbind" data-id="${p.id}" title="Отвязать кнопку" ${p.binding ? '' : 'disabled'}>✕</button>
            <button class="icon" data-act="delp" data-id="${p.id}" title="Удалить игрока" ${S.players.length <= 2 ? 'disabled' : ''}>🗑</button>
          </div>`).join('')}
        </div>
        <button class="btn outline" data-act="addp" ${S.players.length >= 8 ? 'disabled' : ''}>+ Игрок</button>
        <p class="hint">«Назначить кнопку» → нажми кнопку игрока: клавишу, геймпад/аркадную кнопку или кнопку на телефоне. Нажатие назначенной кнопки здесь мигает строкой — так удобно проверить.<br>Нет кнопок? Ведущий кликает по карточке того, кто первым поднял руку.</p>
      </section>
      <section class="card c-phones" id="phones-card">${phonesPanel()}</section>
      <section class="card c-host" id="host-card">${hostPanel()}</section>
      <section class="card c-settings">${settingsPanel()}</section>
    </div>
    <footer class="setup-foot">
      ${saved && saved.G ? `<button class="btn outline lg" data-act="continue">↻ Продолжить игру (${saved.G.phase === 'final' ? 'финал' : saved.G.phase === 'results' ? 'итоги' : 'раунд ' + (saved.G.round + 1)})</button>` : ''}
      <button class="btn lg" data-act="start">Новая игра →</button>
    </footer>
  </div>`;
  drawQR();
}
function phonesPanel() {
  if (!NET.online) return `<h2>Телефоны</h2>
    <p class="hint">Чтобы телефоны стали кнопками, запусти игру через <b>start.bat</b> — здесь появится адрес и QR-код.</p>
    <p class="hint">Сейчас игра открыта как файл: работают клавиатура, геймпады/аркадные кнопки и клики ведущего.</p>`;
  return `<h2>Игроки с телефонов <span class="muted">${phones.size}</span></h2>
    <div class="qr-row"><div data-qr="${esc(NET.url)}"></div><div><p class="hint" style="margin-top:0">Код комнаты</p><div class="room-code">${esc(NET.room)}</div><div class="hint">Сканируй QR или открой сайт → «Я игрок» → код.</div></div></div>
    <div class="big-url sm">${esc(NET.url || 'загрузка…')}</div>
    <label class="check"><input type="checkbox" data-set="autoJoin" ${S.settings.autoJoin ? 'checked' : ''}> Подключившиеся сразу становятся игроками</label>
    <div class="phones">${[...phones].map(([id, ph]) => {
      const b = S.players.find(p => p.binding === 'phone:' + id);
      return `<div class="phone-chip">📱 ${esc(ph.name)} <span class="muted">${b ? '→ ' + esc(b.name) : '· не назначен'}</span></div>`;
    }).join('') || '<div class="muted">Пока никого</div>'}</div>
    ${phones.size ? `<button class="btn outline sm" data-act="autophones">Сделать всех игроками</button>` : ''}`;
}
function hostPanel() {
  const st = S.settings, url = NET.base ? `${NET.base}/host?room=${NET.room}&pin=${st.hostPin}` : '';
  return `<h2>Ведущий ${NET.online ? `<span class="muted" style="font-size:13px">${NET.panels ? '🟢 пульт в сети' : '⚪ пульт не в сети'}</span>` : ''}</h2>
    <input class="inp" data-set="hostName" value="${esc(st.hostName)}" placeholder="Имя ведущего (необязательно)" maxlength="24">
    ${NET.online ? `<div class="qr-row" style="margin-top:12px"><div data-qr="${esc(url)}"></div><div><p class="hint" style="margin-top:0">Пульт ведущего: ответы, табло, «Верно/Неверно», счёт</p>
      <div class="hint">Комната <b class="pin">${esc(NET.room)}</b> · PIN <b class="pin">${esc(st.hostPin)}</b> <button class="btn ghost sm" data-act="newpin">новый PIN</button></div></div></div>
      <label class="check"><input type="checkbox" data-set="hostRemote" ${st.hostRemote ? 'checked' : ''}> Вести только с пульта — на большом экране без кнопок</label>`
    : '<p class="hint">Пульт ведущего работает, когда игра открыта через сервер (start.bat или сайт).</p>'}`;
}
function drawQR() {
  const els = $$('[data-qr]').filter(e => e.dataset.qr);
  if (!els.length) return;
  if (window.QRCode) { els.forEach(el => { if (el.dataset.done === el.dataset.qr) return; el.innerHTML = ''; try { new QRCode(el, { text: el.dataset.qr, width: 132, height: 132 }); el.dataset.done = el.dataset.qr; } catch { } }); return; }
  if (drawQR.loading) return;
  drawQR.loading = true;
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  s.onload = drawQR;
  document.head.append(s);
}
function settingsPanel() {
  const st = S.settings;
  const timeSel = (k, label) => `<label>${label}<select class="inp" data-set="${k}">${TIMES.map(t => `<option value="${t}" ${Number(st[k]) === t ? 'selected' : ''}>${t ? t + ' сек' : 'Выкл'}</option>`).join('')}</select></label>`;
  return `<h2>Оформление и правила</h2>
    <label class="lbl" style="margin-top:0">Тема</label>
    <div class="seg">${THEMES.map(t => `<button class="seg-b ${st.theme === t.id ? 'on' : ''}" data-act="theme" data-v="${t.id}"><span class="sw" style="background:${t.bg}"></span>${t.name}</button>`).join('')}</div>
    <label class="lbl">Акцентный цвет</label>
    <div class="swatches">${ACCENTS.map(c => `<button class="swatch ${st.accent === c ? 'on' : ''}" style="--c:${c}" data-act="accent" data-v="${c}"></button>`).join('')}
      <label class="swatch custom ${ACCENTS.includes(st.accent) ? '' : 'on'}" title="Свой цвет">🎨<input type="color" value="${st.accent}" data-set="accent"></label></div>
    <label class="lbl">Таймеры</label>
    <div class="nums">${timeSel('buzzTime', 'На «нажать»')}${timeSel('answerTime', 'На ответ')}${timeSel('finalTime', 'В финале')}</div>
    <label class="check"><input type="checkbox" data-set="autoArm" ${st.autoArm ? 'checked' : ''}> Отвечать сразу — жать можно, как только появился вопрос, без разрешения ведущего</label>
    <label class="check"><input type="checkbox" data-set="falseStart" ${st.falseStart ? 'checked' : ''}> Фальстарт: нажал до разрешения — блок на 1 сек</label>
    <label class="check"><input type="checkbox" data-set="sound" ${st.sound ? 'checked' : ''}> Звуки</label>`;
}
function flashRow(pid) {
  const el = $(`.prow[data-id="${pid}"]`);
  if (!el) return;
  el.animate([{ transform: 'scale(1)', background: 'transparent' }, { transform: 'scale(1.02)', background: 'color-mix(in srgb, var(--c) 30%, transparent)' }, { transform: 'scale(1)', background: 'transparent' }], { duration: 450 });
  sfx('buzz');
}

/* =================== игра =================== */
function startGame() {
  if (S.players.length < 2) return alert('Нужно минимум 2 игрока');
  S.players.forEach(p => { p.score = 0; p.badges = {}; });
  G = { round: 0, used: {}, chooser: pick(S.players).id, modCells: {}, phase: 'intro', packId: S.packId };
  F = null; Q = null;
  setupRound();
  S.screen = 'game'; save(); render();
}
function setupRound() {
  const r = round();
  G.used = {}; G.modCells = {}; G.phase = 'intro';
  const pool = S.pack.modifiers.filter(m => m.enabled !== false);
  const free = [];
  r.themes.forEach((t, ti) => t.questions.forEach((q, qi) => {
    const k = ti + '-' + qi;
    if (q.modifier === 'random' && pool.length) G.modCells[k] = pick(pool).id;
    else if (q.modifier && modById(q.modifier)) G.modCells[k] = q.modifier;
    else if ((q.type || 'normal') === 'normal') free.push(k);
  }));
  if (pool.length) shuffle(free).slice(0, Number(r.randomMods) || 0).forEach(k => { G.modCells[k] = pick(pool).id; });
  S.players.forEach(p => { delete p.badges.immune; delete p.badges.double; });
  if (G.round > 0) G.chooser = S.players.slice().sort((a, b) => a.score - b.score)[0].id;
}
function roundDone() { return round().themes.every((t, ti) => t.questions.every((q, qi) => G.used[ti + '-' + qi])); }

function renderGame() {
  if (app.dataset.screen !== 'game') {
    app.dataset.screen = 'game';
    app.innerHTML = `<div class="game">
      <header class="topbar"><div class="logo sm">СВОЯ<span>ИГРА</span></div><div class="round-title" id="rtitle"></div><button class="btn ghost sm" data-act="menu">☰</button></header>
      <main id="stage"></main>
      <footer class="pbar" id="pbar"></footer></div>`;
  }
  const host = S.settings.hostName ? `<span class="host-tag">ведущий ${esc(S.settings.hostName)}</span>` : '';
  $('#rtitle').innerHTML = (G.phase === 'final' ? '<b>Финал</b>' : G.phase === 'results' ? '<b>Итоги</b>' : `Раунд ${G.round + 1} · <b>${esc(round().name || '')}</b>`) + host;
  const st = $('#stage'), k = stageKey();
  if (st.dataset.key !== k) {
    $$('audio,video', st).forEach(m => { try { m.pause(); } catch { } });
    st.dataset.key = k;
    st.innerHTML = stageHTML();
    if (G.phase === 'results' && !Q) confetti();
  }
  updateDynamic();
  renderPlayers();
}
function rerenderStage() { const st = $('#stage'); if (st) st.dataset.key = ''; render(); }
function stageKey() {
  if (Q) return `q:${Q.id}:${Q.view}:${(Q.won || []).length}` + (Q.type === 'vote' && Q.view === 'answer' ? JSON.stringify(Q.marks) + (Q.voteDone ? 1 : 0) : '');
  if (G.phase === 'final' && F) return `f:${F.phase}:${F.removed.length}:${F.showAnswer ? 1 : 0}:${Object.keys(F.judged).length}`;
  return `${G.phase}:${G.round}:${Object.keys(G.used).length}`;
}
function stageHTML() {
  if (Q) return questionHTML();
  if (G.phase === 'intro') return introHTML();
  if (G.phase === 'roundEnd') return roundEndHTML();
  if (G.phase === 'final') return finalHTML();
  if (G.phase === 'results') return resultsHTML();
  return boardHTML();
}
function introHTML() {
  const r = round();
  return `<div class="center intro">
    <div class="kicker">Раунд ${G.round + 1} из ${S.pack.rounds.length}</div>
    <h1>${esc(r.name || 'Раунд ' + (G.round + 1))}</h1>
    <div class="intro-themes">${r.themes.map((t, i) => `<div class="chip" style="animation-delay:${0.3 + i * 0.18}s">${esc(t.name)}</div>`).join('')}</div>
    <button class="btn lg ctl" data-act="intro-go">Поехали</button></div>`;
}
function boardHTML() {
  const r = round(), cols = Math.max(1, ...r.themes.map(t => t.questions.length));
  return `<div class="board" style="--cols:${cols};--rows:${r.themes.length}">${r.themes.map((t, ti) => `
    <div class="theme">${esc(t.name)}${t.desc ? `<small>${esc(t.desc)}</small>` : ''}</div>
    ${Array.from({ length: cols }, (_, qi) => {
      const q = t.questions[qi];
      if (!q) return '<div class="cell empty"></div>';
      const k = ti + '-' + qi, used = G.used[k];
      return `<button class="cell ${used ? 'used' : ''}" data-act="open" data-k="${k}" ${used ? 'disabled' : ''}>${used ? '' : fmt(qValue(q, qi))}</button>`;
    }).join('')}`).join('')}</div>`;
}
function podiumHTML() {
  return `<div class="podium">${S.players.slice().sort((a, b) => b.score - a.score).map((p, i) => `
    <div class="pl ${i === 0 ? 'first' : ''}" style="--c:${p.color};animation-delay:${i * 0.08}s"><div class="pos">${i + 1}</div><div class="nm">${esc(p.name)}</div><div class="sc" style="${p.score < 0 ? 'color:var(--bad)' : ''}">${fmt(p.score)}</div></div>`).join('')}</div>`;
}
function roundEndHTML() {
  const last = G.round >= S.pack.rounds.length - 1;
  return `<div class="center"><div class="kicker">Раунд ${G.round + 1} окончен</div>${podiumHTML()}
    <button class="btn lg ctl" data-act="next-round">${last ? 'В финал →' : 'Следующий раунд →'}</button></div>`;
}
function resultsHTML() {
  const w = S.players.slice().sort((a, b) => b.score - a.score)[0];
  return `<div class="center"><div class="kicker">Игра окончена · победитель</div>
    <div class="big-sign" style="font-size:clamp(36px,6vw,90px);color:${w.color}">🏆 ${esc(w.name)}</div>${podiumHTML()}
    <div class="controls"><button class="btn lg" data-act="new-game">В главное меню</button></div></div>`;
}
function renderPlayers() {
  const pb = $('#pbar');
  if (!pb) return;
  pb.style.setProperty('--n', S.players.length);
  pb.innerHTML = S.players.map(p => {
    let cls = '';
    if (Q) { if (Q.answering === p.id || (Q.only === p.id && Q.view === 'question')) cls = 'answering'; else if (Q.tried.includes(p.id) || (Q.only && Q.view === 'question')) cls = 'tried'; }
    else if (G.phase === 'final' && F && !F.parts.includes(p.id)) cls = 'tried';
    const choosing = !Q && G.phase === 'board' && G.chooser === p.id;
    if (choosing) cls += ' chooser';
    if ((falseUntil[p.id] || 0) > Date.now()) cls += ' falsestart';
    const badges = Object.keys(BADGES).filter(b => p.badges[b]).map(b => `<span class="badge" title="${BADGES[b][1]}">${BADGES[b][0]}</span>`).join('')
      + (Q && Q.type === 'vote' && Q.view === 'question' && Q.votes[p.id] != null ? '<span class="badge" title="Проголосовал">🗳</span>' : '');
    return `<button class="pcard ${cls}" style="--c:${p.color}" data-act="pcard" data-id="${p.id}">
      <div class="pname">${esc(p.name)} ${badges}</div><div class="pscore ${p.score < 0 ? 'neg' : ''}">${fmt(p.score)}</div>${choosing ? '<div class="ptag">выбирает</div>' : ''}</button>`;
  }).join('');
}
function ping(pid) {
  const el = $(`.pcard[data-id="${pid}"]`);
  if (!el) return;
  el.classList.remove('ping'); void el.offsetWidth; el.classList.add('ping');
  sfx('bind');
}

/* ---------- вопрос ---------- */
function openCell(k) {
  if (Q || !G || G.phase !== 'board' || G.used[k]) return;
  const [ti, qi] = k.split('-').map(Number), t = round().themes[ti], q = t && t.questions[qi];
  if (!q) return;
  Q = {
    id: uid(), k, q, theme: t.name, desc: t.desc || '', text: q.text || '', value: qValue(q, qi), type: q.type || 'normal',
    modId: G.modCells[k] && modById(G.modCells[k]) ? G.modCells[k] : null,
    tried: [], answering: null, only: null, phase: 'idle', log: [], timer: null, view: '', won: [],
  };
  sfx('open');
  if (q.media && q.media.src) postMedia(Q.id, q.media);
  if (Q.modId) {
    Q.view = 'grab'; Q.phase = 'grab-wait';
    const id = Q.id;
    setTimeout(() => { if (Q && Q.id === id && Q.view === 'grab') { Q.phase = 'grab'; markArmed(); sfx('mod'); render(); } }, 1200);
  } else startMain();
  render();
}
function startMain() {
  if (Q.type === 'cat') { Q.view = 'cat-pick'; sfx('cat'); }
  else if (Q.type === 'auction') { Q.view = 'auction'; Q.auc = { pid: null, bid: Q.value }; sfx('cat'); }
  else if (Q.type === 'vote') { Q.view = 'question'; Q.phase = 'voting'; Q.votes = {}; Q.marks = {}; Q.voteDone = false; }
  else beginQuestion();
}
/* голосование: ✓ — плюс стоимость, ✗ — ноль (или минус, если в клетке включён штраф) */
function applyVotes() {
  if (!Q || Q.type !== 'vote' || Q.voteDone) return;
  let any = false;
  S.players.forEach(p => {
    const m = Q.marks[p.id];
    if (m > 0) { const d = Q.value * (p.badges.double ? 2 : 1); p.score += d; Q.log.push({ pid: p.id, d, note: '🗳' }); any = true; }
    else if (m < 0 && Q.q.votePenalty) {
      let d = -Q.value, note = '🗳';
      if (p.badges.immune) { d = 0; note = 'бессмертие'; } else if (p.badges.shield) { d = 0; note = 'щит'; delete p.badges.shield; }
      p.score += d; Q.log.push({ pid: p.id, d, note });
    }
  });
  Q.voteDone = true; sfx(any ? 'good' : 'bad'); save(); render();
}
function voteBoardHTML() {
  return `<div class="vote-board">${S.players.map(p => {
    const v = Q.votes[p.id], m = Q.marks[p.id] || 0;
    return `<div class="vote-row" style="--c:${p.color}"><span class="nm">${esc(p.name)}</span><span class="vv">${v != null ? esc(v) : '<span class="muted">—</span>'}</span>
      <span class="mk ${m > 0 ? 'plus' : m < 0 ? 'minus' : ''}">${m > 0 ? '✓' : m < 0 ? '✗' : ''}</span>
      ${Q.voteDone ? '' : `<span class="ctl"><button class="btn sm ${m > 0 ? 'good' : 'ghost'}" data-act="vote-mark" data-id="${p.id}" data-v="1">✓</button><button class="btn sm ${m < 0 ? 'bad' : 'ghost'}" data-act="vote-mark" data-id="${p.id}" data-v="-1">✗</button></span>`}</div>`;
  }).join('')}</div>`;
}
/* показать вопрос; с настройкой «Отвечать сразу» кнопки открываются без разрешения ведущего */
function beginQuestion() {
  Q.view = 'question'; Q.phase = 'reading';
  if (!S.settings.autoArm || Q.type === 'closest') return;
  if (Q.only) { Q.answering = Q.only; Q.phase = 'answering'; Q.overtime = false; startTimer(S.settings.answerTime, 'answer'); }
  else { Q.phase = 'armed'; markArmed(); startTimer(S.settings.buzzTime, 'buzz'); }
}
function startTimer(sec, kind) { sec = Number(sec) || 0; Q.timer = sec > 0 ? { end: Date.now() + sec * 1000, total: sec * 1000, kind } : null; }
function reveal() {
  Q.timer = null; Q.answering = null; Q.view = 'answer';
  if (Q.type === 'vote') {   // если задан правильный вариант — отметки по голосам с телефонов ставим сами
    const c = String(Q.q.voteCorrect || '').trim().toLowerCase();
    if (c) S.players.forEach(p => { const v = Q.votes[p.id]; if (v != null && !Q.marks[p.id]) Q.marks[p.id] = v.trim().toLowerCase() === c ? 1 : -1; });
  }
  if (Q.q.answerMedia && Q.q.answerMedia.src) postMedia(Q.id + 'a', Q.q.answerMedia);
  render();
}
function metaHTML() {
  const tag = { cat: '🐱 кот в мешке', auction: '🔨 аукцион', closest: '🎯 ближе всех', vote: '🗳 голосование' }[Q.type];
  return `<div class="qmeta"><span>${esc(Q.theme)}</span><span class="v">${fmt(Q.value)}</span>${tag ? `<span class="tag">${tag}</span>` : ''}</div>`;
}
function mediaTag(m, play) {
  if (!m || !m.src) return '';
  const src = esc(m.src);
  if (m.kind === 'audio') return `<audio src="${src}" controls ${play ? 'autoplay' : ''}></audio>`;
  if (m.kind === 'video') return `<video src="${src}" controls playsinline ${play ? 'autoplay' : ''}></video>`;
  return `<img src="${src}" alt="">`;
}
const whoHTML = p => `<span class="who" style="--c:${p.color}">${esc(p.name)}</span>`;
const pickHTML = (list, act, onId, cls) => `<div class="pick ${cls || ''}">${list.map(p => `<button style="--c:${p.color}" class="${onId === p.id ? 'on' : ''}" data-act="${act}" data-id="${p.id}">${esc(p.name)} · ${fmt(p.score)}</button>`).join('')}</div>`;
function targetPrompt(m) {
  const a = fmt(m.amount);
  return { steal: `у кого забираем ${a}?`, give: `кому отдаёшь ${a}?`, signflip: 'кому меняем знак счёта?', swap: 'с кем меняешься счётом?' }[m.type] || 'выбери игрока';
}
function questionHTML() {
  const q = Q.q;
  switch (Q.view) {
    case 'grab':   // что внутри — не показываем никому, пока кто-то не схватит; надпись крутится
      return `<div class="center">${metaHTML()}
        <div class="mod-card mystery"><div class="mod-word">${[...'МОДИФИКАТОР'].map((c, i) => `<span style="animation-delay:${(i * 0.08).toFixed(2)}s">${c}</span>`).join('')}</div>
          <div class="d">Хорошее или плохое — узнаете, когда кто-нибудь рискнёт нажать</div></div>
        <div class="status" id="status"></div><div class="controls" id="controls"></div></div>`;
    case 'mod-target': {
      const m = modById(Q.modId), owner = player(Q.modOwner), def = MOD_TYPES[m.type];
      return `<div class="center"><div class="status">${whoHTML(owner)} забирает модификатор…</div>
        <div class="mod-card reveal"><div class="e">${esc(m.emoji)}</div><div class="n">${esc(m.name)}</div><div class="d">${esc(m.desc)}</div></div>
        <div class="status">${whoHTML(owner)}, ${targetPrompt(m)}</div>${pickHTML(S.players.filter(p => def.target === 'any' || p.id !== owner.id), 'mod-target')}</div>`;
    }
    case 'mod-result': {
      const m = modById(Q.modId), owner = player(Q.modOwner);
      return `<div class="center">${owner ? `<div class="status">${whoHTML(owner)} забирает модификатор…</div>` : ''}
        <div class="mod-card reveal"><div class="e">${esc(m.emoji)}</div><div class="n">${esc(m.name)}</div><div class="d" style="color:var(--text)">${esc(Q.modText)}</div></div>
        <div class="controls"><button class="btn" data-act="to-question">К вопросу →</button></div></div>`;
    }
    case 'cat-pick': {
      const ch = player(G.chooser);
      return `<div class="center"><div class="big-emoji">🐱</div><div class="big-sign">КОТ В МЕШКЕ</div>
        <div class="status">${ch ? whoHTML(ch) + ', кому отдаёшь вопрос?' : 'Кому отдаём вопрос?'}</div>${pickHTML(S.players.filter(p => !ch || p.id !== ch.id), 'cat-give')}</div>`;
    }
    case 'cat-reveal':
      return `<div class="center"><div class="big-emoji">🐱</div><div class="status">Кот достаётся: ${whoHTML(player(Q.only))}</div>
        <div class="big-sign" style="font-size:clamp(36px,5vw,80px)">${esc(Q.theme)}</div>
        <div class="qmeta"><span class="v">${fmt(Q.value)}</span></div>
        <div class="controls"><button class="btn" data-act="to-question">Вопрос →</button></div></div>`;
    case 'auction':
      return `<div class="center"><div class="big-emoji">🔨</div><div class="big-sign">АУКЦИОН</div>${metaHTML()}
        <div class="status muted" style="font-size:20px">Торгуйтесь! Минимум — ${fmt(Q.value)}, максимум — весь свой счёт</div>
        ${pickHTML(S.players, 'auc-pick', Q.auc.pid)}
        <div class="auction-form ctl"><input class="inp" id="auc-bid" type="number" step="100" value="${Q.auc.bid}">
        <button class="btn outline" data-act="auc-allin" ${Q.auc.pid ? '' : 'disabled'}>Ва-банк</button>
        <button class="btn" data-act="auc-sell" ${Q.auc.pid ? '' : 'disabled'}>Продано!</button></div></div>`;
    case 'question':
      return `<div class="center qscreen">${metaHTML()}
        ${Q.text ? `<div class="qtext ${isEmojiOnly(Q.text) ? 'emoji' : ''}">${esc(Q.text)}</div>` : ''}
        ${q.media && q.media.src ? `<div class="qmedia">${mediaTag(q.media, true)}</div>` : ''}
        ${Q.type === 'vote' ? `<div class="vote-opts">${voteOptions(q).map(o => `<span>${esc(o)}</span>`).join('')}</div>` : ''}
        <div class="timer" id="timer"><i></i></div>
        <div class="status" id="status"></div><div class="controls" id="controls"></div></div>`;
    case 'answer': {
      const log = Q.log.map(l => { const p = player(l.pid); return p ? `<span>${esc(p.name)} <b class="${l.d > 0 ? 'plus' : l.d < 0 ? 'minus' : ''}">${l.d > 0 ? '+' : ''}${fmt(l.d)}</b>${l.note ? ' · ' + esc(l.note) : ''}</span>` : ''; }).join('');
      return `<div class="center qscreen">${Q.text ? `<div class="qtext small">${esc(Q.text)}</div>` : ''}
        <div class="answer">${esc(q.answer || '—')}</div>
        ${q.answerMedia && q.answerMedia.src ? `<div class="qmedia">${mediaTag(q.answerMedia, true)}</div>` : ''}
        ${log ? `<div class="qlog">${log}</div>` : ''}
        ${Q.type === 'closest' ? `<div class="ctl"><div class="status muted" style="font-size:18px;margin-bottom:10px">Кто был ближе всех?</div>${pickHTML(S.players.filter(p => !Q.won.includes(p.id)), 'closest-win')}</div>` : ''}
        ${Q.type === 'vote' ? voteBoardHTML() + (Q.voteDone ? '' : '<div class="ctl"><button class="btn good" data-act="vote-apply">Начислить баллы</button></div>') : ''}
        <div class="controls"><button class="btn" data-act="close-q" title="Пробел">К табло →</button></div></div>`;
    }
  }
  return '';
}
function setDyn(id, html) { const el = $('#' + id); if (el && el.dataset.v !== html) { el.innerHTML = html; el.dataset.v = html; } }
function updateDynamic() {
  if (Q && Q.view === 'grab') {
    setDyn('status', Q.phase === 'grab' ? 'Кто рискнёт? Первый нажавший забирает!' : '<span class="muted">Приготовьтесь…</span>');
    setDyn('controls', '<button class="btn ghost" data-act="mod-skip">Никто — к вопросу</button>');
  } else if (Q && Q.view === 'question') {
    let s = '', c = '';
    if (Q.type === 'vote') {
      s = `Голосуем! <span class="muted">Проголосовали: ${Object.keys(Q.votes).length} из ${S.players.length}</span>`;
      c = '<button class="btn" data-act="reveal">Показать ответ</button>';
    } else if (Q.type === 'closest') {
      s = '<span class="muted">Отвечают все по очереди — баллы самому точному</span>';
      c = '<button class="btn" data-act="reveal">Показать ответ</button>';
    } else if (Q.phase === 'reading') {
      s = Q.only ? 'Отвечает ' + whoHTML(player(Q.only)) : '';
      c = `<button class="btn" data-act="arm" title="Пробел">${Q.only ? 'Старт' : 'Разрешить ответы'}</button><button class="btn ghost" data-act="reveal">Ответ</button>`;
    } else if (Q.phase === 'armed') {
      s = 'Жмите!';
      c = '<button class="btn ghost" data-act="reveal">Никто не знает → ответ</button>';
    } else if (Q.phase === 'answering') {
      const p = player(Q.answering);
      s = whoHTML(p) + (p.badges.double ? ' <span class="badge">×2</span>' : '') + (Q.overtime ? ' <span class="muted">· время вышло</span>' : '');
      c = '<button class="btn good" data-act="right" title="Enter">✓ Верно</button><button class="btn bad" data-act="wrong" title="Backspace">✗ Неверно</button>';
    }
    setDyn('status', s); setDyn('controls', c);
    const tm = $('#timer'); if (tm) tm.classList.toggle('on', !!Q.timer);
  } else if (!Q && G.phase === 'final' && F) updateFinalDyn();
}
function grabMod(pid, force) {
  if (!Q || Q.view !== 'grab') return;
  if (!force && (falseUntil[pid] || 0) > Date.now()) return;
  const m = modById(Q.modId);
  Q.modOwner = pid;
  sfx('mod');
  if (MOD_TYPES[m.type] && MOD_TYPES[m.type].target) Q.view = 'mod-target';
  else { Q.modText = applyMod(m, pid, null); Q.view = 'mod-result'; }
  save(); render();
}
function applyMod(m, pid, tid) {
  const p = player(pid), t = tid ? player(tid) : null, a = Number(m.amount) || 0;
  switch (m.type) {
    case 'add': p.score += a; return a >= 0 ? `${p.name} получает +${fmt(a)}` : `${p.name} теряет ${fmt(-a)}`;
    case 'steal': t.score -= a; p.score += a; return `${p.name} забирает ${fmt(a)} у игрока ${t.name}`;
    case 'give': p.score -= a; t.score += a; return `${p.name} отдаёт ${fmt(a)} игроку ${t.name}`;
    case 'tax': S.players.forEach(o => { if (o.id !== pid) o.score -= a; }); return `Все, кроме игрока ${p.name}, теряют по ${fmt(a)}`;
    case 'signflip': t.score = -t.score; return `Счёт игрока ${t.name} меняет знак: теперь ${fmt(t.score)}`;
    case 'swap': { const x = p.score; p.score = t.score; t.score = x; return `${p.name} и ${t.name} меняются счётом`; }
    case 'immune': p.badges.immune = true; return `У игрока ${p.name} бессмертие до конца раунда: ошибки не отнимают очки`;
    case 'double': p.badges.double = true; return `У игрока ${p.name} ×2 за верные ответы до конца раунда`;
    case 'shield': p.badges.shield = true; return `${p.name} получает щит: следующая ошибка бесплатна`;
    case 'chooser': Q.forceChooser = pid; return `Следующий вопрос выбирает ${p.name}`;
    case 'custom': return `${p.name}: ${m.desc}`;
  }
  return '';
}
/* ---------- честный «кто первый» ----------
   Телефоны сверяют часы с сервером и присылают точное время нажатия (at, по часам сервера).
   Первое нажатие открывает короткое окно: собираем все нажатия, пришедшие за это время,
   и отдаём ответ тому, кто нажал раньше, — а не тому, у кого интернет быстрее. */
const RACE_MS = 120;
const serverNow = () => Date.now() + (NET.off || 0);
const markArmed = () => { Q.armedAt = serverNow(); Q.race = null; };
function race(pid, at, onWin) {
  if (!Q.race) {
    const qid = Q.id, phase = Q.phase, wait = S.players.some(p => p.binding && p.binding.startsWith('phone:')) ? RACE_MS : 0;
    Q.race = { list: [], phase };
    setTimeout(() => {
      if (!Q || Q.id !== qid || !Q.race || Q.race.phase !== phase) return;
      const list = Q.race.list.sort((a, b) => a.at - b.at); Q.race = null;
      if (Q.phase === phase && list.length) onWin(list);
    }, wait);
  }
  if (!Q.race.list.some(x => x.pid === pid)) Q.race.list.push({ pid, at });
}
function buzz(pid, at) {
  if (S.screen === 'setup') { flashRow(pid); return; }
  if (S.screen !== 'game' || !G) return;
  if (!Q) { ping(pid); return; }
  if (at == null) at = serverNow();
  const early = Q.armedAt != null && at < Q.armedAt - 40;   // нажал до разрешения, просто сообщение пришло позже
  if (Q.view === 'grab') {
    if (Q.phase !== 'grab' || early) { if (S.settings.falseStart) falseStart(pid); return; }
    if ((falseUntil[pid] || 0) > Date.now()) return;
    race(pid, Math.max(at, Q.armedAt || 0), list => grabMod(list[0].pid));
    return;
  }
  if (Q.view !== 'question' || Q.only || Q.type === 'closest' || Q.type === 'vote') return;
  if (Q.phase === 'reading') { if (S.settings.falseStart && !Q.tried.includes(pid)) falseStart(pid); return; }
  if (Q.phase === 'armed') {
    if (Q.tried.includes(pid) || (falseUntil[pid] || 0) > Date.now()) return;
    if (early) { if (S.settings.falseStart) falseStart(pid); return; }
    race(pid, Math.max(at, Q.armedAt || 0), list => {
      const win = list.find(x => !Q.tried.includes(x.pid));
      if (!win) return;
      Q.answering = win.pid; Q.phase = 'answering'; Q.overtime = false;
      sfx('buzz'); startTimer(S.settings.answerTime, 'answer'); render();
    });
  }
}
function falseStart(pid) {
  if ((falseUntil[pid] || 0) > Date.now()) return;
  falseUntil[pid] = Date.now() + 1000;
  sfx('fstart'); renderPlayers();
  setTimeout(renderPlayers, 1050);
}
function answerRight() {
  const p = player(Q.answering); if (!p) return;
  const mult = p.badges.double ? 2 : 1, d = Q.value * mult;
  p.score += d; Q.log.push({ pid: p.id, d, note: mult > 1 ? '×2' : '' });
  G.chooser = p.id; sfx('good'); save(); reveal();
}
function answerWrong() {
  const p = player(Q.answering); if (!p) return;
  let d = -Q.value, note = '';
  if (p.badges.immune) { d = 0; note = 'бессмертие'; }
  else if (p.badges.shield) { d = 0; note = 'щит'; delete p.badges.shield; }
  p.score += d; Q.log.push({ pid: p.id, d, note });
  Q.tried.push(p.id); Q.answering = null; Q.overtime = false; Q.timer = null;
  sfx('bad'); save();
  if (Q.only || S.players.every(o => Q.tried.includes(o.id))) return reveal();
  Q.phase = 'armed'; markArmed(); startTimer(S.settings.buzzTime, 'buzz'); render();
}
function closestWin(pid) {
  if (!Q || Q.type !== 'closest' || Q.view !== 'answer' || Q.won.includes(pid)) return;
  const p = player(pid), d = Q.value * (p.badges.double ? 2 : 1);
  p.score += d; Q.won.push(pid); Q.log.push({ pid, d, note: '🎯' });
  G.chooser = pid; sfx('good'); save(); render();
}
function closeQuestion() {
  if (!Q) return;
  if (Q.type === 'vote' && !Q.voteDone && Object.values(Q.marks).some(Boolean)) applyVotes();   // забыли нажать «Начислить» — начисляем сами
  G.used[Q.k] = true;
  if (Q.forceChooser) G.chooser = Q.forceChooser;
  Q = null;
  if (roundDone()) { G.phase = 'roundEnd'; sfx('fanfare'); }
  save(); render();
}
function nextRound() {
  if (G.round >= S.pack.rounds.length - 1) startFinal();
  else { G.round++; setupRound(); }
  save(); render();
}

/* ---------- финал ---------- */
const clampBet = (p, v) => Math.max(1, Math.min(Math.max(1, p.score), Math.round(Number(v) || 0)));
function setBet(p, v, phone) {
  if (v === '' || v == null) delete F.bets[p.id]; else F.bets[p.id] = clampBet(p, v);
  if (phone) F.phoneBet[p.id] = true; else delete F.phoneBet[p.id];
  const inp = $(`[data-bet="${p.id}"]`); if (inp && document.activeElement !== inp) inp.value = F.bets[p.id] != null ? F.bets[p.id] : '';
}
function startFinal() {
  Q = null;
  const fin = (S.pack.final && S.pack.final.themes) || [];
  const parts = S.players.filter(p => p.score > 0).sort((a, b) => a.score - b.score).map(p => p.id);
  if (!fin.length || !parts.length) { G.phase = 'results'; F = null; return; }
  G.phase = 'final';
  F = { phase: fin.length > 1 ? 'remove' : 'bet', removed: [], parts, turn: 0, bets: {}, phoneBet: {}, answers: {}, judged: {}, theme: fin.length > 1 ? null : 0, timer: null, started: false, timeUp: false, showAnswer: false };
}
function finalTheme() { return S.pack.final.themes[F.theme]; }
function finalHTML() {
  const fin = S.pack.final.themes;
  if (F.phase === 'remove') {
    const cur = player(F.parts[F.turn % F.parts.length]);
    const out = S.players.filter(p => !F.parts.includes(p.id)), left = fin.length - F.removed.length;
    const phones = F.parts.some(pid => { const p = player(pid); return p && p.binding && p.binding.startsWith('phone:'); });
    return `<div class="center"><div class="kicker">Финал · осталось ${left} из ${fin.length}</div><div class="big-sign" style="font-size:clamp(30px,4.4vw,62px)">Убираем темы</div>
      <div class="status">${whoHTML(cur)}, какую тему убираешь?${phones ? ' <span class="muted" style="font-size:.6em">— можно прямо с телефона</span>' : ''}</div>
      <div class="final-themes ${fin.length > 6 ? 'grid' : ''}">${fin.map((t, i) => { const gone = F.removed.includes(i); return `<button class="${gone ? 'gone' : ''} ${F.lastGone === i ? 'just-gone' : ''}" data-act="f-remove" data-i="${i}" ${gone ? 'disabled' : ''}>${esc(t.name)}</button>`; }).join('')}</div>
      <div class="hint">Первым убирает тот, у кого меньше очков, дальше по очереди. Последняя оставшаяся тема — финальная.${out.length ? ' Не прошли в финал (счёт не больше нуля): ' + out.map(p => esc(p.name)).join(', ') : ''}</div></div>`;
  }
  const t = finalTheme();
  if (F.phase === 'bet') {
    return `<div class="center"><div class="kicker">Финал · тема</div><div class="big-sign" style="font-size:clamp(34px,5vw,80px)">${esc(t.name)}</div>
      <div class="status muted" style="font-size:20px">Делайте ставки — от 1 до своего счёта</div>
      <div class="bets">${F.parts.map(pid => { const p = player(pid); return `<div class="bet" style="--c:${p.color}"><div class="nm"><span>${esc(p.name)}</span><span class="muted">${fmt(p.score)}</span></div>
        <input class="inp ctl" type="password" inputmode="numeric" autocomplete="off" placeholder="Ставка" data-bet="${pid}" value="${F.bets[pid] != null ? F.bets[pid] : ''}"><div class="hint" data-betflag="${pid}"></div></div>`; }).join('')}</div>
      <button class="btn ctl" data-act="f-go" id="f-go">Показать вопрос →</button></div>`;
  }
  if (F.phase === 'question') {
    return `<div class="center qscreen"><div class="qmeta"><span>Финал · ${esc(t.name)}</span></div>
      <div class="qtext ${isEmojiOnly(t.text) ? 'emoji' : ''}">${esc(t.text)}</div>${t.media && t.media.src ? `<div class="qmedia">${mediaTag(t.media, true)}</div>` : ''}
      <div class="timer" id="timer"><i></i></div>
      <div class="status" id="status"></div><div class="controls" id="controls"></div></div>`;
  }
  const all = F.parts.every(pid => F.judged[pid]);
  return `<div class="center qscreen"><div class="qtext small">${esc(t.text)}</div>
    ${F.showAnswer ? `<div class="answer">${esc(t.answer || '—')}</div>${t.answerMedia && t.answerMedia.src ? `<div class="qmedia">${mediaTag(t.answerMedia, true)}</div>` : ''}` : '<button class="btn outline ctl" data-act="f-show">Показать правильный ответ</button>'}
    <div class="bets">${F.parts.map(pid => { const p = player(pid), j = F.judged[pid], b = F.bets[pid] || 0; return `<div class="bet ${j ? 'done' : ''}" style="--c:${p.color}">
      <div class="nm"><span>${esc(p.name)}</span><span class="muted">ставка ${fmt(b)}</span></div>
      <div class="ans">${F.answers[pid] ? '📱 ' + esc(F.answers[pid]) : '<span class="muted">ответ вслух</span>'}</div>
      ${j ? `<div class="status" style="font-size:24px;color:${j > 0 ? 'var(--good)' : 'var(--bad)'}">${j > 0 ? '+' : '−'}${fmt(b)}</div>` : `<div class="row ctl"><button class="btn good" data-act="f-judge" data-id="${pid}" data-v="1">✓</button><button class="btn bad" data-act="f-judge" data-id="${pid}" data-v="-1">✗</button></div>`}</div>`; }).join('')}</div>
    ${all ? '<button class="btn ctl" data-act="f-results">Итоги игры →</button>' : ''}</div>`;
}
function updateFinalDyn() {
  if (F.phase === 'bet') {
    F.parts.forEach(pid => { const el = $(`[data-betflag="${pid}"]`); if (el) el.textContent = F.phoneBet[pid] ? '📱 ставка принята' : F.bets[pid] ? '✓ ставка есть' : '…'; });
    const n = F.parts.filter(pid => F.bets[pid]).length, go = $('#f-go');
    if (go) go.textContent = `Показать вопрос → (ставки ${n}/${F.parts.length})`;
  } else if (F.phase === 'question') {
    const n = Object.keys(F.answers).length;
    setDyn('status', (F.timer || (F.started && !F.timeUp) ? 'Пишите ответы!' : F.timeUp ? 'Время вышло!' : '') + (n ? ` <span class="muted">· 📱 ответов: ${n}</span>` : ''));
    setDyn('controls', (!F.started ? '<button class="btn" data-act="f-start" title="Пробел">Старт</button>' : '') + '<button class="btn ghost" data-act="f-check">Проверить ответы →</button>');
    const tm = $('#timer'); if (tm) tm.classList.toggle('on', !!F.timer);
  }
}

/* ---------- таймер ---------- */
setInterval(() => {
  const T = (Q && Q.timer) || (F && F.timer);
  if (!T) return;
  const left = T.end - Date.now(), bar = $('#timer');
  if (bar) { bar.querySelector('i').style.transform = `scaleX(${Math.max(0, left / T.total)})`; bar.classList.toggle('warn', left < 3000); }
  const sec = Math.ceil(left / 1000);
  if (sec !== T.lastSec) { T.lastSec = sec; if (sec <= 3 && sec > 0) sfx('tick'); }
  if (left > 0) return;
  sfx('end');
  if (Q && Q.timer === T) {
    Q.timer = null;
    if (T.kind === 'buzz') reveal(); else { Q.overtime = true; render(); }
  } else if (F && F.timer === T) { F.timer = null; F.timeUp = true; render(); }
}, 100);

function confetti() {
  const c = document.createElement('div'); c.className = 'confetti';
  for (let i = 0; i < 140; i++) {
    const b = document.createElement('i');
    b.style.left = Math.random() * 100 + '%'; b.style.background = pick(PCOLORS.concat(S.settings.accent));
    b.style.animationDuration = 2.5 + Math.random() * 3 + 's'; b.style.animationDelay = Math.random() * 1.5 + 's';
    c.append(b);
  }
  document.body.append(c); sfx('fanfare');
  setTimeout(() => c.remove(), 8000);
}

/* ---------- модалки ---------- */
function modal(html, cls) { closeModal(); const m = document.createElement('div'); m.className = 'modal-bg'; m.innerHTML = `<div class="modal ${cls || ''}">${html}</div>`; m.addEventListener('mousedown', e => { if (e.target === m) closeModal(); }); document.body.append(m); return m; }
function closeModal() { const m = $('.modal-bg'); if (m) m.remove(); }
function menuModal() {
  const inRounds = G.phase !== 'final' && G.phase !== 'results';
  modal(`<h3>Меню</h3><div class="menu-list">
    <button class="btn ghost" data-act="fullscreen">⛶ Полный экран</button>
    <button class="btn ghost" data-act="editor">✎ Редактор вопросов</button>
    <button class="btn ghost" data-act="to-setup">👥 Игроки, ведущий и оформление</button>
    ${inRounds ? '<button class="btn ghost" data-act="skip-round">⏭ Закончить раунд</button><button class="btn ghost" data-act="go-final">🏁 Сразу в финал</button>' : ''}
    <button class="btn ghost" data-act="end-game">🏆 Завершить и показать итоги</button>
  </div><p class="hint">Клик по карточке игрока — поправить счёт, выдать модификатор или сделать выбирающим.</p>`);
}
function playerModal(pid) {
  const p = player(pid), step = (G ? G.round + 1 : 1) * 100;
  modal(`<h3 style="color:${p.color}">${esc(p.name)}</h3>
    <label class="lbl" style="margin-top:0">Счёт</label>
    <div class="row"><button class="btn outline" data-act="pm-add" data-id="${pid}" data-v="${-step}">−${step}</button>
      <input class="inp" type="number" id="pm-score" data-pscore="${pid}" value="${p.score}" style="text-align:center;font-family:var(--display);font-size:20px">
      <button class="btn outline" data-act="pm-add" data-id="${pid}" data-v="${step}">+${step}</button></div>
    <label class="lbl">Модификаторы</label>
    <div class="row wrap">${Object.keys(BADGES).map(b => `<label class="check" style="margin:0 12px 0 0"><input type="checkbox" data-pbadge="${b}" data-id="${pid}" ${p.badges[b] ? 'checked' : ''}> ${BADGES[b][0]} ${BADGES[b][1]}</label>`).join('')}</div>
    <div class="row" style="margin-top:20px">${G && G.phase === 'board' ? `<button class="btn outline" data-act="pm-chooser" data-id="${pid}">Сделать выбирающим</button>` : ''}<div class="grow"></div><button class="btn" data-act="modal-close">Готово</button></div>`);
}

/* ---------- горячие клавиши ведущего ---------- */
function hostKey(e) {
  if (e.code === 'Escape') { closeModal(); return; }
  if ($('.modal-bg') || S.screen !== 'game' || !G) return;
  const space = e.code === 'Space', enter = e.code === 'Enter' || e.code === 'NumpadEnter', back = e.code === 'Backspace';
  if (!space && !enter && !back) return;
  e.preventDefault();
  if (Q) {
    if (Q.view === 'question') {
      if (space && Q.type === 'closest') act('reveal');
      else if (space && Q.phase === 'reading') act('arm');
      else if (Q.phase === 'answering') { if (enter) act('right'); if (back) act('wrong'); }
    } else if (space && (Q.view === 'mod-result' || Q.view === 'cat-reveal')) act('to-question');
    else if (space && Q.view === 'answer') act('close-q');
    return;
  }
  if (!space) return;
  if (G.phase === 'intro') act('intro-go');
  else if (G.phase === 'roundEnd') act('next-round');
  else if (G.phase === 'final' && F && F.phase === 'question' && !F.started) act('f-start');
}

/* =================== действия =================== */
document.addEventListener('click', e => {
  if (E.suppressClick) { E.suppressClick = false; return; }   // это был конец перетаскивания, а не клик
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  if (el.tagName === 'BUTTON') { el.blur(); if (el.closest('summary')) e.preventDefault(); }
  act(el.dataset.act, el.dataset);
});
function act(a, d = {}) {
  const p = d.id ? player(d.id) : null;
  const inQ = (...views) => Q && views.includes(Q.view);
  switch (a) {
    /* общее */
    case 'fullscreen': closeModal(); if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => { }); break;
    case 'modal-close': closeModal(); break;
    case 'editor': closeModal(); E.back = S.screen; Q = null; S.screen = 'editor'; render(); break;
    /* настройка */
    case 'color': { const used = S.players.map(o => o.color); const i = PCOLORS.indexOf(p.color); let n = PCOLORS[(i + 1) % 8]; for (let k = 1; k <= 8; k++) { const c = PCOLORS[(i + k) % 8]; if (!used.includes(c)) { n = c; break; } } p.color = n; save(); render(); break; }
    case 'bind': capture = capture && capture.pid === d.id ? null : { pid: d.id }; render(); break;
    case 'unbind': p.binding = null; save(); render(); break;
    case 'delp': S.players = S.players.filter(o => o.id !== d.id); save(); render(); break;
    case 'addp': if (S.players.length < 8) { const np = makePlayer(S.players.length); const used = S.players.map(o => o.color); np.color = PCOLORS.find(c => !used.includes(c)) || np.color; S.players.push(np); save(); render(); } break;
    case 'theme': S.settings.theme = d.v; saveSettings(); render(); break;
    case 'accent': S.settings.accent = d.v; saveSettings(); render(); break;
    case 'newpin': S.settings.hostPin = String(1000 + Math.floor(Math.random() * 9000)); saveSettings(); render(); pushState(true); break;
    case 'autophones':
      for (const [id, ph] of phones) {
        const dev = 'phone:' + id;
        if (S.players.some(o => o.binding === dev)) continue;
        let slot = S.players.find(o => !o.binding);
        if (!slot && S.players.length < 8) { slot = makePlayer(S.players.length); const used = S.players.map(o => o.color); slot.color = PCOLORS.find(c => !used.includes(c)) || slot.color; S.players.push(slot); }
        if (!slot) break;
        slot.binding = dev; slot.name = ph.name;
      }
      save(); render(); break;
    case 'start': if (LS.get('svoyak-save', null) && !confirm('Начать новую игру? Сохранённая игра будет сброшена.')) break; capture = null; startGame(); break;
    case 'continue': {
      const sv = LS.get('svoyak-save', null); if (!sv) break;
      (async () => {   // сохранённая партия могла идти в другой игре — открываем её
        if (sv.G.packId && sv.G.packId !== S.packId && GAMES.list.some(g => g.id === sv.G.packId)) await loadPack(sv.G.packId);
        G = sv.G; F = sv.F; Q = null; capture = null; if (!S.pack.rounds[G.round]) G.round = 0; S.screen = 'game'; render();
      })();
      break;
    }
    /* игра */
    case 'menu': menuModal(); break;
    case 'to-setup': closeModal(); Q = null; save(); S.screen = 'setup'; render(); break;
    case 'skip-round': if (!G) break; closeModal(); Q = null; G.phase = 'roundEnd'; save(); render(); break;
    case 'go-final': if (!G) break; closeModal(); startFinal(); save(); render(); break;
    case 'end-game': if (!G) break; closeModal(); Q = null; F = null; G.phase = 'results'; save(); render(); break;
    case 'new-game': LS.del('svoyak-save'); G = null; F = null; Q = null; S.screen = 'setup'; render(); break;
    case 'intro-go': if (G && G.phase === 'intro') { G.phase = roundDone() ? 'roundEnd' : 'board'; save(); render(); } break;
    case 'next-round': if (G && G.phase === 'roundEnd') nextRound(); break;
    case 'open': openCell(d.k); break;
    case 'pcard':
      if (!p) break;
      if (inQ('question') && Q.phase === 'armed' && !Q.only && Q.type !== 'closest' && !Q.tried.includes(d.id)) { falseUntil[d.id] = 0; buzz(d.id); }
      else if (inQ('grab')) grabMod(d.id, true);
      else if (inQ('answer') && Q.type === 'closest') closestWin(d.id);
      else if (!d.remote) playerModal(d.id);
      break;
    case 'grab-give': if (p) grabMod(d.id, true); break;
    case 'closest-win': closestWin(d.id); break;
    case 'vote-mark': if (inQ('answer') && Q.type === 'vote' && !Q.voteDone && p) { const v = +d.v; Q.marks[d.id] = Q.marks[d.id] === v ? 0 : v; render(); } break;
    case 'vote-apply': if (inQ('answer')) applyVotes(); break;
    case 'arm':
      if (!inQ('question') || Q.phase !== 'reading') break;
      if (Q.only) { Q.answering = Q.only; Q.phase = 'answering'; Q.overtime = false; startTimer(S.settings.answerTime, 'answer'); }
      else { Q.phase = 'armed'; markArmed(); startTimer(S.settings.buzzTime, 'buzz'); tone(600, .08, 'sine', .08); }
      render(); break;
    case 'reveal': if (inQ('question')) reveal(); break;
    case 'right': if (inQ('question') && Q.phase === 'answering') answerRight(); break;
    case 'wrong': if (inQ('question') && Q.phase === 'answering') answerWrong(); break;
    case 'close-q': if (inQ('answer')) closeQuestion(); break;
    case 'to-question':
      if (inQ('mod-result')) startMain();
      else if (inQ('cat-reveal')) beginQuestion();
      render(); break;
    case 'mod-skip': if (inQ('grab')) { startMain(); render(); } break;
    case 'mod-target': if (inQ('mod-target') && p) { Q.modText = applyMod(modById(Q.modId), Q.modOwner, d.id); Q.view = 'mod-result'; sfx('good'); save(); render(); } break;
    case 'cat-give': {
      if (!inQ('cat-pick') || !p) break;
      const c = Q.q.cat || {};
      Q.only = d.id;
      if (c.theme) { Q.theme = c.theme; Q.desc = ''; }
      if (Number(c.value)) Q.value = Number(c.value);
      Q.view = 'cat-reveal'; sfx('open'); render(); break;
    }
    case 'auc-pick': if (inQ('auction')) { Q.auc.pid = d.id; rerenderStage(); } break;
    case 'auc-bid': if (inQ('auction')) { Q.auc.bid = Math.max(0, Math.round(Number(d.v) || 0)); rerenderStage(); } break;
    case 'auc-allin': if (inQ('auction') && Q.auc.pid) { const w = player(Q.auc.pid); Q.auc.bid = Math.max(Q.value, w.score); rerenderStage(); } break;
    case 'auc-sell': {
      if (!inQ('auction') || !Q.auc.pid) break;
      const inp = $('#auc-bid'); const bid = Math.max(1, Math.round(Number(d.remote ? Q.auc.bid : inp ? inp.value : Q.auc.bid) || Q.value));
      Q.only = Q.auc.pid; Q.value = bid; beginQuestion(); sfx('good'); render(); break;
    }
    /* финал */
    case 'f-remove': {
      if (!F || F.phase !== 'remove' || F.theme != null || F.removed.includes(+d.i)) break;
      const fin = S.pack.final.themes;
      F.removed.push(+d.i); F.lastGone = +d.i; F.turn++; sfx('bad');
      const left = fin.map((_, i) => i).filter(i => !F.removed.includes(i));
      if (left.length === 1) {   // осталась одна — даём полсекунды полюбоваться и переходим к ставкам
        F.theme = left[0]; save(); render();
        setTimeout(() => { if (F && F.phase === 'remove') { F.phase = 'bet'; sfx('fanfare'); save(); render(); } }, 900);
        break;
      }
      save(); render(); break;
    }
    case 'f-bet': if (F && F.phase === 'bet' && p) { setBet(p, d.v, false); render(); } break;
    case 'f-go': {
      if (!F || F.phase !== 'bet') break;
      const miss = F.parts.filter(pid => !F.bets[pid]);
      if (miss.length && !d.force && !confirm(`Нет ставки у: ${miss.map(id => player(id).name).join(', ')}. Продолжить? Они сыграют на 1 очко.`)) break;
      miss.forEach(pid => { F.bets[pid] = 1; });
      F.phase = 'question'; postMedia('final-' + F.theme, finalTheme().media); save(); render(); break;
    }
    case 'f-start': if (F && F.phase === 'question' && !F.started) { F.started = true; const s = Number(S.settings.finalTime) || 0; F.timer = s ? { end: Date.now() + s * 1000, total: s * 1000, kind: 'final' } : null; render(); } break;
    case 'f-check': if (F && F.phase === 'question') { F.timer = null; F.phase = 'reveal'; save(); render(); } break;
    case 'f-show': if (F) { F.showAnswer = true; sfx('open'); render(); } break;
    case 'f-judge': if (F && F.phase === 'reveal' && p && !F.judged[d.id]) { F.judged[d.id] = +d.v; p.score += (+d.v) * (F.bets[d.id] || 0); sfx(+d.v > 0 ? 'good' : 'bad'); save(); render(); } break;
    case 'f-results': if (F) { G.phase = 'results'; save(); render(); } break;
    /* счёт */
    case 'pm-add': if (p) { p.score += +d.v; const i = $('#pm-score'); if (i) i.value = p.score; save(); renderPlayers(); pushState(); } break;
    case 'pm-chooser': if (G) { G.chooser = d.id; closeModal(); save(); render(); } break;
    default: if (a.startsWith('ed-')) edAct(a, d);
  }
}
document.addEventListener('input', e => {
  const el = e.target, ds = el.dataset;
  if (ds.pname) { const p = player(ds.pname); if (p) { p.name = el.value; save(); pushState(); } return; }
  if (ds.set) {
    const k = ds.set;
    S.settings[k] = el.type === 'checkbox' ? el.checked : (el.tagName === 'SELECT' || el.type === 'number') ? Number(el.value) || 0 : el.value;
    saveSettings(); applyTheme(); pushState(true); return;
  }
  if (ds.pscore) { const p = player(ds.pscore); p.score = Number(el.value) || 0; save(); renderPlayers(); pushState(); return; }
  if (ds.pbadge) { const p = player(ds.id); if (el.checked) p.badges[ds.pbadge] = true; else delete p.badges[ds.pbadge]; save(); renderPlayers(); return; }
  if (ds.bet && F) { setBet(player(ds.bet), el.value, false); updateFinalDyn(); pushState(); return; }
  if (el.id === 'auc-bid' && Q && Q.auc) { Q.auc.bid = Number(el.value) || 0; pushState(); return; }
  if (el.id === 'reg-q') { filterReg(el.value); return; }
  if (el.id === 'bank-q') { const v = el.value.trim().toLowerCase(); $$('.bank-t').forEach(t => { const hit = !v || t.dataset.search.includes(v); t.hidden = !hit; if (v && hit) t.open = true; }); return; }
  if (ds.path !== undefined && S.screen === 'editor') edInput(el);
});
document.addEventListener('change', e => {
  const el = e.target, ds = el.dataset;
  if (ds.set === 'accent' || ds.set === 'hostRemote') { render(); return; }
  if (el.id === 'reg-import' && el.files && el.files[0]) { regImport(el.files[0]); return; }
  if (el.id === 'game-select') { loadPack(el.value).then(() => { renderSetup(); toast(`Играем в «${S.pack.name}»`); }); return; }
  if (S.screen !== 'editor') return;
  if (ds.media && el.files && el.files[0]) loadMediaFile(ds.media, el.files[0]);
  else if (ds.mediaurl !== undefined && el.value.trim()) { setPath(S.pack, ds.mediaurl, { kind: kindByName(el.value), src: el.value.trim(), name: el.value.trim() }); savePack(); renderEditor(); }
  else if (el.id === 'ed-import' && el.files[0]) importPack(el.files[0]);
  else if (ds.rerender !== undefined) renderEditor();
});

/* =================== редактор =================== */
const E = { tab: 'pack', sel: null, back: 'setup', drag: null };
const blankQ = () => ({ type: 'normal', text: '', answer: '', media: null, answerMedia: null, modifier: '', value: 0 });
/* ---------- несколько игр: каждая — свой пакет (раунды, финал, модификаторы, запас) ---------- */
const GAMES = { list: [] };   // [{ id, name, updated }] — порядок как в списке
let saveT;
async function persistPack() {
  if (!S.packId) return false;
  const ok = await DB.set('pack:' + S.packId, S.pack);
  const g = GAMES.list.find(x => x.id === S.packId);
  if (g) { g.name = S.pack.name; g.updated = Date.now(); } else GAMES.list.push({ id: S.packId, name: S.pack.name, updated: Date.now() });
  await DB.set('packs-index', GAMES.list);
  return ok;
}
function savePack() {
  S.pack.builtin = false;
  const el = $('#ed-save'); if (el) el.textContent = 'Сохраняю…';
  clearTimeout(saveT);
  saveT = setTimeout(async () => { const ok = await persistPack(); const el2 = $('#ed-save'); if (el2) el2.textContent = ok ? '✓ Сохранено' : '⚠ Не удалось сохранить'; }, 400);
}
async function flushPack() { if (saveT) { clearTimeout(saveT); saveT = null; await persistPack(); } }
async function loadPack(id, noFlush) {
  if (!noFlush) await flushPack();
  const p = await DB.get('pack:' + id);
  if (!p) return false;
  S.pack = normalizePack(p); S.packId = id; LS.set('svoyak-current-pack', id);
  return true;
}
async function newGame(fromPack) {
  await flushPack();
  const id = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const base = fromPack || { name: 'Игра ' + (GAMES.list.length + 1), rounds: [1, 2, 3, 4].map(n => ({ name: 'Раунд ' + n, randomMods: 2, themes: [] })), final: { themes: clone(window.FINAL_HARD) }, modifiers: clone(window.DEFAULT_PACK.modifiers), bank: [] };
  S.pack = normalizePack(base); S.pack.builtin = false; S.packId = id;
  LS.set('svoyak-current-pack', id);
  await persistPack();
  E.tab = 'r0'; E.sel = null; renderEditor(); sfx('mod');
  toast(`Создана «${S.pack.name}». Прошлая игра сохранена — она в списке игр под «+»`);
}
async function gamesAct(a, d) {
  if (a === 'ed-newgame') return newGame();
  if (a === 'ed-opengame') {
    if (!d.game || d.game === S.packId) return;
    await loadPack(d.game); E.sel = null; E.tab = 'r0'; renderEditor();
    return toast(`Открыта игра «${S.pack.name}»`);
  }
  if (a === 'ed-delgame') {
    const g = GAMES.list.find(x => x.id === d.game);
    if (!g || GAMES.list.length <= 1) return;
    if (!confirm(`Удалить игру «${g.name}»? Её раунды и вопросы пропадут (реестр не тронется).`)) return;
    GAMES.list = GAMES.list.filter(x => x.id !== d.game);
    await DB.set('packs-index', GAMES.list); await DB.del('pack:' + d.game);
    if (d.game === S.packId) { saveT = null; await loadPack(GAMES.list[0].id, true); E.tab = 'r0'; E.sel = null; }
    renderEditor(); toast(`Игра «${g.name}» удалена`);
  }
}
function gamesWidget(inline) {
  return `<div class="games ${inline ? 'inline' : ''}">
    <button class="games-plus" data-act="ed-newgame" title="Новая игра (текущая сохранится)">+</button>
    <div class="games-pop"><div class="games-menu">
      <div class="games-head">Игры <span class="muted">${GAMES.list.length}</span></div>
      ${GAMES.list.map(g => `<div class="game-item ${g.id === S.packId ? 'on' : ''}" data-act="ed-opengame" data-game="${g.id}"><span class="gname">🎮 ${esc(g.name)}</span>${g.id === S.packId ? '<span class="gmeta">открыта</span>' : ''}${GAMES.list.length > 1 ? `<button class="icon gdel" data-act="ed-delgame" data-game="${g.id}" title="Удалить игру">🗑</button>` : ''}</div>`).join('')}
      <button class="btn sm" data-act="ed-newgame" style="width:100%;margin-top:6px">+ Новая игра</button>
      <p class="hint" style="margin:8px 4px 2px;font-size:12px">Перетащи раунд, тему или вопрос на игру в этом списке и подержи секунду — она откроется, и туда можно будет вставить. В другую игру переносится копия.</p>
    </div></div></div>`;
}
function normTheme(t) {
  t.name = t.name || ''; t.desc = t.desc || '';
  t.questions = (Array.isArray(t.questions) ? t.questions : []).map((q, i) => Object.assign(blankQ(), { diff: i + 1 }, q));
  return t;
}
function normalizePack(p) {
  p = p || {};
  p.name = p.name || 'Мой пакет';
  p.rounds = Array.isArray(p.rounds) ? p.rounds : [];
  p.rounds.forEach((r, i) => { r.name = r.name || 'Раунд ' + (i + 1); r.randomMods = Number(r.randomMods) || 0; r.themes = (Array.isArray(r.themes) ? r.themes : []).map(normTheme); });
  if (!p.rounds.length) p.rounds.push({ name: 'Раунд 1', randomMods: 0, themes: [] });
  p.final = p.final && Array.isArray(p.final.themes) ? p.final : { themes: [] };
  p.modifiers = Array.isArray(p.modifiers) ? p.modifiers : [];
  p.modifiers.forEach(m => { m.id = m.id || uid(); if (!MOD_TYPES[m.type]) m.type = 'add'; });
  p.bank = (Array.isArray(p.bank) ? p.bank : []).map(normTheme);
  return p;
}
function kindByName(n) { n = n.toLowerCase().split('?')[0]; if (/\.(mp3|wav|ogg|m4a|aac|flac)$/.test(n)) return 'audio'; if (/\.(mp4|webm|mov|m4v|ogv)$/.test(n)) return 'video'; return 'image'; }
function loadMediaFile(path, file) {
  if (file.size > 40 * 1024 * 1024 && !confirm('Файл больше 40 МБ — пакет станет тяжёлым. Всё равно добавить?')) return;
  const kind = file.type.startsWith('audio') ? 'audio' : file.type.startsWith('video') ? 'video' : 'image';
  const r = new FileReader();
  r.onload = () => { setPath(S.pack, path, { kind, src: r.result, name: file.name }); savePack(); renderEditor(); };
  r.readAsDataURL(file);
}
function importPack(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const p = JSON.parse(r.result);
      if (!p || !Array.isArray(p.rounds)) throw new Error('нет раундов');
      newGame(p);   // импортированный пакет становится новой игрой, текущая не трогается
    } catch (err) { alert('Не получилось прочитать пакет: ' + err.message); }
  };
  r.readAsText(file);
}
function download(text, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name.replace(/[\\/:*?"<>|]+/g, '_');
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportPack() { download(JSON.stringify(S.pack), (S.pack.name || 'pack') + '.svoyak.json'); }
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.append(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2800);
}

/* =================== реестр тем и вопросов =================== */
// Общий для всех устройств: хранится на сервере сайта (а без сервера — в этом браузере).
const REG = { data: null, storage: '', persistent: false, tab: 'themes', loading: null };
const cleanQ = (q, i) => { const c = clone(q); c.value = 0; c.modifier = ''; if (i != null) c.diff = i + 1; delete c.id; delete c.saved; delete c.theme; return c; };
const cleanTheme = t => ({ name: t.name.trim(), desc: t.desc || '', questions: t.questions.map((q, i) => cleanQ(q, i)) });
const seedThemes = () => (window.QUESTION_BANK || []).map(([name, desc, qs, kind]) => ({ name, desc: desc || '', questions: qs.map(([text, answer], i) => ({ type: kind === 'closest' ? 'closest' : 'normal', text, answer, media: null, answerMedia: null, modifier: '', value: 0, diff: i + 1 })) }));
function regApplyLocal(reg, b) {   // то же, что regApply на сервере — для игры без сервера
  const now = Date.now(), same = (a, c) => String(a || '').trim().toLowerCase() === String(c || '').trim().toLowerCase();
  switch (b.op) {
    case 'seed': if (!reg.seeded) { b.themes.forEach(t => reg.themes.push(Object.assign({}, t, { id: uid(), saved: now }))); reg.seeded = true; } return 'ok';
    case 'addTheme': {
      const i = reg.themes.findIndex(x => same(x.name, b.theme.name));
      if (i >= 0 && !b.replace) return 'exists';
      const item = Object.assign({}, b.theme, { id: i >= 0 ? reg.themes[i].id : uid(), saved: now });
      if (i >= 0) reg.themes[i] = item; else reg.themes.unshift(item);
      return i >= 0 ? 'replaced' : 'ok';
    }
    case 'addQuestion':
      if (reg.questions.some(x => same(x.text, b.question.text) && same(x.answer, b.question.answer))) return 'exists';
      reg.questions.unshift(Object.assign({}, b.question, { id: uid(), theme: b.theme || '', saved: now })); return 'ok';
    case 'delTheme': reg.themes = reg.themes.filter(t => t.id !== b.id); return 'ok';
    case 'delQuestion': reg.questions = reg.questions.filter(q => q.id !== b.id); return 'ok';
    case 'import':
      (b.themes || []).forEach(t => { if (!reg.themes.some(x => same(x.name, t.name))) reg.themes.push(Object.assign({}, t, { id: uid(), saved: now })); });
      (b.questions || []).forEach(q => { if (!reg.questions.some(x => same(x.text, q.text) && same(x.answer, q.answer))) reg.questions.push(Object.assign({}, q, { id: uid(), saved: now })); });
      return 'ok';
  }
  throw new Error('Неизвестная операция');
}
function regSet(j) { REG.data = { themes: j.themes || [], questions: j.questions || [], seeded: !!j.seeded }; REG.storage = j.storage; REG.persistent = !!j.persistent; }
async function regLocal() { REG.data = (await DB.get('registry')) || { themes: [], questions: [], seeded: false }; REG.storage = 'browser'; REG.persistent = true; }
const ghToken = () => { try { return localStorage.getItem('svoyak-ghtoken') || ''; } catch { return ''; } };
async function regLoad() {
  if (NET.online) { try { regSet(await (await fetch('/api/registry')).json()); } catch { await regLocal(); } }
  else await regLocal();
  if (REG.storage === 'file' && ghToken()) {   // сервер без ключа — отдаём ему ключ из этого браузера
    try { await regOp({ op: 'connect', token: ghToken() }); } catch (e) { console.warn('GitHub:', e.message); }
  }
  if (!REG.data.seeded) await regOp({ op: 'seed', themes: seedThemes() });
}
const regReady = () => (REG.data ? Promise.resolve() : (REG.loading = REG.loading || regLoad().catch(e => { REG.loading = null; throw e; })));
async function regOp(body) {
  if (REG.storage !== 'browser') {
    const r = await fetch('/api/registry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ error: 'Сервер не ответил' }));
    if (!r.ok) throw new Error(j.error || 'Ошибка реестра');
    regSet(j); return j.result;
  }
  const res = regApplyLocal(REG.data, body);
  await DB.set('registry', REG.data);
  return res;
}
function regStatusText() {
  if (REG.storage === 'github') return '☁ Общий реестр сайта — сохраняется навсегда (GitHub)';
  if (REG.storage === 'browser') return '💻 Реестр хранится только в этом браузере';
  return /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(location.hostname)
    ? '💾 Реестр хранится на этом компьютере (data/registry.json)'
    : '⚠ Хранилище GitHub на этом устройстве не подключено — новое сохранится только до перезапуска сайта. Вставь ключ GitHub ниже и нажми «Подключить» (один раз на этом устройстве).';
}
function filterReg(v) {
  v = v.trim().toLowerCase();
  $$('.reg-list [data-search]').forEach(el => { const hit = !v || el.dataset.search.includes(v); el.hidden = !hit; if (v && hit && el.tagName === 'DETAILS') el.open = true; });
}
async function regModal() {
  if (!REG.data) {
    modal('<h3>🗂 Реестр</h3><p class="hint">Загружаю…</p>', 'wide');
    try { await regReady(); } catch (e) { return modal(`<h3>🗂 Реестр</h3><p class="hint">Не удалось загрузить реестр: ${esc(e.message)}</p>`); }
  }
  const keep = { scroll: $('.reg-list') ? $('.reg-list').scrollTop : 0, q: $('#reg-q') ? $('#reg-q').value : '', open: $$('.reg-t[open]').map(x => x.dataset.id) };
  const R = REG.data, inRound = E.tab[0] === 'r', sel = inRound && E.sel ? E.sel : null;
  const qRow = (q, qi, attrs) => `<div class="bank-q"><span class="diff">${'●'.repeat(Math.min(5, q.diff || qi + 1))}</span><div class="grow"><div>${q.type === 'closest' ? '🎯 ' : ''}${esc(q.text)}${q.media && q.media.src ? ' 🖼' : ''}</div><div class="muted">${esc(q.answer)}</div></div>${sel ? `<button class="btn sm outline" data-act="ed-regswap" ${attrs}>⇄ В клетку</button>` : ''}`;
  const themesHTML = R.themes.map(t => `<details class="bank-t reg-t" data-id="${t.id}" ${keep.open.includes(t.id) ? 'open' : ''} data-search="${esc((t.name + ' ' + (t.desc || '') + ' ' + t.questions.map(q => q.text + ' ' + q.answer).join(' ')).toLowerCase())}">
      <summary><span class="grow"><b>${esc(t.name)}</b> <span class="muted">${t.questions.length} · ${esc(t.desc || '')}</span></span>${inRound ? `<button class="btn sm outline" data-act="ed-regins" data-id="${t.id}">+ В раунд</button>` : ''}<button class="icon" data-act="ed-regdelt" data-id="${t.id}" title="Удалить из реестра">🗑</button></summary>
      ${t.questions.map((q, qi) => qRow(q, qi, `data-id="${t.id}" data-q="${qi}"`) + '</div>').join('')}</details>`).join('')
    || '<p class="hint">Тем пока нет. Сохраняй их кнопкой 💾 рядом с названием темы в раунде.</p>';
  const qsHTML = R.questions.map(q => `<div class="reg-q" data-search="${esc((q.theme + ' ' + q.text + ' ' + q.answer).toLowerCase())}">${q.theme ? `<div class="reg-tag">${esc(q.theme)}</div>` : ''}${qRow(q, 0, `data-qid="${q.id}"`)}<button class="icon" data-act="ed-regdelq" data-id="${q.id}" title="Удалить из реестра">🗑</button></div></div>`).join('')
    || '<p class="hint">Отдельных вопросов пока нет. Открой клетку в раунде и нажми «💾 В реестр».</p>';
  modal(`<div class="bank-head"><h3>🗂 Реестр тем и вопросов</h3><button class="icon" data-act="modal-close">✕</button></div>
    <div class="reg-status ${REG.persistent ? '' : 'warn'}">${esc(regStatusText())}</div>
    ${!REG.persistent && REG.storage === 'file' ? `<div class="row gap" style="margin-top:8px"><input class="inp" id="reg-token" type="password" autocomplete="off" placeholder="Ключ GitHub (github_pat_…) — чтобы реестр хранился навсегда" style="flex:1"><button class="btn sm" data-act="ed-regconnect">Подключить</button></div>` : ''}
    <div class="row wrap gap" style="margin:10px 0">
      <button class="seg-b ${REG.tab === 'themes' ? 'on' : ''}" data-act="ed-regtab" data-v="themes">Темы · ${R.themes.length}</button>
      <button class="seg-b ${REG.tab === 'questions' ? 'on' : ''}" data-act="ed-regtab" data-v="questions">Вопросы · ${R.questions.length}</button>
      <input class="inp" id="reg-q" placeholder="Поиск по темам, вопросам и ответам…" value="${esc(keep.q)}" style="flex:1;min-width:180px">
      <button class="btn sm ghost" data-act="ed-regexport" title="Скачать реестр файлом">⬇ Файл</button>
      <label class="btn sm ghost file" title="Добавить темы и вопросы из файла">⬆ Файл<input type="file" accept=".json,application/json" id="reg-import" hidden></label>
    </div>
    ${sel ? '<p class="hint" style="margin:0 0 8px">Выбрана клетка — «⇄ В клетку» поставит в неё вопрос из реестра (текущий вопрос клетки заменится).</p>' : inRound ? '' : '<p class="hint" style="margin:0 0 8px">Открой раунд, чтобы добавлять темы в игру.</p>'}
    <div class="bank-list reg-list">${REG.tab === 'themes' ? themesHTML : qsHTML}</div>`, 'wide');
  const l = $('.reg-list'); if (l) l.scrollTop = keep.scroll;
  if (keep.q) filterReg(keep.q);
}
async function regAct(a, d) {
  const pk = S.pack;
  try {
    if (a !== 'ed-reg') await regReady();
    switch (a) {
      case 'ed-reg': return regModal();
      case 'ed-regconnect': {
        const t = ($('#reg-token') || {}).value || '';
        if (!t.trim()) return toast('Вставь ключ GitHub');
        await regOp({ op: 'connect', token: t.trim() });
        try { localStorage.setItem('svoyak-ghtoken', t.trim()); } catch { }
        toast('Реестр подключён к GitHub — теперь он хранится навсегда');
        return regModal();
      }
      case 'ed-regtab': REG.tab = d.v; return regModal();
      case 'ed-regtheme': {
        const t = pk.rounds[+d.r].themes[+d.t];
        if (!t.name.trim()) return toast('Сначала дай теме название');
        let res = await regOp({ op: 'addTheme', theme: cleanTheme(t) });
        if (res === 'exists') {
          if (!confirm(`Тема «${t.name}» уже есть в реестре. Заменить её этой версией?`)) return;
          res = await regOp({ op: 'addTheme', theme: cleanTheme(t), replace: true });
        }
        return toast(res === 'replaced' ? `«${t.name}» обновлена в реестре` : `«${t.name}» сохранена в реестр`);
      }
      case 'ed-reground': {
        const r = pk.rounds[+d.r], names = new Set(REG.data.themes.map(t => t.name.trim().toLowerCase()));
        const list = r.themes.filter(t => t.name.trim()), dup = list.filter(t => names.has(t.name.trim().toLowerCase()));
        const replace = dup.length ? confirm(`Тем с такими же названиями в реестре: ${dup.length}. Заменить их версиями из раунда?\n(«Отмена» — сохранить только новые)`) : false;
        let n = 0;
        for (const t of list) { if (await regOp({ op: 'addTheme', theme: cleanTheme(t), replace }) !== 'exists') n++; }
        return toast(`Сохранено в реестр тем: ${n}`);
      }
      case 'ed-regq': {
        if (!E.sel) return;
        const th = pk.rounds[E.sel.r].themes[E.sel.t], q = th.questions[E.sel.q];
        if (!String(q.text || '').trim() && !(q.media && q.media.src)) return toast('Вопрос пустой');
        const res = await regOp({ op: 'addQuestion', question: cleanQ(q, E.sel.q), theme: th.name });
        return toast(res === 'exists' ? 'Такой вопрос уже есть в реестре' : 'Вопрос сохранён в реестр');
      }
      case 'ed-regins': {
        const t = REG.data.themes.find(x => x.id === d.id), r = E.tab[0] === 'r' ? pk.rounds[+E.tab.slice(1)] : null;
        if (!t || !r) return;
        r.themes.push(cleanTheme(t)); E.sel = null; savePack(); renderEditor();
        toast(`«${t.name}» добавлена в раунд`);
        return regModal();
      }
      case 'ed-regswap': {
        if (!E.sel) return;
        const src = d.qid ? REG.data.questions.find(x => x.id === d.qid) : (REG.data.themes.find(x => x.id === d.id) || { questions: [] }).questions[+d.q];
        if (!src) return;
        const arr = pk.rounds[E.sel.r].themes[E.sel.t].questions, nq = cleanQ(src, E.sel.q);
        nq.value = arr[E.sel.q] ? arr[E.sel.q].value : 0;
        arr[E.sel.q] = nq; savePack(); closeModal(); renderEditor();
        return toast('Вопрос поставлен в клетку');
      }
      case 'ed-regdelt': {
        const t = REG.data.themes.find(x => x.id === d.id);
        if (!t || !confirm(`Удалить тему «${t.name}» из реестра? Она пропадёт для всех.`)) return;
        await regOp({ op: 'delTheme', id: d.id }); return regModal();
      }
      case 'ed-regdelq':
        if (!confirm('Удалить вопрос из реестра? Он пропадёт для всех.')) return;
        await regOp({ op: 'delQuestion', id: d.id }); return regModal();
      case 'ed-regexport': return download(JSON.stringify({ themes: REG.data.themes, questions: REG.data.questions }), 'Реестр — Своя игра.json');
    }
  } catch (e) { toast('⚠ ' + (e.message || e)); }
}
async function regImport(file) {
  try {
    const j = JSON.parse(await file.text());
    if (!Array.isArray(j.themes) && !Array.isArray(j.questions)) throw new Error('в файле нет тем и вопросов');
    await regReady();
    await regOp({ op: 'import', themes: j.themes || [], questions: j.questions || [] });
    toast('Реестр пополнен из файла'); regModal();
  } catch (e) { toast('⚠ Не получилось: ' + e.message); }
}
function edInput(el) {
  const v = el.type === 'checkbox' ? el.checked : el.dataset.type === 'num' ? (el.value === '' ? 0 : Number(el.value)) : el.value;
  setPath(S.pack, el.dataset.path, v);
  savePack();
  if (E.sel && /\.(value|text|answer)$/.test(el.dataset.path)) {
    const c = $('.ed-cell.on'); if (c) c.innerHTML = cellInner(E.sel.r, E.sel.t, E.sel.q);
  }
  if (el.dataset.path === 'name') { const g = $('.ed-game'); if (g) g.textContent = '🎮 ' + el.value; }
  if (/^rounds\.\d+\.name$/.test(el.dataset.path)) { const i = +el.dataset.path.split('.')[1], n = $(`.nav-b[data-v="r${i}"]`); if (n) n.innerHTML = `<span class="grip">⠿</span>${i + 1}. ${esc(el.value)}`; }
}
function bankCount() { return S.pack.bank.reduce((s, t) => s + t.questions.length, 0); }
function renderEditor() {
  const sm = $('.ed-main') ? $('.ed-main').scrollTop : 0, ss = $('.ed-side') ? $('.ed-side').scrollTop : 0, same = app.dataset.screen === 'editor';
  app.dataset.screen = 'editor';
  const pk = S.pack;
  app.innerHTML = `<div class="editor">
    <aside class="ed-nav">
      <div class="logo sm">РЕДАКТОР</div>
      <div class="ed-game" title="Открытая игра">🎮 ${esc(pk.name)}</div>
      <button class="nav-b ${E.tab === 'pack' ? 'on' : ''}" data-act="ed-tab" data-v="pack">📦 Пакет</button>
      ${pk.rounds.map((r, i) => `<button class="nav-b ${E.tab === 'r' + i ? 'on' : ''}" data-act="ed-tab" data-v="r${i}" data-round="${i}" title="Зажми и перетащи, чтобы поменять порядок"><span class="grip">⠿</span>${i + 1}. ${esc(r.name)}</button>`).join('')}
      <button class="nav-b add" data-act="ed-addround">+ Раунд</button>
      <button class="nav-b ${E.tab === 'final' ? 'on' : ''}" data-act="ed-tab" data-v="final">🏁 Финал</button>
      <button class="nav-b ${E.tab === 'mods' ? 'on' : ''}" data-act="ed-tab" data-v="mods">✨ Модификаторы</button>
      <button class="nav-b small" data-act="ed-reg">🗂 Реестр тем и вопросов</button>
      <button class="nav-b small" data-act="ed-bank">📚 Запас пакета <span class="muted">${bankCount()}</span></button>
      <div class="grow"></div>
      <div class="ed-save" id="ed-save">✓ Сохранено</div>
      <button class="btn" data-act="ed-close">← ${E.back === 'game' ? 'В игру' : 'Назад'}</button>
    </aside>
    <main class="ed-main">${edMain()}</main>
    ${E.sel && E.tab[0] === 'r' ? `<aside class="ed-side">${edCell()}</aside>` : ''}
  </div>`;
  if (same) { const m = $('.ed-main'), s = $('.ed-side'); if (m) m.scrollTop = sm; if (s) s.scrollTop = ss; }
}
function packStats() {
  let q = 0, media = 0, noAns = 0;
  S.pack.rounds.forEach(r => r.themes.forEach(t => t.questions.forEach(x => { q++; if ((x.media && x.media.src) || (x.answerMedia && x.answerMedia.src)) media++; if (!String(x.answer || '').trim()) noAns++; })));
  const bytes = JSON.stringify(S.pack).length;
  return { q, media, noAns, size: bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' МБ' : Math.ceil(bytes / 1024) + ' КБ' };
}
function edMain() {
  const pk = S.pack;
  if (E.tab === 'pack') {
    const st = packStats();
    return `<div class="ed-head"><div class="title-wrap"><input class="inp title" data-path="name" value="${esc(pk.name)}" placeholder="Название игры">${gamesWidget()}</div></div>
      <div class="stat"><div><b>${st.q}</b>в раундах</div><div><b>${bankCount()}</b>в запасе</div><div><b>${pk.rounds.length}</b>раундов</div><div><b>${st.media}</b>с медиа</div><div><b>${st.noAns}</b>без ответа</div><div><b>${st.size}</b>размер</div></div>
      <div class="row wrap gap">
        <button class="btn" data-act="ed-export">⬇ Экспорт пакета</button>
        <label class="btn outline file">⬆ Импорт пакета<input type="file" accept=".json,application/json" id="ed-import" hidden></label>
        <button class="btn outline" data-act="ed-newgame">+ Новая игра</button>
        <button class="btn ghost danger" data-act="ed-reset">Сбросить к стандартному</button>
      </div>
      <p class="hint" style="max-width:720px">Всё сохраняется автоматически в этом браузере. Игр может быть сколько угодно: «+» на рамке названия создаёт новую, список игр выкатывается при наведении. «Экспорт» сохраняет игру файлом (с картинками и звуками), «Импорт» добавляет игру из файла.</p>
      <p class="hint" style="max-width:720px"><b>Как редактировать:</b> раунд слева → клик по клетке → справа откроется вопрос. <b>Перетаскивать мышкой</b> можно раунды (в списке слева), темы (за карточку с названием) и вопросы (клетки). Чтобы перенести в другую игру — тащи на неё в списке игр под «+» и подержи секунду: она откроется, бросай куда нужно.</p>`;
  }
  if (E.tab === 'final') {
    const fin = pk.final.themes;
    return `<div class="ed-head"><div class="logo sm">ФИНАЛ</div><span class="muted grow">Тем: ${fin.length}. Игроки по очереди убирают по одной (первым — у кого меньше очков), на последнюю делают ставки</span>${gamesWidget(true)}</div>
      <div class="row wrap gap" style="margin-bottom:14px"><button class="btn sm" data-act="ed-finalhard">⭐ Вставить 12 сложных тем</button><span class="hint" style="margin:0">Кино, космос, география, тело, алкоголь, музыка, литература, животные, бренды, история, 18+, еда</span></div>
      <div class="ed-list">${fin.map((t, i) => { const b = `final.themes.${i}`; return `<div class="ed-item">
        <div class="row"><input class="inp" data-path="${b}.name" value="${esc(t.name)}" placeholder="Тема" style="font-weight:800"><button class="icon" data-act="ed-fdel" data-i="${i}" title="Удалить">🗑</button></div>
        <textarea class="inp" rows="2" data-path="${b}.text" placeholder="Вопрос">${esc(t.text)}</textarea>${mediaEditor(b + '.media', t.media)}
        <input class="inp" data-path="${b}.answer" value="${esc(t.answer)}" placeholder="Ответ">${mediaEditor(b + '.answerMedia', t.answerMedia, 'к ответу')}</div>`; }).join('')}</div>
      <button class="btn outline" data-act="ed-fadd" style="margin-top:12px">+ Тема финала</button>`;
  }
  if (E.tab === 'mods') {
    return `<div class="ed-head"><div class="logo sm grow">МОДИФИКАТОРЫ</div>${gamesWidget(true)}</div>
      <p class="hint" style="max-width:780px;margin-bottom:16px">Модификатор прячется за клеткой. Когда её открывают, все жмут кнопки — кто первый, тот и забирает. Количество случайных модификаторов задаётся в каждом раунде. Игроки не видят, какой модификатор спрятан, — он раскрывается только тому, кто нажал первым (ведущий видит его на пульте). Тип «Правило» ничего не считает сам — просто объявляет условие, а следит за ним ведущий.</p>
      <div class="ed-list">${pk.modifiers.map((m, i) => { const b = `modifiers.${i}`, def = MOD_TYPES[m.type] || {}; return `<div class="ed-item">
        <div class="mod-grid"><input class="inp emoji" data-path="${b}.emoji" value="${esc(m.emoji)}" maxlength="4">
          <input class="inp" data-path="${b}.name" value="${esc(m.name)}" placeholder="Название" style="font-weight:800">
          <select class="inp" data-path="${b}.type" data-rerender>${Object.entries(MOD_TYPES).map(([k, v]) => `<option value="${k}" ${m.type === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
          ${def.amount ? `<input class="inp" type="number" step="100" data-path="${b}.amount" data-type="num" value="${Number(m.amount) || 0}" title="Очки">` : '<span></span>'}
          <button class="icon" data-act="ed-moddel" data-i="${i}" title="Удалить">🗑</button></div>
        <input class="inp" data-path="${b}.desc" value="${esc(m.desc)}" placeholder="Что видят игроки">
        <div class="row"><label class="check" style="margin:0"><input type="checkbox" data-path="${b}.enabled" ${m.enabled !== false ? 'checked' : ''}> Выпадает случайно</label></div></div>`; }).join('')}</div>
      <button class="btn outline" data-act="ed-modadd" style="margin-top:12px">+ Модификатор</button>`;
  }
  const ri = +E.tab.slice(1), r = pk.rounds[ri];
  if (!r) { E.tab = 'pack'; return edMain(); }
  return `<div class="ed-head">
      <div class="title-wrap"><input class="inp title" data-path="rounds.${ri}.name" value="${esc(r.name)}" placeholder="Название раунда">${gamesWidget()}</div>
      <label>Случайных модификаторов <input class="inp sm" type="number" min="0" max="40" data-path="rounds.${ri}.randomMods" data-type="num" value="${Number(r.randomMods) || 0}"></label>
      <button class="btn outline sm" data-act="ed-reg" title="Общий реестр тем и вопросов">🗂 Реестр</button>
      <button class="btn outline sm" data-act="ed-reground" data-r="${ri}" title="Сохранить все темы этого раунда в реестр">💾 Раунд в реестр</button>
      <button class="btn outline sm" data-act="ed-bank" title="Запас вопросов этого пакета">📚 Запас · ${bankCount()}</button>
      <button class="btn outline sm" data-act="ed-randtheme" title="Собрать тему из 5 случайных вопросов запаса по возрастанию сложности">🎲 Случайная тема</button>
      <button class="btn ghost sm" data-act="ed-autoval" data-r="${ri}" title="Сбросить стоимости на стандартные">Стоимости ${(ri + 1) * 100}…</button>
      <button class="btn ghost sm danger" data-act="ed-delround" data-r="${ri}">Удалить раунд</button>
    </div>
    <div class="ed-board">${r.themes.map((t, ti) => `<div class="ed-theme" style="--n:${t.questions.length}" data-r="${ri}" data-t="${ti}">
      <div class="ed-tcol"><input class="inp" data-path="rounds.${ri}.themes.${ti}.name" value="${esc(t.name)}" placeholder="Тема" style="font-weight:800">
        <input class="inp desc" data-path="rounds.${ri}.themes.${ti}.desc" value="${esc(t.desc)}" placeholder="Подсказка к теме">
        <div class="row"><span class="tgrip" title="Зажми и перетащи тему">⠿</span><button class="icon" data-act="ed-tup" data-r="${ri}" data-t="${ti}" title="Выше" ${ti ? '' : 'disabled'}>↑</button><button class="icon" data-act="ed-tdown" data-r="${ri}" data-t="${ti}" title="Ниже" ${ti < r.themes.length - 1 ? '' : 'disabled'}>↓</button><div class="grow"></div><button class="icon" data-act="ed-regtheme" data-r="${ri}" data-t="${ti}" title="Сохранить тему в реестр">💾</button><button class="icon" data-act="ed-tobank" data-r="${ri}" data-t="${ti}" title="Убрать тему в запас">📚</button><button class="icon" data-act="ed-tdel" data-r="${ri}" data-t="${ti}" title="Удалить тему">🗑</button></div></div>
      ${t.questions.map((q, qi) => `<button class="ed-cell ${E.sel && E.sel.r === ri && E.sel.t === ti && E.sel.q === qi ? 'on' : ''}" data-act="ed-sel" data-r="${ri}" data-t="${ti}" data-q="${qi}">${cellInner(ri, ti, qi)}</button>`).join('')}
      <button class="ed-cell add" data-act="ed-addq" data-r="${ri}" data-t="${ti}" title="Добавить вопрос">+</button></div>`).join('')}</div>
    <button class="btn outline" data-act="ed-addtheme" data-r="${ri}">+ Тема</button>`;
}
function cellInner(ri, ti, qi) {
  const q = S.pack.rounds[ri].themes[ti].questions[qi];
  const ic = [QICONS[q.type] || '', q.modifier ? '✨' : '',
    q.media && q.media.src ? { image: '🖼', audio: '🔊', video: '🎬' }[q.media.kind] : '', !String(q.answer || '').trim() ? '⚠️' : ''].join(' ');
  return `<b>${fmt(qValue(q, qi, ri))}</b><span class="ico">${ic}</span><span class="prev">${esc(q.text) || '<i>пусто</i>'}</span>`;
}
function mediaEditor(path, m, label) {
  return `<div class="media-ed">${m && m.src ? `<div class="media-prev">${mediaTag(m, false)}<button class="icon" data-act="ed-mdel" data-path="${path}" title="Убрать">✕</button></div>` : ''}
    <div class="row wrap">
      <label class="btn outline sm file">🖼 Картинка<input type="file" accept="image/*" data-media="${path}" hidden></label>
      <label class="btn outline sm file">🔊 Звук<input type="file" accept="audio/*" data-media="${path}" hidden></label>
      <label class="btn outline sm file">🎬 Видео<input type="file" accept="video/*" data-media="${path}" hidden></label>
      <input class="inp" style="flex:1;min-width:140px;padding:6px 10px" placeholder="или ссылка${label ? ' ' + label : ''}…" data-mediaurl="${path}">
    </div></div>`;
}
function edCell() {
  const { r, t, q: qi } = E.sel, th = S.pack.rounds[r] && S.pack.rounds[r].themes[t], q = th && th.questions[qi];
  if (!q) { E.sel = null; return ''; }
  if (q.type === 'cat' && !q.cat) q.cat = { theme: '', value: 0 };
  const b = `rounds.${r}.themes.${t}.questions.${qi}`;
  return `<div class="ed-side-head"><b>${esc(th.name || 'Тема')} · ${fmt(qValue(q, qi, r))}</b><button class="icon" data-act="ed-unsel">✕</button></div>
    <div class="row wrap" style="margin-top:10px"><button class="btn sm" data-act="ed-regq">💾 В реестр</button><button class="btn outline sm" data-act="ed-reg">🗂 Из реестра</button><button class="btn outline sm" data-act="ed-bank">📚 Из запаса</button></div>
    <label class="lbl">Стоимость <span class="muted">(0 = стандартная ${fmt((qi + 1) * (r + 1) * 100)})</span></label>
    <input class="inp" type="number" step="100" data-path="${b}.value" data-type="num" value="${Number(q.value) || ''}" placeholder="${(qi + 1) * (r + 1) * 100}">
    <label class="lbl">Тип клетки</label>
    <select class="inp" data-path="${b}.type" data-rerender>${Object.entries(QTYPES).map(([k, v]) => `<option value="${k}" ${q.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    ${q.type === 'cat' ? `<label class="lbl">Тема кота <span class="muted">(пусто = как у клетки)</span></label><input class="inp" data-path="${b}.cat.theme" value="${esc(q.cat.theme)}" placeholder="Например: Котики">
      <label class="lbl">Стоимость кота <span class="muted">(0 = как у клетки)</span></label><input class="inp" type="number" step="100" data-path="${b}.cat.value" data-type="num" value="${Number(q.cat.value) || ''}">` : ''}
    ${q.type === 'closest' ? '<p class="hint">Все отвечают по очереди, ведущий открывает ответ и отмечает самого точного — он получает баллы. Никто не теряет.</p>' : ''}
    ${q.type === 'vote' ? `<p class="hint">Голосуют все: с телефона — кнопками вариантов, без телефона — вслух. Ведущий открывает ответ, отмечает каждого ✓/✗ и начисляет баллы.</p>
      <label class="lbl">Варианты <span class="muted">(каждый с новой строки; пусто = Да / Нет)</span></label>
      <textarea class="inp" rows="3" data-path="${b}.voteOptions" placeholder="Да&#10;Нет">${esc(q.voteOptions || '')}</textarea>
      <label class="lbl">Правильный вариант <span class="muted">(необязательно — тогда ✓/✗ по голосам с телефонов проставятся сами)</span></label>
      <input class="inp" data-path="${b}.voteCorrect" value="${esc(q.voteCorrect || '')}" placeholder="Например: Да">
      <label class="check"><input type="checkbox" data-path="${b}.votePenalty" ${q.votePenalty ? 'checked' : ''}> Штраф за неверный голос (минус стоимость)</label>` : ''}
    <label class="lbl">Вопрос</label><textarea class="inp" rows="4" data-path="${b}.text" placeholder="Текст вопроса (можно только эмодзи — они будут крупными)">${esc(q.text)}</textarea>
    ${mediaEditor(b + '.media', q.media)}
    <label class="lbl">Ответ</label><textarea class="inp" rows="2" data-path="${b}.answer" placeholder="Правильный ответ">${esc(q.answer)}</textarea>
    ${mediaEditor(b + '.answerMedia', q.answerMedia, 'к ответу')}
    <label class="lbl">Модификатор</label>
    <select class="inp" data-path="${b}.modifier" data-rerender>
      <option value="">— нет (может выпасть случайно) —</option>
      <option value="random" ${q.modifier === 'random' ? 'selected' : ''}>🎲 Точно будет, случайный</option>
      ${S.pack.modifiers.map(m => `<option value="${m.id}" ${q.modifier === m.id ? 'selected' : ''}>${esc(m.emoji)} ${esc(m.name)}</option>`).join('')}</select>
    <div class="row" style="margin-top:22px"><button class="btn ghost danger" data-act="ed-delq">🗑 Удалить вопрос</button></div>`;
}
function bankModal() {
  const bank = S.pack.bank, sel = E.sel && E.tab[0] === 'r' ? E.sel : null, inRound = E.tab[0] === 'r';
  const scroll = $('.bank-list') ? $('.bank-list').scrollTop : 0, open = $$('.bank-t[open]').map(d => d.dataset.b);
  modal(`<div class="bank-head"><h3>📚 Запас <span class="muted">${bankCount()} вопросов · ${bank.length} тем</span></h3><button class="icon" data-act="modal-close">✕</button></div>
    <div class="row wrap gap" style="margin-bottom:10px">
      ${inRound ? '<button class="btn sm" data-act="ed-randtheme">🎲 Случайная тема в раунд</button>' : '<span class="hint" style="margin:0">Открой раунд, чтобы вставлять темы</span>'}
      <input class="inp" id="bank-q" placeholder="Поиск по вопросам и ответам…" style="flex:1;min-width:200px">
    </div>
    ${sel ? '<p class="hint" style="margin:0 0 10px">Выбрана клетка — «⇄» меняет её вопрос местами с вопросом из запаса.</p>' : ''}
    <div class="bank-list">${bank.map((t, bi) => `<details class="bank-t" data-b="${bi}" ${open.includes(String(bi)) ? 'open' : ''} data-search="${esc((t.name + ' ' + t.desc + ' ' + t.questions.map(q => q.text + ' ' + q.answer).join(' ')).toLowerCase())}">
      <summary><span class="grow"><b>${esc(t.name)}</b> <span class="muted">${t.questions.length} · ${esc(t.desc)}</span></span>${inRound ? `<button class="btn sm outline" data-act="ed-banktheme" data-b="${bi}">+ В раунд</button>` : ''}</summary>
      ${t.questions.map((q, qi) => `<div class="bank-q"><span class="diff" title="Сложность">${'●'.repeat(Math.min(5, q.diff || qi + 1))}</span><div class="grow"><div>${{ closest: '🎯 ' }[q.type] || ''}${esc(q.text)}</div><div class="muted">${esc(q.answer)}</div></div>
        ${sel ? `<button class="btn sm outline" data-act="ed-bankswap" data-b="${bi}" data-q="${qi}">⇄ В клетку</button>` : ''}<button class="icon" data-act="ed-bankdel" data-b="${bi}" data-q="${qi}" title="Удалить">🗑</button></div>`).join('')}
    </details>`).join('') || '<p class="hint">Запас пуст. Тему из раунда можно убрать сюда кнопкой 📚 рядом с её названием.</p>'}</div>`, 'wide');
  const l = $('.bank-list'); if (l) l.scrollTop = scroll;
}
function swapCells(a, b) {
  const A = S.pack.rounds[a.r].themes[a.t].questions, B = S.pack.rounds[b.r].themes[b.t].questions;
  const qa = A[a.q], qb = B[b.q];
  if (!qa || !qb || qa === qb) return;
  [qa.value, qb.value] = [qb.value, qa.value];   // стоимость остаётся на месте
  A[a.q] = qb; B[b.q] = qa;
  if (E.sel && E.sel.r === a.r && E.sel.t === a.t && E.sel.q === a.q) E.sel = Object.assign({}, b);
  else if (E.sel && E.sel.r === b.r && E.sel.t === b.t && E.sel.q === b.q) E.sel = Object.assign({}, a);
  sfx('bind'); savePack(); renderEditor();
}
/* ---------- перетаскивание раундов, тем и вопросов — внутри игры и между играми ----------
   Зажал и потянул (больше 6 px) → появляется «призрак», «+» крутится, список игр раскрыт.
   Подержал секунду над другой игрой → она открывается, и туда можно бросить.
   Внутри одной игры элемент перемещается, в другую игру — копируется. */
let DR = null;
function dragTarget(x, y) {
  const under = document.elementFromPoint(x, y), at = sel => under && under.closest(sel);
  const pk = S.pack, k = DR.kind;
  let t = null;
  if (at('.games')) return { t: null, game: at('.game-item[data-game]') };   // над списком игр — только открываем игру удержанием
  if (k === 'round') {
    const nb = at('.nav-b[data-round]');
    if (nb) { const r = nb.getBoundingClientRect(), after = y > r.top + r.height / 2; t = { index: +nb.dataset.round + (after ? 1 : 0), el: nb, cls: after ? 'drop-after' : 'drop-before' }; }
    else if (at('.nav-b.add')) t = { index: pk.rounds.length, el: at('.nav-b.add'), cls: 'drop-before' };
  } else if (k === 'theme') {
    const row = at('.ed-theme[data-t]'), nb = at('.nav-b[data-round]');
    if (row) { const r = row.getBoundingClientRect(), after = y > r.top + r.height / 2; t = { r: +row.dataset.r, index: +row.dataset.t + (after ? 1 : 0), el: row, cls: after ? 'drop-after' : 'drop-before' }; }
    else if (nb) t = { r: +nb.dataset.round, index: pk.rounds[+nb.dataset.round].themes.length, el: nb, cls: 'drop-into' };
    else if (E.tab[0] === 'r' && at('.ed-main')) { const ri = +E.tab.slice(1); t = { r: ri, index: pk.rounds[ri].themes.length, el: $('.ed-board') || at('.ed-main'), cls: 'drop-end' }; }
  } else if (k === 'q') {
    const c = at('.ed-cell');
    if (c && c.classList.contains('add')) t = { type: 'append', r: +c.dataset.r, t: +c.dataset.t, el: c, cls: 'drop-into' };
    else if (c && c.dataset.q != null) t = { type: 'cell', r: +c.dataset.r, t: +c.dataset.t, q: +c.dataset.q, el: c, cls: 'drop-into' };
  }
  // бросить на самого себя — ничего не делать
  if (t && DR.src.game === S.packId) {
    const s = DR.src;
    if (k === 'round' && (t.index === s.r || t.index === s.r + 1)) t.noop = true;
    if (k === 'theme' && t.r === s.r && (t.index === s.t || t.index === s.t + 1) && t.cls !== 'drop-into') t.noop = true;
    if (k === 'q' && t.type === 'cell' && t.r === s.r && t.t === s.t && t.q === s.q) t.noop = true;
  }
  return { t, game: at('.game-item[data-game]') };
}
function dragHoverGame(item) {
  const id = item ? item.dataset.game : null;
  if (DR.hg && DR.hg.id === id) return;
  if (DR.hg) { clearTimeout(DR.hg.timer); $$('.game-item.arming').forEach(x => x.classList.remove('arming')); DR.hg = null; }
  if (!id || id === S.packId) return;
  item.classList.add('arming');
  DR.hg = { id, timer: setTimeout(async () => {
    if (!DR) return;
    const keepTab = E.tab;
    await loadPack(id); E.sel = null;
    E.tab = keepTab[0] === 'r' && S.pack.rounds[+keepTab.slice(1)] ? keepTab : 'r0';
    renderEditor(); sfx('bind');
    toast(`Открыта «${S.pack.name}» — бросай сюда`);
    if (DR) DR.hg = null;
  }, 900) };
}
function dragCleanup() {
  $$('.drop-before,.drop-after,.drop-into,.drop-end,.drag-src,.game-item.arming').forEach(x => x.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-end', 'drag-src', 'arming'));
  const g = $('#drag-ghost'); if (g) g.remove();
  document.body.classList.remove('dragging-any');
}
function dragEnd(drop) {
  const d = DR; DR = null;
  if (!d || !d.active) return;
  if (d.hg) clearTimeout(d.hg.timer);
  const tgt = d.target;
  dragCleanup();
  E.suppressClick = true; setTimeout(() => { E.suppressClick = false; }, 300);
  if (drop && tgt && !tgt.noop) applyDrop(d, tgt); else renderEditor();
}
function applyDrop(d, tgt) {
  const pk = S.pack, same = d.src.game === S.packId;
  const openR = E.tab[0] === 'r' ? pk.rounds[+E.tab.slice(1)] : null, gameR = G && G.packId === S.packId ? pk.rounds[G.round] : null;
  let msg = '';
  if (d.kind === 'round') {
    if (same) { const [r] = pk.rounds.splice(d.src.r, 1); let i = tgt.index; if (d.src.r < i) i--; pk.rounds.splice(i, 0, r); msg = `Раунд «${r.name}» — теперь ${i + 1}-й`; }
    else { pk.rounds.splice(tgt.index, 0, clone(d.data)); msg = `Раунд «${d.data.name}» скопирован в «${pk.name}»`; }
  } else if (d.kind === 'theme') {
    const dest = pk.rounds[tgt.r];
    if (same) {
      const srcR = pk.rounds[d.src.r], [t] = srcR.themes.splice(d.src.t, 1);
      let i = tgt.index; if (srcR === dest && d.src.t < i) i--;
      dest.themes.splice(i, 0, t); msg = srcR === dest ? `Тема «${t.name}» перемещена` : `Тема «${t.name}» перенесена в «${dest.name}»`;
    } else { dest.themes.splice(tgt.index, 0, clone(d.data)); msg = `Тема «${d.data.name}» скопирована в «${pk.name}» → «${dest.name}»`; }
  } else if (d.kind === 'q') {
    if (tgt.type === 'cell') {
      if (same) { swapCells(d.src, tgt); return; }
      const arr = pk.rounds[tgt.r].themes[tgt.t].questions, nq = clone(d.data);
      nq.value = arr[tgt.q].value; arr[tgt.q] = nq; msg = 'Вопрос скопирован в клетку (прежний вопрос клетки заменён)';
    } else {
      const arr = pk.rounds[tgt.r].themes[tgt.t].questions, nq = same ? pk.rounds[d.src.r].themes[d.src.t].questions.splice(d.src.q, 1)[0] : clone(d.data);
      nq.value = 0; arr.push(nq); msg = same ? 'Вопрос перенесён в конец темы' : 'Вопрос скопирован в конец темы';
    }
  }
  if (openR && pk.rounds.includes(openR)) E.tab = 'r' + pk.rounds.indexOf(openR);
  if (gameR) { G.round = Math.max(0, pk.rounds.indexOf(gameR)); save(); }
  E.sel = null; savePack(); renderEditor(); sfx('bind'); toast(msg);
}
document.addEventListener('pointerdown', e => {
  if (e.button !== 0 || S.screen !== 'editor' || $('.modal-bg')) return;
  const t = e.target;
  if (!t.closest || t.closest('input,textarea,select,label,.games')) return;
  let el, kind, src;
  if ((el = t.closest('.nav-b[data-round]'))) { kind = 'round'; src = { r: +el.dataset.round }; }
  else if ((el = t.closest('.ed-cell[data-q]'))) { kind = 'q'; src = { r: +el.dataset.r, t: +el.dataset.t, q: +el.dataset.q }; }
  else if ((el = t.closest('.ed-tcol'))) {
    if (t.closest('button') && !t.closest('.tgrip')) return;
    const row = el.closest('.ed-theme'); kind = 'theme'; src = { r: +row.dataset.r, t: +row.dataset.t };
  } else return;
  DR = { kind, src: Object.assign({ game: S.packId }, src), el, x0: e.clientX, y0: e.clientY, active: false };
});
document.addEventListener('pointermove', e => {
  const d = DR; if (!d) return;
  if (!d.active) {
    if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;   // маленький сдвиг — это ещё клик
    const pk = S.pack, s = d.src;
    if (d.kind === 'round') { d.data = clone(pk.rounds[s.r]); d.label = `🗂 Раунд «${d.data.name}»`; }
    if (d.kind === 'theme') { d.data = clone(pk.rounds[s.r].themes[s.t]); d.label = `📋 Тема «${d.data.name || 'без названия'}»`; }
    if (d.kind === 'q') { const q = pk.rounds[s.r].themes[s.t].questions[s.q]; d.data = clone(q); d.label = `❓ ${fmt(qValue(q, s.q, s.r))} · ${(q.text || 'пустой вопрос').slice(0, 40)}`; }
    d.active = true;
    const g = document.createElement('div'); g.id = 'drag-ghost'; g.textContent = d.label; document.body.append(g);
    d.el.classList.add('drag-src'); document.body.classList.add('dragging-any');
    try { window.getSelection().removeAllRanges(); } catch { }
  }
  const g = $('#drag-ghost'); if (g) g.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`;
  const { t, game } = dragTarget(e.clientX, e.clientY);
  $$('.drop-before,.drop-after,.drop-into,.drop-end').forEach(x => x.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-end'));
  d.target = t;
  if (t && !t.noop && t.el) t.el.classList.add(t.cls);
  dragHoverGame(game);
});
document.addEventListener('pointerup', () => dragEnd(true));
document.addEventListener('pointercancel', () => dragEnd(false));
document.addEventListener('keydown', e => { if (e.code === 'Escape' && DR && DR.active) dragEnd(false); });

function edAct(a, d) {
  if (a.startsWith('ed-reg')) { regAct(a, d); return; }
  if (a === 'ed-newgame' || a === 'ed-opengame' || a === 'ed-delgame' || a === 'ed-new') { gamesAct(a === 'ed-new' ? 'ed-newgame' : a, d); return; }
  const pk = S.pack, r = d.r != null ? pk.rounds[+d.r] : null, curRound = E.tab[0] === 'r' ? pk.rounds[+E.tab.slice(1)] : null;
  let reopenBank = false;
  switch (a) {
    case 'ed-tab': E.tab = d.v; E.sel = null; break;
    case 'ed-close': E.sel = null; S.screen = E.back === 'game' && G ? 'game' : 'setup'; if (G && G.round >= pk.rounds.length) G.round = pk.rounds.length - 1; render(); return;
    case 'ed-sel': E.sel = { r: +d.r, t: +d.t, q: +d.q }; break;
    case 'ed-unsel': E.sel = null; break;
    case 'ed-addq': r.themes[+d.t].questions.push(blankQ()); E.sel = { r: +d.r, t: +d.t, q: r.themes[+d.t].questions.length - 1 }; break;
    case 'ed-delq': if (!confirm('Удалить вопрос?')) return; pk.rounds[E.sel.r].themes[E.sel.t].questions.splice(E.sel.q, 1); E.sel = null; break;
    case 'ed-addtheme': r.themes.push({ name: 'Новая тема', desc: '', questions: [0, 1, 2, 3, 4].map(blankQ) }); break;
    case 'ed-tdel': if (!confirm('Удалить тему «' + r.themes[+d.t].name + '» со всеми вопросами?')) return; r.themes.splice(+d.t, 1); E.sel = null; break;
    case 'ed-tobank': { const t = r.themes.splice(+d.t, 1)[0]; t.questions.forEach((q, i) => { q.diff = q.diff || i + 1; q.value = 0; }); pk.bank.unshift(t); E.sel = null; break; }
    case 'ed-tup': case 'ed-tdown': { const i = +d.t, j = a === 'ed-tup' ? i - 1 : i + 1; [r.themes[i], r.themes[j]] = [r.themes[j], r.themes[i]]; E.sel = null; break; }
    case 'ed-autoval': r.themes.forEach(t => t.questions.forEach(q => { q.value = 0; })); break;
    case 'ed-addround': pk.rounds.push({ name: 'Раунд ' + (pk.rounds.length + 1), randomMods: 2, themes: [] }); E.tab = 'r' + (pk.rounds.length - 1); E.sel = null; break;
    case 'ed-delround': if (pk.rounds.length <= 1) return alert('Нужен хотя бы один раунд'); if (!confirm('Удалить раунд «' + r.name + '»?')) return; pk.rounds.splice(+d.r, 1); E.tab = 'pack'; E.sel = null; break;
    case 'ed-mdel': setPath(pk, d.path, null); break;
    case 'ed-fadd': pk.final.themes.push({ name: 'Новая тема', text: '', answer: '', media: null, answerMedia: null }); break;
    case 'ed-finalhard': {
      const has = pk.final.themes.filter(t => String(t.text || '').trim()).length;
      if (has && !confirm(`Заменить ${pk.final.themes.length} тем финала на 12 сложных? («Отмена» — ничего не менять)`)) return;
      pk.final.themes = clone(window.FINAL_HARD); toast('В финале 12 сложных тем'); break;
    }
    case 'ed-fdel': if (!confirm('Удалить тему финала?')) return; pk.final.themes.splice(+d.i, 1); break;
    case 'ed-modadd': pk.modifiers.push({ id: uid(), emoji: '✨', name: 'Новый модификатор', desc: '', type: 'add', amount: 500, enabled: true, hidden: false }); break;
    case 'ed-moddel': if (!confirm('Удалить модификатор?')) return; pk.modifiers.splice(+d.i, 1); break;
    /* запас */
    case 'ed-bank': bankModal(); return;
    case 'ed-banktheme': {
      if (!curRound) return;
      const t = pk.bank.splice(+d.b, 1)[0];
      t.questions.sort((x, y) => (x.diff || 0) - (y.diff || 0)).forEach(q => { q.value = 0; });
      curRound.themes.push(t); E.sel = null; reopenBank = true; break;
    }
    case 'ed-bankswap': {
      if (!E.sel) return;
      const cellArr = pk.rounds[E.sel.r].themes[E.sel.t].questions, bt = pk.bank[+d.b];
      const cq = cellArr[E.sel.q], bq = bt.questions[+d.q];
      bq.value = cq.value; cq.value = 0; cq.diff = cq.diff || E.sel.q + 1;
      cellArr[E.sel.q] = bq; bt.questions[+d.q] = cq;
      closeModal(); break;
    }
    case 'ed-bankdel': {
      if (!confirm('Удалить вопрос из запаса?')) return;
      const bt = pk.bank[+d.b]; bt.questions.splice(+d.q, 1);
      if (!bt.questions.length) pk.bank.splice(+d.b, 1);
      reopenBank = true; break;
    }
    case 'ed-randtheme': {
      if (!curRound) return;
      const qs = [];
      for (let lvl = 1; lvl <= 5; lvl++) {
        const cands = [];
        pk.bank.forEach((t, ti) => t.questions.forEach((q, qi) => { if ((q.diff || qi + 1) === lvl && q.type !== 'closest') cands.push([ti, qi]); }));
        if (!cands.length) continue;
        const [ti, qi] = pick(cands), src = pk.bank[ti];
        const q = src.questions.splice(qi, 1)[0];
        q.value = 0; q.answer = q.answer + ' · из темы «' + src.name + '»';
        qs.push(q);
      }
      pk.bank = pk.bank.filter(t => t.questions.length);
      if (!qs.length) return alert('В запасе не осталось вопросов');
      curRound.themes.push({ name: 'Солянка', desc: 'Вопросы из разных тем', questions: qs });
      E.sel = null; closeModal(); sfx('mod'); break;
    }
    case 'ed-export': exportPack(); return;
    case 'ed-reset': if (!confirm('Вернуть стандартный пакет? Твои изменения пропадут (сначала можно сделать экспорт).')) return; S.pack = normalizePack(clone(window.DEFAULT_PACK)); E.tab = 'pack'; E.sel = null; break;
  }
  savePack(); renderEditor();
  if (reopenBank) bankModal();
}
document.addEventListener('paste', e => {
  if (S.screen !== 'editor' || !E.sel || E.tab[0] !== 'r') return;
  const f = [...(e.clipboardData ? e.clipboardData.files : [])].find(x => /^(image|audio|video)\//.test(x.type));
  if (!f) return;
  e.preventDefault();
  loadMediaFile(`rounds.${E.sel.r}.themes.${E.sel.t}.questions.${E.sel.q}.media`, f);
});

/* =================== старт =================== */
(async function init() {
  // ключ GitHub можно передать ссылкой …/screen#ghtoken=… — он сохранится только в этом браузере
  const m = location.hash.match(/ghtoken=([\w-]+)/);
  if (m) { try { localStorage.setItem('svoyak-ghtoken', m[1]); } catch { } history.replaceState(null, '', location.pathname + location.search); }
  const def = window.DEFAULT_PACK;
  let index = await DB.get('packs-index');
  if (!Array.isArray(index) || !index.length) {
    // переезд на «несколько игр»: прежний единственный пакет становится первой игрой
    const stored = await DB.get('pack');
    const oldBuiltin = stored && (stored.builtin || ((stored.version || 1) === 1 && stored.name === def.name));
    const useDefault = !stored || (oldBuiltin && (stored.version || 1) < def.version);
    const first = normalizePack(useDefault ? clone(def) : stored);
    if (useDefault) first.builtin = true;
    const id = 'g' + Date.now().toString(36);
    await DB.set('pack:' + id, first);
    index = [{ id, name: first.name, updated: Date.now() }];
    await DB.set('packs-index', index);
    LS.set('svoyak-current-pack', id);
  }
  GAMES.list = index;
  // финал из 12 сложных тем: где стоит прежний стандартный финал (его не меняли) — заменяем сами, один раз
  if (!LS.get('svoyak-final12', false)) {
    const old = (window.FINAL_OLD_NAMES || []).join('|');
    for (const g of index) {
      const pg = await DB.get('pack:' + g.id);
      if (pg && pg.final && Array.isArray(pg.final.themes) && pg.final.themes.map(t => t.name).join('|') === old) {
        pg.final.themes = clone(window.FINAL_HARD); await DB.set('pack:' + g.id, pg);
      }
    }
    LS.set('svoyak-final12', true);
  }
  let cur = LS.get('svoyak-current-pack', null);
  if (!index.some(g => g.id === cur)) cur = index[0].id;
  let p = await DB.get('pack:' + cur);
  if (p && p.builtin && (p.version || 1) < def.version) { p = clone(def); p.builtin = true; }
  S.pack = normalizePack(p || clone(def)); S.packId = cur;
  connectNet();
  requestAnimationFrame(pollGamepads);
  render();
  if (NET.online && ghToken()) regReady().catch(() => { });   // после перезапуска сервера сразу возвращаем ему хранилище
})();
