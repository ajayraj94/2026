// Parse vocab-master.md -> vocab-master.html
// Each chip shows the word; clicking opens a popup with meaning, memory trick & sentences.
const fs = require("fs");

const raw = fs.readFileSync("vocab-master.md", "utf8");
const lines = raw.split(/\r?\n/);

const words = [];
let section = "";
let column = "";

// Entry line: **N. Word — हिन्दी अर्थ** · core meaning   (note/optional after meaning)
const entryRe = /^\*\*(\d+)\.\s*(.+?)\*\*\s*·\s*(.*)$/;
// Speaker line: 🗣️ English sentence · Hindi sentence
const speakRe = /^🗣️\s*(.*)$/;
// Memory line: 🧠 ...
const memRe = /^🧠\s*(.*)$/;

let cur = null;

function flush() {
  if (cur && cur.word) words.push(cur);
  cur = null;
}

for (const rawLine of lines) {
  const line = rawLine.trim();
  if (!line) continue;

  const secMatch = line.match(/^#\s+Section\s+(\d+)/);
  if (secMatch) { section = "Section " + secMatch[1]; continue; }

  const colMatch = line.match(/^##\s+Section\s+\d+\s+·\s+Column\s+(\d+)/);
  if (colMatch) { flush(); column = "Column " + colMatch[1]; continue; }

  const eMatch = line.match(entryRe);
  if (eMatch) {
    flush();
    const text = eMatch[2].trim();           // "Thwart — विफल करना" (may contain extra parenthetical)
    const dashIdx = text.indexOf("—");
    let word, hi;
    if (dashIdx > 0) {
      word = text.slice(0, dashIdx).trim();
      hi = text.slice(dashIdx + 1).trim();
    } else {
      word = text; hi = "";
    }
    cur = {
      word,
      hi,                                     // hindi meaning
      en: eMatch[3].trim(),                   // english core meaning
      trick: "",
      sentences: [],
      section, column,
      no: Number(eMatch[1]),
    };
    continue;
  }

  if (cur) {
    const mMem = line.match(memRe);
    if (mMem) { cur.trick = mMem[1].trim(); continue; }

    const mSpk = line.match(speakRe);
    if (mSpk) {
      const parts = mSpk[1].split("·");
      const en = (parts[0] || "").trim();
      const hi = parts.length > 1 ? parts.slice(1).join(" · ").trim() : "";
      cur.sentences.push({ en, hi });
      continue;
    }
  }
}
flush();

console.log("Parsed words:", words.length);
const missing = words.filter(w => !w.hi && !w.en);
if (missing.length) console.log("Missing meaning:", missing.map(w => w.word).join(", "));

// ---- Embed into HTML ----
const chipColors = ["#e63980", "#7c4dff", "#00897b", "#ef6c00", "#3949ab", "#c62828", "#2e7d32", "#6d4c41"];

const data = words.map((w, i) => ({
  w: w.word,
  hi: w.hi,
  en: w.en,
  t: w.trick,
  s: w.sentences,
  loc: w.section + " · " + w.column + " · #" + w.no,
  c: chipColors[i % chipColors.length],
}));

const html = `<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vocabulary Master — Click any word</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #fff; color: #222; padding: 8px 10px; }
  h1 { font-size: 14px; margin-bottom: 0; display: inline; }
  .sub { color: #666; font-size: 11px; margin-bottom: 6px; display: inline; margin-left: 8px; }
  #search {
    width: 100%; max-width: 300px; padding: 4px 12px; font-size: 13px;
    border: 1.5px solid #ddd; border-radius: 16px; outline: none; margin: 8px 0 6px; display: block;
  }
  #search:focus { border-color: #7c4dff; }
  .chips { display: flex; flex-wrap: wrap; gap: 0 4px; align-items: center; }
  .chip {
    display: inline-flex; align-items: center;
    background: none; border: none; cursor: pointer;
    font-size: 14.5px; padding: 0; color: inherit; font-family: inherit;
  }
  .chip:hover .label { text-decoration: underline; }
  .label { line-height: 1.35; padding: 0 4px; border: 1px solid transparent; border-radius: 6px; }
  .chip.open { outline: none; }
  .chip.open .label { border-color: #b39ddb; background: #faf8ff; }
  /* Mastery marks */
  .label.m-weak { background: #ffe1e1; border-color: #ffb0b0; }
  .label.m-done { background: #d9f2e2; border-color: #a5d6a7; opacity: .55; text-decoration: line-through; }
  /* Mastery filter bar */
  #masterybar { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: 0 0 6px; }
  .mbtn {
    border: 1.5px solid #e0e0e0; background: #fff; border-radius: 14px;
    font-size: 12px; padding: 2px 10px; cursor: pointer; font-family: inherit; color: #444;
  }
  .mbtn.active { border-color: #7c4dff; background: #f3ecff; color: #4a148c; }
  .mbtn .n { font-weight: 700; }
  #reset { border: none; background: none; color: #bbb; font-size: 11px; cursor: pointer; font-family: inherit; text-decoration: underline; }
  /* Popup mastery buttons */
  #p-actions { display: flex; gap: 8px; margin-top: 12px; }
  .pbtn { flex: 1; border: 1.5px solid #e0e0e0; background: #fff; border-radius: 8px; padding: 5px 4px; cursor: pointer; font-size: 12.5px; font-family: inherit; color: #444; }
  .pbtn.p-weak.active { background: #ffe1e1; border-color: #e57373; }
  .pbtn.p-learn.active { background: #f0f0f0; border-color: #9e9e9e; }
  .pbtn.p-done.active { background: #d9f2e2; border-color: #66bb6a; }
  /* Popup */
  #popup {
    position: fixed; z-index: 100; max-width: 380px; width: min(92vw, 380px);
    background: #fff; border-radius: 14px; padding: 16px 18px;
    box-shadow: 0 8px 32px rgba(0,0,0,.22); border: 1px solid #eee;
    display: none; font-size: 14px;
  }
  #popup.show { display: block; animation: pop .16s ease-out; }
  @keyframes pop { from { opacity: 0; transform: translateY(6px) scale(.97); } to { opacity: 1; transform: none; } }
  #popup .pw { font-size: 19px; font-weight: 700; color: var(--pc, #e63980); }
  #popup .close {
    position: absolute; top: 8px; right: 12px; border: none; background: none;
    font-size: 20px; cursor: pointer; color: #999; line-height: 1;
  }
  #popup .hi { font-size: 16px; font-weight: 600; margin-top: 2px; }
  #popup .en { color: #555; margin-top: 4px; }
  #popup .trick { background: #fff8e1; border-radius: 8px; padding: 8px 10px; margin-top: 10px; font-size: 13px; }
  #popup .sent { margin-top: 8px; font-size: 13px; line-height: 1.5; }
  #popup .sent .en-s { display: block; }
  #popup .sent .hi-s { color: #777; display: block; }
  #popup .loc { margin-top: 10px; font-size: 11px; color: #aaa; }
  #overlay { position: fixed; inset: 0; z-index: 90; display: none; }
  #overlay.show { display: block; }
  #count { color: #888; font-size: 12px; margin: 10px 0 0; }
</style>
</head>
<body>
<h1>Vocabulary Master</h1>
<div class="sub">~440 words · Click any word for meaning · set 🔴/✅ mastery in popup (auto-save)</div>
<div id="masterybar">
  <button class="mbtn active" data-f="all">All <span class="n" id="n-all"></span></button>
  <button class="mbtn" data-f="weak">🔴 Weak <span class="n" id="n-weak"></span></button>
  <button class="mbtn" data-f="learn">⚪ Learning <span class="n" id="n-learn"></span></button>
  <button class="mbtn" data-f="done">✅ Mastered <span class="n" id="n-done"></span></button>
  <button id="reset">reset</button>
</div>
<input id="search" type="text" placeholder="Search word… (type & click)" autocomplete="off">
<div class="chips" id="chips"></div>
<div id="count"></div>

<div id="overlay"></div>
<div id="popup" role="dialog">
  <button class="close" onclick="closePop()">✕</button>
  <div class="pw" id="p-word"></div>
  <div class="hi" id="p-hi"></div>
  <div class="en" id="p-en"></div>
  <div class="trick" id="p-trick"></div>
  <div class="sent" id="p-sent"></div>
  <div id="p-actions">
    <button class="pbtn p-weak" onclick="markFromPop('weak')">🔴 Weak</button>
    <button class="pbtn p-learn" onclick="markFromPop('learn')">⚪ Learning</button>
    <button class="pbtn p-done" onclick="markFromPop('done')">✅ Mastered</button>
  </div>
  <div class="loc" id="p-loc"></div>
</div>

<script>
const DATA = ${JSON.stringify(data)};

const chipsEl = document.getElementById('chips');
const searchEl = document.getElementById('search');
const countEl = document.getElementById('count');
const popup = document.getElementById('popup');
const overlay = document.getElementById('overlay');
let openChip = null;
let curWord = null;
let curFilter = 'all';

// ---- Mastery tracking (auto-saved in browser) ----
const LS_KEY = 'vocabMasteryV1';
let mastery = {};
try { mastery = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { mastery = {}; }
function saveMastery() { try { localStorage.setItem(LS_KEY, JSON.stringify(mastery)); } catch (e) {} }
function mClass(w) { const s = mastery[w]; return s === 'weak' ? 'm-weak' : (s === 'done' ? 'm-done' : ''); }
function chipMatchesFilter(d) {
  if (curFilter === 'weak' && mastery[d.w] !== 'weak') return false;
  if (curFilter === 'done' && mastery[d.w] !== 'done') return false;
  if (curFilter === 'learn' && mastery[d.w]) return false;
  return true;
}
function nEl(id) { return document.getElementById(id); }
function updateCounts() {
  let weak = 0, done = 0;
  DATA.forEach(d => { if (mastery[d.w] === 'weak') weak++; else if (mastery[d.w] === 'done') done++; });
  nEl('n-weak').textContent = weak;
  nEl('n-done').textContent = done;
  nEl('n-learn').textContent = DATA.length - weak - done;
  nEl('n-all').textContent = DATA.length;
}

function render() {
  chipsEl.innerHTML = '';
  const f = (searchEl.value || '').trim().toLowerCase();
  let shown = 0;
  DATA.forEach((d, i) => {
    if (f && !d.w.toLowerCase().includes(f) && !d.hi.includes(f)) return;
    if (!chipMatchesFilter(d)) return;
    shown++;
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.dataset.idx = i;
    const mc = mClass(d.w);
    btn.innerHTML = '<span class="label' + (mc ? ' ' + mc : '') + '" style="color:' + d.c + '">' + d.w + '</span>';
    btn.addEventListener('click', e => { e.stopPropagation(); togglePop(btn, d); });
    chipsEl.appendChild(btn);
  });
  countEl.textContent = shown + ' / ' + DATA.length + ' words' + ((f || curFilter !== 'all') ? ' (filtered)' : '');
  updateCounts();
}

function markFromPop(state) {
  if (!curWord) return;
  if (state === 'learn') delete mastery[curWord]; else mastery[curWord] = state;
  saveMastery();
  document.querySelectorAll('#chips .chip').forEach(ch => {
    const d = DATA[ch.dataset.idx];
    if (d.w !== curWord) return;
    if (!chipMatchesFilter(d)) { ch.style.display = 'none'; return; }
    ch.style.display = '';
    const lbl = ch.querySelector('.label');
    lbl.classList.remove('m-weak', 'm-done');
    const mc = mClass(curWord); if (mc) lbl.classList.add(mc);
  });
  let vis = 0;
  document.querySelectorAll('#chips .chip').forEach(ch => { if (ch.style.display !== 'none') vis++; });
  countEl.textContent = vis + ' / ' + DATA.length + ' words' + ((searchEl.value.trim() || curFilter !== 'all') ? ' (filtered)' : '');
  updateCounts();
  syncPopButtons();
}
function syncPopButtons() {
  const s = mastery[curWord] || 'learn';
  document.querySelector('.p-weak').classList.toggle('active', s === 'weak');
  document.querySelector('.p-learn').classList.toggle('active', s === 'learn');
  document.querySelector('.p-done').classList.toggle('active', s === 'done');
}

function togglePop(chipEl, d) {
  if (openChip === chipEl) { closePop(); return; }
  if (openChip) openChip.classList.remove('open');
  openChip = chipEl;
  chipEl.classList.add('open');

  popup.style.setProperty('--pc', d.c);
  document.getElementById('p-word').textContent = d.w;
  document.getElementById('p-hi').textContent = d.hi;
  document.getElementById('p-en').textContent = d.en;
  document.getElementById('p-trick').textContent = d.t ? '🧠 ' + d.t : '';
  document.getElementById('p-trick').style.display = d.t ? 'block' : 'none';
  const sEl = document.getElementById('p-sent');
  sEl.innerHTML = '';
  (d.s || []).forEach(s => {
    const e = document.createElement('span'); e.className = 'en-s'; e.textContent = '🗣️ ' + s.en; sEl.appendChild(e);
    if (s.hi) { const h = document.createElement('span'); h.className = 'hi-s'; h.textContent = s.hi; sEl.appendChild(h); }
  });
  sEl.style.display = (d.s && d.s.length) ? 'block' : 'none';
  document.getElementById('p-loc').textContent = d.loc;
  curWord = d.w;
  syncPopButtons();
  popup.classList.add('show');
  overlay.classList.add('show');
  positionPop(chipEl);
}

function positionPop(chipEl) {
  const r = chipEl.getBoundingClientRect();
  const pw = popup.offsetWidth, ph = popup.offsetHeight;
  let left = r.left;
  let top = r.bottom + 8;
  if (left + pw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - pw - 8);
  if (top + ph > window.innerHeight - 8) {
    top = r.top - ph - 8;                 // flip above
    if (top < 8) { top = 8; }             // fallback: near top
  }
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';
}

function closePop() {
  popup.classList.remove('show');
  overlay.classList.remove('show');
  if (openChip) { openChip.classList.remove('open'); openChip = null; }
}

overlay.addEventListener('click', closePop);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
window.addEventListener('resize', () => { if (openChip) positionPop(openChip); });

searchEl.addEventListener('input', () => render());
document.querySelectorAll('.mbtn').forEach(b => b.addEventListener('click', () => {
  curFilter = b.dataset.f;
  document.querySelectorAll('.mbtn').forEach(x => x.classList.toggle('active', x === b));
  render();
}));
document.getElementById('reset').addEventListener('click', () => {
  if (!confirm('Clear all Weak/Mastered marks?')) return;
  mastery = {};
  saveMastery();
  render();
});
render();
</script>
</body>
</html>
`;

fs.writeFileSync("vocab-master.html", html);
console.log("Wrote vocab-master.html with", data.length, "chips");
