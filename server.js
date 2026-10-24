// Своя игра — сервер с комнатами. Без зависимостей: node server.js
// Экран игры (/screen) ведёт игру и создаёт комнату, игроки (/p) и ведущий (/host) подключаются по коду.
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT) || 3000;
const PUB = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

/* комнаты: code -> { key, hosts, panels, players, lastState, pin, lastHostState, media, touched } */
const rooms = new Map();
const roomCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
function newRoom(code, key) {
  const r = { code, key, hosts: new Set(), panels: new Set(), players: new Map(), lastState: null, pin: null, lastHostState: null, media: new Map(), touched: Date.now() };
  rooms.set(code, r);
  return r;
}
const conns = r => r.hosts.size + r.panels.size + [...r.players.values()].reduce((s, p) => s + p.conns.size, 0);
setInterval(() => {   // пустые комнаты живут час
  for (const [code, r] of rooms) if (!conns(r) && Date.now() - r.touched > 3600e3) rooms.delete(code);
}, 600e3);

/* ---------- реестр тем и вопросов: общий для всех устройств ----------
   Хранится в data/registry.json, а если заданы GITHUB_TOKEN и GITHUB_REPO — ещё и в ветке GitHub
   (бесплатный Render стирает файлы при перезапуске, GitHub — нет). */
const REG_FILE = path.join(__dirname, 'data', 'registry.json');
const GH = { token: process.env.GITHUB_TOKEN || '', repo: process.env.GITHUB_REPO || 'kutlugildinartem-dotcom/svoya-igra', branch: process.env.GITHUB_BRANCH || 'registry', file: 'registry.json', sha: null, ok: false };
let registry = { themes: [], questions: [], seeded: false };
const regStorage = () => (GH.ok ? 'github' : 'file');

async function gh(method, url, body, raw) {
  return fetch('https://api.github.com' + url, {
    method,
    headers: { Authorization: 'Bearer ' + GH.token, 'User-Agent': 'svoya-igra', Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function ghEnsureBranch() {
  if ((await gh('GET', `/repos/${GH.repo}/branches/${GH.branch}`)).ok) return;
  const main = await (await gh('GET', `/repos/${GH.repo}/git/ref/heads/main`)).json();
  const r = await gh('POST', `/repos/${GH.repo}/git/refs`, { ref: 'refs/heads/' + GH.branch, sha: main.object.sha });
  if (!r.ok) throw new Error('не удалось создать ветку ' + GH.branch + ': ' + r.status);
}
async function loadFromGithub() {   // null — в ветке ещё нет файла
  await ghEnsureBranch();
  const url = `/repos/${GH.repo}/contents/${GH.file}?ref=${GH.branch}`;
  const meta = await gh('GET', url);
  if (meta.status === 404) return null;
  if (!meta.ok) throw new Error('GitHub ответил ' + meta.status);
  GH.sha = (await meta.json()).sha;
  return JSON.parse(await (await gh('GET', url, null, true)).text());
}
async function loadRegistry() {
  let loaded = null;
  if (GH.token && GH.repo) {
    try { loaded = await loadFromGithub(); GH.ok = true; console.log('  Реестр: GitHub ' + GH.repo + ' (ветка ' + GH.branch + ')'); }
    catch (e) { console.warn('  Реестр: GitHub недоступен —', e.message); }
  }
  if (!loaded && GH.repo) {   // без ключа читаем публичную копию — реестр не будет пустым после перезапуска
    try {
      const r = await fetch(`https://raw.githubusercontent.com/${GH.repo}/${GH.branch}/${GH.file}?t=${Date.now()}`, { signal: AbortSignal.timeout(6000) });
      if (r.ok) { loaded = await r.json(); console.log('  Реестр загружен из GitHub (только чтение, ждём ключ для записи)'); }
    } catch (e) { console.warn('  Реестр: не удалось прочитать GitHub —', e.message); }
  }
  if (!loaded) { try { loaded = JSON.parse(fs.readFileSync(REG_FILE, 'utf8')); } catch { } }
  if (loaded && Array.isArray(loaded.themes)) registry = Object.assign({ themes: [], questions: [], seeded: false }, loaded);
}
/* ключ GitHub может прийти с экрана игры (хранится в браузере ведущего), если его нет в настройках сервера */
let connecting = null;
async function connectGithub(token) {
  token = String(token || '').trim();
  if (!token) throw new Error('Пустой ключ');
  if (GH.ok && GH.token === token) return;
  const r = await fetch('https://api.github.com/repos/' + GH.repo, { headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'svoya-igra' } });
  if (!r.ok) throw new Error('GitHub не принял ключ (' + r.status + ')');
  if (!((await r.json()).permissions || {}).push) throw new Error('Ключ не даёт права записи в ' + GH.repo);
  const temp = registry, prevToken = GH.token;
  GH.token = token;
  try {
    const loaded = await loadFromGithub();
    if (loaded && Array.isArray(loaded.themes)) {
      registry = Object.assign({ themes: [], questions: [], seeded: false }, loaded);
      regApply(registry, { op: 'import', themes: temp.themes, questions: temp.questions });   // ничего не теряем из временного реестра
      registry.seeded = registry.seeded || temp.seeded;
    }
    GH.ok = true;
    console.log('  Реестр подключён к GitHub ' + GH.repo);
    saveRegistry();
  } catch (e) { GH.token = prevToken; throw e; }
}
let regTimer = null, regChain = Promise.resolve();
function saveRegistry() {
  clearTimeout(regTimer);
  regTimer = setTimeout(() => { regChain = regChain.then(persistRegistry).catch(e => console.warn('Реестр не сохранён:', e.message)); }, 2500);
}
async function persistRegistry() {
  const txt = JSON.stringify(registry);
  try { fs.mkdirSync(path.dirname(REG_FILE), { recursive: true }); fs.writeFileSync(REG_FILE, txt); } catch { }
  if (!GH.ok) return;
  const put = () => gh('PUT', `/repos/${GH.repo}/contents/${GH.file}`, { message: 'Реестр: ' + registry.themes.length + ' тем, ' + registry.questions.length + ' вопросов', content: Buffer.from(txt).toString('base64'), branch: GH.branch, sha: GH.sha || undefined });
  let r = await put();
  if (r.status === 409 || r.status === 422) {   // файл поменялся — берём свежий sha и повторяем
    const m = await gh('GET', `/repos/${GH.repo}/contents/${GH.file}?ref=${GH.branch}`);
    GH.sha = m.ok ? (await m.json()).sha : null;
    r = await put();
  }
  if (!r.ok) throw new Error('GitHub ответил ' + r.status);
  GH.sha = (await r.json()).content.sha;
}
function regApply(reg, b) {
  const now = Date.now(), nid = () => Math.random().toString(36).slice(2, 10);
  const same = (a, c) => String(a || '').trim().toLowerCase() === String(c || '').trim().toLowerCase();
  switch (b.op) {
    case 'seed':
      if (!reg.seeded) { (b.themes || []).forEach(t => reg.themes.push(Object.assign({}, t, { id: nid(), saved: now }))); reg.seeded = true; }
      return 'ok';
    case 'addTheme': {
      const t = b.theme;
      if (!t || !String(t.name || '').trim()) throw new Error('У темы нет названия');
      const i = reg.themes.findIndex(x => same(x.name, t.name));
      if (i >= 0 && !b.replace) return 'exists';
      const item = Object.assign({}, t, { id: i >= 0 ? reg.themes[i].id : nid(), saved: now });
      if (i >= 0) reg.themes[i] = item; else reg.themes.unshift(item);
      return i >= 0 ? 'replaced' : 'ok';
    }
    case 'addQuestion': {
      const q = b.question;
      if (!q || !(String(q.text || '').trim() || (q.media && q.media.src))) throw new Error('Пустой вопрос');
      if (reg.questions.some(x => same(x.text, q.text) && same(x.answer, q.answer))) return 'exists';
      reg.questions.unshift(Object.assign({}, q, { id: nid(), theme: b.theme || '', saved: now }));
      return 'ok';
    }
    case 'delTheme': reg.themes = reg.themes.filter(t => t.id !== b.id); return 'ok';
    case 'delQuestion': reg.questions = reg.questions.filter(q => q.id !== b.id); return 'ok';
    case 'import':
      (b.themes || []).forEach(t => { if (!reg.themes.some(x => same(x.name, t.name))) reg.themes.push(Object.assign({}, t, { id: nid(), saved: now })); });
      (b.questions || []).forEach(q => { if (!reg.questions.some(x => same(x.text, q.text) && same(x.answer, q.answer))) reg.questions.push(Object.assign({}, q, { id: nid(), saved: now })); });
      return 'ok';
  }
  throw new Error('Неизвестная операция');
}
const regReply = (res, code, result) => json(res, code, { result, themes: registry.themes, questions: registry.questions, seeded: registry.seeded, storage: regStorage(), persistent: GH.ok });

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}`);
  }
  return out;
}
function openSse(res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 1500\n\n');
}
const send = (res, obj) => res.write('data: ' + JSON.stringify(obj) + '\n\n');
const toHosts = (r, obj) => { for (const h of r.hosts) send(h, obj); };
const toPlayers = (r, obj) => { for (const p of r.players.values()) for (const c of p.conns) send(c, obj); };

setInterval(() => {
  for (const r of rooms.values()) {
    for (const h of r.hosts) h.write(':\n\n');
    for (const h of r.panels) h.write(':\n\n');
    for (const p of r.players.values()) for (const c of p.conns) c.write(':\n\n');
  }
}, 15000);

function readBody(req, limit, cb) {
  let data = '', size = 0;
  req.on('data', ch => { size += ch.length; if (size > limit) { req.destroy(); return; } data += ch; });
  req.on('end', () => { try { cb(JSON.parse(data || '{}')); } catch { cb(null); } });
}
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://local');
  const p = url.pathname, q = url.searchParams;

  if (p === '/events') {
    const code = roomCode(q.get('room')), role = q.get('role');
    openSse(res);
    let r = rooms.get(code);
    if (role === 'host') {
      const key = String(q.get('key') || '');
      if (!code || !key) return res.end();
      if (!r) r = newRoom(code, key);
      if (r.key !== key) { send(res, { type: 'roomtaken' }); return res.end(); }
      r.hosts.add(res); r.touched = Date.now();
      for (const [id, pl] of r.players) send(res, { type: 'join', id, name: pl.name });
      send(res, { type: 'panels', n: r.panels.size });
      req.on('close', () => { r.hosts.delete(res); r.touched = Date.now(); });
      return;
    }
    if (!r) { send(res, { type: 'noroom' }); return res.end(); }
    if (role === 'panel') {
      if (!r.pin || q.get('pin') !== r.pin) { send(res, { type: 'badpin' }); return res.end(); }
      r.panels.add(res);
      if (r.lastHostState) send(res, { type: 'hoststate', state: r.lastHostState });
      toHosts(r, { type: 'panels', n: r.panels.size });
      req.on('close', () => { r.panels.delete(res); toHosts(r, { type: 'panels', n: r.panels.size }); });
      return;
    }
    const id = (q.get('id') || '').slice(0, 40), name = (q.get('name') || 'Игрок').slice(0, 24);
    if (!id) return res.end();
    let pl = r.players.get(id);
    if (!pl) { pl = { name, conns: new Set() }; r.players.set(id, pl); }
    pl.name = name; pl.conns.add(res); r.touched = Date.now();
    toHosts(r, { type: 'join', id, name });
    if (r.lastState) send(res, { type: 'state', state: r.lastState });
    req.on('close', () => {
      pl.conns.delete(res); r.touched = Date.now();
      setTimeout(() => { if (!pl.conns.size && r.players.get(id) === pl) { r.players.delete(id); toHosts(r, { type: 'leave', id }); } }, 10000);
    });
    return;
  }

  if (p === '/api/registry') {
    if (req.method !== 'POST') return regReply(res, 200, null);
    return readBody(req, 40e6, b => {
      if (!b) return json(res, 400, { error: 'Слишком большой или битый запрос' });
      if (b.op === 'connect') {
        connecting = (connecting || Promise.resolve()).then(() => connectGithub(b.token));
        return connecting.then(() => regReply(res, 200, 'connected'), e => json(res, 400, { error: e.message })).finally(() => { connecting = null; });
      }
      try { const result = regApply(registry, b); if (result !== 'exists') saveRegistry(); regReply(res, 200, result); }
      catch (e) { json(res, 400, { error: e.message }); }
    });
  }

  if (req.method === 'POST' && p.startsWith('/api/')) {
    const limit = p === '/api/media' ? 60e6 : 1e6;
    return readBody(req, limit, obj => {
      const r = obj && rooms.get(roomCode(obj.room));
      if (!r) return json(res, 404, { error: 'noroom' });
      r.touched = Date.now();
      const isHost = obj.key && obj.key === r.key;
      switch (p) {
        case '/api/state':
          if (!isHost) return json(res, 403, {});
          r.lastState = obj.state; toPlayers(r, { type: 'state', state: obj.state });
          return json(res, 200, {});
        case '/api/hoststate':
          if (!isHost) return json(res, 403, {});
          if (obj.pin && r.pin && obj.pin !== r.pin) for (const c of r.panels) { send(c, { type: 'badpin' }); c.end(); }
          r.pin = String(obj.pin || ''); r.lastHostState = obj.state;
          for (const c of r.panels) send(c, { type: 'hoststate', state: obj.state });
          return json(res, 200, {});
        case '/api/media':
          if (!isHost) return json(res, 403, {});
          r.media.set(String(obj.id), obj.media);
          if (r.media.size > 30) r.media.delete(r.media.keys().next().value);
          return json(res, 200, {});
        case '/api/cmd':
          if (!r.pin || obj.pin !== r.pin || !obj.act) return json(res, 403, {});
          toHosts(r, { type: 'cmd', act: String(obj.act), d: obj.d || {} });
          return json(res, 200, {});
        case '/api/player':
          if (!obj.id) return json(res, 400, {});
          obj.t = Date.now(); delete obj.room; toHosts(r, obj);
          return json(res, 200, {});
      }
      json(res, 404, {});
    });
  }

  if (p === '/api/media') {
    const r = rooms.get(roomCode(q.get('room'))), m = r && r.media.get(String(q.get('id')));
    return m ? json(res, 200, m) : json(res, 404, {});
  }
  if (p === '/api/room') return json(res, 200, { exists: rooms.has(roomCode(q.get('code'))) });
  if (p === '/api/time') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end('{"s":' + Date.now() + '}'); }
  if (p === '/api/info') return json(res, 200, { port: PORT, urls: lanUrls(), rooms: rooms.size });

  // статика
  const routes = { '/': '/landing.html', '/screen': '/index.html', '/p': '/player.html', '/host': '/host.html' };
  let file = routes[p.replace(/\/$/, '') || '/'] || decodeURIComponent(p);
  const full = path.normalize(path.join(PUB, file));
  if (!full.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
});

/* ---------- WebSocket для телефонов: нажатие идёт по открытому каналу, без нового HTTP-запроса ---------- */
function wsFrame(data, op = 1) {
  const p = Buffer.from(data);
  let h;
  if (p.length < 126) h = Buffer.from([0x80 | op, p.length]);
  else if (p.length < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(p.length, 2); }
  else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(p.length), 2); }
  return Buffer.concat([h, p]);
}
function wsParse(b) {
  if (b.length < 2) return null;
  const op = b[0] & 15, masked = b[1] & 128;
  let len = b[1] & 127, off = 2;
  if (len === 126) { if (b.length < 4) return null; len = b.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (b.length < 10) return null; len = Number(b.readBigUInt64BE(2)); off = 10; }
  const maskAt = off; if (masked) off += 4;
  if (b.length < off + len) return null;
  const payload = Buffer.alloc(len);
  for (let i = 0; i < len; i++) payload[i] = masked ? b[off + i] ^ b[maskAt + (i & 3)] : b[off + i];
  return { op, payload, size: off + len };
}
server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://local'), key = req.headers['sec-websocket-key'];
  if (url.pathname !== '/ws' || !key) return socket.destroy();
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  const code = roomCode(url.searchParams.get('room')), id = (url.searchParams.get('id') || '').slice(0, 40);
  let buf = Buffer.alloc(0);
  const onMessage = txt => {
    let m; try { m = JSON.parse(txt); } catch { return; }
    if (m.ping != null) return socket.write(wsFrame('{"pong":' + Number(m.ping) + ',"s":' + Date.now() + '}'));   // сверка часов
    const r = rooms.get(code);
    if (!r || !id) return;
    r.touched = Date.now(); m.id = id; m.t = Date.now(); delete m.room;
    toHosts(r, m);
  };
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    let f;
    while ((f = wsParse(buf))) {
      buf = buf.subarray(f.size);
      if (f.op === 8) { socket.end(wsFrame('', 8)); return; }
      if (f.op === 9) socket.write(wsFrame(f.payload, 10));
      else if (f.op === 1) onMessage(f.payload.toString('utf8'));
    }
  });
  socket.on('error', () => { });
  const ka = setInterval(() => { if (!socket.destroyed) socket.write(wsFrame('', 9)); }, 20000);
  socket.on('close', () => clearInterval(ka));
});

loadRegistry().finally(() => server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  СВОЯ ИГРА запущена!\n');
  console.log(`  На этом компьютере:  http://localhost:${PORT}`);
  const urls = lanUrls();
  if (urls.length) { console.log('  В той же Wi-Fi сети:'); for (const u of urls) console.log(`     ${u}`); }
  console.log('  Реестр: ' + registry.themes.length + ' тем, ' + registry.questions.length + ' вопросов, хранилище — ' + (GH.ok ? 'GitHub' : 'файл data/registry.json'));
  console.log('\n  Не закрывай это окно, пока идёт игра.\n');
}));
