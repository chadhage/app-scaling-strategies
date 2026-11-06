'use strict';

// EXHAUSTIVE keyboard enumeration: every key of a defined set x every focusable position x every reachable state of the page
// (including a request in flight and every typed outcome). After each key press: no exception, the checker and the oracle hold,
// the focus is on a named, connected element, Tab moves on (no trap, forwards and backwards) and a key that is not part of a
// pattern changes nothing. A combination that changed the page is followed by a rebuild, so every combination starts from the
// exact state it names.
const test = require('node:test');
const assert = require('node:assert/strict');
const { checker, c042, gate, openSession, oracle } = require('./harness.cjs');
const { idle } = require('./dom.cjs');

const KEYS = ['Tab', 'Shift+Tab', 'Enter', ' ', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Backspace', 'Delete', 'a'];
const INERT = new Set(['Escape', 'Home', 'End', 'PageUp', 'PageDown', 'Backspace', 'Delete', 'a']);
const refusal = (code) => c042('result.cjs').refusal(code, { action: 'submit' });

async function conduct(session, values) {
  session.fill(values);
  session.submit();
  await idle(session.document);
}

// A request whose answer is lost while the step stays held in flight by the executor.
async function lost(extra = {}) {
  const held = gate();
  let drop = true;
  const session = await openSession({ executor: held.executor, wrap: (base) => async (route, options) => {
    if (drop && route === '/v1/steps') { drop = false; base(route, options).catch(() => {}); throw new TypeError('connection lost'); }
    return base(route, options);
  }, ...extra });
  await conduct(session, { key: 'kb-lost-0001', units: 2 });
  await held.entered('kb-lost-0001');
  session.cleanup = () => held.release('kb-lost-0001');
  return session;
}

const press = (session, id) => { session.$(id).focus(); session.press('Enter'); return idle(session.document); };

const STATES = {
  initial: () => openSession(),
  chosen: async () => { const s = await openSession(); s.radios()[0].click(); return s; },
  opened: async () => { const s = await openSession(); s.radios()[1].click(); s.$('open-lesson').click(); return s; },
  invalid: async () => { const s = await openSession(); await conduct(s, { key: 'x', units: '0' }); return s; },
  succeeded: async () => { const s = await openSession(); await conduct(s, { key: 'kb-key-0001', units: 2 }); return s; },
  rejected: async () => {
    const s = await openSession();
    await conduct(s, { key: 'kb-key-0002', lease: 'synthetic-lease-002', units: 10 });
    await conduct(s, { key: 'kb-key-0003', lease: 'synthetic-lease-002', units: 1 });
    return s;
  },
  conflict: async () => { const s = await openSession(); await conduct(s, { key: 'kb-key-0004', units: 2 }); await conduct(s, { units: 3 }); return s; },
  unknown: async () => { const s = await openSession(); s.fetch.state.fail = true; await conduct(s, { key: 'kb-key-0005', units: 2 }); return s; },
  unsupported: async () => { const s = await openSession(); s.fetch.state.next = () => s.fetch.answer(refusal('UNSUPPORTED_STEP')); await conduct(s, { key: 'kb-key-0006', units: 2 }); return s; },
  inflight: async () => { const s = await lost(); await press(s, 'recovery-inspect'); return s; },
  cancelled: async () => { const s = await lost(); await press(s, 'recovery-inspect'); await press(s, 'recovery-cancel'); return s; },
  interrupted: async () => { const s = await lost(); await s.restart(); await press(s, 'recovery-inspect'); return s; },
  busy: async () => {
    const held = gate();
    const s = await openSession({ executor: held.executor });
    s.fill({ key: 'kb-busy-0001', units: 2 });
    s.submit();
    await held.entered('kb-busy-0001');
    s.cleanup = () => held.release('kb-busy-0001');
    return s;
  },
  'started over': async () => { const s = await openSession(); await conduct(s, { key: 'kb-key-0007', units: 2 }); await press(s, 'start-over'); return s; },
};

const focusables = (session) => session.document.elements().filter((element) => element.focusable());
const signature = (document) => document.elements().map((element) => [element.localName, [...element.attrs].sort().join(','), element.state.value, element.childNodes.filter((node) => node.nodeType === 3).map((node) => node.data).join('')].join('|')).join('\n');
const pressKey = (session, key) => (key === 'Shift+Tab' ? session.press('Tab', { shift: true }) : session.press(key));

async function finish(session) {
  session.cleanup?.();
  await idle(session.document);
}

for (const [name, build] of Object.entries(STATES)) {
  test(`keyboard enumeration in the state "${name}": every key at every focus position keeps the focus, the contract and the Tab cycle`, { timeout: 240000 }, async () => {
    let session = await build();
    const positions = focusables(session).length;
    assert.ok(positions >= 10, `${name}: only ${positions} focusable positions`);
    let combinations = 0;
    for (let position = 0; position < positions; position += 1) {
      for (const key of KEYS) {
        const start = focusables(session)[position];
        start.focus();
        const before = signature(session.document);
        const announced = session.document.announcements.length;
        pressKey(session, key);
        // A retry of a step that is held in flight joins it and waits: release the held step so that the page can answer.
        if (name !== 'busy' && session.$('result').getAttribute('aria-busy') === 'true') session.cleanup?.();
        await (name === 'busy' ? Promise.resolve() : idle(session.document));
        const label = `${name} / ${start.id || start.localName} / ${JSON.stringify(key)}`;
        const active = session.document.activeElement;
        assert.deepEqual(checker.check(session.document).findings.map((item) => `${item.code} ${item.selector}`), [], label);
        assert.deepEqual(oracle(session.document, { busy: name === 'busy' }), [], label);
        if (key === 'Tab' || key === 'Shift+Tab') assert.notEqual(active, start, `${label}: Tab did not move the focus (a trap)`);
        assert.equal(checker.walkTab({ document: session.document, press: session.press }).trapped, false, `${label}: forward cycle`);
        assert.equal(checker.walkTab({ document: session.document, press: session.press, shift: true }).trapped, false, `${label}: backward cycle`);
        const writes = session.document.announcements.slice(announced).filter((entry) => entry.text !== '').length;
        assert.ok(writes <= 2, `${label}: ${writes} announcements for one key`);
        const changed = signature(session.document) !== before;
        if (INERT.has(key)) assert.equal(changed, false, `${label}: an inert key changed the page`);
        combinations += 1;
        if (changed || writes > 0) { await finish(session); session = await build(); }
      }
    }
    await finish(session);
    assert.equal(combinations, positions * KEYS.length);
  });
}
