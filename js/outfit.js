// Outfit-Builder (Teile pro Slot antippen, Vorschau, Rating, Vorschläge) + gespeicherte Outfits.
import { state, itemById, itemImg, saveOutfit, deleteOutfit, wearItems, markOutfitWorn } from './store.js';
import { rateOutfit } from './rating.js';
import { suggestSwaps, surprise } from './suggest.js';
import { availability, relDate, lastWorn, wornToday } from './wardrobe.js';
import { KATEGORIEN, katIcon } from './config.js';
import { newId } from './db.js';
import { h, fill, toast, dialog, confirmDialog, segmented } from './ui.js';

// Aktuelle Auswahl (überlebt einen Neustart der App)
const LS_KEY = 'ks-builder';
let builder = { pick: {}, outfitId: null, name: '' };
try { builder = { ...builder, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') }; } catch { /* egal */ }
const persist = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(builder)); } catch { /* egal */ } };

let sub = 'build';           // 'build' | 'saved'
let swaps = null, swapIdx = 0; // aktuelle Vorschlagsliste
let refs = {};               // Elemente, die live aktualisiert werden

const pickedItems = () => KATEGORIEN.map((k) => itemById(builder.pick[k.id])).filter(Boolean);
const pickedMap = () => Object.fromEntries(KATEGORIEN.map((k) => [k.id, itemById(builder.pick[k.id])]).filter(([, v]) => v));
const scoreClass = (s) => (s == null ? '' : s >= 7 ? 'good' : s >= 5 ? 'ok' : 'bad');

export function loadIntoBuilder(outfit) {
  builder = { pick: { ...outfit.items }, outfitId: outfit.id, name: outfit.name };
  persist();
  sub = 'build';
  swaps = null;
}

export function renderOutfit(view) {
  // Gelöschte Teile aus der Auswahl entfernen
  for (const k in builder.pick) if (builder.pick[k] && !itemById(builder.pick[k])) builder.pick[k] = null;
  view.replaceChildren(
    segmented([{ value: 'build', label: 'Zusammenstellen' }, { value: 'saved', label: `Gespeichert (${state.outfits.length})` }],
      sub, (v) => { sub = v; renderOutfit(view); }, 'seg-top'),
    sub === 'build' ? buildView() : savedView(view));
  if (sub === 'build') updateLive(); // erst jetzt hängt die Ansicht im DOM
}

// ── Builder ──────────────────────────────────────────────────────────
function buildView() {
  if (!state.items.length) return h('div', { class: 'empty' }, h('p', {}, 'Füge zuerst ein paar Teile im Schrank hinzu.'));
  refs = {
    summary: h('div', { class: 'ob-summary' }),
    preview: h('div', { class: 'flatlay' }),
    suggestion: h('div'),
    reasons: h('div', { class: 'card rating-card' }),
    strips: h('div', { class: 'slots' }),
  };
  KATEGORIEN.forEach((k) => refs.strips.append(slotStrip(k)));
  const view = h('div', { class: 'builder' },
    refs.summary,
    refs.preview,
    h('div', { class: 'row gap' },
      h('button', { class: 'btn', onclick: onImprove }, '💡 Verbessern'),
      h('button', { class: 'btn', onclick: onSurprise }, '🎲 Überrasch mich')),
    refs.suggestion,
    refs.reasons,
    refs.strips,
    h('div', { class: 'row gap sticky-actions' },
      h('button', { class: 'btn primary', onclick: onWearToday }, '✓ Heute angezogen'),
      h('button', { class: 'btn', onclick: onSave }, 'Speichern'),
      h('button', { class: 'btn ghost', onclick: () => { builder = { pick: {}, outfitId: null, name: '' }; swaps = null; persist(); updateLive(); } }, 'Leeren')));
  return view;
}

function slotStrip(k) {
  // verfügbare Teile zuerst, dann am längsten nicht getragene
  const items = state.items.filter((i) => i.category === k.id).sort((a, b) =>
    (availability(b, state.settings).ok - availability(a, state.settings).ok) || (lastWorn(a) || '').localeCompare(lastWorn(b) || ''));
  const strip = h('div', { class: 'strip' },
    h('button', { class: 'strip-item none', dataset: { slot: k.id, id: '' }, onclick: () => choose(k.id, null) }, h('span', {}, '–'), h('small', {}, 'keins')),
    items.map((it) => {
      const av = availability(it, state.settings);
      return h('button', { class: `strip-item ${av.ok ? '' : 'blocked'}`, dataset: { slot: k.id, id: it.id }, onclick: () => choose(k.id, it.id, av) },
        itemImg(it.id),
        !av.ok && h('span', { class: `tag ${av.kind}` }, av.kind === 'waesche' ? 'Wäsche' : 'Woche'),
        h('small', {}, it.name));
    }));
  return h('div', { class: 'slot' }, h('h3', {}, `${k.icon} ${k.label}`), items.length ? strip : h('p', { class: 'muted small' }, `Noch keine ${k.plural}.`));
}

function choose(slot, id, av) {
  builder.pick[slot] = builder.pick[slot] === id ? null : id;
  if (av && !av.ok && builder.pick[slot]) toast(`Hinweis: ${av.reason}`);
  swaps = null;
  persist();
  updateLive();
}

function updateLive() {
  if (!refs.preview?.isConnected) return;
  const items = pickedItems();
  const r = rateOutfit(items);

  // Kompakte Leiste oben (bleibt beim Scrollen sichtbar)
  fill(refs.summary,
    h('div', { class: `score small ${scoreClass(r.score)}` }, r.score ?? '–'),
    h('div', { class: 'mini-thumbs' }, items.map((it) => itemImg(it.id))),
    h('span', { class: 'muted small' }, builder.name || (items.length ? `${items.length} Teile` : 'Teile unten antippen')));

  // Flat-Lay-Vorschau: Teile übereinander angeordnet
  const cell = (slot) => {
    const it = itemById(builder.pick[slot]);
    return h('div', { class: `fl fl-${slot} ${it ? '' : 'empty'}` }, it ? itemImg(it.id) : h('span', {}, katIcon(slot)));
  };
  fill(refs.preview,
    h('div', { class: 'fl-row top' }, cell('jacke'), cell('oberteil')),
    cell('hose'), cell('schuhe'), cell('accessoire'),
    r.score != null && h('div', { class: `score ${scoreClass(r.score)}` }, h('b', {}, r.score), h('small', {}, '/10')));

  // Rating + Begründung
  fill(refs.reasons,
    h('div', { class: 'rating-head' }, h('h3', {}, 'Farb-Rating'), r.score != null && h('span', { class: `pill ${scoreClass(r.score)}` }, `${r.score}/10 · ${r.label}`)),
    r.reasons.length
      ? h('ul', { class: 'reasons' }, r.reasons.map((x) => h('li', { class: x.sign === '+' ? 'pos' : x.sign === '−' ? 'neg' : '' }, h('b', {}, x.sign), ' ', x.text)))
      : h('p', { class: 'muted small' }, 'Wähle Teile aus, um eine Bewertung zu sehen.'),
    items.some((i) => !availability(i, state.settings).ok) && h('p', { class: 'warn small' }, '⚠️ Mindestens ein Teil ist in der Wäsche oder wurde diese Woche schon getragen.'));

  renderSuggestion();
  // Auswahl in den Leisten markieren
  refs.strips.querySelectorAll('.strip-item').forEach((b) => b.classList.toggle('selected', (builder.pick[b.dataset.slot] || '') === b.dataset.id));
}

// ── Vorschläge ───────────────────────────────────────────────────────
function onImprove() {
  if (!pickedItems().length) return toast('Wähle zuerst ein paar Teile aus.');
  swaps = suggestSwaps(pickedMap(), state.items, state.settings);
  swapIdx = 0;
  if (!swaps.length) { swaps = null; toast('Kein besseres Ersatzteil gefunden – das Outfit ist schon gut kombiniert.'); }
  renderSuggestion();
}

function renderSuggestion() {
  const el = refs.suggestion;
  if (!swaps) return el.replaceChildren();
  const s = swaps[swapIdx];
  el.replaceChildren(h('div', { class: 'card suggestion' },
    h('h3', {}, `Vorschlag ${swapIdx + 1}/${swaps.length}`),
    h('div', { class: 'swap' },
      h('div', { class: 'swap-item' }, itemImg(s.weak.id), h('small', {}, s.weak.name)),
      h('span', { class: 'arrow' }, '→'),
      h('div', { class: 'swap-item' }, itemImg(s.cand.id), h('small', {}, s.cand.name)),
      h('div', { class: `score small ${scoreClass(s.after.score)}` }, s.after.score)),
    h('ul', { class: 'reasons' }, s.why.map((w) => h('li', {}, w))),
    h('div', { class: 'row gap' },
      h('button', { class: 'btn primary', onclick: () => { builder.pick[s.cand.category] = s.cand.id; swaps = null; persist(); updateLive(); } }, 'Übernehmen'),
      swaps.length > 1 && h('button', { class: 'btn', onclick: () => { swapIdx = (swapIdx + 1) % swaps.length; renderSuggestion(); } }, 'Anderer'),
      h('button', { class: 'btn ghost', onclick: () => { swaps = null; renderSuggestion(); } }, '✕'))));
}

function onSurprise() {
  const res = surprise(state.items, state.settings, builder.pick);
  if (!res.pick) return toast('Zu wenig verfügbare Teile (alles in der Wäsche oder diese Woche getragen?).');
  builder = { pick: Object.fromEntries(Object.entries(res.pick).map(([k, v]) => [k, v.id])), outfitId: null, name: '' };
  swaps = null;
  persist();
  updateLive();
  const missing = res.missing.length ? ` · keine verfügbaren: ${res.missing.join(', ')}` : '';
  toast(`🎲 ${res.rating.score ?? '–'}/10${res.why.length ? ' · ' + res.why.join(', ') : ''}${missing}`, 4000);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Speichern / Anziehen ─────────────────────────────────────────────
async function onWearToday() {
  const items = pickedItems();
  if (!items.length) return toast('Keine Teile ausgewählt.');
  const already = items.every(wornToday);
  const n = await wearItems(items);
  const o = state.outfits.find((x) => x.id === builder.outfitId);
  if (o) await markOutfitWorn(o);
  toast(already ? 'Schon für heute eingetragen.' : `${n} ${n === 1 ? 'Teil' : 'Teile'} als heute getragen eingetragen.`);
}

async function onSave() {
  const items = pickedItems();
  if (!items.length) return toast('Keine Teile ausgewählt.');
  const existing = state.outfits.find((o) => o.id === builder.outfitId);
  const input = h('input', { type: 'text', class: 'input', value: builder.name || '', placeholder: 'z. B. Büro Montag', enterkeyhint: 'done' });
  setTimeout(() => input.focus(), 250);
  const buttons = [{ label: 'Abbrechen', value: null }];
  if (existing) buttons.push({ label: 'Als neues', value: 'new' }, { label: 'Aktualisieren', value: 'update', style: 'primary' });
  else buttons.push({ label: 'Speichern', value: 'new', style: 'primary' });
  const choice = await dialog({ title: 'Outfit speichern', content: input, buttons });
  if (!choice) return;
  const name = input.value.trim() || `Outfit ${state.outfits.length + 1}`;
  const pick = Object.fromEntries(KATEGORIEN.map((k) => [k.id, builder.pick[k.id] || null]));
  let o;
  if (choice === 'update' && existing) { o = existing; o.items = pick; o.name = name; }
  else o = { id: newId(), name, items: pick, wornDates: [], createdAt: Date.now() };
  builder.outfitId = o.id; builder.name = name;
  persist();
  await saveOutfit(o);
  toast('Outfit gespeichert.');
}

// ── Gespeicherte Outfits ─────────────────────────────────────────────
function savedView(view) {
  if (!state.outfits.length) return h('div', { class: 'empty' }, h('p', {}, 'Noch keine Outfits gespeichert.'), h('p', { class: 'muted' }, 'Stell im Builder etwas zusammen und tippe auf „Speichern“.'));
  return h('div', { class: 'outfit-list' }, state.outfits.map((o) => {
    const items = KATEGORIEN.map((k) => itemById(o.items[k.id])).filter(Boolean);
    const r = rateOutfit(items);
    const blocked = items.filter((i) => !availability(i, state.settings).ok);
    const last = o.wornDates?.length ? o.wornDates[o.wornDates.length - 1] : null;
    return h('div', { class: 'card outfit-card' },
      h('div', { class: 'outfit-thumbs', onclick: () => { loadIntoBuilder(o); renderOutfit(view); } }, items.map((it) => itemImg(it.id))),
      h('div', { class: 'outfit-info' },
        h('div', { class: 'row between' }, h('b', {}, o.name), r.score != null && h('span', { class: `pill ${scoreClass(r.score)}` }, `${r.score}/10`)),
        h('p', { class: 'muted small' }, `Zuletzt angezogen: ${relDate(last)} · ${o.wornDates?.length || 0}×`),
        blocked.length > 0 && h('p', { class: 'warn small' }, `⚠️ ${blocked.map((i) => `${i.name} (${availability(i, state.settings).reason})`).join(', ')}`),
        h('div', { class: 'row gap' },
          h('button', { class: 'btn small', onclick: () => { loadIntoBuilder(o); renderOutfit(view); } }, 'Öffnen'),
          h('button', { class: 'btn small primary', onclick: async () => {
            const n = await wearItems(items);
            await markOutfitWorn(o);
            toast(n ? `Heute angezogen: ${o.name}` : 'Schon für heute eingetragen.');
          } }, '✓ Heute'),
          h('button', { class: 'btn small ghost', 'aria-label': 'Löschen', onclick: async () => {
            if (await confirmDialog('Outfit löschen?', `„${o.name}“ wird gelöscht. Die Teile bleiben im Schrank.`, 'Löschen', true)) {
              await deleteOutfit(o.id);
              if (builder.outfitId === o.id) { builder.outfitId = null; persist(); }
            }
          } }, '🗑'))));
  }));
}
