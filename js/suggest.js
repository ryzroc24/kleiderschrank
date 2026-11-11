// Vorschläge: Ersatz für das schwächste Teil + "Überrasch mich".
import { rateOutfit } from './rating.js';
import { availability, daysAgo, lastWorn, relDate } from './wardrobe.js';
import { KATEGORIEN } from './config.js';

// ── REGELN: Vorschläge ───────────────────────────────────────────────
export const VORSCHLAG_REGELN = {
  gewichtPaar: 1.0,      // max. Bonus für Kombis, die nie / lange nicht zusammen getragen wurden
  paarTageVoll: 60,      // ab 60 Tagen ohne gemeinsames Tragen gibt es den vollen Bonus
  gewichtFrische: 0.5,   // max. Bonus für Teile, die lange nicht getragen wurden
  frischeTageVoll: 30,
  bonusSauber: 0.3,      // frisch gewaschene ("sauber") Teile leicht bevorzugen
  toleranzWaesche: 3,    // ersetzt man ein Teil aus der Wäsche, darf das Rating um bis zu 3 Punkte sinken
  pflichtSlots: ['oberteil', 'hose', 'schuhe'],
  optionalChance: 0.4,   // Überrasch mich: Jacke/Accessoire mit 40 % Wahrscheinlichkeit
  versuche: 400,         // Überrasch mich: so viele Zufallskombis werden bewertet
  zufall: 1.2,           // Überrasch mich: Zufallsanteil (höher = abwechslungsreicher)
};
const R = VORSCHLAG_REGELN;

// ── Historie ─────────────────────────────────────────────────────────
// Letzter Tag, an dem zwei Teile zusammen getragen wurden (oder null)
export function lastTogether(a, b) {
  const set = new Set(a.wornDates || []);
  let last = null;
  for (const d of b.wornDates || []) if (set.has(d) && (!last || d > last)) last = d;
  return last;
}
const pairNovelty = (a, b) => { const d = lastTogether(a, b); return d ? Math.min(1, daysAgo(d) / R.paarTageVoll) : 1; };
const freshness = (it) => { const d = lastWorn(it); return d ? Math.min(1, daysAgo(d) / R.frischeTageVoll) : 1; };

// Bonus für ein ganzes Outfit (0 … gewichtPaar + gewichtFrische)
export function historyBonus(items) {
  let sum = 0, pairs = 0;
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) { sum += pairNovelty(items[i], items[j]); pairs++; }
  const pair = pairs ? sum / pairs : 1;
  const fresh = items.length ? items.reduce((s, it) => s + freshness(it), 0) / items.length : 1;
  return { pair, fresh, value: R.gewichtPaar * pair + R.gewichtFrische * fresh };
}
// Bonus für EIN Teil im Zusammenspiel mit den anderen
function itemHistory(item, others) {
  const pair = others.length ? others.reduce((s, o) => s + pairNovelty(item, o), 0) / others.length : 1;
  return R.gewichtPaar * pair + R.gewichtFrische * freshness(item);
}

// ── Schwächstes Teil ─────────────────────────────────────────────────
// Reihenfolge: zuerst nicht verfügbare Teile (Wäsche/diese Woche), dann das Teil,
// ohne das das Farb-Rating am stärksten steigt.
export function weakestOrder(items, settings) {
  const base = rateOutfit(items).raw ?? 0;
  return items.map((it) => {
    const rest = items.filter((x) => x !== it);
    const without = rest.length ? rateOutfit(rest).raw ?? base : base;
    return {
      item: it,
      blocked: availability(it, settings).ok ? 0 : 1,
      gain: without - base,
      bunt: it.colors?.[0]?.type === 'farbe' ? 1 : 0,
    };
  }).sort((a, b) => b.blocked - a.blocked || b.gain - a.gain || b.bunt - a.bunt).map((x) => x.item);
}

const names = (list) => list.map((i) => i.name).join(', ');

// ── Ersatzteil-Vorschläge ────────────────────────────────────────────
// selected: { slot: item }  → Liste von Vorschlägen, bestes zuerst
export function suggestSwaps(selected, allItems, settings) {
  const current = Object.values(selected).filter(Boolean);
  if (!current.length) return [];
  const before = rateOutfit(current);
  const base = before.raw ?? 0;
  const used = new Set(current.map((i) => i.id));
  const result = [];

  weakestOrder(current, settings).forEach((weak, rank) => {
    const others = current.filter((i) => i !== weak);
    const weakAvail = availability(weak, settings);
    const minRaw = weakAvail.ok ? base : base - R.toleranzWaesche;
    const cleanBonus = (it) => (it.status === 'sauber' ? R.bonusSauber : 0);
    const currentTotal = weakAvail.ok ? base + itemHistory(weak, others) + cleanBonus(weak) : -Infinity;

    allItems
      .filter((c) => c.category === weak.category && !used.has(c.id) && availability(c, settings).ok)
      .forEach((c) => {
        const after = rateOutfit([...others, c]);
        const raw = after.raw ?? 0;
        if (raw < minRaw) return;                              // Farben dürfen nicht schlechter werden
        const total = raw + itemHistory(c, others) + cleanBonus(c);
        if (total <= currentTotal + 0.05) return;             // kein echter Gewinn
        result.push({ weak, cand: c, before, after, total, rank, why: explainSwap(weak, weakAvail, c, others, before, after) });
      });
  });

  // Schwächstes Teil zuerst, innerhalb davon der beste Kandidat
  return result.sort((a, b) => a.rank - b.rank || b.total - a.total);
}

function explainSwap(weak, weakAvail, c, others, before, after) {
  const why = [];
  if (!weakAvail.ok) why.push(`${weak.name}: ${weakAvail.reason}`);
  if (after.score > (before.score ?? 0)) why.push(`Farben: ${after.score}/10 statt ${before.score}/10`);
  else why.push(`Farben bleiben bei ${after.score}/10`);
  const never = others.filter((o) => !lastTogether(c, o));
  if (others.length && never.length === others.length) why.push('Noch nie in dieser Kombination getragen');
  else if (never.length) why.push(`Noch nie zusammen mit ${names(never)} getragen`);
  else if (others.length) {
    const last = others.map((o) => lastTogether(c, o)).sort().pop();
    why.push(`Zuletzt ${relDate(last)} zusammen getragen`);
  }
  const lw = lastWorn(c);
  why.push(lw ? `${c.name} zuletzt ${relDate(lw)} getragen` : `${c.name} wurde noch nie getragen`);
  return why;
}

// ── Überrasch mich ───────────────────────────────────────────────────
const comboKey = (pick) => Object.values(pick).map((i) => i.id).sort().join('|');

export function surprise(allItems, settings, currentPick = {}) {
  const pools = {};
  KATEGORIEN.forEach((k) => { pools[k.id] = allItems.filter((i) => i.category === k.id && availability(i, settings).ok); });
  const missing = R.pflichtSlots.filter((s) => !pools[s].length);
  if (missing.length === R.pflichtSlots.length) return { missing };
  const avoid = comboKey(Object.fromEntries(Object.entries(currentPick).filter(([, v]) => v)));

  let best = null;
  for (let t = 0; t < R.versuche; t++) {
    const pick = {};
    for (const k of KATEGORIEN) {
      const pool = pools[k.id];
      if (!pool.length) continue;
      if (!R.pflichtSlots.includes(k.id) && Math.random() > R.optionalChance) continue;
      pick[k.id] = pool[Math.floor(Math.random() * pool.length)];
    }
    const items = Object.values(pick);
    if (!items.length || comboKey(pick) === avoid) continue;
    const rating = rateOutfit(items);
    const hist = historyBonus(items);
    const total = (rating.raw ?? 5) + hist.value + Math.random() * R.zufall;
    if (!best || total > best.total) best = { pick, rating, hist, total };
  }
  if (!best) return { missing };
  const items = Object.values(best.pick);
  const why = [];
  if (best.hist.pair >= 0.999 && items.length > 1) why.push('Noch nie so kombiniert');
  else if (best.hist.pair > 0.5) why.push('Lange nicht so kombiniert');
  if (best.hist.fresh > 0.6) why.push('Teile, die länger nicht dran waren');
  return { ...best, missing, why };
}
