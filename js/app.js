// Hauptdatei: Tabs, Schrank, Detailansicht, Teil hinzufügen, Wäsche, Einstellungen.
import { state, load, subscribe, emit, itemById, itemImg, saveItem, saveItems, deleteItem, saveSettings } from './store.js';
import { KATEGORIEN, STATUS, katLabel } from './config.js';
import { newId, requestPersist, isPersisted, estimate, getImage } from './db.js';
import { colorFromHex, extractColors } from './colors.js';
import { openEditor } from './bgremove.js';
import { renderOutfit } from './outfit.js';
import { createBackup, shareFile, downloadFile, importBackup, deleteAll } from './backup.js';
import * as W from './wardrobe.js';
import { $, h, fill, toast, dialog, confirmDialog, openPage, sheet, spinner, segmented } from './ui.js';

const TITLES = { schrank: 'Kleiderschrank', outfit: 'Outfit', waesche: 'Wäsche', mehr: 'Mehr' };
let tab = 'schrank';
let filter = 'alle';
let detailRefresh = null; // aktualisiert eine offene Detailansicht

// ── Start ────────────────────────────────────────────────────────────
async function start() {
  try { await load(); }
  catch (e) { $('#view').replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'Datenbank konnte nicht geöffnet werden.'), h('p', { class: 'muted' }, String(e.message || e)))); return; }
  document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('#fab').addEventListener('click', addItem);
  subscribe(() => { render(); detailRefresh?.(); });
  render();
  requestPersist();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
}

function switchTab(t) {
  tab = t;
  window.scrollTo(0, 0);
  render();
}

function render() {
  $('#title').textContent = TITLES[tab];
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('#fab').hidden = tab !== 'schrank';
  const n = state.items.filter((i) => i.status === 'waesche').length;
  const badge = $('#laundryBadge');
  badge.textContent = n;
  badge.hidden = !n;
  const view = $('#view');
  const y = window.scrollY;
  if (tab === 'schrank') renderSchrank(view);
  else if (tab === 'outfit') renderOutfit(view);
  else if (tab === 'waesche') renderWaesche(view);
  else renderMehr(view);
  window.scrollTo(0, y);
}

// ── Kleine Bausteine ─────────────────────────────────────────────────
const statusPill = (s) => h('span', { class: `pill ${STATUS[s]?.cls || ''}` }, STATUS[s]?.label || s);
const colorDots = (colors = []) => h('span', { class: 'dots' }, colors.map((c) => h('i', { style: { background: c.hex }, title: c.name })));
const weekBadge = (it) => W.wornThisWeek(it) && h('span', { class: 'badge-week' }, 'diese Woche');

// ── Schrank ──────────────────────────────────────────────────────────
function renderSchrank(view) {
  const count = (id) => state.items.filter((i) => id === 'alle' || i.category === id).length;
  const chips = h('div', { class: 'chips' },
    [{ id: 'alle', plural: 'Alle', icon: '' }, ...KATEGORIEN].map((k) =>
      h('button', { class: `chip ${filter === k.id ? 'active' : ''}`, onclick: () => { filter = k.id; render(); } },
        `${k.icon} ${k.plural} `, h('small', {}, count(k.id)))));
  const items = state.items.filter((i) => filter === 'alle' || i.category === filter);

  if (!state.items.length) {
    return view.replaceChildren(h('div', { class: 'empty' },
      h('div', { class: 'empty-icon' }, '👕'),
      h('p', {}, 'Dein Schrank ist noch leer.'),
      h('p', { class: 'muted' }, 'Tippe auf ＋, fotografiere ein Kleidungsstück und stelle es frei.'),
      h('button', { class: 'btn primary', onclick: addItem }, '＋ Erstes Teil hinzufügen')));
  }
  view.replaceChildren(chips, items.length
    ? h('div', { class: 'grid' }, items.map((it) =>
      h('button', { class: `card item-card ${it.status === 'waesche' ? 'dim' : ''}`, onclick: () => openItem(it.id) },
        h('div', { class: 'card-img' }, itemImg(it.id), weekBadge(it)),
        h('div', { class: 'card-body' },
          h('div', { class: 'card-name' }, it.name),
          h('div', { class: 'card-meta' }, statusPill(it.status), colorDots(it.colors))))))
    : h('p', { class: 'empty muted' }, 'Keine Teile in dieser Kategorie.'));
}

// ── Farben-Editor (für Formular und Detailansicht) ───────────────────
function colorEditor(colors, onChange, onRedetect) {
  const wrap = h('div', { class: 'color-editor' });
  const draw = () => {
    wrap.replaceChildren(
      ...colors.map((c, i) => {
        const nameIn = h('input', { class: 'input small', value: c.name, 'aria-label': 'Farbname', onchange: () => { c.name = nameIn.value.trim() || c.name; onChange(colors); } });
        return h('div', { class: 'color-row' },
          h('input', { type: 'color', value: c.hex, 'aria-label': 'Farbe wählen', onchange: (e) => {
            const nc = colorFromHex(e.target.value, c.share);
            colors[i] = nc; onChange(colors); draw();
          } }),
          nameIn,
          segmented([{ value: 'neutral', label: 'neutral' }, { value: 'farbe', label: 'Farbe' }], c.type, (v) => { c.type = v; onChange(colors); }, 'seg-small'),
          h('small', { class: 'muted share' }, `${Math.round(c.share * 100)} %`),
          h('button', { class: 'icon-btn', 'aria-label': 'Farbe entfernen', onclick: () => { colors.splice(i, 1); onChange(colors); draw(); } }, '✕'));
      }),
      h('div', { class: 'row gap' },
        colors.length < 3 && h('button', { class: 'btn small', onclick: () => { colors.push(colorFromHex('#808080', 0.2)); onChange(colors); draw(); } }, '＋ Farbe'),
        onRedetect && h('button', { class: 'btn small ghost', onclick: async () => { const nc = await onRedetect(); if (nc) { colors.splice(0, colors.length, ...nc); onChange(colors); draw(); } } }, '↻ Neu erkennen')));
  };
  draw();
  return wrap;
}

function categoryPicker(value, onChange) {
  const wrap = h('div', { class: 'cat-picker' });
  const draw = (v) => wrap.replaceChildren(...KATEGORIEN.map((k) =>
    h('button', { class: `cat-btn ${v === k.id ? 'active' : ''}`, onclick: () => { draw(k.id); onChange(k.id); } },
      h('span', { class: 'cat-icon' }, k.icon), h('span', {}, k.label))));
  draw(value);
  return wrap;
}

// ── Teil hinzufügen ──────────────────────────────────────────────────
// Datei-Inputs stecken in <label>, damit iOS die Kamera/Galerie zuverlässig öffnet.
function fileOption(label, capture) {
  return {
    render: (close) => {
      const input = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', onchange: () => { if (input.files[0]) close(input.files[0]); } });
      if (capture) input.setAttribute('capture', 'environment');
      return h('label', { class: 'btn block' }, label, input);
    },
  };
}

async function addItem() {
  const file = await sheet('Neues Teil', [fileOption('📷 Foto aufnehmen', true), fileOption('🖼️ Aus Fotos wählen', false)]);
  if (!file) return;
  const res = await openEditor(file);
  if (res) openNewItemForm(res);
}

function openNewItemForm(res) {
  const draft = { category: null, colors: res.colors, name: '' };
  const url = URL.createObjectURL(res.image);
  const save = async () => {
    if (!draft.category) return toast('Bitte eine Kategorie wählen.');
    const fallback = draft.colors[0] ? `${katLabel(draft.category)} in ${draft.colors[0].name}` : katLabel(draft.category);
    const item = {
      id: newId(), name: draft.name.trim() || fallback, category: draft.category, colors: draft.colors,
      status: 'sauber', wearsSinceWash: 0, wornDates: [], createdAt: Date.now(),
    };
    await saveItem(item, res);
    requestPersist();
    page.close();
    filter = 'alle';
    switchTab('schrank');
    toast(`„${item.name}“ gespeichert.`);
  };
  const page = openPage({
    title: 'Neues Teil',
    left: h('button', { class: 'btn ghost small', onclick: async () => { if (await confirmDialog('Verwerfen?', 'Das freigestellte Bild geht verloren.', 'Verwerfen', true)) page.close(); } }, 'Abbrechen'),
    right: h('button', { class: 'btn primary small', onclick: save }, 'Sichern'),
    onClose: () => URL.revokeObjectURL(url),
  });
  page.body.append(
    h('div', { class: 'detail-img checker' }, h('img', { src: url, alt: '' })),
    h('label', { class: 'field' }, h('span', {}, 'Name'),
      h('input', { class: 'input', placeholder: 'z. B. Blaue Jeans', oninput: (e) => { draft.name = e.target.value; } })),
    h('div', { class: 'field' }, h('span', {}, 'Kategorie'), categoryPicker(null, (v) => { draft.category = v; })),
    h('div', { class: 'field' }, h('span', {}, 'Farben (automatisch erkannt, änderbar)'),
      colorEditor(draft.colors, (c) => { draft.colors = c; }, () => extractColors(res.image))),
    h('button', { class: 'btn primary block', onclick: save }, 'Speichern'));
}

// ── Detailansicht ────────────────────────────────────────────────────
function openItem(id) {
  let item = itemById(id);
  if (!item) return;
  const page = openPage({
    title: item.name,
    left: h('button', { class: 'btn ghost small', onclick: () => page.close() }, '‹ Zurück'),
    onClose: () => { detailRefresh = null; },
  });
  const save = () => saveItem(item);

  const draw = () => {
    if (!itemById(id)) return page.close();
    item = itemById(id); // nach Import kann es ein neues Objekt sein
    const limit = state.settings.wearLimits[item.category] || 0;
    const last = W.lastWorn(item);
    const today = W.wornToday(item);
    const y = page.body.scrollTop;
    page.el.querySelector('h2').textContent = item.name;
    fill(page.body,
      h('div', { class: 'detail-img checker' }, itemImg(item.id, 'image'), weekBadge(item)),
      h('button', { class: `btn block big ${today ? 'done' : 'primary'}`, onclick: async () => {
        if (today) { W.unmarkWorn(item, state.settings); toast('Eintrag für heute entfernt.'); }
        else { W.markWorn(item, state.settings); toast(item.status === 'waesche' ? 'Getragen – ab in die Wäsche!' : 'Als heute getragen eingetragen.'); }
        await save();
      } }, today ? '✓ Heute getragen (rückgängig)' : 'Heute getragen'),
      h('div', { class: 'card stats' },
        h('div', {}, h('b', {}, `${item.wearsSinceWash || 0}${limit ? '/' + limit : ''}`), h('small', {}, 'seit Wäsche')),
        h('div', {}, h('b', {}, item.wornDates?.length || 0), h('small', {}, 'insgesamt')),
        h('div', {}, h('b', {}, W.relDate(last)), h('small', {}, 'zuletzt'))),
      h('div', { class: 'field' }, h('span', {}, 'Status'),
        segmented(Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label, cls: s.cls })), item.status, async (v) => { W.setStatus(item, v); await save(); })),
      h('label', { class: 'field' }, h('span', {}, 'Name'),
        h('input', { class: 'input', value: item.name, onchange: async (e) => { item.name = e.target.value.trim() || item.name; await save(); } })),
      h('div', { class: 'field' }, h('span', {}, 'Kategorie'),
        categoryPicker(item.category, async (v) => { item.category = v; await save(); })),
      h('div', { class: 'field' }, h('span', {}, 'Farben'),
        colorEditor(item.colors, async (c) => { item.colors = c; await save(); },
          async () => { const b = await getImage(`${item.id}:image`); return b ? extractColors(b) : null; })),
      item.wornDates?.length > 0 && h('div', { class: 'field' }, h('span', {}, 'Zuletzt getragen'),
        h('p', { class: 'muted small' }, item.wornDates.slice(-8).reverse().map((d) => W.parseIso(d).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })).join(' · '))),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn', onclick: () => reEdit(item) }, '✂️ Hintergrund neu bearbeiten'),
        h('button', { class: 'btn danger', onclick: async () => {
          if (await confirmDialog('Teil löschen?', `„${item.name}“ wird endgültig gelöscht.`, 'Löschen', true)) { await deleteItem(item.id); page.close(); toast('Gelöscht.'); }
        } }, 'Löschen')));
    page.body.scrollTop = y;
  };
  detailRefresh = draw;
  draw();
}

async function reEdit(item) {
  const orig = (await getImage(`${item.id}:orig`)) || (await getImage(`${item.id}:image`));
  if (!orig) return toast('Kein Originalbild gespeichert.');
  const res = await openEditor(orig);
  if (!res) return;
  item.colors = res.colors;
  await saveItem(item, res);
  toast('Bild aktualisiert, Farben neu erkannt.');
}

// ── Wäsche ───────────────────────────────────────────────────────────
function renderWaesche(view) {
  const inWash = state.items.filter((i) => i.status === 'waesche');
  const worn = state.items.filter((i) => i.status === 'getragen');
  const wash = async (items) => { items.forEach(W.markWashed); await saveItems(items); toast(items.length > 1 ? `${items.length} Teile gewaschen ✨` : 'Gewaschen ✨'); };
  const row = (it, buttons) => h('div', { class: 'list-row' },
    h('div', { class: 'list-img', onclick: () => openItem(it.id) }, itemImg(it.id)),
    h('div', { class: 'list-text', onclick: () => openItem(it.id) },
      h('b', {}, it.name),
      h('small', { class: 'muted' }, `${katLabel(it.category)} · ${it.status === 'waesche' && it.laundrySince ? 'in der Wäsche seit ' + W.relDate(it.laundrySince) : `${it.wearsSinceWash}× getragen`}`)),
    buttons);

  view.replaceChildren(
    h('div', { class: 'section-head' }, h('h3', {}, `In der Wäsche (${inWash.length})`),
      inWash.length > 1 && h('button', { class: 'btn small primary', onclick: () => wash(inWash) }, 'Alles gewaschen')),
    inWash.length
      ? h('div', { class: 'card list' }, inWash.map((it) => row(it, h('button', { class: 'btn small primary', onclick: () => wash([it]) }, 'Gewaschen'))))
      : h('p', { class: 'muted empty-small' }, 'Wäschekorb ist leer 🎉'),
    h('div', { class: 'section-head' }, h('h3', {}, `Getragen, noch tragbar (${worn.length})`)),
    worn.length
      ? h('div', { class: 'card list' }, worn.map((it) => row(it, h('div', { class: 'row gap-s' },
        h('button', { class: 'btn small', onclick: async () => { W.setStatus(it, 'waesche'); await saveItems([it]); } }, 'In Wäsche'),
        h('button', { class: 'btn small ghost', onclick: () => wash([it]) }, 'Gewaschen')))))
      : h('p', { class: 'muted empty-small' }, 'Nichts angetragen.'),
    h('p', { class: 'muted small' }, 'Teile kommen automatisch in die Wäsche, wenn sie so oft getragen wurden wie unter „Mehr“ eingestellt.'));
}

// ── Mehr / Einstellungen ─────────────────────────────────────────────
function renderMehr(view) {
  const s = state.settings;
  const stepper = (k) => h('div', { class: 'stepper' },
    h('button', { class: 'icon-btn', 'aria-label': 'weniger', onclick: async () => { s.wearLimits[k] = Math.max(0, (s.wearLimits[k] || 0) - 1); await saveSettings(); } }, '−'),
    h('b', {}, s.wearLimits[k] ? `${s.wearLimits[k]}×` : 'nie'),
    h('button', { class: 'icon-btn', 'aria-label': 'mehr', onclick: async () => { s.wearLimits[k] = Math.min(30, (s.wearLimits[k] || 0) + 1); await saveSettings(); } }, '+'));
  const toggle = (k) => h('label', { class: 'switch' },
    h('input', { type: 'checkbox', checked: !!s.weekRule[k], onchange: async (e) => { s.weekRule[k] = e.target.checked; await saveSettings(); } }),
    h('span', {}));

  const storageInfo = h('p', { class: 'muted small' }, 'Speicher wird geprüft …');
  Promise.all([estimate(), isPersisted()]).then(([est, pers]) => {
    const mb = (b) => (b / 1048576).toFixed(1).replace('.', ',');
    storageInfo.textContent = `${est ? `Belegt: ${mb(est.usage)} MB` : 'Belegung unbekannt'} · ${pers ? 'dauerhaft gespeichert ✓' : pers === false ? 'nicht dauerhaft (Backup empfohlen)' : 'Status unbekannt'}`;
  });

  const importInput = h('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden', onchange: () => { const f = importInput.files[0]; importInput.value = ''; if (f) doImport(f); } });

  view.replaceChildren(
    h('div', { class: 'card settings' },
      h('h3', {}, 'Tragen bis zur Wäsche'),
      h('p', { class: 'muted small' }, 'Nach so vielen Tragetagen kommt ein Teil automatisch in die Wäsche.'),
      KATEGORIEN.map((k) => h('div', { class: 'set-row' }, h('span', {}, `${k.icon} ${k.label}`), stepper(k.id)))),
    h('div', { class: 'card settings' },
      h('h3', {}, '„Diese Woche getragen“ ausgrauen'),
      h('p', { class: 'muted small' }, 'Gilt Mo–So. Ausgegraute Teile tauchen nicht in Vorschlägen auf.'),
      KATEGORIEN.map((k) => h('div', { class: 'set-row' }, h('span', {}, `${k.icon} ${k.label}`), toggle(k.id)))),
    h('div', { class: 'card settings' },
      h('h3', {}, 'Backup'),
      h('p', { class: 'muted small' }, 'Alle Teile, Bilder, Outfits und Einstellungen in einer Datei. Am iPhone: „In Dateien sichern“ wählen.'),
      h('div', { class: 'row gap wrap' },
        h('button', { class: 'btn primary', onclick: doExport }, '⬇︎ Backup erstellen'),
        h('label', { class: 'btn' }, '⬆︎ Backup einlesen', importInput))),
    h('div', { class: 'card settings' },
      h('h3', {}, 'Speicher & Datenschutz'),
      storageInfo,
      h('p', { class: 'muted small' }, 'Alles bleibt auf diesem Gerät (IndexedDB). Keine Konten, kein Server, keine Uploads. Nur das optionale KI-Modell wird einmalig aus dem Internet geladen – deine Fotos nie.'),
      h('button', { class: 'btn small', onclick: async () => { const ok = await requestPersist(); toast(ok ? 'Speicher ist dauerhaft ✓' : 'Browser hat abgelehnt – regelmäßig Backups machen.'); render(); } }, 'Dauerhaften Speicher anfragen')),
    h('div', { class: 'card settings' },
      h('h3', {}, 'Alles löschen'),
      h('button', { class: 'btn danger', onclick: async () => {
        if (!(await confirmDialog('Wirklich alles löschen?', 'Alle Teile, Bilder und Outfits werden von diesem Gerät gelöscht. Das kann nicht rückgängig gemacht werden.', 'Alles löschen', true))) return;
        await deleteAll(); await load(); emit(); toast('Alles gelöscht.');
      } }, 'Alle Daten löschen')),
    h('p', { class: 'muted small center' }, 'Digitaler Kleiderschrank · läuft offline'));
}

async function doExport() {
  if (!state.items.length && !state.outfits.length) return toast('Noch nichts zu sichern.');
  const sp = spinner('Backup wird erstellt …');
  let file;
  try { file = await createBackup((i, n) => sp.set(`Bilder ${i}/${n} …`)); }
  catch (e) { sp.close(); return toast('Backup fehlgeschlagen: ' + e.message); }
  sp.close();
  const mb = (file.size / 1048576).toFixed(1).replace('.', ',');
  // Eigener Klick nötig, weil iOS "Teilen" nur direkt nach einer Berührung erlaubt
  const how = await dialog({
    title: 'Backup fertig', text: `${file.name} (${mb} MB)`,
    buttons: [{ label: 'Schließen', value: null }, { label: 'Herunterladen', value: 'dl' }, ...(navigator.canShare?.({ files: [file] }) ? [{ label: 'Teilen / Sichern', value: 'share', style: 'primary' }] : [])],
  });
  if (how === 'share') { const r = await shareFile(file); if (r === 'downloaded') toast('Heruntergeladen.'); }
  else if (how === 'dl') downloadFile(file);
}

async function doImport(file) {
  const mode = await dialog({
    title: 'Backup einlesen', text: `${file.name} – wie soll es übernommen werden?`,
    buttons: [{ label: 'Abbrechen', value: null }, { label: 'Ergänzen', value: 'merge' }, { label: 'Alles ersetzen', value: 'replace', style: 'danger' }],
  });
  if (!mode) return;
  const sp = spinner('Backup wird eingelesen …');
  try {
    const r = await importBackup(file, mode, (i, n) => sp.set(`Bilder ${i}/${n} …`));
    await load();
    emit();
    toast(`${r.items} Teile und ${r.outfits} Outfits eingelesen.`);
  } catch (e) { toast(e.message, 5000); }
  finally { sp.close(); }
}

start();
