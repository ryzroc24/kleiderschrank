// Tragen, Wäsche-Status und Datumslogik (reine Funktionen, ändern nur das übergebene Objekt).

// ── Datum (immer lokale Zeit, Format JJJJ-MM-TT) ─────────────────────
export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const today = () => isoDate();
export function parseIso(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export const daysAgo = (iso) => Math.round((parseIso(today()) - parseIso(iso)) / 86400000);

// Aktuelle Woche Montag–Sonntag
export function weekRange(d = new Date()) {
  const offset = (d.getDay() + 6) % 7; // Montag = 0
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  return [isoDate(mon), isoDate(sun)];
}

export function relDate(iso) {
  if (!iso) return 'nie';
  const n = daysAgo(iso);
  if (n === 0) return 'heute';
  if (n === 1) return 'gestern';
  if (n > 1 && n < 30) return `vor ${n} Tagen`;
  const d = parseIso(iso);
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: n > 300 ? 'numeric' : undefined });
}

// ── Abfragen ─────────────────────────────────────────────────────────
export const lastWorn = (item) => (item.wornDates?.length ? item.wornDates[item.wornDates.length - 1] : null);
export const wornToday = (item) => (item.wornDates || []).includes(today());
export function wornThisWeek(item) {
  const [a, b] = weekRange();
  return (item.wornDates || []).some((d) => d >= a && d <= b);
}

// Ist das Teil gerade gut verfügbar? (für Outfit-Builder und Vorschläge)
export function availability(item, settings) {
  if (item.status === 'waesche') return { ok: false, kind: 'waesche', reason: 'In der Wäsche' };
  if (settings.weekRule?.[item.category] && wornThisWeek(item)) return { ok: false, kind: 'woche', reason: 'Diese Woche getragen' };
  return { ok: true, kind: null, reason: '' };
}

// ── Status-Regeln ────────────────────────────────────────────────────
export function statusFor(item, settings) {
  const limit = settings.wearLimits?.[item.category] ?? 0;
  if (limit > 0 && item.wearsSinceWash >= limit) return 'waesche';
  return item.wearsSinceWash > 0 ? 'getragen' : 'sauber';
}

function applyStatus(item, status) {
  if (status === 'waesche' && item.status !== 'waesche') item.laundrySince = today();
  item.status = status;
}

// "Heute getragen" – pro Tag nur einmal. Gibt false zurück, wenn schon eingetragen.
export function markWorn(item, settings, date = today()) {
  item.wornDates = item.wornDates || [];
  if (item.wornDates.includes(date)) return false;
  item.wornDates.push(date);
  item.wornDates.sort();
  item.wearsSinceWash = (item.wearsSinceWash || 0) + 1;
  applyStatus(item, statusFor(item, settings));
  return true;
}

export function unmarkWorn(item, settings, date = today()) {
  const i = (item.wornDates || []).indexOf(date);
  if (i < 0) return false;
  item.wornDates.splice(i, 1);
  item.wearsSinceWash = Math.max(0, (item.wearsSinceWash || 0) - 1);
  applyStatus(item, statusFor(item, settings));
  return true;
}

export function markWashed(item) {
  item.status = 'sauber';
  item.wearsSinceWash = 0;
  item.laundrySince = null;
}

// Status von Hand setzen
export function setStatus(item, status) {
  if (status === 'sauber') return markWashed(item);
  if (status === 'getragen') item.wearsSinceWash = Math.max(1, item.wearsSinceWash || 0);
  applyStatus(item, status);
}
