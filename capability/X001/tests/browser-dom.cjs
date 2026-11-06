'use strict';

// Reads the real DOM of the page in Edge and wraps it so the SAME invariants of tests\invariants.cjs (assertShown) are asserted in the
// real browser as under the DOM stub: unique ids, every entry listed once, one current entry, counts reconciled with the C044 fold.
const readDom = () => {
  const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
  const slider = document.getElementById('scrub');
  const buttons = ['prev', 'next', ...['gap', 'failure', 'unknown', 'epoch'].flatMap((kind) => [`prev-${kind}`, `next-${kind}`])];
  return {
    ids,
    items: [...document.querySelectorAll('#entries > li')].map((li) => ({ id: li.id, label: li.children[0].textContent, text: li.children[1].textContent, cls: li.dataset.class, current: li.getAttribute('aria-current'),
      here: li.children[2].textContent, note: li.children[3].textContent, className: li.className, kinds: [...li.children].map((child) => child.className) })),
    seq: ['seq-find', 'seq-epoch', 'seq-number'].map((id) => document.getElementById(id).disabled),
    buttons: Object.fromEntries(buttons.map((id) => [id, document.getElementById(id).disabled])),
    state: [...document.querySelectorAll('#state dd[id]')].map((dd) => [dd.id, dd.textContent, dd.previousElementSibling.textContent]),
    slider: Object.fromEntries(['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext', 'aria-disabled', 'tabindex'].map((name) => [name, slider.getAttribute(name)])),
    texts: Object.fromEntries(['position', 'status', 'error', 'verified', 'producing', 'provenance', 'seq-result'].map((id) => [id, document.getElementById(id).textContent])),
    positionData: document.getElementById('position').dataset.position, ofData: document.getElementById('position').dataset.of, hash: location.hash,
    selected: document.getElementById('saved-run').value, statusState: document.getElementById('status').dataset.state, producingMark: document.getElementById('producing').dataset.mark,
    fill: document.getElementById('scrub-fill').style.width, active: document.activeElement ? document.activeElement.id : '', limits: [...document.querySelectorAll('#limits > li')].map((li) => li.textContent),
    calls: window.__network ? [...window.__network] : null,
  };
};

function facade(dom) {
  const entries = dom.items.map((item) => ({
    id: item.id, className: item.className, dataset: { class: item.cls }, getAttribute: (name) => (name === 'aria-current' ? item.current : null),
    children: [{ textContent: item.label, className: item.kinds[0] }, { textContent: item.text, className: item.kinds[1] }, { textContent: item.here, className: item.kinds[2] }, { textContent: item.note, className: item.kinds[3] }],
  }));
  const nodes = {
    entries: { children: entries }, 'saved-run': { value: dom.selected },
    'seq-find': { disabled: dom.seq[0] }, 'seq-epoch': { disabled: dom.seq[1] }, 'seq-number': { disabled: dom.seq[2] },
    state: { descendants: () => dom.state.map(([id, textContent]) => ({ id, textContent })), children: dom.state.flatMap(([id, textContent, heading]) => [{ textContent: heading }, { id, textContent }]) },
    scrub: { getAttribute: (name) => dom.slider[name] }, limits: { children: dom.limits.map((textContent) => ({ textContent })) },
    position: { dataset: { of: dom.ofData } }, status: { dataset: { state: dom.statusState } }, producing: { dataset: { mark: dom.producingMark } },
    'scrub-fill': { style: { width: dom.fill } },
    ...Object.fromEntries(Object.entries(dom.buttons).map(([id, disabled]) => [id, { disabled }])),
  };
  return { $: (id) => nodes[id], ids: () => dom.ids, position: () => Number(dom.positionData), text: (id) => dom.texts[id], location: { hash: dom.hash }, calls: dom.calls || [] };
}

module.exports = Object.freeze({ readDom, facade });
