// Backup: alle Daten inkl. Bilder als eine JSON-Datei exportieren / wieder einlesen.
import * as db from './db.js';
import { today } from './wardrobe.js';

const APP = 'kleiderschrank';

const bufToBase64 = (buf) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(r.error);
  r.readAsDataURL(new Blob([buf]));
});
function base64ToBuf(b64) {
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

// Erstellt die Backup-Datei (Bilder werden einzeln gelesen, um Speicher zu sparen)
export async function createBackup(onProgress = () => {}) {
  const [items, outfits, settings, keys] = await Promise.all([
    db.getAll('items'), db.getAll('outfits'), db.get('settings', 'main'), db.getAllKeys('images'),
  ]);
  const head = JSON.stringify({ app: APP, version: 1, exportedAt: new Date().toISOString(), settings, items, outfits });
  const parts = [head.slice(0, -1), ',"images":['];
  for (let i = 0; i < keys.length; i++) {
    onProgress(i + 1, keys.length);
    const rec = await db.get('images', keys[i]);
    if (!rec) continue;
    if (parts.length > 2) parts.push(',');
    parts.push(JSON.stringify({ key: rec.key, type: rec.type, data: await bufToBase64(rec.buf) }));
  }
  parts.push(']}');
  return new File(parts, `kleiderschrank-backup-${today()}.json`, { type: 'application/json' });
}

// Teilen (iPhone: "In Dateien sichern") oder herunterladen
export async function shareFile(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'aborted'; }
  }
  downloadFile(file);
  return 'downloaded';
}
export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Liest eine Backup-Datei. mode: 'replace' (alles ersetzen) oder 'merge' (hinzufügen/aktualisieren)
export async function importBackup(file, mode, onProgress = () => {}) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('Datei ist kein gültiges Backup.'); }
  if (data?.app !== APP || !Array.isArray(data.items)) throw new Error('Das ist kein Kleiderschrank-Backup.');

  if (mode === 'replace') await Promise.all(['items', 'images', 'outfits', 'settings'].map((s) => db.clear(s)));
  const images = data.images || [];
  for (let i = 0; i < images.length; i += 20) {
    onProgress(i, images.length);
    await db.putMany('images', images.slice(i, i + 20).map((im) => ({ key: im.key, type: im.type, buf: base64ToBuf(im.data) })));
  }
  await db.putMany('items', data.items);
  await db.putMany('outfits', data.outfits || []);
  if (data.settings && (mode === 'replace' || !(await db.get('settings', 'main')))) await db.put('settings', data.settings);
  return { items: data.items.length, outfits: (data.outfits || []).length };
}

export async function deleteAll() {
  await Promise.all(['items', 'images', 'outfits', 'settings'].map((s) => db.clear(s)));
}
