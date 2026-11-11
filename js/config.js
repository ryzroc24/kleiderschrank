// Grundeinstellungen der App. Hier kannst du Kategorien und Standardwerte anpassen.

export const KATEGORIEN = [
  { id: 'jacke',      label: 'Jacke',      plural: 'Jacken',      icon: '🧥' },
  { id: 'oberteil',   label: 'Oberteil',   plural: 'Oberteile',   icon: '👕' },
  { id: 'hose',       label: 'Hose',       plural: 'Hosen',       icon: '👖' },
  { id: 'schuhe',     label: 'Schuhe',     plural: 'Schuhe',      icon: '👟' },
  { id: 'accessoire', label: 'Accessoire', plural: 'Accessoires', icon: '🧢' },
];

export const katLabel = (id) => KATEGORIEN.find((k) => k.id === id)?.label ?? id;
export const katIcon = (id) => KATEGORIEN.find((k) => k.id === id)?.icon ?? '❔';

export const STATUS = {
  sauber:   { label: 'sauber',   cls: 'st-sauber' },
  getragen: { label: 'getragen', cls: 'st-getragen' },
  waesche:  { label: 'Wäsche',   cls: 'st-waesche' },
};

// Standard-Einstellungen (in der App unter "Mehr" änderbar).
export const STANDARD_EINSTELLUNGEN = {
  key: 'main',
  // Nach so vielen Tragetagen kommt ein Teil automatisch in die Wäsche. 0 = nie automatisch.
  wearLimits: { oberteil: 1, hose: 3, jacke: 5, schuhe: 0, accessoire: 0 },
  // "Diese Woche getragen" → im Outfit-Builder ausgrauen und bei Vorschlägen auslassen.
  weekRule: { oberteil: true, hose: true, jacke: true, schuhe: true, accessoire: true },
};

// Bildgrößen (Pixel, längste Seite)
export const BILD = { max: 800, thumb: 400 };
