/* Pennywise – server.js
   A tiny Node.js server (no packages to install).
   It serves the website, handles accounts (sign up / log in / log out)
   and saves each person's data in its own JSON file inside the data folder.
*/
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Render provides PORT automatically. Locally, the app defaults to port 3000.
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const ROOT = __dirname;
const DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const USERS = path.join(DIR, 'users.json');
const NAME_OK = /^[a-z0-9_]{3,20}$/;
const WEEK30 = 60 * 60 * 24 * 30;

const PUBLIC = new Set(['index.html', 'config.json', 'css/styles.css', 'js/app.js']);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

/* ---------- Files ---------- */
fs.mkdirSync(DIR, { recursive: true });
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; } };
function writeJson(file, obj) {                       // safe save: never leaves a half-written file
  fs.writeFileSync(file + '.tmp', JSON.stringify(obj, null, 2));
  fs.renameSync(file + '.tmp', file);
}
const dataFile = name => path.join(DIR, 'u_' + name + '.json');

/* ---------- Passwords and sessions ---------- */
const SECRET = process.env.SESSION_SECRET || (() => {
  const f = path.join(DIR, '.secret');
  try { return fs.readFileSync(f, 'utf8'); } catch (e) {}
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
})();
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const sign = text => crypto.createHmac('sha256', SECRET).update(text).digest('base64url');
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

function makeToken(name) {
  const body = Buffer.from(JSON.stringify({ u: name, exp: Date.now() + WEEK30 * 1000 })).toString('base64url');
  return body + '.' + sign(body);
}
function userFrom(req) {                              // returns the logged-in username, or null
  const m = /(?:^|;\s*)pw_session=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  const [body, sig] = m[1].split('.');
  if (!body || !sig || !same(sig, sign(body))) return null;
  try {
    const t = JSON.parse(Buffer.from(body, 'base64url').toString());
    return t.exp > Date.now() && NAME_OK.test(t.u) && readJson(USERS, {})[t.u] ? t.u : null;
  } catch (e) { return null; }
}
const cookie = (req, value, age) =>
  `pw_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}` +
  (req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '');

/* ---------- Slow down password guessing ---------- */
const fails = new Map();
const blocked = key => { const f = fails.get(key); return !!f && Date.now() - f.t < 15 * 60e3 && f.n >= 8; };
const failed = key => { const f = fails.get(key); fails.set(key, f && Date.now() - f.t < 15 * 60e3 ? { n: f.n + 1, t: f.t } : { n: 1, t: Date.now() }); };

/* ---------- Helpers ---------- */
function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(body);
}
const json = (res, code, obj, extra) => send(res, code, JSON.stringify(obj), undefined, extra);

function readBody(req, res, limit, done) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'JSON required' });
  let body = '', bytes = 0;
  req.on('data', c => { bytes += c.length; if (bytes > limit) req.destroy(); else body += c; });
  req.on('end', () => { try { done(JSON.parse(body)); } catch (e) { json(res, 400, { error: 'Invalid data' }); } });
}

/* ---------- API ---------- */
function api(req, res, pathname) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;

  if (pathname === '/api/me' && req.method === 'GET') return json(res, 200, { user: userFrom(req) });

  if (pathname === '/api/logout' && req.method === 'POST') return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) });

  if ((pathname === '/api/register' || pathname === '/api/login') && req.method === 'POST') {
    return readBody(req, res, 1e4, d => {
      const name = String(d.username || '').trim().toLowerCase(), pw = String(d.password || '');
      if (!NAME_OK.test(name)) return json(res, 400, { error: 'Username: 3 to 20 letters, numbers or _ only.' });
      const users = readJson(USERS, {});
      if (pathname === '/api/register') {
        if (blocked('reg|' + ip)) return json(res, 429, { error: 'Too many tries. Please wait a few minutes.' });
        if (pw.length < 6 || pw.length > 100) return json(res, 400, { error: 'Password must be 6 to 100 characters.' });
        if (users[name]) { failed('reg|' + ip); return json(res, 409, { error: 'That username is already taken.' }); }
        const salt = crypto.randomBytes(16).toString('hex');
        users[name] = { salt, hash: hashPw(pw, salt), created: new Date().toISOString() };
        writeJson(USERS, users);
      } else {
        if (blocked(name)) return json(res, 429, { error: 'Too many wrong tries. Please wait 15 minutes.' });
        const rec = users[name] || { salt: '00', hash: '' };
        const ok = !!users[name] && same(hashPw(pw, rec.salt), rec.hash);
        if (!ok) { failed(name); return json(res, 401, { error: 'Wrong username or password.' }); }
        fails.delete(name);
      }
      json(res, 200, { user: name }, { 'Set-Cookie': cookie(req, makeToken(name), WEEK30) });
    });
  }

  if (pathname === '/api/data') {                     // each person only sees their own data
    const name = userFrom(req);
    if (!name) return json(res, 401, { error: 'Please log in.' });
    if (req.method === 'GET') return json(res, 200, readJson(dataFile(name), { tx: [], goals: [] }));
    if (req.method === 'PUT') {
      return readBody(req, res, 5e6, d => {
        if (!Array.isArray(d.tx) || !Array.isArray(d.goals)) return json(res, 400, { error: 'Invalid data' });
        writeJson(dataFile(name), { tx: d.tx, goals: d.goals });
        json(res, 200, { ok: true });
      });
    }
  }
  json(res, 404, { error: 'Not found' });
}

/* ---------- Server ---------- */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return api(req, res, url.pathname);

  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);   // website files
  if (!PUBLIC.has(file)) return send(res, 404, 'Not found', 'text/plain');
  fs.readFile(path.join(ROOT, file), (err, buf) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, buf, TYPES[path.extname(file)]);
  });
});

// IMPORTANT: Bind to 0.0.0.0 so Render can detect the server.
server.listen(PORT, HOST, () => {
  console.log('===================================');
  console.log('       PENNYWISE APPLICATION');
  console.log('===================================');
  console.log(`Server listening on ${HOST}:${PORT}`);
  console.log(`Local access: http://localhost:${PORT}`);
  console.log('===================================');
});
