'use strict';

// Review F3 (C059): page.js statement mutants that no test noticed. Each test pins one observable behavior: VISIBILITY (the hidden flags,
// not the textContent of hidden elements), data-about, a stale data-code, Start over, recovery after malformed JSON, defaultPrevented
// of the chooser keys and of the form, hidden error messages, and a stale recovery button clicked while busy.
const test = require('node:test');
const assert = require('node:assert/strict');
const { c042, gate, openSession } = require('./harness.cjs');
const { Event, idle } = require('./dom.cjs');

const OPTIONS = { timeout: 20000 };
const press = (session, id) => () => { session.$(id).focus(); session.press('Enter'); };
const conduct = (session, values) => { session.fill(values); return session.act('conduct', () => session.submit(), { announced: 2 }); };

test('every announcement carries its kind in data-about: ready, navigation, validation, progress and result', OPTIONS, async () => {
  const held = gate();
  const session = await openSession({ executor: held.executor });
  const about = () => session.$('status').getAttribute('data-about');
  assert.equal(about(), 'ready');
  await session.act('choose', () => session.radios()[0].click(), { announced: 1 });
  assert.equal(about(), 'navigation');
  session.fill({ key: '', units: 'abc' });
  await session.act('invalid submit', () => session.submit(), { announced: 1 });
  assert.equal(about(), 'validation');
  session.fill({ key: 'about-key-0001', units: 2 });
  session.submit();
  await held.entered('about-key-0001');
  assert.equal(about(), 'progress');
  held.release('about-key-0001');
  await idle(session.document);
  assert.equal(about(), 'result');
});

test('the "no step yet" sentence, the facts and the what-did-not-happen block are shown or hidden with the result (visibility, not text)', OPTIONS, async () => {
  const session = await openSession();
  const shown = (id) => !session.$(id).hidden;
  assert.deepEqual(['result-empty', 'facts', 'did-not-block', 'recovery-block', 'recovery-note'].map(shown), [true, false, false, false, false]);
  await conduct(session, { key: 'vis-key-0001', units: 2 });
  assert.deepEqual(['result-empty', 'facts', 'did-not-block', 'recovery-block', 'recovery-note'].map(shown), [false, true, true, true, false]);
  assert.ok(session.$('facts').children.length > 0 && session.$('did-not').children.length > 0);
  session.fill({ key: '' });
  await session.act('invalid', () => session.submit(), { announced: 1 });
  assert.deepEqual(['result-empty', 'facts', 'did-not-block', 'recovery-block'].map(shown), [false, false, false, false], 'a validation result has no facts and no offered actions');
  await session.act('start over', () => session.$('start-over').click(), { announced: 1 });
  assert.deepEqual(['result-empty', 'facts', 'did-not-block', 'recovery-block'].map(shown), [true, false, false, false]);
});

test('a result without any offered action says so (the note is shown, the recovery block is not)', OPTIONS, async () => {
  const session = await openSession();
  await conduct(session, { key: 'vis-key-0002', units: 2 });
  const refused = c042('result.cjs').refusal('NOT_FOUND', { action: 'inspect', key: 'vis-key-0002' });
  session.fetch.state.next = () => session.fetch.answer(refused);
  await session.act('inspect answered by a refusal with no action', press(session, 'recovery-inspect'), { announced: 2 });
  assert.equal(session.$('result').getAttribute('data-recovery'), '');
  assert.deepEqual([session.$('recovery-block').hidden, session.$('recovery-note').hidden], [true, false]);
});

test('a stale data-code never survives into the next result', OPTIONS, async () => {
  const session = await openSession();
  await conduct(session, { key: 'code-key-0001', lease: 'synthetic-lease-002', units: 10 });
  await conduct(session, { key: 'code-key-0002', lease: 'synthetic-lease-002', units: 1 });
  assert.equal(session.$('result').getAttribute('data-code'), 'CAPACITY_EXHAUSTED');
  await conduct(session, { key: 'code-key-0003', lease: 'synthetic-lease-001', units: 1 });
  assert.equal(session.outcome(), 'succeeded');
  assert.equal(session.$('result').hasAttribute('data-code'), false);
});

test('Start over forgets the chosen lesson: Open then asks for a choice and mounts nothing', OPTIONS, async () => {
  const session = await openSession();
  await session.act('choose', () => session.radios()[0].click(), { announced: 1 });
  await session.act('open', () => session.$('open-lesson').click(), { announced: 1 });
  await session.act('start over', () => session.$('start-over').click(), { announced: 1 });
  assert.equal(session.$('open-lesson').getAttribute('aria-disabled'), 'true');
  const again = await session.act('open after start over', press(session, 'open-lesson'), { announced: 1 });
  assert.equal(again.text, 'Choose a lesson first: no lesson is chosen.');
  assert.equal(session.$('lesson-heading').hidden, true);
  assert.equal(session.$('lesson-mount').children.length, 0);
  assert.deepEqual(session.radios().map((radio) => radio.getAttribute('aria-checked')), ['false', 'false']);
});

test('after malformed JSON the recovery controls are Retry and Inspect', OPTIONS, async () => {
  const session = await openSession();
  session.fetch.state.next = async () => ({ status: 200, ok: true, json: async () => { throw new SyntaxError('Unexpected token'); } });
  await conduct(session, { key: 'json-key-0001', units: 2 });
  assert.deepEqual(session.buttons(), ['recovery-retry', 'recovery-inspect']);
  assert.equal(session.$('result').getAttribute('data-recovery'), 'retry inspect');
});

test('the chooser cancels the default of Arrow keys and Space (no page scroll), leaves Tab and other keys alone, and ignores modified keys', OPTIONS, async () => {
  const session = await openSession();
  session.radios()[0].focus();
  for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', ' ']) assert.equal(session.press(key).defaultPrevented, true, `${JSON.stringify(key)} must not scroll the page`);
  for (const key of ['Tab', 'Home', 'End', 'a', 'Enter']) { session.radios()[0].focus(); assert.equal(session.press(key).defaultPrevented, false, key); }
  session.radios()[0].focus();
  const before = session.radios().map((radio) => radio.getAttribute('aria-checked'));
  for (const modifier of ['altKey', 'ctrlKey', 'metaKey']) {
    const event = new Event('keydown', { bubbles: true, key: 'ArrowRight', [modifier]: true });
    session.document.activeElement.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false, modifier);
  }
  assert.deepEqual(session.radios().map((radio) => radio.getAttribute('aria-checked')), before, 'a modified arrow key chooses nothing');
});

test('an Arrow key moves the focus WITH the choice, wrapping: the newly chosen radio is the active element and the only tab stop', OPTIONS, async () => {
  const session = await openSession();
  const radios = session.radios();
  assert.equal(radios.length, 2);
  radios[0].focus();
  session.press('ArrowRight');
  assert.equal(session.document.activeElement, radios[1], 'the focus follows the choice');
  assert.deepEqual(radios.map((radio) => radio.getAttribute('aria-checked')), ['false', 'true']);
  session.press('ArrowRight');
  assert.equal(session.document.activeElement, radios[0], 'wrapping: the focus follows to the first radio');
  assert.deepEqual(radios.map((radio) => radio.getAttribute('tabindex')), ['0', '-1']);
});

test('the form submit default is cancelled and every error message is hidden again after a valid submit', OPTIONS, async () => {
  const session = await openSession();
  let seen = null;
  session.$('step-form').addEventListener('submit', (event) => { seen = event; });
  session.fill({ key: '', units: 'abc' });
  await session.act('invalid', () => session.submit(), { announced: 1 });
  assert.equal(seen.defaultPrevented, true, 'the page handles the submit itself');
  assert.deepEqual(['key-error', 'lease-error', 'units-error', 'error-summary'].map((id) => session.$(id).hidden), [false, true, false, false]);
  assert.equal(session.$('error-list').children.length, 2);
  await conduct(session, { key: 'err-key-0001', units: 2 });
  for (const id of ['key-error', 'lease-error', 'units-error', 'error-summary']) assert.equal(session.$(id).hidden, true, id);
  for (const id of ['key-error', 'lease-error', 'units-error']) assert.equal(session.$(id).textContent, '', id);
  assert.equal(session.$('error-list').children.length, 0);
  for (const field of ['key', 'lease', 'units']) {
    assert.equal(session.$(field).hasAttribute('aria-invalid'), false, field);
    assert.equal(session.$(field).getAttribute('aria-describedby'), `${field}-help`, field);
  }
});

test('a recovery button that is no longer on the page does nothing while a request is in flight', OPTIONS, async () => {
  const held = gate();
  const session = await openSession({ executor: held.executor });
  session.fetch.state.fail = true;
  await conduct(session, { key: 'stale-key-0001', units: 2 });
  const stale = session.$('recovery-inspect');
  session.submit();
  await held.entered('stale-key-0001');
  assert.equal(session.$('result').getAttribute('aria-busy'), 'true');
  const calls = session.fetch.state.calls.length;
  stale.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(session.fetch.state.calls.length, calls, 'no second request was started');
  held.release('stale-key-0001');
  await idle(session.document);
  assert.equal(session.outcome(), 'succeeded');
});
