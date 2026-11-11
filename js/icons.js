// Eigene Linien-Icons (24×24, Strich statt Füllung) statt Emojis – sehen auf iPhone und Android gleich aus.
// icon('hose') → <svg class="ic">…</svg>
const P = {
  // Kategorien (gleiche ids wie in config.js)
  jacke: '<path d="M9 3 4.5 5.5 3 12l2.5.8V21H11V9.5"/><path d="M15 3l4.5 2.5L21 12l-2.5.8V21H13V9.5"/><path d="M9 3l3 4.5L15 3"/><path d="M12 7.5V21"/>',
  oberteil: '<path d="M8 3 4 5.5 2.5 10l3 1.2V21h13v-9.8l3-1.2L20 5.5 16 3c-.6 1.6-2.2 2.6-4 2.6S8.6 4.6 8 3Z"/>',
  hose: '<path d="M6.5 3h11l1.5 18h-5l-2-11-2 11H5L6.5 3Z"/><path d="M6.3 6.5h11.4"/>',
  schuhe: '<path d="M3 16.5V9.2c0-.7.6-1.2 1.2-1.2H7l1.8 2.3 2.4-1 1.9 2.4 4.1 1.3c2.2.7 3.8 1.8 3.8 3.5"/><path d="M3 16.5h18v1.3c0 .7-.5 1.2-1.2 1.2H4.2c-.7 0-1.2-.5-1.2-1.2v-1.3Z"/>',
  accessoire: '<path d="M4 15a8 8 0 0 1 16 0"/><path d="M2 15h20c0 1.2-1 2-2.2 2H9"/><path d="M12 7V5.6"/>',
  // Aktionen
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 3.5V8h4.5"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 20.5V16h-4.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  camera: '<path d="M4 8h3l1.6-2.4h6.8L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.5" r="3.6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="9.5" r="1.8"/><path d="m21 15-4.5-4.5L7 20"/>',
  scissors: '<circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><path d="M8.2 7.6 20 18M8.2 16.4 20 6"/>',
  wand: '<path d="M4 20 14.5 9.5"/><path d="M15 3.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z"/><path d="M19.5 11l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5Z"/>',
  eraser: '<path d="M7.5 20H20"/><path d="M4.4 14.6 13.6 5.4a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L11 20H7.8l-3.4-3.4a1.4 1.4 0 0 1 0-2Z"/><path d="m9 10 5 5"/>',
  brush: '<path d="M18.4 3.6a2.1 2.1 0 0 1 3 3L12.5 15.5l-3-3 8.9-8.9Z"/><path d="M9.5 12.5c-2.4 0-4.3 1.9-4.3 4.3 0 1.4-.9 2.6-2.2 3.2 3.6 0 7.5-1.3 7.5-4.5"/>',
  sparkle: '<path d="M11 3.5 12.8 9 18.5 11l-5.7 2-1.8 5.5L9.2 13 3.5 11l5.7-2Z"/><path d="M18.5 15.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6Z"/>',
  bulb: '<path d="M9.5 18h5M10.5 21h3"/><path d="M12 3a6 6 0 0 0-3.4 10.9c.6.5.9 1.1.9 1.8v.3h5v-.3c0-.7.3-1.3.9-1.8A6 6 0 0 0 12 3Z"/>',
  shuffle: '<path d="M16 3.5h4.5V8"/><path d="M3.5 20 20.5 3.5"/><path d="M20.5 16v4.5H16"/><path d="m14.5 14.5 6 6"/><path d="M3.5 4l5.5 5.5"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4L12 4Z"/><path d="M12 10v4.5M12 17.2h.01"/>',
  hanger: '<path d="M12 8.5V7c0-.8.5-1.2 1.1-1.6.6-.4 1-.9 1-1.7a2.1 2.1 0 0 0-4.2 0"/><path d="M12 8.5 3 15.1c-.9.7-.4 2.1.7 2.1h16.6c1.1 0 1.6-1.4.7-2.1L12 8.5Z"/>',
};

export function icon(name, cls = '') {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${P[name] || ''}</svg>`;
  return t.content.firstChild;
}
