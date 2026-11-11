// Hintergrund entfernen – ohne KI: Flood-Fill von den Bildrändern, Zauberstab, Radierer/Pinsel, Rückgängig.
// Optional: lokales KI-Modell (RMBG-1.4) im Browser, wird erst auf Knopfdruck geladen.
import { rgbToLab, kmeans, extractColorsFromImageData } from './colors.js';
import { BILD } from './config.js';
import { h, openPage, toast, confirmDialog, spinner } from './ui.js';

// ── REGELN: Freistellen ──────────────────────────────────────────────
export const FREISTELL_REGELN = {
  standardToleranz: 30,  // Startwert des Reglers, falls die Automatik nichts findet (0 = Rand-Automatik aus)
  autoToleranz: true,    // Startwert pro Foto automatisch wählen (Otsu-Schwelle zwischen Rand- und Teil-Farben)
  autoFaktor: 0.7,       // … davon 70 % nehmen (lieber etwas Rand stehen lassen als ins Teil schneiden)
  toleranzFaktor: 0.6,   // Regler × Faktor = erlaubter Farbabstand (Lab-Einheiten)
  helligkeitGewicht: 0.75, // Helligkeit zählt nur 75 % → Schatten auf dem Hintergrund werden eher mit entfernt
  minInsel: 0.02,        // übrig gebliebene Flecken < 2 % des größten Teils werden entfernt
  randFarben: 3,         // so viele Hintergrundfarben werden am Bildrand gelernt
  kiModell: 'briaai/RMBG-1.4',
  kiBibliothek: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js',
};
const R = FREISTELL_REGELN;

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht geladen werden')); };
    img.src = url;
  });
}
const toBlob = (cv, type, q) => new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Export fehlgeschlagen'))), type, q));

export class BgEditor {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.tool = 'wand';
    this.brush = 18;          // Pinselradius in Bildschirm-Pixeln
    this.ghost = false;       // Entferntes rötlich anzeigen
    this.tolerance = R.standardToleranz;
    this.mode = 'auto';       // 'auto' (Rand-Flood-Fill) oder 'ki'
    this.ops = [];            // manuelle Schritte (für Rückgängig / Neuberechnung)
    this.onChange = null;
    this._bindPointer();
  }

  async load(blob) {
    const img = await loadImage(blob);
    const s = Math.min(1, BILD.max / Math.max(img.naturalWidth, img.naturalHeight));
    const W = (this.W = Math.max(1, Math.round(img.naturalWidth * s)));
    const H = (this.H = Math.max(1, Math.round(img.naturalHeight * s)));
    this.srcCanvas = document.createElement('canvas');
    this.srcCanvas.width = W; this.srcCanvas.height = H;
    const sctx = this.srcCanvas.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(img, 0, 0, W, H);
    this.src = sctx.getImageData(0, 0, W, H).data;
    this.cv.width = W; this.cv.height = H;
    this.out = this.ctx.createImageData(W, H);

    // Lab-Werte einmal vorberechnen (Helligkeit gewichtet)
    const n = W * H, src = this.src;
    this.lab = new Float32Array(n * 3);
    const cache = new Map();
    for (let i = 0; i < n; i++) {
      const key = (src[i * 4] << 16) | (src[i * 4 + 1] << 8) | src[i * 4 + 2];
      let v = cache.get(key);
      if (!v) { v = rgbToLab(src[i * 4], src[i * 4 + 1], src[i * 4 + 2]); v[0] *= R.helligkeitGewicht; if (cache.size < 200000) cache.set(key, v); }
      this.lab[i * 3] = v[0]; this.lab[i * 3 + 1] = v[1]; this.lab[i * 3 + 2] = v[2];
    }
    this.base = new Uint8ClampedArray(n);
    this.mask = new Uint8ClampedArray(n);
    this.border = this._borderIndices();
    this.refs = this._borderRefs();
    if (R.autoToleranz) this.tolerance = this._autoTolerance();
    this.startTolerance = this.tolerance;
    this.recompute();
  }

  // Otsu-Verfahren: Histogramm der Farbabstände zur nächsten Randfarbe → beste Trennschwelle
  _autoTolerance() {
    const n = this.W * this.H, lab = this.lab, bins = new Float64Array(101);
    const step = Math.max(1, Math.floor(n / 60000));
    for (let i = 0; i < n; i += step) {
      let best = Infinity;
      for (const r of this.refs) {
        const a = lab[i * 3] - r[0], b = lab[i * 3 + 1] - r[1], c = lab[i * 3 + 2] - r[2];
        best = Math.min(best, a * a + b * b + c * c);
      }
      bins[Math.min(100, Math.sqrt(best)) | 0]++;
    }
    let total = 0, sumAll = 0;
    bins.forEach((v, t) => { total += v; sumAll += t * v; });
    let wB = 0, sumB = 0, best = 0, thr = 0;
    for (let t = 0; t <= 100; t++) {
      wB += bins[t]; sumB += t * bins[t];
      const wF = total - wB;
      if (!wB || !wF) continue;
      const v = wB * wF * (sumB / wB - (sumAll - sumB) / wF) ** 2;
      if (v > best) { best = v; thr = t; }
    }
    if (!thr) return R.standardToleranz;
    return Math.round(Math.min(90, Math.max(6, (thr * R.autoFaktor) / R.toleranzFaktor)));
  }

  _borderIndices() {
    const { W, H } = this, out = [];
    for (let x = 0; x < W; x++) out.push(x, (H - 1) * W + x);
    for (let y = 1; y < H - 1; y++) out.push(y * W, y * W + W - 1);
    return out;
  }

  // Typische Hintergrundfarben am Rand lernen (k-means), seltene Randfarben ignorieren
  _borderRefs() {
    const idx = this.border, m = idx.length, pts = new Float32Array(m * 3);
    idx.forEach((p, i) => { pts[i * 3] = this.lab[p * 3]; pts[i * 3 + 1] = this.lab[p * 3 + 1]; pts[i * 3 + 2] = this.lab[p * 3 + 2]; });
    const { centers, assign } = kmeans(pts, m, R.randFarben, 8);
    const counts = centers.map(() => 0);
    for (let i = 0; i < m; i++) counts[assign[i]]++;
    return centers.filter((_, j) => counts[j] / m >= 0.1);
  }

  // Flood-Fill: setzt in target alle mit dem Startpunkt verbundenen Pixel auf 0,
  // deren Farbe nah an einer der Referenzfarben (refs) liegt
  _flood(seeds, refs, thr, target) {
    const { W, H, lab } = this, n = W * H;
    const visited = new Uint8Array(n), queue = new Int32Array(n);
    const thr2 = thr * thr;
    const refDist = (i) => {
      let best = Infinity;
      for (const r of refs) {
        const a = lab[i * 3] - r[0], b = lab[i * 3 + 1] - r[1], c = lab[i * 3 + 2] - r[2];
        const d = a * a + b * b + c * c;
        if (d < best) best = d;
      }
      return best;
    };
    let qh = 0, qt = 0;
    for (const s of seeds) if (!visited[s] && refDist(s) <= thr2) { visited[s] = 1; queue[qt++] = s; }
    const tryAdd = (q) => { if (!visited[q] && refDist(q) <= thr2) { visited[q] = 1; queue[qt++] = q; } };
    while (qh < qt) {
      const p = queue[qh++];
      target[p] = 0;
      const x = p % W;
      if (x > 0) tryAdd(p - 1);
      if (x < W - 1) tryAdd(p + 1);
      if (p >= W) tryAdd(p - W);
      if (p < n - W) tryAdd(p + W);
    }
  }

  // Kleine Vordergrund-Flecken entfernen (Staub, Muster im Hintergrund)
  _removeIslands(mask) {
    const { W } = this, n = mask.length;
    const label = new Int32Array(n), queue = new Int32Array(n), sizes = [0];
    let cur = 0, maxSize = 0;
    for (let i = 0; i < n; i++) {
      if (!mask[i] || label[i]) continue;
      cur++;
      let qh = 0, qt = 0;
      queue[qt++] = i; label[i] = cur;
      while (qh < qt) {
        const p = queue[qh++], x = p % W;
        const nb = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W];
        for (const q of nb) if (q >= 0 && q < n && mask[q] && !label[q]) { label[q] = cur; queue[qt++] = q; }
      }
      sizes[cur] = qt;
      if (qt > maxSize) maxSize = qt;
    }
    const min = Math.max(30, maxSize * R.minInsel);
    for (let i = 0; i < n; i++) if (mask[i] && sizes[label[i]] < min) mask[i] = 0;
  }

  _autoMask() {
    this.base.fill(255);
    if (this.tolerance <= 0) return;
    this._flood(this.border, this.refs, this.tolerance * R.toleranzFaktor, this.base);
    this._removeIslands(this.base);
  }

  recompute() {
    if (this.mode === 'ki') this.base.set(this.kiMask);
    else this._autoMask();
    this._replay();
  }

  _replay() {
    this.mask.set(this.base);
    for (const op of this.ops) this._applyOp(op);
    this.render();
  }

  _applyOp(op) {
    if (op.type === 'wand') {
      const l = this.lab, i = op.idx;
      this._flood([i], [[l[i * 3], l[i * 3 + 1], l[i * 3 + 2]]], op.thr, this.mask);
    } else {
      const val = op.type === 'erase' ? 0 : 255, p = op.pts;
      this._stamp(p[0], p[1], op.r, val);
      for (let i = 2; i < p.length; i += 2) this._line(p[i - 2], p[i - 1], p[i], p[i + 1], op.r, val);
    }
  }

  _stamp(x, y, r, val) {
    const { W, H, mask } = this, r2 = r * r;
    const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r));
    const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r));
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const dx = xx - x, dy = yy - y;
      if (dx * dx + dy * dy <= r2) mask[yy * W + xx] = val;
    }
  }
  _line(x0, y0, x1, y1, r, val) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / Math.max(1, r * 0.4)));
    for (let i = 1; i <= steps; i++) this._stamp(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, r, val);
  }

  render() {
    const { src, mask, out } = this, d = out.data, n = this.W * this.H, ghost = this.ghost;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const a = mask[i];
      if (ghost && a < 128) { // entfernte Bereiche rötlich durchscheinen lassen
        d[j] = (src[j] + 230) >> 1; d[j + 1] = (src[j + 1] + 40) >> 1; d[j + 2] = (src[j + 2] + 60) >> 1; d[j + 3] = 150;
      } else {
        d[j] = src[j]; d[j + 1] = src[j + 1]; d[j + 2] = src[j + 2]; d[j + 3] = a;
      }
    }
    this.ctx.putImageData(out, 0, 0);
  }
  _scheduleRender() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(); });
  }

  // ── Touch / Maus ──
  _pos(e) {
    const r = this.cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * this.W) / r.width, y: ((e.clientY - r.top) * this.H) / r.height, sx: e.clientX, sy: e.clientY };
  }
  _bindPointer() {
    const cv = this.cv;
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', (e) => {
      if (!this.src) return;
      e.preventDefault();
      cv.setPointerCapture?.(e.pointerId);
      const p = this._pos(e);
      if (this.tool === 'wand') { this._down = p; return; }
      const r = (this.brush * this.W) / cv.getBoundingClientRect().width;
      this._stroke = { type: this.tool, r, pts: [p.x, p.y] };
      this._stamp(p.x, p.y, r, this.tool === 'erase' ? 0 : 255);
      this._scheduleRender();
    });
    cv.addEventListener('pointermove', (e) => {
      const s = this._stroke;
      if (!s) return;
      const val = s.type === 'erase' ? 0 : 255;
      const co = e.getCoalescedEvents?.();
      for (const ev of co && co.length ? co : [e]) {
        const p = this._pos(ev), n = s.pts.length;
        this._line(s.pts[n - 2], s.pts[n - 1], p.x, p.y, s.r, val);
        s.pts.push(p.x, p.y);
      }
      this._scheduleRender();
    });
    const end = (e) => {
      if (this._stroke) { this.ops.push(this._stroke); this._stroke = null; this.onChange?.(); }
      else if (this._down && e.type === 'pointerup') {
        const p = this._pos(e);
        if (Math.hypot(p.sx - this._down.sx, p.sy - this._down.sy) < 12) this.wandAt(this._down.x, this._down.y);
      }
      this._down = null;
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
  }

  wandAt(x, y) {
    const xi = Math.min(this.W - 1, Math.max(0, Math.round(x))), yi = Math.min(this.H - 1, Math.max(0, Math.round(y)));
    const op = { type: 'wand', idx: yi * this.W + xi, thr: Math.max(10, this.tolerance * R.toleranzFaktor) };
    this._applyOp(op);
    this.ops.push(op);
    this.render();
    this.onChange?.();
  }

  setTolerance(v) { this.tolerance = v; if (this.mode === 'auto') this.recompute(); }
  undo() { if (!this.ops.length) return false; this.ops.pop(); this._replay(); this.onChange?.(); return true; }
  reset() { this.ops = []; this.mode = 'auto'; this.kiMask = null; this.tolerance = this.startTolerance; this.recompute(); this.onChange?.(); }

  // ── Optional: lokales KI-Modell ──
  async runKI(onStatus) {
    const T = await getKI(onStatus);
    onStatus('Berechne Maske … (10–60 Sekunden)');
    const blob = await toBlob(this.srcCanvas, 'image/png');
    const url = URL.createObjectURL(blob);
    try {
      const image = await T.lib.RawImage.fromURL(url);
      const { pixel_values } = await T.processor(image);
      const { output } = await T.model({ input: pixel_values });
      const m = await T.lib.RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(this.W, this.H);
      const n = this.W * this.H, ch = m.channels || 1;
      this.kiMask = new Uint8ClampedArray(n);
      for (let i = 0; i < n; i++) this.kiMask[i] = m.data[i * ch];
    } finally { URL.revokeObjectURL(url); }
    this.mode = 'ki';
    this.ops = [];
    this.recompute();
    this.onChange?.();
  }

  // ── Ergebnis: zugeschnittenes PNG (max. 800 px), Vorschaubild, Original, Farben ──
  async export() {
    const { W, H, src } = this, n = W * H;
    let alpha = Uint8ClampedArray.from(this.mask);
    if (this.mode === 'auto') alpha = erode(alpha, W, H);
    alpha = blur3(alpha, W, H); // weiche Kante

    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let i = 0; i < n; i++) if (alpha[i] > 8) {
      const x = i % W, y = (i / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) throw new Error('Es ist nichts mehr übrig – Toleranz verringern oder Pinsel benutzen.');
    const pad = 6;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const crop = document.createElement('canvas');
    crop.width = cw; crop.height = ch;
    const cctx = crop.getContext('2d');
    const id = cctx.createImageData(cw, ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const si = (y + y0) * W + (x + x0), di = (y * cw + x) * 4;
      id.data[di] = src[si * 4]; id.data[di + 1] = src[si * 4 + 1]; id.data[di + 2] = src[si * 4 + 2]; id.data[di + 3] = alpha[si];
    }
    cctx.putImageData(id, 0, 0);
    const colors = extractColorsFromImageData(id.data, cw, ch);

    const ts = Math.min(1, BILD.thumb / Math.max(cw, ch));
    const th = document.createElement('canvas');
    th.width = Math.max(1, Math.round(cw * ts)); th.height = Math.max(1, Math.round(ch * ts));
    th.getContext('2d').drawImage(crop, 0, 0, th.width, th.height);

    const [image, thumb, orig] = await Promise.all([toBlob(crop, 'image/png'), toBlob(th, 'image/png'), toBlob(this.srcCanvas, 'image/jpeg', 0.88)]);
    crop.width = th.width = 0;
    return { image, thumb, orig, colors };
  }

  destroy() {
    if (this.srcCanvas) this.srcCanvas.width = 0;
    this.cv.width = 0;
    this.src = this.lab = this.mask = this.base = null;
  }
}

function erode(a, W, H) {
  const o = new Uint8ClampedArray(a.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    o[i] = Math.min(a[i], x > 0 ? a[i - 1] : 0, x < W - 1 ? a[i + 1] : 0, y > 0 ? a[i - W] : 0, y < H - 1 ? a[i + W] : 0);
  }
  return o;
}
function blur3(a, W, H) {
  const o = new Uint8ClampedArray(a.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0, c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < W && yy >= 0 && yy < H) { s += a[yy * W + xx]; c++; }
    }
    o[y * W + x] = s / c;
  }
  return o;
}

// KI-Bibliothek + Modell nur einmal laden (Browser-Cache hält es danach offline bereit)
let kiPromise = null;
function getKI(onStatus) {
  if (!kiPromise) {
    kiPromise = (async () => {
      onStatus('Lade KI-Bibliothek …');
      const lib = await import(R.kiBibliothek);
      lib.env.allowLocalModels = false;
      lib.env.backends.onnx.wasm.numThreads = 1; // 1 Thread = weniger Arbeitsspeicher (iPhone-Tab-Limit)
      const progress_callback = (p) => {
        if (p.status === 'progress' && p.total > 1e6) onStatus(`Lade Modell … ${Math.round(p.progress)} % (einmalig)`);
      };
      const model = await lib.AutoModel.from_pretrained(R.kiModell, {
        config: { model_type: 'custom' }, dtype: 'q8', progress_callback,
        // Speicher sparen: kein Memory-Arena/-Pattern, einfache Optimierung (sonst bis ~870 statt ~700 MB)
        session_options: { graphOptimizationLevel: 'basic', enableCpuMemArena: false, enableMemPattern: false },
      });
      const processor = await lib.AutoProcessor.from_pretrained(R.kiModell, {
        config: {
          do_normalize: true, do_pad: false, do_rescale: true, do_resize: true,
          image_mean: [0.5, 0.5, 0.5], image_std: [1, 1, 1], resample: 2,
          rescale_factor: 1 / 255, feature_extractor_type: 'ImageFeatureExtractor',
          size: { width: 1024, height: 1024 },
        },
      });
      return { lib, model, processor };
    })();
    kiPromise.catch(() => { kiPromise = null; });
  }
  return kiPromise;
}

// Merker in localStorage: läuft die KI und die Seite wird beendet, bleibt er stehen und beim nächsten Versuch kommt eine Warnung.
// kiMerker('Laden') setzt, kiMerker(null) löscht, kiMerker() liest (undefined = kein Absturz).
function kiMerker(wert) {
  try {
    if (wert === undefined) return localStorage.getItem('ki-phase') || '';
    if (wert === null) localStorage.removeItem('ki-phase'); else localStorage.setItem('ki-phase', wert);
  } catch { /* Speicher gesperrt: egal */ }
  return '';
}

// ── Editor-Ansicht ───────────────────────────────────────────────────
// Öffnet den Freistell-Editor. Ergebnis: { image, thumb, orig, colors } oder null (abgebrochen).
export function openEditor(blob) {
  return new Promise((resolve) => {
    const canvas = h('canvas', { class: 'editor-canvas checker' });
    const ed = new BgEditor(canvas);
    let finished = false;
    const finish = (v) => { if (finished) return; finished = true; page.close(); ed.destroy(); resolve(v); };

    const btnNext = h('button', { class: 'btn primary small', onclick: async () => {
      btnNext.disabled = true;
      const sp = spinner('Bild wird gespeichert …');
      try { finish(await ed.export()); }
      catch (e) { toast(e.message); btnNext.disabled = false; }
      finally { sp.close(); }
    } }, 'Weiter');
    const page = openPage({
      title: 'Freistellen',
      left: h('button', { class: 'btn ghost small', onclick: () => finish(null) }, 'Abbrechen'),
      right: btnNext,
    });

    const toolBtn = (tool, icon, label) => h('button', { class: `tool ${ed.tool === tool ? 'active' : ''}`, dataset: { tool }, onclick: () => setTool(tool) },
      h('span', { class: 'tool-icon' }, icon), h('span', {}, label));
    const tools = h('div', { class: 'tools' },
      toolBtn('wand', '🪄', 'Zauberstab'), toolBtn('erase', '🧽', 'Radierer'), toolBtn('restore', '🖌️', 'Pinsel'),
      h('button', { class: 'tool', onclick: () => { if (!ed.undo()) toast('Nichts zum Rückgängigmachen'); } }, h('span', { class: 'tool-icon' }, '↶'), h('span', {}, 'Zurück')));
    const setTool = (t) => { ed.tool = t; tools.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t)); hint.textContent = HINTS[t]; };
    const HINTS = {
      wand: 'Tippe auf Hintergrund-Reste (z. B. zwischen Arm und Körper), um sie zu entfernen.',
      erase: 'Mit dem Finger über Stellen malen, die weg sollen.',
      restore: 'Mit dem Finger über Stellen malen, die wieder sichtbar werden sollen.',
    };
    const hint = h('p', { class: 'hint' }, HINTS.wand);

    const tolVal = h('output', {}, String(ed.tolerance));
    let tolTimer;
    const tol = h('input', { type: 'range', min: 0, max: 100, value: ed.tolerance, oninput: () => {
      tolVal.textContent = tol.value === '0' ? 'aus' : tol.value;
      clearTimeout(tolTimer);
      tolTimer = setTimeout(() => ed.setTolerance(+tol.value), 60);
    } });
    const tolRow = h('label', { class: 'slider' }, h('span', {}, 'Rand-Toleranz'), tol, tolVal);
    const brush = h('input', { type: 'range', min: 6, max: 50, value: ed.brush, oninput: () => { ed.brush = +brush.value; } });

    const kiBtn = h('button', { class: 'btn small', onclick: async () => {
      // Wurde die Seite beim letzten Versuch von iOS beendet (zu wenig Arbeitsspeicher), steht der Merker noch da
      const last = kiMerker();
      const warn = last
        ? `\n\nACHTUNG: Der letzte Versuch ist in der Phase „${last}" abgestürzt (Handy hat die Seite beendet, vermutlich zu wenig Arbeitsspeicher). ` +
          'Schließ vorher andere Apps und Safari-Tabs. Wenn es wieder abstürzt, nimm Zauberstab/Radierer/Pinsel.'
        : '';
      const ok = await confirmDialog('Lokales KI-Modell',
        'Lädt einmalig ca. 65 MB (Modell RMBG-1.4 + Laufzeit) aus dem Internet und speichert es im Browser-Cache. ' +
        'Dein Foto wird NICHT hochgeladen – die Berechnung läuft komplett auf dem Handy und braucht ca. 700 MB Arbeitsspeicher. ' +
        'Kann auf älteren iPhones abbrechen.' + warn, 'Laden & ausführen');
      if (!ok) return;
      const sp = spinner('Starte …');
      kiMerker('Laden');
      try {
        await ed.runKI((t) => { sp.set(t); if (t.startsWith('Berechne')) kiMerker('Berechnung'); });
        kiMerker(null);
        tolRow.classList.add('disabled');
        toast('KI-Maske fertig – mit Radierer/Pinsel nachbessern');
      } catch (e) {
        console.error(e);
        kiMerker(null);
        toast('KI fehlgeschlagen: ' + (e.message || e), 5000);
      } finally { sp.close(); }
    } }, '✨ Besser (lokales KI-Modell)');

    const ghost = h('input', { type: 'checkbox', onchange: () => { ed.ghost = ghost.checked; ed.render(); } });

    page.body.classList.add('editor');
    page.body.append(
      h('div', { class: 'editor-stage' }, canvas),
      h('div', { class: 'editor-controls' },
        tools, hint, tolRow,
        h('label', { class: 'slider' }, h('span', {}, 'Pinselgröße'), brush, h('span')),
        h('div', { class: 'row wrap' },
          h('label', { class: 'check' }, ghost, 'Entferntes rot zeigen'),
          h('button', { class: 'btn ghost small', onclick: () => { ed.reset(); tol.value = ed.tolerance; tolVal.textContent = ed.tolerance; tolRow.classList.remove('disabled'); } }, 'Zurücksetzen')),
        kiBtn));

    const sp = spinner('Bild wird vorbereitet …');
    ed.load(blob)
      .then(() => { tol.value = ed.tolerance; tolVal.textContent = ed.tolerance; })
      .catch((e) => { toast(e.message); finish(null); })
      .finally(() => sp.close());
  });
}
