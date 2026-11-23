import { Sound } from './sound.js';
import { FieldGL } from './gl.js';

const DISC = {
  Architettura: 'architecture', Arte: 'art', Cinema: 'cinema', Fotografia: 'photography',
  Design: 'design', Testo: 'text', Scienza: 'science', Filosofia: 'philosophy',
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

/* ================= sound: on by default ================= */
const sound = new Sound();
const soundBtn = $('#sound');
let soundWanted = true;
try { soundWanted = localStorage.getItem('mnemo-sound') !== 'off'; } catch {}
const showSound = () => soundBtn.setAttribute('aria-pressed', String(soundWanted));
showSound();
// Browsers only let a page make sound after the visitor's first gesture,
// so the sound starts on the first click, drag, scroll or key.
const GESTURES = ['pointerdown', 'pointerup', 'keydown', 'touchend'];
const firstGesture = (e) => {
  if (e.target?.closest?.('#sound')) return; // the button handles itself
  if (soundWanted) { if (!sound.on) sound.toggle(); else sound.ctx?.resume(); }
  if (!soundWanted || sound.ctx?.state === 'running') GESTURES.forEach((t) => removeEventListener(t, firstGesture, true));
};
GESTURES.forEach((t) => addEventListener(t, firstGesture, { capture: true, passive: true }));
soundBtn.addEventListener('click', () => {
  soundWanted = !soundWanted;
  if (soundWanted !== sound.on) sound.toggle();
  try { localStorage.setItem('mnemo-sound', soundWanted ? 'on' : 'off'); } catch {}
  showSound();
});

/* ================= field layout ================= */
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

let gl = null;
try { gl = new FieldGL($('#glcanvas'), { reduced }); document.body.classList.add('gl'); }
catch (e) { console.warn('WebGL off:', e); }

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
  let img = null;
  if (has(w.img[0])) {
    img = new Image();
    img.className = 'base';
    img.alt = '';
    img.decoding = 'async';
    img.src = thumb(w.img[0]);
    frame.append(img);
  } else {
    frame.classList.add('slip');
    frame.innerHTML = '<span></span>';
    frame.firstChild.textContent = w.titolo;
  }
  const label = document.createElement('figcaption');
  label.className = 'label';
  label.innerHTML = '<b></b><i></i>';
  label.querySelector('b').textContent = w.n;
  label.querySelector('i').textContent = w.titolo;
  el.append(frame, label);
  world.append(el);
  return { w, el, frame, img, x, y, width, height, sx: 1e9, sy: 1e9, tex: null, hover: 0, target: 0, mouse: [0.5, 0.5], vel: [0, 0], alpha: 0, muted: false };
});

/* loader: count thumbnails as they arrive; each one becomes a texture */
{
  const withImg = items.filter((it) => it.img);
  let done = 0;
  $('#load-t').textContent = withImg.length;
  const finish = () => setTimeout(() => $('#loader').classList.add('done'), 250);
  const tick = (it) => {
    it.img.classList.add('in');
    if (gl && it.img.naturalWidth) { try { it.tex = gl.texture(it.img); } catch {} }
    $('#load-n').textContent = ++done;
    if (done === withImg.length) finish();
  };
  withImg.forEach((it) => (it.img.complete && it.img.naturalWidth ? tick(it) : (it.img.onload = it.img.onerror = () => tick(it))));
  if (!withImg.length) finish();
  setTimeout(finish, 9000); // never hold the visitor hostage
}

/* ================= camera, drag, inertia ================= */
const cam = { x: -(W - innerWidth) / 2, y: -(H - innerHeight) / 2, vx: 0, vy: 0, dx: 0, dy: 0 };
const mod = (a, n) => ((a % n) + n) % n;
function place() {
  const vw = innerWidth, vh = innerHeight;
  for (const it of items) {
    const px = mod(it.x + cam.x + CELL, W) - CELL;
    const py = mod(it.y + cam.y + CELL, H) - CELL;
    if (px !== it.sx || py !== it.sy) {
      it.sx = px; it.sy = py;
      it.el.style.transform = `translate3d(${px}px, ${py}px, 0)`;
    }
    const vis = px > -it.width - 40 && px < vw + 40 && py > -it.height - 60 && py < vh + 40;
    if (vis !== it.vis) { it.vis = vis; it.el.style.visibility = vis ? '' : 'hidden'; }
  }
}

let dragging = false, moved = 0, last = null;
let hovered = null;
const pointer = { x: -1, y: -1, px: -1, py: -1 };
const t0 = performance.now();

function frame(now) {
  const bx = cam.x, by = cam.y;
  if (!dragging) {
    cam.x += cam.vx; cam.y += cam.vy;
    cam.vx *= 0.93; cam.vy *= 0.93;
    if (Math.abs(cam.vx) < 0.02 && Math.abs(cam.vy) < 0.02) cam.vx = cam.vy = 0;
  }
  // smoothed camera speed, used by the glass and the sound
  cam.dx += (cam.x - bx - cam.dx) * 0.2; cam.dy += (cam.y - by - cam.dy) * 0.2;
  place();
  sound.motion(Math.hypot(cam.dx, cam.dy));

  if (gl) {
    const plates = [];
    for (const it of items) {
      it.hover += (it.target - it.hover) * (it.target ? 0.08 : 0.05);
      it.alpha += ((it.muted ? 0.12 : 1) - it.alpha) * 0.08;
      if (it === hovered && pointer.x >= 0) {
        const u = (pointer.x - it.sx) / it.width, v = (pointer.y - it.sy) / it.height;
        const du = pointer.px >= 0 ? (pointer.x - pointer.px) / it.width : 0;
        const dv = pointer.px >= 0 ? (pointer.y - pointer.py) / it.height : 0;
        it.mouse[0] += (u - it.mouse[0]) * 0.25; it.mouse[1] += (v - it.mouse[1]) * 0.25;
        it.vel[0] += (du - it.vel[0]) * 0.15; it.vel[1] += (dv - it.vel[1]) * 0.15;
      } else { it.vel[0] *= 0.9; it.vel[1] *= 0.9; }
      if (it.vis && it.tex) plates.push({ x: it.sx, y: it.sy, w: it.width, h: it.height, tex: it.tex, hover: it.hover, mouse: it.mouse, vel: it.vel, alpha: it.alpha });
    }
    pointer.px = pointer.x; pointer.py = pointer.y;
    gl.render(plates, (now - t0) / 1000, [cam.dx, cam.dy]);
  }
  requestAnimationFrame(frame);
}
place();
requestAnimationFrame(frame);

const hint = $('#hint');
const hideHint = () => hint.classList.add('gone');
setTimeout(hideHint, 6000);

field.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  dragging = true; moved = 0;
  last = { x: e.clientX, y: e.clientY, t: performance.now() };
  cam.vx = cam.vy = 0;
  field.setPointerCapture(e.pointerId);
});
field.addEventListener('pointermove', (e) => {
  pointer.x = e.clientX; pointer.y = e.clientY;
  if (!dragging) return;
  const dx = e.clientX - last.x, dy = e.clientY - last.y;
  const now = performance.now(), dt = Math.max(1, now - last.t);
  cam.x += dx; cam.y += dy;
  cam.vx = (dx / dt) * 16; cam.vy = (dy / dt) * 16;
  moved += Math.abs(dx) + Math.abs(dy);
  last = { x: e.clientX, y: e.clientY, t: now };
  if (moved > 6) { field.classList.add('dragging'); hideHint(); setHover(null); }
});
const release = (e) => {
  if (!dragging) return;
  dragging = false;
  field.classList.remove('dragging');
  if (performance.now() - last.t > 80) cam.vx = cam.vy = 0;
  if (moved < 6) {
    const hit = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList?.contains('tav'));
    if (hit) open(items.findIndex((it) => it.el === hit));
  }
};
field.addEventListener('pointerup', release);
field.addEventListener('pointercancel', release);
field.addEventListener('pointerleave', () => { pointer.x = pointer.y = -1; });
field.addEventListener('wheel', (e) => {
  e.preventDefault();
  const k = e.deltaMode === 1 ? 16 : 1;
  cam.x -= (e.shiftKey ? e.deltaY : e.deltaX) * k;
  cam.y -= (e.shiftKey ? 0 : e.deltaY) * k;
  cam.vx = cam.vy = 0;
  hideHint();
}, { passive: false });
addEventListener('keydown', (e) => {
  if (view !== 'atlas' || !$('#detail').hidden) return;
  const step = 14;
  const map = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
  if (map[e.key] && document.activeElement === field) { cam.vx = map[e.key][0]; cam.vy = map[e.key][1]; e.preventDefault(); }
});
items.forEach((it, i) => it.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); } }));
addEventListener('resize', () => { gl?.resize(); place(); });

/* ---------- hover: the plate under the pointer turns liquid ---------- */
function setHover(it) {
  if (hovered === it) return;
  if (hovered) hovered.target = 0;
  hovered = it;
  if (it) {
    it.target = 1;
    it.mouse = [(pointer.x - it.sx) / it.width, (pointer.y - it.sy) / it.height];
    sound.pluck(items.indexOf(it));
  }
}
items.forEach((it) => {
  it.el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !dragging) setHover(it); });
  it.el.addEventListener('pointerleave', () => { if (hovered === it) setHover(null); });
  it.el.addEventListener('focus', () => { pointer.x = it.sx + it.width / 2; pointer.y = it.sy + it.height / 2; setHover(it); });
  it.el.addEventListener('blur', () => { if (hovered === it) setHover(null); });
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
    b.innerHTML = `${text}<sup>${n}</sup>`;
    b.onclick = () => setFilter(key);
    box.append(b);
  };
  mk(null, 'all', N);
  Object.keys(DISC).filter((k) => counts[k]).forEach((k) => mk(k, DISC[k], counts[k]));
}
function setFilter(key) {
  filter = key;
  document.querySelectorAll('#filters button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.key || null) === key)));
  items.forEach((it) => { it.muted = !!key && it.w.disciplina !== key; it.el.classList.toggle('muted', it.muted); });
  indexLis.forEach((li, i) => (li.hidden = !!key && works[i].disciplina !== key));
}

/* ================= views ================= */
let view = 'atlas';
const peek = $('#index-peek');
function setView(v) {
  view = v;
  document.querySelectorAll('.nav button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  $('#index').hidden = v !== 'index';
  $('#info').hidden = v !== 'info';
  peek.classList.remove('on');
  if (v === 'atlas') field.focus({ preventScroll: true });
}
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); setView(b.dataset.view); }));
// a click on the empty cloth around the index or the about text goes back to the atlas
$('#index').addEventListener('click', (e) => { if (!e.target.closest('.row')) setView('atlas'); });
$('#info').addEventListener('click', (e) => { if (!e.target.closest('.info-body')) setView('atlas'); });

/* index list, newest first, with a preview that follows the pointer */
{
  const list = $('#index-list');
  works.forEach((w, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.className = 'row';
    b.innerHTML = '<span class="n"></span><span class="t"></span><span class="a"></span><span class="y"></span><span class="d"></span>';
    b.querySelector('.n').textContent = w.n;
    b.querySelector('.t').textContent = w.titolo;
    b.querySelector('.a').textContent = w.autore;
    b.querySelector('.y').textContent = w.anno || '';
    b.querySelector('.d').textContent = DISC[w.disciplina] || '';
    b.onclick = () => open(i);
    b.onmouseenter = () => {
      peek.innerHTML = '';
      if (!has(w.img[0])) { peek.classList.remove('on'); return; }
      const img = new Image(); img.src = thumb(w.img[0]); img.alt = '';
      peek.append(img); peek.classList.add('on');
      sound.pluck(i);
    };
    b.onmouseleave = () => peek.classList.remove('on');
    li.append(b);
    list.prepend(li);
    indexLis.push(li);
  });
  // the preview lives outside the scrolling sheet, fixed to the window
  const movePeek = (e) => {
    const pw = 260, ph = peek.offsetHeight || 320;
    const x = Math.min(e.clientX + 28, innerWidth - pw - 16);
    const y = Math.max(16, Math.min(e.clientY - ph / 2, innerHeight - ph - 16));
    peek.style.transform = `translate(${x}px, ${y}px)`;
  };
  list.addEventListener('mousemove', movePeek);
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
      const img = new Image(); img.alt = k === 0 ? `${w.titolo}, ${w.autore}` : `${w.titolo}, image ${k + 1}`;
      img.src = thumb(id);                          // instant, then sharpen
      const hi = new Image(); hi.onload = () => (img.src = hi.src); hi.src = large(id);
      s.append(img);
    } else {
      s.innerHTML = '<div class="frame slip"><span></span></div>';
      s.querySelector('span').textContent = w.titolo;
    }
    D.track.append(s);
  });
  $('#d-num').textContent = w.n;
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
  peek.classList.remove('on');
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
{ // swipe sideways for the next image, swipe down or tap the dark around the image to close
  let start = null;
  const st = $('.d-stage');
  const reset = () => { D.el.style.transform = ''; D.el.style.opacity = ''; D.el.classList.remove('pulling'); };
  st.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.d-arrow')) return;
    start = { x: e.clientX, y: e.clientY, onImg: e.target.tagName === 'IMG' || !!e.target.closest('.slip') };
  });
  st.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (dy > 0 && dy > Math.abs(dx)) {          // the sheet follows the finger downwards
      D.el.classList.add('pulling');
      D.el.style.transform = `translateY(${dy * 0.8}px)`;
      D.el.style.opacity = String(Math.max(0.3, 1 - dy / 500));
    }
  });
  const end = (e) => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y, onImg = start.onImg;
    start = null;
    if (dy > 90 && dy > Math.abs(dx)) { reset(); close(); return; }
    reset();
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { slide(D.k + (dx < 0 ? 1 : -1)); return; }
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && !onImg) close();
  };
  st.addEventListener('pointerup', end);
  st.addEventListener('pointercancel', () => { start = null; reset(); });
}
// deep link: mnemotheca.org/#37
{
  const n = parseInt(location.hash.slice(1), 10);
  if (n) open(works.findIndex((w) => w.n === n));
}
