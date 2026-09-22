/* =====================================================================
   MelchiorCent — client
   ===================================================================== */

const $ = (sel) => document.querySelector(sel);

/** What Melchior can afford as the fund grows. Amounts in cents. */
const GOALS = [
  { cents: 0, emoji: '🪫', name: 'Broke intern' },
  { cents: 100, emoji: '☕', name: 'Coffee' },
  { cents: 300, emoji: '🧇', name: 'Stroopwafel stash' },
  { cents: 500, emoji: '🥙', name: 'Döner kebab' },
  { cents: 1000, emoji: '🍕', name: 'Pizza night' },
  { cents: 2500, emoji: '🦆', name: 'Rubber duck army' },
  { cents: 5000, emoji: '🎧', name: 'Noise-cancelling headphones' },
  { cents: 10000, emoji: '⌨️', name: 'Mechanical keyboard' },
  { cents: 25000, emoji: '🪑', name: 'Gaming chair' },
  { cents: 50000, emoji: '✈️', name: 'Weekend in Barcelona' },
  { cents: 100000, emoji: '🏝️', name: 'Early retirement' },
];

const LINES = {
  poke: [
    'Ask away! That’ll be 10 cents. 🪙',
    'Have you tried turning it off and on again?',
    'It’s DNS. It’s always DNS.',
    'Ouch! Poking is free. For now.',
    'Works on my machine™',
    'Did you check the logs? …Did you?',
    'I’m not a search engine. I’m a paid search engine.',
    'Is this a question or a feature request?',
    'git blame says… it was you.',
    'Hmm, have you read the README?',
  ],
  pokeSpam: [
    'OK, stop poking. That one costs extra.',
    'I’m billing you for emotional damage.',
    'HR has been notified. 📋',
  ],
  thanks: [
    'Ka-ching! 🤑',
    'Pleasure doing business!',
    'Another coin for the snack fund!',
    'That’s what I call a good question.',
    'Cha-ching! Next!',
    'Money well spent, honestly.',
    'My wallet thanks you.',
  ],
  idle: [
    'Any questions? 👀',
    'Silence is golden. Questions are 10 cents.',
    '*polishes glasses*',
    'I can hear you thinking…',
    'Standing by. Wallet open.',
  ],
  toasts: [
    'Melchior’s eyes just turned into euros.',
    'Coin accepted. Knowledge dispensed.',
    'Your curiosity is fully funded.',
    'Receipt: 1× wisdom, 10¢.',
    'Achievement unlocked: asked a question.',
    'Melchior is now 10¢ richer and 0% more patient.',
  ],
};

const EXAMPLE_PLACEHOLDERS = [
  'e.g. “why is the Docker container on fire?”',
  'e.g. “what’s the Wi-Fi password again?”',
  'e.g. “can you fix my printer?”',
  'e.g. “is it ok to push to main on Friday?”',
  'e.g. “what does this regex do?”',
  'e.g. “how do I exit vim?”',
];

const state = {
  name: '',
  config: { centsPerQuestion: 10, maxName: 24, maxText: 80, art: {} },
  stats: { totalCents: 0, count: 0, askers: 0, leaderboard: [] },
  me: { count: 0, cents: 0 },
  questions: [],
  seen: new Set(),
  myNonces: new Set(),
  hasMore: false,
  loaded: false,
  muted: false,
  busy: false,
  stream: null,
  streamWasOpen: false,
  pokes: [],
};

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

const money = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
const fmtMoney = (cents) => money.format(cents / 100);
const fmtPrice = (cents) => (cents < 100 ? `${cents}¢` : fmtMoney(cents));
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => min + Math.random() * (max - min);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

function timeAgo(ts) {
  const diff = (ts - Date.now()) / 1000;
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, secs] of units) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return 'just now';
}

function hueFor(name) {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 360;
}

function avatarEl(name, tag = 'span') {
  const el = document.createElement(tag);
  el.className = 'avatar';
  el.textContent = [...name.trim()][0]?.toUpperCase() || '?';
  el.style.setProperty('--hue', hueFor(name));
  el.setAttribute('aria-hidden', 'true');
  return el;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function storageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } }

function readCookie(key) {
  const row = document.cookie.split('; ').find((r) => r.startsWith(`${key}=`));
  if (!row) return '';
  try { return decodeURIComponent(row.slice(key.length + 1)); } catch { return ''; }
}

function loadName() {
  return (readCookie('mc_name') || storageGet('mc_name') || '').trim();
}

function saveName(name) {
  document.cookie = `mc_name=${encodeURIComponent(name)}; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Lax`;
  storageSet('mc_name', name);
}

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Ask Melchior?');
  return data;
}

function levelFor(cents) {
  let idx = 0;
  for (let i = 0; i < GOALS.length; i++) if (cents >= GOALS[i].cents) idx = i;
  return idx;
}

/* ------------------------------------------------------------------ */
/* Sound (tiny WebAudio synth, no files)                               */
/* ------------------------------------------------------------------ */

let audioCtx = null;

function tone(freq, start, dur, type = 'square', vol = 0.08) {
  const ctx = audioCtx;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = ctx.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function play(kind) {
  if (state.muted) return;
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (kind === 'coin') { tone(987.77, 0, 0.09); tone(1318.51, 0.08, 0.4); }
    if (kind === 'remote') { tone(1318.51, 0, 0.12, 'triangle', 0.06); tone(1760, 0.1, 0.25, 'triangle', 0.06); }
    if (kind === 'poke') { tone(220, 0, 0.12, 'sawtooth', 0.04); tone(180, 0.06, 0.12, 'sawtooth', 0.04); }
    if (kind === 'error') { tone(200, 0, 0.18, 'square', 0.05); tone(150, 0.16, 0.25, 'square', 0.05); }
    if (kind === 'levelup') {
      [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.11, 0.2, 'square', 0.06));
    }
  } catch { /* audio not available */ }
}

/* ------------------------------------------------------------------ */
/* Melchior + FX                                                       */
/* ------------------------------------------------------------------ */

const melchior = $('#melchior');
const bubble = $('#bubble');
const fx = $('#fx');
let bubbleTimer = null;
let moodTimer = null;

function say(text, ms = 3200) {
  bubble.textContent = text;
  bubble.classList.add('show');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubble.classList.remove('show'), ms);
}

function setMood(mood, ms) {
  melchior.classList.remove('is-happy', 'is-poked');
  void melchior.offsetWidth; // restart CSS animations
  if (mood) melchior.classList.add(`is-${mood}`);
  const art = state.config.art;
  const img = $('#melchior-art');
  if (!img.hidden) img.src = (mood && art[mood]) || art.idle;
  clearTimeout(moodTimer);
  if (mood) moodTimer = setTimeout(() => setMood(null), ms);
}

function center(node) {
  const r = node.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function flyCoin(from, to, { delay = 0, duration = 750 } = {}) {
  const coin = el('span', 'coin');
  fx.append(coin);
  const half = 22;
  const peak = Math.min(from.y, to.y) - rand(90, 160);
  const anim = coin.animate([
    { transform: `translate(${from.x - half}px, ${from.y - half}px) scale(.6) rotateY(0deg)` },
    { transform: `translate(${(from.x + to.x) / 2 - half}px, ${peak}px) scale(1.15) rotateY(540deg)`, offset: 0.5 },
    { transform: `translate(${to.x - half}px, ${to.y - half}px) scale(.5) rotateY(1080deg)` },
  ], { duration: reducedMotion ? 1 : duration, delay, easing: 'cubic-bezier(.35,.1,.45,1)', fill: 'both' });
  return anim.finished.then(() => coin.remove());
}

function burst(at, count = 14) {
  if (reducedMotion) return;
  const colors = ['#e3cd57', '#09614e', '#005c8a', '#ffffff', '#f4e694'];
  for (let i = 0; i < count; i++) {
    const s = el('span', 'spark');
    s.style.background = pick(colors);
    fx.append(s);
    const angle = rand(0, Math.PI * 2);
    const dist = rand(50, 140);
    s.animate([
      { transform: `translate(${at.x}px, ${at.y}px) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${at.x + Math.cos(angle) * dist}px, ${at.y + Math.sin(angle) * dist + 60}px) rotate(${rand(180, 720)}deg)`, opacity: 0 },
    ], { duration: rand(600, 1000), easing: 'cubic-bezier(.2,.8,.4,1)', fill: 'forwards' }).finished.then(() => s.remove());
  }
}

function floatText(at, text) {
  const t = el('span', 'plus', text);
  fx.append(t);
  t.animate([
    { transform: `translate(${at.x - 30}px, ${at.y - 20}px) scale(.6)`, opacity: 0 },
    { transform: `translate(${at.x - 30}px, ${at.y - 60}px) scale(1.1)`, opacity: 1, offset: 0.25 },
    { transform: `translate(${at.x - 30}px, ${at.y - 120}px) scale(1)`, opacity: 0 },
  ], { duration: reducedMotion ? 1 : 1300, easing: 'ease-out', fill: 'forwards' }).finished.then(() => t.remove());
}

function confetti(amount = 80) {
  if (reducedMotion) return;
  const colors = ['#e3cd57', '#09614e', '#005c8a', '#ffffff', '#e0584a'];
  for (let i = 0; i < amount; i++) {
    const s = el('span', 'spark');
    s.style.background = pick(colors);
    fx.append(s);
    const x = rand(0, window.innerWidth);
    s.animate([
      { transform: `translate(${x}px, -20px) rotate(0deg)` },
      { transform: `translate(${x + rand(-120, 120)}px, ${window.innerHeight + 40}px) rotate(${rand(360, 1440)}deg)` },
    ], { duration: rand(1800, 3200), delay: rand(0, 600), easing: 'cubic-bezier(.25,.4,.5,1)', fill: 'both' })
      .finished.then(() => s.remove());
  }
}

function jiggleJar() {
  const jar = $('#jar');
  jar.classList.remove('jiggle');
  void jar.offsetWidth;
  jar.classList.add('jiggle');
}

function bumpStat(id) {
  const node = $(id).closest('.hud-stat');
  node.classList.remove('bump');
  void node.offsetWidth;
  node.classList.add('bump');
}

function toast(message, { type = '', coin = true } = {}) {
  const t = el('div', `toast ${type}`);
  if (coin) t.append(el('span', 'coin'));
  t.append(el('span', '', message));
  $('#toasts').append(t);
  const all = $('#toasts').children;
  if (all.length > 4) all[0].remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 4200);
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

const counters = new Map();

function countTo(node, value, format) {
  const from = counters.get(node) ?? value;
  counters.set(node, value);
  if (from === value || reducedMotion) { node.textContent = format(value); return; }
  const start = performance.now();
  const dur = 900;
  const step = (now) => {
    const p = Math.min((now - start) / dur, 1);
    const eased = 1 - (1 - p) ** 3;
    node.textContent = format(Math.round(from + (value - from) * eased));
    if (p < 1 && counters.get(node) === value) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderPlayer() {
  $('#player-name').textContent = state.name || 'Player 1';
  $('#player-avatar').replaceWith(Object.assign(avatarEl(state.name || '?'), { id: 'player-avatar' }));
}

function renderConfig() {
  const price = fmtPrice(state.config.centsPerQuestion);
  $('#pay-label').textContent = `Pay ${price}`;
  $('#footer-rate').textContent = price;
  document.querySelectorAll('.price-label').forEach((n) => { n.textContent = price; });
  $('#question').maxLength = state.config.maxText;
  $('#name-input').maxLength = state.config.maxName;
  $('#char-count').textContent = `${$('#question').value.length}/${state.config.maxText}`;

  const art = state.config.art || {};
  if (art.idle) {
    const img = $('#melchior-art');
    img.src = art.idle;
    img.hidden = false;
    $('#melchior-svg').style.display = 'none';
  }
}

function renderStats({ celebrate = false } = {}) {
  const { totalCents, count } = state.stats;
  countTo($('#stat-total'), totalCents, fmtMoney);
  countTo($('#stat-count'), count, (n) => n.toLocaleString('nl-NL'));

  const idx = levelFor(totalCents);
  const now = GOALS[idx];
  const next = GOALS[idx + 1];
  $('#level-num').textContent = idx + 1;
  $('#level-now').textContent = `${now.emoji} ${now.name}`;

  let pct = 100;
  if (next) {
    pct = ((totalCents - now.cents) / (next.cents - now.cents)) * 100;
    $('#level-next').textContent = `next: ${next.emoji} ${next.name}`;
    $('#level-foot').textContent = `${fmtMoney(totalCents)} / ${fmtMoney(next.cents)}`;
  } else {
    $('#level-next').textContent = 'MAX LEVEL 🎉';
    $('#level-foot').textContent = `${fmtMoney(totalCents)} — Melchior has won capitalism`;
  }
  pct = Math.max(0, Math.min(100, pct));
  $('#level-fill').style.width = `${pct}%`;
  $('#level-fill').toggleAttribute('data-empty', pct === 0);
  $('#level-bar').setAttribute('aria-valuenow', Math.round(pct));
  $('#jar-fill').style.height = `${Math.max(pct, totalCents > 0 ? 6 : 0)}%`;

  if (celebrate && state.level != null && idx > state.level) levelUp(now);
  state.level = idx;

  renderLeaderboard();
}

function renderMe() {
  const { count, cents } = state.me;
  const node = $('#me');
  node.replaceChildren();
  if (!count) {
    node.append('You haven’t paid Melchior anything yet. ', el('b', '', 'Suspicious.'));
    return;
  }
  const quip = count >= 50 ? 'Basically his employer now.' : count >= 20 ? 'Melchior knows your footsteps.' : count >= 5 ? 'A loyal customer!' : 'Welcome to the club.';
  node.append('You have paid ', el('b', '', fmtMoney(cents)), ' in ', el('b', '', String(count)), count === 1 ? ' question. ' : ' questions. ', quip);
}

function timelineItem(q, isNew) {
  const li = el('li', 'tl-item');
  li.dataset.id = q.id;
  if (state.name && sameName(q.name, state.name)) li.classList.add('is-me');
  if (isNew) li.classList.add('is-new');
  li.append(avatarEl(q.name));
  const body = el('div', 'tl-body');
  const top = el('div', 'tl-top');
  top.append(el('span', 'tl-name', q.name), el('span', 'tl-cents', `+${fmtPrice(q.cents)}`));
  const time = el('time', 'tl-time', timeAgo(q.ts));
  time.dateTime = new Date(q.ts).toISOString();
  time.title = new Date(q.ts).toLocaleString();
  time.dataset.ts = q.ts;
  top.append(time);
  body.append(top, el('p', 'tl-text', q.text));
  li.append(body);
  return li;
}

function renderTimeline() {
  const list = $('#timeline');
  list.replaceChildren(...state.questions.map((q) => timelineItem(q, false)));
  $('#timeline-empty').hidden = state.questions.length > 0;
  $('#more-btn').hidden = !state.hasMore;
}

function addQuestion(q, animate) {
  if (state.seen.has(q.id)) return false;
  state.seen.add(q.id);
  state.questions.unshift(q);
  const list = $('#timeline');
  list.prepend(timelineItem(q, animate));
  list.scrollTo({ top: 0, behavior: 'smooth' });
  $('#timeline-empty').hidden = true;
  return true;
}

function renderLeaderboard() {
  const list = $('#leaderboard');
  const medals = ['🥇', '🥈', '🥉'];
  list.replaceChildren(...state.stats.leaderboard.map((p, i) => {
    const li = el('li', 'lb-item');
    if (state.name && sameName(p.name, state.name)) li.classList.add('is-me');
    li.append(
      el('span', 'lb-rank', medals[i] || String(i + 1)),
      avatarEl(p.name),
      el('span', 'lb-name', p.name),
      el('span', 'lb-count', `${p.count}×`),
      el('span', 'lb-cents', fmtMoney(p.cents)),
    );
    return li;
  }));
  $('#leaders-empty').hidden = state.stats.leaderboard.length > 0;
}

function renderOnline({ count, names }) {
  countTo($('#stat-online'), count, String);
  const list = $('#online-list');
  list.replaceChildren(...names.map((name) => {
    const li = el('li');
    li.append(avatarEl(name), el('span', '', sameName(name, state.name) ? `${name} (you)` : name));
    return li;
  }));
}

function refreshTimes() {
  document.querySelectorAll('time[data-ts]').forEach((t) => { t.textContent = timeAgo(Number(t.dataset.ts)); });
}

function levelUp(goal) {
  $('#levelup-emoji').textContent = goal.emoji;
  $('#levelup-text').textContent = `Melchior can now afford: ${goal.name}!`;
  const overlay = $('#levelup');
  overlay.hidden = false;
  play('levelup');
  confetti(120);
  const close = () => { overlay.hidden = true; overlay.removeEventListener('click', close); };
  overlay.addEventListener('click', close);
  setTimeout(close, 3200);
}

/* ------------------------------------------------------------------ */
/* Data flow                                                           */
/* ------------------------------------------------------------------ */

function applyStats(stats) {
  state.stats = stats;
  renderStats({ celebrate: true });
}

async function refreshState() {
  const data = await api(`/api/state?name=${encodeURIComponent(state.name)}`);
  state.config = data.config;
  state.stats = data.stats;
  state.me = data.me;
  state.questions = data.questions;
  state.hasMore = data.hasMore;
  state.seen = new Set(data.questions.map((q) => q.id));
  renderConfig();
  renderStats({ celebrate: state.loaded });
  renderMe();
  renderTimeline();
  renderOnline(data.online);
  state.loaded = true;
}

function connectStream() {
  state.stream?.close();
  const es = new EventSource(`/api/stream?name=${encodeURIComponent(state.name)}`);
  state.stream = es;
  const dot = $('#live-dot');

  es.addEventListener('open', () => {
    dot.classList.remove('offline');
    // Catch up on anything missed while disconnected.
    if (state.streamWasOpen) refreshState().catch(() => {});
    state.streamWasOpen = true;
  });
  es.addEventListener('error', () => dot.classList.add('offline'));

  es.addEventListener('question', (e) => {
    const { question, stats, nonce } = JSON.parse(e.data);
    applyStats(stats);
    if (nonce && state.myNonces.has(nonce)) {
      state.myNonces.delete(nonce);
      addQuestion(question, true);
      return;
    }
    if (addQuestion(question, true)) remoteDonation(question);
  });

  es.addEventListener('delete', (e) => {
    const { id, stats } = JSON.parse(e.data);
    state.questions = state.questions.filter((q) => q.id !== id);
    document.querySelector(`.tl-item[data-id="${CSS.escape(id)}"]`)?.remove();
    $('#timeline-empty').hidden = state.questions.length > 0;
    applyStats(stats);
    api(`/api/state?name=${encodeURIComponent(state.name)}`).then((d) => { state.me = d.me; renderMe(); }).catch(() => {});
  });

  es.addEventListener('online', (e) => renderOnline(JSON.parse(e.data)));
}

function remoteDonation(q) {
  const jar = center($('#jar'));
  const top = { x: jar.x + rand(-160, 160), y: -30 };
  flyCoin(top, jar, { duration: 900 }).then(() => {
    jiggleJar();
    burst(jar, 8);
    floatText(jar, `+${fmtPrice(q.cents)}`);
    setMood('happy', 1400);
    play('remote');
  });
  say(`Thanks ${q.name}! 🪙`, 2600);
  bumpStat('#stat-total');
  toast(`${q.name} asked: “${q.text}”`);
}

async function donate(event) {
  event.preventDefault();
  if (state.busy) return;
  if (!state.name) { openNameDialog(true); return; }

  const input = $('#question');
  const btn = $('#pay-btn');
  const text = input.value.trim();
  const nonce = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  state.myNonces.add(nonce);
  state.busy = true;
  btn.disabled = true;

  try {
    const data = await api('/api/questions', {
      method: 'POST',
      body: JSON.stringify({ name: state.name, text, nonce }),
    });
    input.value = '';
    input.placeholder = pick(EXAMPLE_PLACEHOLDERS);
    updateCharCount();
    state.me = data.me;

    const jar = center($('#jar'));
    play('coin');
    await flyCoin(center(btn), jar);
    jiggleJar();
    burst(jar);
    floatText(jar, `+${fmtPrice(data.question.cents)}`);
    setMood('happy', 1800);
    say(pick(LINES.thanks));
    bumpStat('#stat-total');
    bumpStat('#stat-count');

    addQuestion(data.question, true);
    applyStats(data.stats);
    renderMe();
    toast(pick(LINES.toasts));
  } catch (err) {
    state.myNonces.delete(nonce);
    play('error');
    $('#ask-form').classList.remove('shake');
    void $('#ask-form').offsetWidth;
    $('#ask-form').classList.add('shake');
    toast(err.message, { type: 'error', coin: false });
  } finally {
    setTimeout(() => { state.busy = false; btn.disabled = false; }, 700);
  }
}

async function loadMore() {
  const oldest = state.questions[state.questions.length - 1];
  if (!oldest) return;
  const btn = $('#more-btn');
  btn.disabled = true;
  try {
    const data = await api(`/api/questions?before=${oldest.ts}&limit=40`);
    const fresh = data.questions.filter((q) => !state.seen.has(q.id));
    fresh.forEach((q) => state.seen.add(q.id));
    state.questions.push(...fresh);
    $('#timeline').append(...fresh.map((q) => timelineItem(q, false)));
    state.hasMore = data.hasMore;
    btn.hidden = !data.hasMore;
  } catch (err) {
    toast(err.message, { type: 'error', coin: false });
  } finally {
    btn.disabled = false;
  }
}

/* ------------------------------------------------------------------ */
/* Name dialog                                                         */
/* ------------------------------------------------------------------ */

const dialog = $('#name-dialog');

function openNameDialog(first = false) {
  dialog.classList.toggle('is-first', first);
  $('#name-title').textContent = first ? 'Player 1, enter your name' : 'Change your name';
  $('#name-sub').textContent = first ? 'So Melchior knows who owes him.' : 'New name, same debts.';
  $('#name-input').value = state.name;
  $('#name-error').textContent = '';
  dialog.showModal();
  $('#name-input').select();
}

function submitName(event) {
  event.preventDefault();
  const name = $('#name-input').value.replace(/\s+/g, ' ').trim();
  if (!name) {
    $('#name-error').textContent = 'Even secret agents have a code name.';
    return;
  }
  const first = !state.name;
  const changed = name !== state.name;
  state.name = name;
  saveName(name);
  dialog.close();
  renderPlayer();
  if (first) {
    startSession().then(() => say(`Welcome, ${name}! Questions are ${fmtPrice(state.config.centsPerQuestion)} each. 😏`, 4000));
  } else if (changed) {
    refreshState().catch(() => {});
    connectStream();
    toast(`You are now known as ${name}.`, { coin: false });
  }
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

function updateCharCount() {
  const len = $('#question').value.length;
  const max = state.config.maxText;
  const c = $('#char-count');
  c.textContent = `${len}/${max}`;
  c.classList.toggle('near', len > max - 10);
}

function pokeMelchior() {
  const now = Date.now();
  state.pokes = state.pokes.filter((t) => now - t < 4000).concat(now);
  setMood('poked', 700);
  play('poke');
  say(state.pokes.length >= 6 ? pick(LINES.pokeSpam) : pick(LINES.poke));
  burst(center($('#melchior-art').hidden ? $('#head') : melchior), 6);
  if (window.matchMedia('(hover: hover)').matches) $('#question').focus({ preventScroll: true });
}

function setMuted(muted) {
  state.muted = muted;
  storageSet('mc_muted', muted ? '1' : '0');
  const btn = $('#mute-btn');
  btn.textContent = muted ? '🔇' : '🔊';
  btn.setAttribute('aria-pressed', String(muted));
}

async function startSession() {
  try {
    await refreshState();
  } catch (err) {
    toast(`Could not load the scoreboard: ${err.message}`, { type: 'error', coin: false });
  }
  connectStream();
}

function init() {
  $('#year').textContent = new Date().getFullYear();
  $('#question').placeholder = pick(EXAMPLE_PLACEHOLDERS);
  setMuted(storageGet('mc_muted') === '1');

  $('#ask-form').addEventListener('submit', donate);
  $('#question').addEventListener('input', updateCharCount);
  melchior.addEventListener('click', pokeMelchior);
  $('#player-btn').addEventListener('click', () => openNameDialog(false));
  $('#mute-btn').addEventListener('click', () => setMuted(!state.muted));
  $('#more-btn').addEventListener('click', loadMore);
  $('#name-form').addEventListener('submit', submitName);
  $('#name-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', (e) => { if (!state.name) e.preventDefault(); });

  setInterval(refreshTimes, 30_000);
  setInterval(() => {
    if (document.visibilityState === 'visible' && !state.busy && Math.random() < 0.4) say(pick(LINES.idle), 2600);
  }, 25_000);

  state.name = loadName();
  renderPlayer();
  if (state.name) {
    saveName(state.name); // refresh cookie lifetime
    startSession();
  } else {
    openNameDialog(true);
  }
}

init();
