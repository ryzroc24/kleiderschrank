// Kleine UI-Helfer: Elemente bauen, Toast, Dialoge, Bottom-Sheets.

export const $ = (sel, root = document) => root.querySelector(sel);

// Wie el.replaceChildren(), überspringt aber false/null (für bedingte Elemente)
export const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));

// h('div', { class: 'x', onclick: fn }, 'Text', kindElement, …)
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

let toastTimer;
export function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// Modaler Dialog. buttons: [{ label, value, style: 'primary'|'danger'|'' }]
export function dialog({ title, text, content, buttons }) {
  return new Promise((resolve) => {
    const close = (v) => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 200); resolve(v); };
    const wrap = h('div', { class: 'modal-wrap', onclick: (e) => { if (e.target === wrap) close(null); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
        title && h('h3', {}, title),
        text && h('p', { class: 'muted' }, text),
        content,
        h('div', { class: 'modal-buttons' },
          buttons.map((b) => h('button', { class: `btn ${b.style || ''}`, onclick: () => close(typeof b.value === 'function' ? b.value() : b.value) }, b.label)))));
    document.body.append(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
  });
}

export const confirmDialog = (title, text, okLabel = 'OK', danger = false) =>
  dialog({ title, text, buttons: [{ label: 'Abbrechen', value: false }, { label: okLabel, value: true, style: danger ? 'danger' : 'primary' }] });

export function promptDialog(title, value = '', placeholder = '') {
  const input = h('input', { type: 'text', class: 'input', value, placeholder, enterkeyhint: 'done' });
  setTimeout(() => input.focus(), 250);
  return dialog({ title, content: input, buttons: [{ label: 'Abbrechen', value: null }, { label: 'OK', value: () => input.value.trim(), style: 'primary' }] });
}

// Vollbild-Ansicht (für Editor, Details, Formular). Gibt { el, body, close } zurück.
export function openPage({ title, left, right, onClose }) {
  const body = h('div', { class: 'page-body' });
  const page = h('section', { class: 'page' },
    h('header', { class: 'page-bar' },
      h('div', { class: 'bar-left' }, left),
      h('h2', {}, title),
      h('div', { class: 'bar-right' }, right)),
    body);
  document.body.append(page);
  requestAnimationFrame(() => page.classList.add('open'));
  const close = () => { page.classList.remove('open'); setTimeout(() => page.remove(), 250); onClose?.(); };
  return { el: page, body, close };
}

// Bottom-Sheet mit Optionen
export function sheet(title, options) {
  return new Promise((resolve) => {
    const close = (v) => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 220); resolve(v); };
    const wrap = h('div', { class: 'sheet-wrap', onclick: (e) => { if (e.target === wrap) close(null); } },
      h('div', { class: 'sheet' },
        h('div', { class: 'sheet-grip' }),
        title && h('h3', {}, title),
        options.map((o) => (o.render ? o.render(close) : h('button', { class: `btn block ${o.style || ''}`, onclick: () => close(o.value) }, o.label))),
        h('button', { class: 'btn block ghost', onclick: () => close(null) }, 'Abbrechen')));
    document.body.append(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
  });
}

export function spinner(text) {
  const el = h('div', { class: 'busy' }, h('div', { class: 'spin' }), h('p', { class: 'busy-text' }, text));
  document.body.append(el);
  return { set: (t) => { el.querySelector('.busy-text').textContent = t; }, close: () => el.remove() };
}

// Segment-Schalter (z. B. Status)
export function segmented(options, value, onChange, cls = '') {
  const wrap = h('div', { class: `seg ${cls}` });
  const render = (v) => {
    wrap.replaceChildren(...options.map((o) => h('button', {
      class: `seg-btn ${o.value === v ? 'active' : ''} ${o.cls || ''}`,
      onclick: () => { render(o.value); onChange(o.value); },
    }, o.label)));
  };
  render(value);
  return wrap;
}
