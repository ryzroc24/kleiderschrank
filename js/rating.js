// Farb-Rating 0–10, rein regelbasiert, mit kurzer Begründung.
// Farbabstände werden im RYB-Farbkreis (Malerfarbkreis) gemessen, siehe rybHue() in colors.js.
import { hueDist, rybHue } from './colors.js';

// ── REGELN: Rating ───────────────────────────────────────────────────
export const RATING_REGELN = {
  zweitfarbeAb: 0.25,   // Zweit-/Drittfarbe eines Teils zählt erst ab 25 % Fläche
  gleicherTon: 25,      // Farbtöne bis 25° Abstand gelten als "dieselbe Farbe"
  analogMax: 45,        // bis 45° Abstand = analog (Nachbarn im Farbkreis)
  verwandtMax: 75,      // bis 75° = verwandt
  komplementaerAb: 140, // ab 140° = komplementär (gegenüber im Farbkreis)
  triadeToleranz: 25,   // drei Farben je ~120° auseinander

  // Grundpunkte je nach Farbsituation
  punkte: {
    nurNeutral: 7,
    neutralPlusAkzent: 9,
    tonInTon: 8,
    analog: 8.5,
    verwandt: 7,
    komplementaer: 8,
    unklar: 5,
    dreiAnalog: 7.5,
    triade: 6.5,
    dreiUnklar: 4.5,
    vieleFarben: 3.5,
  },

  maxFarben: 3,           // mehr als 3 Farben → Abzug …
  abzugProFarbe: 1.5,     // … pro zusätzlicher Farbe
  neutralZaehltAls: 0.5,  // Neutraltöne zählen beim Farben-Zählen nur halb

  knallig: 70,            // Sättigung ab der eine Farbe als "knallig" gilt
  abzugKnallig: 1,
  kontrastMin: 30,        // Helligkeitsunterschied für "guter Hell-Dunkel-Kontrast"
  bonusKontrast: 0.5,
  abzugFlach: 0.5,
  bonusNeutraleBasis: 0.5,
  bonusGedeckt: 1,        // unklare Kombi wird durch einen gedeckten Ton (Sättigung < 35) entschärft
  bonusErdtoene: 0.5,
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
const lightRange = (cols) => (cols.length ? Math.max(...cols.map((c) => c.l)) - Math.min(...cols.map((c) => c.l)) : 0);
const uniqNames = (cols) => [...new Set(cols.map((c) => c.name))].join(', ');

// Bunte Farben nach Farbton gruppieren (Rot + Dunkelrot = eine Farbe)
function groupHues(cols, tol) {
  const groups = [];
  [...cols].sort((a, b) => b.share - a.share).forEach((c) => {
    const g = groups.find((g) => hueDist(g.h, c.rh) <= tol);
    if (g) g.members.push(c);
    else groups.push({ h: c.rh, s: c.s, l: c.l, name: c.name, members: [c] });
  });
  return groups;
}

// Kleinster Bogen auf dem Farbkreis, der alle Farbtöne enthält
function hueSpan(hues) {
  const s = [...hues].sort((a, b) => a - b);
  let maxGap = 360 - s[s.length - 1] + s[0];
  for (let i = 1; i < s.length; i++) maxGap = Math.max(maxGap, s[i] - s[i - 1]);
  return 360 - maxGap;
}
function isTriad(hues, tol) {
  const s = [...hues].sort((a, b) => a - b);
  const gaps = [s[1] - s[0], s[2] - s[1], 360 - s[2] + s[0]];
  return gaps.every((g) => Math.abs(g - 120) <= tol);
}

export function labelFor(score) {
  if (score == null) return '';
  if (score >= 9) return 'Top';
  if (score >= 7) return 'Gut';
  if (score >= 5) return 'Okay';
  if (score >= 3) return 'Gewagt';
  return 'Unruhig';
}

/**
 * items: Kleidungsstücke mit .colors = [{h,s,l,name,type,share}]
 * Rückgabe: { score (0–10, ganzzahlig), raw (ungerundet), label, reasons: [{sign, text}] }
 */
export function rateOutfit(items) {
  const R = RATING_REGELN, P = R.punkte;
  const reasons = [];
  const plus = (text) => reasons.push({ sign: '+', text });
  const minus = (text) => reasons.push({ sign: '−', text });
  const info = (text) => reasons.push({ sign: '•', text });

  const withColors = items.filter((it) => it?.colors?.length);
  if (!withColors.length) {
    if (items.length) info('Keine Farben hinterlegt');
    return { score: null, raw: null, label: '', reasons };
  }

  // Relevante Farben sammeln: Hauptfarbe + große Zweitfarben
  const cols = [];
  withColors.forEach((it) => it.colors.forEach((c, i) => {
    if (i === 0 || c.share >= R.zweitfarbeAb) cols.push({ ...c, rh: rybHue(c.h), itemId: it.id });
  }));
  const neutrals = cols.filter((c) => c.type === 'neutral');
  const groups = groupHues(cols.filter((c) => c.type !== 'neutral'), R.gleicherTon);
  const n = groups.length;
  let score;

  if (n === 0) {
    score = P.nurNeutral;
    info(`Nur neutrale Töne (${uniqNames(neutrals)}) – zeitlos und sicher`);
    const warm = neutrals.every((c) => c.s >= 12) && hueSpan(neutrals.map((c) => c.h)) <= 30 && neutrals.length > 1;
    if (warm) { score += R.bonusErdtoene; plus('Ton-in-Ton in Erdtönen – wirkt edel'); }
    if (lightRange(cols) >= R.kontrastMin) { score += R.bonusKontrast; plus('Hell-Dunkel-Kontrast belebt das Outfit'); }
    else if (withColors.length > 1 && !warm) { score -= R.abzugFlach; minus('Wenig Kontrast – wirkt etwas flach'); }
  } else if (n === 1) {
    const g = groups[0];
    if (neutrals.length) {
      score = P.neutralPlusAkzent;
      plus(`Neutral + 1 Akzentfarbe (${g.name}) – klassisch gut`);
    } else {
      score = P.tonInTon;
      plus(`Ton-in-Ton in ${g.name} – ruhig und stimmig`);
      if (lightRange(g.members) >= 15) { score += 0.5; plus('Hell-Dunkel-Abstufungen geben Tiefe'); }
    }
  } else if (n === 2) {
    const [a, b] = groups;
    const d = hueDist(a.h, b.h);
    if (d <= R.analogMax) {
      score = P.analog; plus(`${a.name} & ${b.name} sind analog (Nachbarn im Farbkreis) – harmonisch`);
    } else if (d <= R.verwandtMax) {
      score = P.verwandt; plus(`${a.name} & ${b.name} sind verwandt – meist stimmig`);
    } else if (d >= R.komplementaerAb) {
      score = P.komplementaer; plus(`${a.name} & ${b.name} sind Komplementärfarben – spannender Kontrast`);
      if (a.s >= R.knallig && b.s >= R.knallig) { score -= R.abzugKnallig; minus('Beide sehr knallig – ein gedeckterer Ton wäre ruhiger'); }
    } else {
      score = P.unklar; minus(`${a.name} & ${b.name} sind weder analog noch komplementär – beißt sich leicht`);
      if (Math.min(a.s, b.s) < 35) { score += R.bonusGedeckt; plus('Ein gedeckter Ton mildert das ab'); }
    }
    if (neutrals.length) { score += R.bonusNeutraleBasis; plus('Neutrale Teile geben eine ruhige Basis'); }
  } else if (n === 3) {
    const hues = groups.map((g) => g.h);
    if (hueSpan(hues) <= R.analogMax * 2) { score = P.dreiAnalog; plus('Drei benachbarte Farbtöne – harmonischer Verlauf'); }
    else if (isTriad(hues, R.triadeToleranz)) { score = P.triade; info('Triade (gleichmäßig im Farbkreis verteilt) – mutig, aber ausgewogen'); }
    else { score = P.dreiUnklar; minus('Drei Farben ohne klare Harmonie – wirkt unruhig'); }
    if (neutrals.length) { score += R.bonusNeutraleBasis; plus('Neutrale Teile beruhigen'); }
  } else {
    score = P.vieleFarben; minus(`${n} verschiedene Farbtöne – wirkt schnell bunt`);
  }

  // Mehr als 3 Farben → Abzug (Neutraltöne zählen halb)
  const count = n + new Set(neutrals.map((c) => c.name)).size * R.neutralZaehltAls;
  if (count > R.maxFarben) {
    score -= (count - R.maxFarben) * R.abzugProFarbe;
    minus(`Mehr als ${R.maxFarben} Farben (${fmt(count)} gezählt, Neutrale halb) – Abzug`);
  }
  // Mehrere knallige Farben konkurrieren
  if (groups.filter((g) => g.s >= R.knallig && g.l > 25 && g.l < 80).length >= 3) {
    score -= R.abzugKnallig; minus('Viele knallige Farben konkurrieren');
  }

  const raw = clamp(score, 0, 10);
  const rounded = Math.round(raw);
  return { score: rounded, raw, label: labelFor(rounded), reasons };
}
