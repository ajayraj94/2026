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
    max-height: calc(100vh - 16px); overflow-y: auto;
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
  /* Word image (view + edit) */
  #popup .wimg { max-width: 100%; max-height: 180px; border-radius: 8px; margin-top: 8px; display: block; border: 1px solid #eee; }
  #popup .wimgwrap { position: relative; display: none; }
  #popup .wimgwrap.show { display: block; }
  #popup .wimgdel {
    position: absolute; top: 4px; right: 4px; border: none; border-radius: 50%;
    width: 22px; height: 22px; cursor: pointer; background: rgba(0,0,0,.55); color: #fff; font-size: 12px; line-height: 1;
  }
  .imgzone {
    display: none; margin-top: 8px; border: 1.5px dashed #c9b8f5; border-radius: 8px;
    padding: 10px; text-align: center; font-size: 11.5px; color: #7e57c2; background: #faf8ff;
  }
  #popup.editing .imgzone { display: block; }
  .imgzone.drag { background: #efe7ff; border-color: #7c4dff; }
  .imgzone .izrow { display: flex; gap: 6px; justify-content: center; margin-top: 6px; }
  .izbtn { border: 1px solid #d1c4e9; background: #fff; border-radius: 12px; font-size: 11px; padding: 3px 10px; cursor: pointer; color: #5e35b1; font-family: inherit; }
  .izbtn:hover { background: #f3ecff; }
  .padwrap { display: none; margin-top: 8px; }
  .padwrap.show { display: block; }
  .padbar { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
  .padbar .tool { border: 1px solid #e0e0e0; background: #fff; border-radius: 10px; font-size: 11px; padding: 3px 9px; cursor: pointer; font-family: inherit; color: #444; }
  .padbar .tool.active { border-color: #7c4dff; background: #f3ecff; color: #4a148c; }
  .padbar input[type=range] { width: 90px; }
  .padbar input[type=color] { width: 26px; height: 22px; padding: 0; border: 1px solid #ddd; border-radius: 6px; background: #fff; }
  #pad {
    width: 100%; height: 190px; border: 1.5px solid #ddd; border-radius: 10px;
    background: #fff; touch-action: none; cursor: crosshair; display: block;
  }
  #popup .sent .en-s { display: block; }
  #popup .sent .hi-s { color: #777; display: block; }
  #popup .loc { margin-top: 10px; font-size: 11px; color: #aaa; }
  /* Edit option in popup */
  .pw-row { display: flex; align-items: flex-start; gap: 8px; padding-right: 22px; }
  .pw-row .pw { flex: 1; }
  .editbtn {
    border: 1px solid #e0e0e0; background: #fafafa; border-radius: 12px;
    font-size: 11.5px; padding: 2px 9px; cursor: pointer; color: #666;
    font-family: inherit; white-space: nowrap; margin-top: 2px;
  }
  .editbtn:hover { border-color: #7c4dff; background: #f3ecff; color: #4a148c; }
  .pform { display: none; margin-top: 8px; }
  #popup.editing .pform { display: block; }
  #popup.editing .hi, #popup.editing .en, #popup.editing .trick, #popup.editing .sent,
  #popup.editing .editbtn { display: none; }
  .pform .flabel { display: block; font-size: 11px; color: #888; margin-top: 8px; }
  .pform textarea {
    width: 100%; font-family: inherit; font-size: 13px; padding: 6px 8px;
    border: 1.5px solid #ddd; border-radius: 8px; outline: none; resize: vertical;
    margin-top: 3px; display: block; background: #fff; color: #222;
  }
  .pform textarea:focus { border-color: #7c4dff; }
  .ebar { display: flex; gap: 8px; margin-top: 10px; }
  .ebtn { flex: 1; border: 1.5px solid #e0e0e0; background: #fff; border-radius: 8px; padding: 6px 4px; cursor: pointer; font-size: 12.5px; font-family: inherit; color: #444; }
  .ebtn.save { background: #7c4dff; border-color: #7c4dff; color: #fff; font-weight: 600; }
  .ebtn.save:hover { background: #6939d6; }
  .enote { margin-top: 6px; font-size: 10.5px; color: #aaa; }
  #overlay { position: fixed; inset: 0; z-index: 90; display: none; }
  #overlay.show { display: block; }
  #count { color: #888; font-size: 12px; margin: 10px 0 0; }
</style>
</head>
<body>
<h1>Vocabulary Master</h1>
<div class="sub">~440 words · Click any word for meaning · set 🔴/✅ mastery · ✏️ edit content in popup (auto-save)</div>
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
  <div class="pw-row">
    <div class="pw" id="p-word"></div>
    <button class="editbtn" onclick="openEdit()">✏️ Edit</button>
  </div>
  <div class="hi" id="p-hi"></div>
  <div class="en" id="p-en"></div>
  <div class="trick" id="p-trick"></div>
  <div class="sent" id="p-sent"></div>
  <div class="wimgwrap" id="p-imgwrap"><img class="wimg" id="p-img" alt=""><button class="wimgdel" id="p-imgdel" title="Remove image">✕</button></div>
  <div class="pform" id="p-form">
    <label class="flabel">Hindi meaning</label>
    <textarea id="e-hi" rows="2"></textarea>
    <label class="flabel">English meaning</label>
    <textarea id="e-en" rows="2"></textarea>
    <label class="flabel">Memory trick 🧠</label>
    <textarea id="e-trick" rows="3"></textarea>
    <label class="flabel">Example sentence (one per line: English · Hindi — Hindi optional)</label>
    <textarea id="e-sent" rows="4"></textarea>
    <label class="flabel">Image (paste Ctrl+V, drop, or pick) · sketch with ✍️ Pen</label>
    <div class="imgzone" id="imgzone">
      <div>📋 Paste (Ctrl+V) · 🖱️ drag &amp; drop · or pick a file</div>
      <div class="izrow">
        <button class="izbtn" onclick="document.getElementById('imgfile').click()">📁 Choose file</button>
        <button class="izbtn" id="penbtn" onclick="togglePad()">✍️ Pen: draw</button>
      </div>
      <input type="file" id="imgfile" accept="image/*" style="display:none">
    </div>
    <div class="padwrap" id="padwrap">
      <div class="padbar">
        <button class="tool active" id="tool-pen" onclick="setTool('pen')">✏️ Pen</button>
        <button class="tool" id="tool-eraser" onclick="setTool('eraser')">🧽 Eraser</button>
        <input type="color" id="padcolor" value="#1a1a1a" title="Ink color">
        <input type="range" id="padsize" min="1" max="24" value="3" title="Brush size">
        <span style="font-size:11px;color:#999" id="padsizeval">3px</span>
        <button class="tool" onclick="undoPad()">↩️ Undo</button>
        <button class="tool" onclick="clearPad()">🗑️ Clear</button>
        <button class="tool" onclick="togglePad()">▲ Hide pad</button>
      </div>
      <canvas id="pad"></canvas>
    </div>
    <div class="ebar">
      <button class="ebtn save" onclick="saveEdit()">💾 Save</button>
      <button class="ebtn" onclick="cancelEdit()">✖ Cancel</button>
    </div>
    <div class="enote">Saved in this browser (localStorage) · survives page reload</div>
  </div>
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
const LS_EDITS = 'vocabEditsV1';
let mastery = {};
let edits = {};
try { mastery = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { mastery = {}; }
try { edits = JSON.parse(localStorage.getItem(LS_EDITS) || '{}'); } catch (e) { edits = {}; }
function saveMastery() { try { localStorage.setItem(LS_KEY, JSON.stringify(mastery)); } catch (e) {} }
function saveEdits() { try { localStorage.setItem(LS_EDITS, JSON.stringify(edits)); } catch (e) {} }
function mergeEdits(d) {
  const e = edits[d.w];
  if (!e) return;
  if (typeof e.hi === 'string') d.hi = e.hi;
  if (typeof e.en === 'string') d.en = e.en;
  if (typeof e.t === 'string') d.t = e.t;
  if (Array.isArray(e.s)) d.s = e.s;
  if (typeof e.img === 'string') d.img = e.img;
}
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
    const dv = Object.assign({}, d); mergeEdits(dv);
    if (f && !dv.w.toLowerCase().includes(f) && !dv.hi.includes(f)) return;
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

function togglePop(chipEl, dRaw) {
  if (openChip === chipEl) { closePop(); return; }
  if (openChip) openChip.classList.remove('open');
  openChip = chipEl;
  chipEl.classList.add('open');
  fillPop(dRaw);
  popup.classList.add('show');
  overlay.classList.add('show');
  positionPop(chipEl);
}

function fillPop(dRaw) {
  const d = Object.assign({}, dRaw);
  mergeEdits(d);
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
  const iw = document.getElementById('p-imgwrap');
  if (d.img) { document.getElementById('p-img').src = d.img; iw.classList.add('show'); } else { iw.classList.remove('show'); document.getElementById('p-img').src = ''; }
  document.getElementById('p-loc').textContent = d.loc;
  curWord = d.w;
  syncPopButtons();
  closeEdit();
}

// ---- Edit option in popup (auto-saved in browser) ----
function openEdit() {
  if (!curWord) return;
  const d = getCurData();
  document.getElementById('e-hi').value = d.hi || '';
  document.getElementById('e-en').value = d.en || '';
  document.getElementById('e-trick').value = d.t || '';
  document.getElementById('e-sent').value = (d.s || []).map(s => s.hi ? (s.en + ' · ' + s.hi) : s.en).join('\\n');
  setImgDraft(d.img || '');
  hidePad();
  popup.classList.add('editing');
  positionPop(openChip);
  popup.scrollTop = 0;
  document.getElementById('e-hi').focus();
}
function getCurData() {
  const base = DATA.find(x => x.w === curWord);
  const d = Object.assign({}, base);
  mergeEdits(d);
  return d;
}
function saveEdit() {
  if (!curWord) return;
  const hi = document.getElementById('e-hi').value.trim();
  const en = document.getElementById('e-en').value.trim();
  const t = document.getElementById('e-trick').value.trim();
  const s = document.getElementById('e-sent').value.split('\\n').map(l => l.trim()).filter(Boolean).map(l => {
    const parts = l.split('·');
    const sen = (parts[0] || '').trim();
    const hiS = parts.length > 1 ? parts.slice(1).join(' · ').trim() : '';
    return sen ? { en: sen, hi: hiS } : null;
  }).filter(Boolean);
  const base = DATA.find(x => x.w === curWord);
  const e = {};
  if (hi !== (base.hi || '')) e.hi = hi;
  if (en !== (base.en || '')) e.en = en;
  if (t !== (base.t || '')) e.t = t;
  const baseS = JSON.stringify((base.s || []).map(x => [x.en, x.hi || '']));
  if (JSON.stringify(s.map(x => [x.en, x.hi || ''])) !== baseS) e.s = s;
  if (penOpen && padDirty && pad.width) imgDraft = padToDataUrl();
  const curImg = getCurData().img || '';
  if ((imgDraft || '') !== curImg) e.img = imgDraft || '';
  if (Object.keys(e).length) edits[curWord] = e; else delete edits[curWord];
  saveEdits();
  render();
  closeEdit();
  fillPop(DATA.find(x => x.w === curWord));
  const newChip = Array.from(document.querySelectorAll('#chips .chip')).find(ch => DATA[ch.dataset.idx] && DATA[ch.dataset.idx].w === curWord);
  if (newChip) { newChip.classList.add('open'); openChip = newChip; positionPop(newChip); }
}
function cancelEdit() { closeEdit(); }
function closeEdit() { popup.classList.remove('editing'); imgDraft = null; }

// ---- Word image: paste / drop / file / sketch ----
let imgDraft = null;      // dataURL waiting to be saved with the form
function setImgDraft(dataUrl) {
  imgDraft = dataUrl;
  const iw = document.getElementById('p-imgwrap');
  if (dataUrl) { document.getElementById('p-img').src = dataUrl; iw.classList.add('show'); } else { iw.classList.remove('show'); document.getElementById('p-img').src = ''; }
}
document.getElementById('p-imgdel').addEventListener('click', () => {
  if (popup.classList.contains('editing')) { setImgDraft(''); hidePad(); }
  else if (curWord) { const e = edits[curWord] || {}; e.img = ''; edits[curWord] = e; saveEdits(); fillPop(DATA.find(x => x.w === curWord)); }
});
document.getElementById('imgfile').addEventListener('change', ev => {
  const f = ev.target.files && ev.target.files[0];
  if (f) loadImageFile(f);
  ev.target.value = '';
});
const imgzone = document.getElementById('imgzone');
['dragenter', 'dragover'].forEach(n => imgzone.addEventListener(n, e => { e.preventDefault(); imgzone.classList.add('drag'); }));
['dragleave', 'drop'].forEach(n => imgzone.addEventListener(n, e => { e.preventDefault(); imgzone.classList.remove('drag'); }));
imgzone.addEventListener('drop', e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadImageFile(f); });
popup.addEventListener('paste', e => {
  if (!popup.classList.contains('editing')) return;
  const items = (e.clipboardData || {}).items || [];
  for (const it of items) {
    if (it.type && it.type.indexOf('image') === 0) { e.preventDefault(); loadImageFile(it.getAsFile()); break; }
  }
});
function loadImageFile(f) {
  if (!f || f.type.indexOf('image') !== 0) return;
  const rd = new FileReader();
  rd.onload = () => compressImg(rd.result);
  rd.readAsDataURL(f);
}
function compressImg(dataUrl) {
  const im = new Image();
  im.onload = () => {
    const MAX = 640;
    let w = im.width, h = im.height;
    if (w > MAX || h > MAX) { const k = MAX / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(im, 0, 0, w, h);
    hidePad();
    setImgDraft(cv.toDataURL('image/jpeg', 0.82));
  };
  im.src = dataUrl;
}
// ---- Inking pad (Notepad-smooth: pressure, smoothing, palm rejection, undo) ----
const pad = document.getElementById('pad');
const pctx = pad.getContext('2d');
let penOpen = false, padDirty = false;
let strokes = [];            // committed strokes: {tool,color,size,pts:[{x,y,p}]}
let cur = null;              // stroke being drawn
let activeId = null;         // active pointerId
let activeType = 'pen';      // 'pen' | 'mouse' | 'touch'
let lastPenTime = 0;
let curTool = 'pen';
let lastVp = 0.5;            // smoothed pseudo-pressure (mouse)
const dpr = Math.max(1, window.devicePixelRatio || 1);

function padRect() { return pad.getBoundingClientRect(); }
function resizePad() {
  const r = padRect();
  if (!r.width || !r.height) return;
  pad.width = Math.round(r.width * dpr);
  pad.height = Math.round(r.height * dpr);
  redrawPad();
}
function setupCtx() {
  pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  pctx.lineCap = 'round';
  pctx.lineJoin = 'round';
}
function segWidth(s, a, b) {
  const base = +document.getElementById('padsize').value;
  if (s.tool === 'eraser') return Math.max(2, base * 3);
  const p = ((a.p + b.p) / 2);
  return Math.max(0.6, base * (0.45 + 1.1 * p));
}
function drawSeg(s, a, b, prevMid) {
  pctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
  pctx.strokeStyle = s.color;
  pctx.lineWidth = segWidth(s, a, b);
  pctx.beginPath();
  if (prevMid) {
    pctx.moveTo(prevMid.x, prevMid.y);
    pctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  } else {
    pctx.moveTo(a.x, a.y);
    pctx.lineTo((a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  pctx.stroke();
}
function drawAll() {
  pctx.setTransform(1, 0, 0, 1, 0, 0);
  pctx.globalCompositeOperation = 'source-over';
  pctx.fillStyle = '#fff';
  pctx.fillRect(0, 0, pad.width, pad.height);
  setupCtx();
  for (const s of strokes) {
    const pts = s.pts;
    if (pts.length === 1) { drawSeg(s, pts[0], { x: pts[0].x + 0.01, y: pts[0].y + 0.01 }, null); continue; }
    let prevMid = null;
    for (let i = 1; i < pts.length; i++) {
      drawSeg(s, pts[i - 1], pts[i], prevMid);
      prevMid = { x: (pts[i - 1].x + pts[i].x) / 2, y: (pts[i - 1].y + pts[i].y) / 2 };
    }
    // tail to last point
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    if (prevMid) {
      pctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
      pctx.strokeStyle = s.color;
      pctx.lineWidth = segWidth(s, a, b);
      pctx.beginPath(); pctx.moveTo(prevMid.x, prevMid.y); pctx.lineTo(b.x, b.y); pctx.stroke();
    }
  }
  pctx.globalCompositeOperation = 'source-over';
}
function redrawPad() { drawAll(); }
function togglePad() {
  penOpen = !penOpen;
  document.getElementById('padwrap').classList.toggle('show', penOpen);
  document.getElementById('penbtn').textContent = penOpen ? '\u270d\ufe0f Pen: hide' : '\u270d\ufe0f Pen: draw';
  if (penOpen) { resizePad(); padDirty = false; }
}
function hidePad() {
  if (!penOpen) return;
  endStroke(false);
  penOpen = false;
  document.getElementById('padwrap').classList.remove('show');
  document.getElementById('penbtn').textContent = '\u270d\ufe0f Pen: draw';
}
function setTool(t) {
  curTool = t;
  document.getElementById('tool-pen').classList.toggle('active', t === 'pen');
  document.getElementById('tool-eraser').classList.toggle('active', t === 'eraser');
}
function clearPad() { strokes = []; padDirty = false; drawAll(); }
function undoPad() { endStroke(false); if (strokes.length) { strokes.pop(); drawAll(); padDirty = strokes.length > 0; } }
function padToDataUrl() {
  const cv = document.createElement('canvas'); cv.width = pad.width; cv.height = pad.height;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
  cx.drawImage(pad, 0, 0);
  return cv.toDataURL('image/jpeg', 0.85);
}
function evPt(e) {
  const r = padRect();
  let p = (e.pressure && e.pressure > 0 && e.pressure !== 0.5) ? e.pressure : 0;
  if (!p) {
    // mouse/no-pressure: velocity -> pseudo pressure (slow = thick, fast = thin)
    const v = Math.hypot(e.movementX || 0, e.movementY || 0);
    const target = Math.max(0.25, Math.min(1, 1 - v / 40));
    lastVp = lastVp * 0.7 + target * 0.3;
    p = lastVp;
  } else lastVp = p;
  return { x: e.clientX - r.left, y: e.clientY - r.top, p };
}
function startStroke(e, tool) {
  const s = { tool: tool || curTool, color: document.getElementById('padcolor').value, size: +document.getElementById('padsize').value, pts: [evPt(e)] };
  cur = s; strokes.push(s); padDirty = true;
  setupCtx();
  drawSeg(s, s.pts[0], { x: s.pts[0].x + 0.01, y: s.pts[0].y + 0.01 }, null);
}
function extendStroke(e) {
  if (!cur) return;
  const pts = cur.pts;
  const coalesced = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ce of coalesced) {
    const pt = evPt(ce);
    const n = pts.length;
    const prevMid = n >= 2 ? { x: (pts[n - 2].x + pts[n - 1].x) / 2, y: (pts[n - 2].y + pts[n - 1].y) / 2 } : null;
    drawSeg(cur, pts[n - 1], pt, prevMid);
    pts.push(pt);
  }
}
function endStroke(finish) {
  if (!cur) return;
  if (finish) drawAll();   // normalize the whole stroke (perfect smoothing)
  cur = null; activeId = null;
}
// Unified pointer pipeline: capture keeps strokes alive even if the pointer
// briefly leaves the canvas — same feel as Notepad/OneNote inking.
function effTool(e) {
  if (e.pointerType === 'pen' && (e.buttons & 32)) return 'eraser';  // stylus back-eraser button
  return curTool;
}
pad.addEventListener('pointerdown', e => {
  e.preventDefault();
  const isPen = e.pointerType === 'pen';
  if (isPen) lastPenTime = Date.now();
  // palm rejection: ignore touch right after pen use, or while a stroke is live
  if (activeId !== null) {
    if (!(isPen && activeType === 'touch')) return;
    endStroke(true);  // pen takes over from a palm-touch stroke
  }
  if (e.pointerType === 'touch' && Date.now() - lastPenTime < 1500) return;
  activeId = e.pointerId; activeType = e.pointerType || 'mouse';
  try { pad.setPointerCapture(e.pointerId); } catch (err) {}
  lastVp = 0.5;
  startStroke(e, effTool(e));
});
pad.addEventListener('pointermove', e => {
  if (e.pointerType === 'pen') lastPenTime = Date.now();
  if (activeId === null || e.pointerId !== activeId) return;
  e.preventDefault();
  extendStroke(e);
});
['pointerup', 'pointercancel'].forEach(n => pad.addEventListener(n, e => {
  if (activeId === null || e.pointerId !== activeId) return;
  endStroke(true);
}));
// Fallback (old browsers without Pointer Events)
if (!window.PointerEvent) {
  pad.addEventListener('mousedown', e => { activeId = 1; activeType = 'mouse'; lastVp = 0.5; startStroke(e, curTool); });
  pad.addEventListener('mousemove', e => { if (activeId === 1) extendStroke(e); });
  window.addEventListener('mouseup', () => endStroke(true));
  pad.addEventListener('touchstart', e => { e.preventDefault(); if (activeId !== null) return; activeId = e.touches[0].identifier; activeType = 'touch'; lastVp = 0.5; startStroke(e.touches[0], curTool); }, { passive: false });
  pad.addEventListener('touchmove', e => { e.preventDefault(); if (activeId === null) return; const t = Array.from(e.touches).find(t => t.identifier === activeId); if (t) extendStroke(t); }, { passive: false });
  ['touchend', 'touchcancel'].forEach(n => pad.addEventListener(n, e => { if (Array.from(e.changedTouches).some(t => t.identifier === activeId)) endStroke(true); }));
}
document.getElementById('padsize').addEventListener('input', () => { document.getElementById('padsizeval').textContent = document.getElementById('padsize').value + 'px'; if (cur) { /* live width adapts */ } else drawAll(); });
document.getElementById('padcolor').addEventListener('input', () => { if (!cur) drawAll(); });
window.addEventListener('resize', () => { if (penOpen) resizePad(); });

function positionPop(chipEl) {
  const r = chipEl.getBoundingClientRect();
  const pw = popup.offsetWidth, ph = popup.offsetHeight;
  let left = r.left;
  let top = r.bottom + 8;
  if (left + pw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - pw - 8);
  if (top + ph > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - ph - 8);  // clamp to viewport (popup scrolls internally)
    if (ph > window.innerHeight - 16) { top = 8; }
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
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (popup.classList.contains('editing')) { closeEdit(); } else { closePop(); } } });
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
