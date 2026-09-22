'use strict';

/**
 * MelchiorCent — a tiny zero-dependency server.
 *  - serves the static single page from ./public
 *  - stores questions in a JSON file (DATA_DIR/db.json)
 *  - pushes live updates to every open browser via Server-Sent Events
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const CENTS_PER_QUESTION = Number(process.env.CENTS_PER_QUESTION) || 10;
const COOLDOWN_MS = Number(process.env.COOLDOWN_MS ?? 3000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const MAX_NAME = 24;
const MAX_TEXT = 80;
const PAGE_SIZE = 40;
const ART_POSES = ['idle', 'happy', 'poke'];
const ART_EXTS = ['png', 'webp', 'svg'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

let db = { questions: [] };
let saveTimer = null;

function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (Array.isArray(parsed.questions)) db = parsed;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // Never start with an empty db on top of a corrupt one — that would wipe history.
      console.error(`Could not read ${DB_FILE}: ${err.message}`);
      process.exit(1);
    }
  }
  console.log(`Loaded ${db.questions.length} questions from ${DB_FILE}`);
}

function saveNow() {
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { saveNow(); } catch (err) { console.error('Save failed:', err); }
  }, 250);
}

/* ------------------------------------------------------------------ */
/* Domain                                                              */
/* ------------------------------------------------------------------ */

function clean(value, max) {
  return String(value ?? '')
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, '') // control chars + line/paragraph separators
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function computeStats() {
  const byName = new Map();
  let totalCents = 0;
  for (const q of db.questions) {
    totalCents += q.cents;
    const key = q.name.toLowerCase();
    const entry = byName.get(key) || { name: q.name, count: 0, cents: 0 };
    entry.count += 1;
    entry.cents += q.cents;
    entry.name = q.name; // latest spelling wins
    byName.set(key, entry);
  }
  const leaderboard = [...byName.values()]
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name))
    .slice(0, 10);
  return { totalCents, count: db.questions.length, askers: byName.size, leaderboard };
}

function meStats(name) {
  const key = String(name || '').toLowerCase();
  let count = 0;
  let cents = 0;
  if (key) {
    for (const q of db.questions) {
      if (q.name.toLowerCase() === key) { count += 1; cents += q.cents; }
    }
  }
  return { count, cents };
}

function pageQuestions(before, limit) {
  let end = db.questions.length;
  if (before) {
    while (end > 0 && db.questions[end - 1].ts >= before) end--;
  }
  const start = Math.max(0, end - limit);
  return { questions: db.questions.slice(start, end).reverse(), hasMore: start > 0 };
}

/** Custom artwork dropped into public/img (see docs/IMAGE_PROMPTS.md). */
function availableArt() {
  const art = {};
  for (const pose of ART_POSES) {
    for (const ext of ART_EXTS) {
      const file = `melchior-${pose}.${ext}`;
      if (fs.existsSync(path.join(PUBLIC_DIR, 'img', file))) { art[pose] = `img/${file}`; break; }
    }
  }
  return art;
}

/* ------------------------------------------------------------------ */
/* Live updates (Server-Sent Events)                                   */
/* ------------------------------------------------------------------ */

const clients = new Set();

function online() {
  const names = [...new Set([...clients].map((c) => c.name))];
  return { count: names.length, names: names.slice(0, 30) };
}

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.res.write(msg);
}

function openStream(req, res, url) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const client = { res, name: clean(url.searchParams.get('name'), MAX_NAME) || 'Mystery guest' };
  clients.add(client);
  broadcast('online', online());
  req.on('close', () => {
    clients.delete(client);
    broadcast('online', online());
  });
}

setInterval(() => {
  for (const c of clients) c.res.write(': ping\n\n');
}, 25_000).unref();

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': [
    "default-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
};

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readJson(req, limit = 8 * 1024) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
    return Promise.reject(new HttpError(415, 'Please send JSON.'));
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(new HttpError(413, 'That question is way too long.')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new HttpError(400, 'Invalid JSON.')); }
    });
    req.on('error', reject);
  });
}

function clientIp(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) {
    return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { throw new HttpError(400, 'Bad path.'); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(404, 'Not found.');

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 — Melchior could not find that. That will be 10 cents.');
      return;
    }
    const etag = `"${st.size.toString(36)}-${st.mtimeMs.toString(36)}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304); res.end(); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
      ETag: etag,
    });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

const lastPostByIp = new Map();
setInterval(() => {
  const cutoff = Date.now() - COOLDOWN_MS;
  for (const [ip, ts] of lastPostByIp) if (ts < cutoff) lastPostByIp.delete(ip);
}, 60_000).unref();

function getState(url) {
  const name = clean(url.searchParams.get('name'), MAX_NAME);
  return {
    config: { centsPerQuestion: CENTS_PER_QUESTION, maxName: MAX_NAME, maxText: MAX_TEXT, art: availableArt() },
    stats: computeStats(),
    me: meStats(name),
    online: online(),
    ...pageQuestions(null, PAGE_SIZE),
  };
}

async function createQuestion(req, res) {
  const body = await readJson(req);
  const name = clean(body.name, MAX_NAME);
  if (!name) throw new HttpError(400, 'Tell us your name first!');
  const text = clean(body.text, MAX_TEXT) || '🤫 a top-secret question';

  const ip = clientIp(req);
  const now = Date.now();
  if (now - (lastPostByIp.get(ip) || 0) < COOLDOWN_MS) {
    throw new HttpError(429, 'Whoa, easy! Melchior is still counting the last coin.');
  }
  lastPostByIp.set(ip, now);

  const prev = db.questions[db.questions.length - 1];
  const ts = prev && prev.ts >= now ? prev.ts + 1 : now; // keep timestamps strictly increasing for paging
  const question = { id: crypto.randomUUID(), name, text, ts, cents: CENTS_PER_QUESTION };
  db.questions.push(question);
  scheduleSave();

  const stats = computeStats();
  broadcast('question', { question, stats, nonce: clean(body.nonce, 64) });
  json(res, 201, { question, stats, me: meStats(name) });
}

function deleteQuestion(req, res, id) {
  if (!ADMIN_TOKEN || !safeEqual(req.headers['x-admin-token'] || '', ADMIN_TOKEN)) {
    throw new HttpError(403, 'Only the admin may un-ask questions.');
  }
  const idx = db.questions.findIndex((q) => q.id === id);
  if (idx === -1) throw new HttpError(404, 'No such question.');
  db.questions.splice(idx, 1);
  scheduleSave();
  const stats = computeStats();
  broadcast('delete', { id, stats });
  json(res, 200, { ok: true, stats });
}

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;

  try {
    if (pathname === '/healthz') return json(res, 200, { ok: true });

    if (pathname === '/api/state' && req.method === 'GET') return json(res, 200, getState(url));

    if (pathname === '/api/questions' && req.method === 'GET') {
      const before = Number(url.searchParams.get('before')) || null;
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || PAGE_SIZE, 1), 100);
      return json(res, 200, pageQuestions(before, limit));
    }

    if (pathname === '/api/questions' && req.method === 'POST') return await createQuestion(req, res);

    if (pathname.startsWith('/api/questions/') && req.method === 'DELETE') {
      return deleteQuestion(req, res, decodeURIComponent(pathname.slice('/api/questions/'.length)));
    }

    if (pathname === '/api/stream' && req.method === 'GET') return openStream(req, res, url);

    if (pathname.startsWith('/api/')) throw new HttpError(404, 'Unknown endpoint.');

    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, pathname);

    throw new HttpError(405, 'Method not allowed.');
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err);
    if (!res.headersSent) json(res, err.status || 500, { error: err.status ? err.message : 'Something broke. Ask Melchior (10¢).' });
  }
});

function shutdown(signal) {
  console.log(`${signal} received, saving and shutting down…`);
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try { saveNow(); } catch (err) { console.error('Final save failed:', err); }
  for (const c of clients) c.res.end();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

loadDb();
server.listen(PORT, () => {
  console.log(`🪙 MelchiorCent running at http://localhost:${PORT} (${CENTS_PER_QUESTION}¢ per question)`);
});
