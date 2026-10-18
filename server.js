// Своя игра — сервер с комнатами. Без зависимостей: node server.js
// Экран игры (/screen) ведёт игру и создаёт комнату, игроки (/p) и ведущий (/host) подключаются по коду.
const http = require('http');
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

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  СВОЯ ИГРА запущена!\n');
  console.log(`  На этом компьютере:  http://localhost:${PORT}`);
  const urls = lanUrls();
  if (urls.length) { console.log('  В той же Wi-Fi сети:'); for (const u of urls) console.log(`     ${u}`); }
  console.log('\n  Не закрывай это окно, пока идёт игра.\n');
});
