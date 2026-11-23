import { Sound } from './sound.js';

const DISC = {
  Architettura: 'architettura', Arte: 'arte', Cinema: 'cinema', Fotografia: 'fotografia',
  Design: 'design', Testo: 'testi', Scienza: 'scienza', Filosofia: 'filosofia',
};
const $ = (s) => document.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const [works, sizes] = await Promise.all([
  fetch('data/opere.json').then((r) => r.json()),
  fetch('data/sizes.json').then((r) => r.json()).catch(() => ({})),
]);
const thumb = (id) => `img/t/${id}.webp`;
const large = (id) => `img/l/${id}.webp`;
const has = (id) => id in sizes;
const ratio = (w) => { const s = sizes[w.img[0]]; return s ? s[0] / s[1] : 0.8; };

// seeded random, so the montage is stable between visits
let seed = 1994;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

const sound = new Sound();

/* ================= field ================= */
const field = $('#field');
const world = $('#world');
const small = innerWidth < 700;
const CELL = small ? 210 : 320;
const N = works.length;
const cols = Math.ceil(Math.sqrt(N * 1.7));
const rows = Math.ceil(N / cols);
const W = cols * CELL;
const H = rows * CELL;

// shuffle the cells: neighbours on the cloth are not neighbours in time
const cells = [...Array(cols * rows).keys()];
for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }

const items = works.map((w, i) => {
  const c = cells[i];
  const long = CELL * (0.42 + rnd() * 0.3);
  const r = ratio(w);
  const width = r >= 1 ? long : long * r;
  const height = r >= 1 ? long / r : long;
  const x = (c % cols) * CELL + (CELL - width) * (0.15 + rnd() * 0.7);
  const y = Math.floor(c / cols) * CELL + (CELL - height - 28) * (0.15 + rnd() * 0.7);

  const el = document.createElement('figure');
  el.className = 'tav';
  el.tabIndex = 0;
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `${w.n}. ${w.titolo}, ${w.autore}`);
  const frame = document.createElement('div');
  frame.className = 'frame';
  if (has(w.img[0])) {
    const img = new Image();
    img.className = 'base';
    img.alt = '';
    img.decoding = 'async';
    img.src = thumb(w.img[0]);
    frame.append(img);
  } else {
    frame.classList.add('slip');
    frame.innerHTML = `<span></span>`;
    frame.firstChild.textContent = w.titolo;
  }
  const label = document.createElement('figcaption');
  label.className = 'label';
  label.innerHTML = `<b>${w.n}</b><i></i>`;
  label.querySelector('i').textContent = w.titolo;
  el.append(frame, label);
  world.append(el);
  return { w, el, frame, x, y, width, height, sx: 0, sy: 0 };
});

/* loader: count thumbnails as they arrive */
{
  const imgs = items.map((it) => it.frame.querySelector('img')).filter(Boolean);
  let done = 0;
  $('#load-t').textContent = imgs.length;
  const finish = () => setTimeout(() => $('#loader').classList.add('done'), 250);
  const tick = (img) => { img.classList.add('in'); $('#load-n').textContent = ++done; if (done === imgs.length) finish(); };
  imgs.forEach((img) => (img.complete && img.naturalWidth ? tick(img) : (img.onload = img.onerror = () => tick(img))));
  if (!imgs.length) finish();
  setTimeout(finish, 9000); // never hold the visitor hostage
}

/* camera with inertia; positions wrap around so the cloth has no edges */
const cam = { x: -(W - innerWidth) / 2, y: -(H - innerHeight) / 2, vx: 0, vy: 0 };
const mod = (a, n) => ((a % n) + n) % n;
function place() {
  const vw = innerWidth, vh = innerHeight;
  for (const it of items) {
    let px = mod(it.x + cam.x + CELL, W) - CELL;
    let py = mod(it.y + cam.y + CELL, H) - CELL;
    // if the world is smaller than the viewport on an axis, items simply wrap inside it
    if (px !== it.sx || py !== it.sy) {
      it.sx = px; it.sy = py;
      it.el.style.transform = `translate3d(${px}px, ${py}px, 0)`;
    }
    const vis = px > -it.width - 40 && px < vw + 40 && py > -it.height - 60 && py < vh + 40;
    if (vis !== it.vis) { it.vis = vis; it.el.style.visibility = vis ? '' : 'hidden'; }
  }
}

let dragging = false, moved = 0, last = null, raf = 0;
function loop() {
  if (!dragging) {
    cam.x += cam.vx; cam.y += cam.vy;
    cam.vx *= 0.93; cam.vy *= 0.93;
    if (Math.abs(cam.vx) < 0.02 && Math.abs(cam.vy) < 0.02) { cam.vx = cam.vy = 0; }
  }
  place();
  sound.motion(Math.hypot(cam.vx, cam.vy));
  raf = cam.vx || cam.vy || dragging ? requestAnimationFrame(loop) : 0;
}
const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
place();

const hint = $('#hint');
const hideHint = () => hint.classList.add('gone');
setTimeout(hideHint, 6000);

field.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  dragging = true; moved = 0;
  last = { x: e.clientX, y: e.clientY, t: performance.now() };
  cam.vx = cam.vy = 0;
  field.setPointerCapture(e.pointerId);
  kick();
});
field.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - last.x, dy = e.clientY - last.y;
  const now = performance.now(), dt = Math.max(1, now - last.t);
  cam.x += dx; cam.y += dy;
  cam.vx = (dx / dt) * 16; cam.vy = (dy / dt) * 16;
  moved += Math.abs(dx) + Math.abs(dy);
  last = { x: e.clientX, y: e.clientY, t: now };
  if (moved > 6) { field.classList.add('dragging'); hideHint(); }
});
const release = (e) => {
  if (!dragging) return;
  dragging = false;
  field.classList.remove('dragging');
  if (performance.now() - last.t > 80) cam.vx = cam.vy = 0;
  if (moved < 6) {
    // a click, not a drag: find the work under the pointer
    const hit = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList?.contains('tav'));
    if (hit) open(items.findIndex((it) => it.el === hit));
  }
  kick();
};
field.addEventListener('pointerup', release);
field.addEventListener('pointercancel', release);
field.addEventListener('wheel', (e) => {
  e.preventDefault();
  const k = e.deltaMode === 1 ? 16 : 1;
  cam.x -= (e.shiftKey ? e.deltaY : e.deltaX) * k;
  cam.y -= (e.shiftKey ? 0 : e.deltaY) * k;
  cam.vx = cam.vy = 0;
  hideHint();
  place();
}, { passive: false });
addEventListener('keydown', (e) => {
  if (view !== 'atlas' || !$('#detail').hidden) return;
  const step = 14;
  const map = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
  if (map[e.key] && document.activeElement === field) { cam.vx = map[e.key][0]; cam.vy = map[e.key][1]; kick(); e.preventDefault(); }
});
items.forEach((it, i) => it.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); } }));
addEventListener('resize', place);

/* ---------- hover: the image splits into its red, green and blue plates ---------- */
function splitOn(frame, idx) {
  const base = frame.querySelector('img.base');
  if (!base || frame.classList.contains('split') || reduced) return;
  frame.classList.add('split');
  const layers = ['g', 'b'].map((c) => {
    const im = base.cloneNode(); im.className = 'ch'; im.style.filter = `url(#ch-${c})`; frame.append(im); return im;
  });
  const slice = base.cloneNode(); slice.className = 'slice'; frame.append(slice);
  const t0 = performance.now();
  let alive = true;
  const step = (t) => {
    if (!alive) return;
    const age = (t - t0) / 1000;
    const burst = Math.max(0, 1 - age / 0.45);            // strong glitch at first, then it settles
    const drift = 1.5 + Math.sin(t / 380) * 1.2;          // a slow residual misregistration
    const a = burst * 14 + drift;
    layers[0].style.transform = `translate(${-a * 0.7}px, ${Math.sin(t / 90) * burst * 3}px)`;
    layers[1].style.transform = `translate(${a}px, ${-a * 0.25}px)`;
    if (burst > 0 && Math.random() < 0.5) {
      const top = Math.random() * 90, h = 2 + Math.random() * 12;
      slice.style.clipPath = `inset(${top}% 0 ${Math.max(0, 100 - top - h)}% 0)`;
      slice.style.transform = `translateX(${(Math.random() - 0.5) * 40 * burst}px)`;
      slice.style.opacity = 1;
    } else slice.style.opacity = 0;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  frame._off = () => { alive = false; layers.forEach((l) => l.remove()); slice.remove(); frame.classList.remove('split'); };
  sound.pluck(idx);
}
function splitOff(frame) { frame._off?.(); frame._off = null; }
items.forEach((it, i) => {
  it.el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !dragging) splitOn(it.frame, i); });
  it.el.addEventListener('pointerleave', () => splitOff(it.frame));
  it.el.addEventListener('focus', () => splitOn(it.frame, i));
  it.el.addEventListener('blur', () => splitOff(it.frame));
});

/* ================= filters ================= */
let filter = null;
const indexLis = [];
{
  const box = $('#filters');
  const counts = {};
  works.forEach((w) => (counts[w.disciplina] = (counts[w.disciplina] || 0) + 1));
  const mk = (key, text, n) => {
    const b = document.createElement('button');
    b.dataset.key = key ?? '';
    b.setAttribute('aria-pressed', key === null ? 'true' : 'false');
    b.innerHTML = `${text}${n ? `<sup>${n}</sup>` : ''}`;
    b.onclick = () => setFilter(key);
    box.append(b);
  };
  mk(null, 'tutto', N);
  Object.keys(DISC).filter((k) => counts[k]).forEach((k) => mk(k, DISC[k], counts[k]));
}
function setFilter(key) {
  filter = key;
  document.querySelectorAll('#filters button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.key || null) === key)));
  items.forEach((it) => it.el.classList.toggle('muted', !!key && it.w.disciplina !== key));
  indexLis.forEach((li, i) => (li.hidden = !!key && works[i].disciplina !== key));
}

/* ================= views ================= */
let view = 'atlas';
function setView(v) {
  view = v;
  document.querySelectorAll('.nav button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  $('#index').hidden = v !== 'index';
  $('#info').hidden = v !== 'info';
  if (v === 'atlas') field.focus({ preventScroll: true });
}
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); setView(b.dataset.view); }));

/* index list, newest first */
{
  const list = $('#index-list');
  const peek = $('#index-peek');
  works.forEach((w, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.className = 'row';
    b.innerHTML = `<span class="n"></span><span class="t"></span><span class="a"></span><span class="y"></span><span class="d"></span>`;
    b.querySelector('.n').textContent = w.n;
    b.querySelector('.t').textContent = w.titolo;
    b.querySelector('.a').textContent = w.autore;
    b.querySelector('.y').textContent = w.anno || '';
    b.querySelector('.d').textContent = DISC[w.disciplina] || '';
    b.onclick = () => open(i);
    b.onmouseenter = () => {
      peek.innerHTML = '';
      if (!has(w.img[0])) return;
      const f = document.createElement('div'); f.className = 'frame';
      f.style.aspectRatio = ratio(w);
      const img = new Image(); img.className = 'base in'; img.src = thumb(w.img[0]); f.append(img);
      peek.append(f); peek.classList.add('on'); splitOn(f, i);
    };
    b.onmouseleave = () => peek.classList.remove('on');
    li.append(b);
    list.prepend(li);
    indexLis.push(li);
  });
  list.addEventListener('mousemove', (e) => {
    peek.style.transform = `translate(${Math.min(e.clientX + 28, innerWidth - 280)}px, ${Math.min(e.clientY - 120, innerHeight - 340)}px)`;
  });
}

/* ================= detail ================= */
const D = { el: $('#detail'), track: $('#d-track'), i: 0, k: 0 };
function open(i) {
  if (i < 0) return;
  const w = works[i];
  D.i = i; D.k = 0;
  D.track.innerHTML = '';
  w.img.forEach((id, k) => {
    const s = document.createElement('div'); s.className = 'd-slide';
    if (has(id)) {
      const img = new Image(); img.alt = k === 0 ? `${w.titolo}, ${w.autore}` : `${w.titolo}, immagine ${k + 1}`;
      img.src = thumb(id);                          // instant, then sharpen
      const hi = new Image(); hi.onload = () => (img.src = hi.src); hi.src = large(id);
      s.append(img);
    } else {
      s.innerHTML = `<div class="frame slip"><span></span></div>`;
      s.querySelector('span').textContent = w.titolo;
    }
    D.track.append(s);
  });
  $('#d-num').innerHTML = `<b>${w.n}</b>`;
  $('#d-title').textContent = w.titolo;
  $('#d-author').textContent = w.autore;
  $('#d-meta').textContent = [w.anno, DISC[w.disciplina]].filter(Boolean).join(', ');
  const txt = $('#d-text');
  txt.innerHTML = '';
  (w.testo || '').split(/\n+/).filter(Boolean).forEach((p) => { const el = document.createElement('p'); el.textContent = p; txt.append(el); });
  const multi = w.img.length > 1;
  $('#d-prev').hidden = $('#d-next').hidden = $('#d-count').hidden = !multi;
  slide(0);
  D.el.hidden = false;
  $('#d-close').focus({ preventScroll: true });
  history.replaceState(null, '', `#${w.n}`);
  sound.open();
}
function slide(k) {
  const n = works[D.i].img.length;
  D.k = (k + n) % n;
  D.track.style.transform = `translateX(${-100 * D.k}%)`;
  $('#d-count').textContent = `${D.k + 1} / ${n}`;
}
function close() { D.el.hidden = true; history.replaceState(null, '', location.pathname); }
$('#d-prev').onclick = () => slide(D.k - 1);
$('#d-next').onclick = () => slide(D.k + 1);
$('#d-close').onclick = close;
$('#d-before').onclick = () => open((D.i - 1 + N) % N);
$('#d-after').onclick = () => open((D.i + 1) % N);
addEventListener('keydown', (e) => {
  if (D.el.hidden) { if (e.key === 'Escape' && view !== 'atlas') setView('atlas'); return; }
  if (e.key === 'Escape') close();
  if (e.key === 'ArrowRight') slide(D.k + 1);
  if (e.key === 'ArrowLeft') slide(D.k - 1);
});
{ // swipe the carousel
  let sx = null;
  const st = $('.d-stage');
  st.addEventListener('pointerdown', (e) => (sx = e.clientX));
  st.addEventListener('pointerup', (e) => {
    if (sx === null) return;
    const dx = e.clientX - sx; sx = null;
    if (Math.abs(dx) > 40) slide(D.k + (dx < 0 ? 1 : -1));
  });
}
// deep link: mnemotheca.org/#37
{
  const n = parseInt(location.hash.slice(1), 10);
  if (n) open(works.findIndex((w) => w.n === n));
}

/* ================= sound ================= */
$('#sound').addEventListener('click', (e) => {
  const on = sound.toggle();
  e.currentTarget.setAttribute('aria-pressed', String(on));
});
