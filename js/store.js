// App-Zustand im Speicher + alle Schreibvorgänge in die Datenbank.
import * as db from './db.js';
import { STANDARD_EINSTELLUNGEN } from './config.js';
import { markWorn, today } from './wardrobe.js';

export const state = { items: [], outfits: [], settings: structuredClone(STANDARD_EINSTELLUNGEN) };

const listeners = new Set();
export const subscribe = (fn) => listeners.add(fn);
export const emit = () => listeners.forEach((fn) => fn());

function mergeSettings(s) {
  const d = structuredClone(STANDARD_EINSTELLUNGEN);
  if (!s) return d;
  return { ...d, ...s, wearLimits: { ...d.wearLimits, ...s.wearLimits }, weekRule: { ...d.weekRule, ...s.weekRule } };
}

export async function load() {
  const [items, outfits, settings] = await Promise.all([db.getAll('items'), db.getAll('outfits'), db.get('settings', 'main')]);
  state.items = items.sort((a, b) => b.createdAt - a.createdAt);
  state.outfits = outfits.sort((a, b) => b.createdAt - a.createdAt);
  state.settings = mergeSettings(settings);
  clearImageCache();
}

export const itemById = (id) => state.items.find((i) => i.id === id);

// ── Kleidungsstücke ──
export async function saveItem(item, images) {
  item.updatedAt = Date.now();
  if (images) {
    for (const k of ['image', 'thumb', 'orig']) if (images[k]) await db.putImage(`${item.id}:${k}`, images[k]);
    dropImages(item.id);
  }
  await db.put('items', item);
  if (!state.items.includes(item)) {
    const i = state.items.findIndex((x) => x.id === item.id);
    if (i >= 0) state.items[i] = item; else state.items.unshift(item);
  }
  emit();
}

export async function saveItems(items) {
  if (!items.length) return;
  items.forEach((i) => { i.updatedAt = Date.now(); });
  await db.putMany('items', items);
  emit();
}

export async function deleteItem(id) {
  await db.del('items', id);
  await db.deleteImages(id);
  dropImages(id);
  state.items = state.items.filter((i) => i.id !== id);
  // Aus Outfits entfernen
  const touched = state.outfits.filter((o) => Object.values(o.items).includes(id));
  touched.forEach((o) => { for (const k in o.items) if (o.items[k] === id) o.items[k] = null; });
  if (touched.length) await db.putMany('outfits', touched);
  emit();
}

// Mehrere Teile als heute getragen markieren → Anzahl der tatsächlich neu eingetragenen
export async function wearItems(items) {
  const changed = items.filter((it) => markWorn(it, state.settings));
  await saveItems(changed);
  return changed.length;
}

// ── Outfits ──
export async function saveOutfit(o) {
  o.updatedAt = Date.now();
  await db.put('outfits', o);
  if (!state.outfits.includes(o)) state.outfits.unshift(o);
  emit();
}
export async function deleteOutfit(id) {
  await db.del('outfits', id);
  state.outfits = state.outfits.filter((o) => o.id !== id);
  emit();
}
export async function markOutfitWorn(o) {
  o.wornDates = o.wornDates || [];
  if (!o.wornDates.includes(today())) o.wornDates.push(today());
  await saveOutfit(o);
}

// ── Einstellungen ──
export async function saveSettings() {
  await db.put('settings', state.settings);
  emit();
}

// ── Bilder (Object-URLs werden zwischengespeichert) ──
const urlCache = new Map();
export function imageURL(id, kind = 'thumb') {
  const key = `${id}:${kind}`;
  if (!urlCache.has(key)) urlCache.set(key, db.getImage(key).then((b) => (b ? URL.createObjectURL(b) : null)));
  return urlCache.get(key);
}
function dropImages(id) {
  for (const k of ['image', 'thumb', 'orig']) {
    const p = urlCache.get(`${id}:${k}`);
    if (p) { p.then((u) => u && URL.revokeObjectURL(u)); urlCache.delete(`${id}:${k}`); }
  }
}
export function clearImageCache() {
  urlCache.forEach((p) => p.then((u) => u && URL.revokeObjectURL(u)));
  urlCache.clear();
}

// <img>, das sein Bild asynchron aus der Datenbank lädt
export function itemImg(id, kind = 'thumb', cls = '') {
  const img = document.createElement('img');
  img.className = cls;
  img.alt = '';
  img.decoding = 'async';
  imageURL(id, kind).then((u) => { if (u) img.src = u; });
  return img;
}
