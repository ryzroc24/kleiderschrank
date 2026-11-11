// Farberkennung: k-means auf den nicht transparenten Pixeln → 1–3 Hauptfarben als HSL,
// mit deutschem Namen und Typ (neutral/farbe).

// ── REGELN: Erkennung ────────────────────────────────────────────────
export const FARB_REGELN = {
  k: 3,              // max. Anzahl Farben
  minShare: 0.10,    // Farben mit weniger als 10 % Fläche werden verworfen
  mergeDeltaE: 13,   // Cluster mit kleinerem Lab-Abstand werden zusammengelegt (Licht/Schatten)
  mergeHue: 14,      // gleicher Farbton (± Grad) bei bunten Farben → zusammenlegen
  sampleMax: 20000,  // max. ausgewertete Pixel (Geschwindigkeit)
  alphaMin: 200,     // nur Pixel mit dieser Deckkraft zählen
};

// ── REGELN: Farbnamen ────────────────────────────────────────────────
// Reihenfolge zählt: die ERSTE passende Zeile gewinnt.
// h = Farbton 0–360° (Bereich darf über 0 laufen, z. B. [345, 12]), s = Sättigung 0–100, l = Helligkeit 0–100.
// neutral: true → zählt beim Rating als Neutralton (kombiniert sich mit allem).
export const FARBNAMEN = [
  { name: 'Schwarz',    l: [0, 12],                       neutral: true },
  { name: 'Weiß',       l: [94, 100],                     neutral: true },
  { name: 'Schwarz',    s: [0, 12],  l: [0, 22],          neutral: true },
  { name: 'Anthrazit',  s: [0, 12],  l: [22, 40],         neutral: true },
  { name: 'Grau',       s: [0, 12],  l: [40, 70],         neutral: true },
  { name: 'Hellgrau',   s: [0, 12],  l: [70, 85],         neutral: true },
  { name: 'Weiß',       s: [0, 12],  l: [85, 100],        neutral: true },
  { name: 'Marineblau', h: [200, 255], l: [0, 30],        neutral: true },
  { name: 'Jeansblau',  h: [195, 230], s: [12, 50], l: [25, 72], neutral: true },
  { name: 'Creme',      h: [30, 65],  s: [12, 60], l: [82, 94], neutral: true },
  { name: 'Braun',      h: [10, 45],  s: [12, 80], l: [12, 42], neutral: true },
  { name: 'Camel',      h: [20, 42],  s: [25, 60], l: [42, 60], neutral: true },
  { name: 'Beige',      h: [20, 60],  s: [12, 60], l: [60, 88], neutral: true },
  { name: 'Khaki',      h: [45, 75],  s: [12, 45], l: [30, 65], neutral: true },
  { name: 'Oliv',       h: [60, 95],  l: [0, 38],         neutral: true },
  { name: 'Grau',       s: [12, 15],                      neutral: true },
  { name: 'Bordeaux',   h: [330, 12], l: [0, 30] },
  { name: 'Rosa',       h: [330, 15], l: [72, 100] },
  { name: 'Rot',        h: [345, 12] },
  { name: 'Apricot',    h: [12, 40],  l: [72, 100] },
  { name: 'Orange',     h: [12, 40] },
  { name: 'Senfgelb',   h: [40, 60],  l: [0, 50] },
  { name: 'Gelb',       h: [40, 65] },
  { name: 'Limette',    h: [65, 95] },
  { name: 'Dunkelgrün', h: [95, 165], l: [0, 28] },
  { name: 'Mint',       h: [95, 175], l: [72, 100] },
  { name: 'Grün',       h: [95, 165] },
  { name: 'Petrol',     h: [165, 200], l: [0, 38] },
  { name: 'Türkis',     h: [165, 200] },
  { name: 'Hellblau',   h: [200, 250], l: [70, 100] },
  { name: 'Blau',       h: [200, 250] },
  { name: 'Flieder',    h: [250, 290], l: [70, 100] },
  { name: 'Lila',       h: [250, 290] },
  { name: 'Rosa',       h: [290, 345], l: [75, 100] },
  { name: 'Pink',       h: [290, 345], s: [50, 100] },
  { name: 'Altrosa',    h: [290, 345] },
];

const inRange = (v, r) => !r || (r[0] <= r[1] ? v >= r[0] && v <= r[1] : v >= r[0] || v <= r[1]);

export function colorName(h, s, l) {
  const rule = FARBNAMEN.find((r) => inRange(h, r.h) && inRange(s, r.s) && inRange(l, r.l));
  return rule ? { name: rule.name, type: rule.neutral ? 'neutral' : 'farbe' } : { name: 'Bunt', type: 'farbe' };
}

// ── Umrechnungen ─────────────────────────────────────────────────────
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h) % 360, s: Math.round(s * 100), l: Math.round(l * 100) };
}

export const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// sRGB → Lab (für wahrnehmungsnahe Abstände)
const LIN = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const fLab = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
export function rgbToLab(r, g, b) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const x = fLab((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const y = fLab(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const z = fLab((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

// Mode und Malerei denken im RYB-Farbkreis (Rot–Gelb–Blau). Dort liegen Rot/Grün, Blau/Orange und
// Gelb/Lila gegenüber. Diese Funktion rechnet den HSL-Farbton in einen RYB-Farbton um (für Rating-Regeln).
const RYB_PUNKTE = [[0, 0], [35, 60], [60, 120], [120, 180], [180, 210], [240, 240], [300, 300], [360, 360]];
export function rybHue(h) {
  for (let i = 1; i < RYB_PUNKTE.length; i++) {
    const [a0, b0] = RYB_PUNKTE[i - 1], [a1, b1] = RYB_PUNKTE[i];
    if (h <= a1) return b0 + ((h - a0) * (b1 - b0)) / (a1 - a0);
  }
  return h;
}

// Kürzester Abstand zweier Farbtöne auf dem Farbkreis (0–180°)
export function hueDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// Ein Farb-Objekt, wie es am Kleidungsstück gespeichert wird
export function makeColor(r, g, b, share = 1) {
  const { h, s, l } = rgbToHsl(r, g, b);
  return { hex: rgbToHex(r, g, b), h, s, l, share: Math.round(share * 100) / 100, ...colorName(h, s, l) };
}
export const colorFromHex = (hex, share = 1) => makeColor(...hexToRgb(hex), share);

// ── k-means ──────────────────────────────────────────────────────────
function rng(seed) { // deterministischer Zufall → gleiche Eingabe, gleiches Ergebnis
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function kmeans(pts, n, k, iters = 12) {
  const rand = rng(42);
  const d2 = (i, c) => { const a = pts[i * 3] - c[0], b = pts[i * 3 + 1] - c[1], e = pts[i * 3 + 2] - c[2]; return a * a + b * b + e * e; };
  // k-means++ Start
  const centers = [];
  let first = Math.floor(rand() * n);
  centers.push([pts[first * 3], pts[first * 3 + 1], pts[first * 3 + 2]]);
  const dist = new Float64Array(n);
  while (centers.length < k) {
    let sum = 0;
    for (let i = 0; i < n; i++) { dist[i] = Math.min(...centers.map((c) => d2(i, c))); sum += dist[i]; }
    if (sum === 0) break;
    let r = rand() * sum, idx = 0;
    while ((r -= dist[idx]) > 0 && idx < n - 1) idx++;
    centers.push([pts[idx * 3], pts[idx * 3 + 1], pts[idx * 3 + 2]]);
  }
  const assign = new Uint8Array(n);
  for (let it = 0; it < iters; it++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < centers.length; c++) { const d = d2(i, centers[c]); if (d < bd) { bd = d; best = c; } }
      assign[i] = best;
      const s = sums[best]; s[0] += pts[i * 3]; s[1] += pts[i * 3 + 1]; s[2] += pts[i * 3 + 2]; s[3]++;
    }
    centers.forEach((c, j) => { const s = sums[j]; if (s[3]) { c[0] = s[0] / s[3]; c[1] = s[1] / s[3]; c[2] = s[2] / s[3]; } });
  }
  return { centers, assign };
}

// ── Hauptfarben aus Bilddaten ────────────────────────────────────────
export function extractColorsFromImageData(data, w, h) {
  const R = FARB_REGELN;
  const total = w * h;
  const step = Math.max(1, Math.floor(Math.sqrt(total / R.sampleMax)));
  const lab = [], rgb = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < R.alphaMin) continue;
      lab.push(...rgbToLab(data[i], data[i + 1], data[i + 2]));
      rgb.push(data[i], data[i + 1], data[i + 2]);
    }
  }
  const n = rgb.length / 3;
  if (n < 20) return [];
  const pts = Float32Array.from(lab);
  const { centers, assign } = kmeans(pts, n, Math.min(R.k, n));

  // Cluster mit Durchschnitts-RGB und Anteil
  let clusters = centers.map((c) => ({ lab: [...c], rgb: [0, 0, 0], count: 0 }));
  for (let i = 0; i < n; i++) {
    const c = clusters[assign[i]];
    c.rgb[0] += rgb[i * 3]; c.rgb[1] += rgb[i * 3 + 1]; c.rgb[2] += rgb[i * 3 + 2]; c.count++;
  }
  clusters = clusters.filter((c) => c.count > 0);
  clusters.forEach((c) => { c.rgb = c.rgb.map((v) => v / c.count); });

  // Ähnliche Cluster zusammenlegen (Schatten, Falten, Lichtreflexe)
  let merged = true;
  while (merged && clusters.length > 1) {
    merged = false;
    outer: for (let a = 0; a < clusters.length; a++) {
      for (let b = a + 1; b < clusters.length; b++) {
        if (shouldMerge(clusters[a], clusters[b])) {
          const A = clusters[a], B = clusters[b], t = A.count + B.count;
          A.lab = A.lab.map((v, i) => (v * A.count + B.lab[i] * B.count) / t);
          A.rgb = A.rgb.map((v, i) => (v * A.count + B.rgb[i] * B.count) / t);
          A.count = t;
          clusters.splice(b, 1);
          merged = true;
          break outer;
        }
      }
    }
  }

  clusters.sort((a, b) => b.count - a.count);
  let kept = clusters.filter((c, i) => i === 0 || c.count / n >= R.minShare);
  const keptTotal = kept.reduce((s, c) => s + c.count, 0);
  return kept.slice(0, R.k).map((c) => makeColor(...c.rgb.map(Math.round), c.count / keptTotal));
}

function shouldMerge(A, B) {
  const dl = A.lab[0] - B.lab[0], da = A.lab[1] - B.lab[1], db = A.lab[2] - B.lab[2];
  if (Math.sqrt(dl * dl + da * da + db * db) < FARB_REGELN.mergeDeltaE) return true;
  const a = makeColor(...A.rgb), b = makeColor(...B.rgb);
  if (a.name === b.name) return true;
  const grauA = a.s < 15 || a.l < 12, grauB = b.s < 15 || b.l < 12;
  if (grauA && grauB && Math.abs(dl) < 22) return true;                       // Schwarz/Anthrazit durch Schatten
  if (!grauA && !grauB && hueDist(a.h, b.h) < FARB_REGELN.mergeHue && Math.abs(a.s - b.s) < 30) return true;
  return false;
}

// Aus einem gespeicherten Bild (Blob) neu erkennen
export async function extractColors(blob) {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, 160 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return extractColorsFromImageData(ctx.getImageData(0, 0, w, h).data, w, h);
}
