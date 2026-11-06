'use strict';

// The REAL page under the DOM stub: render, the keyboard order, the radio group pattern, the lesson host and form errors.
// After EVERY action `act` runs the production checker and an independent oracle and counts the announcements.
const test = require('node:test');
const assert = require('node:assert/strict');
const { checker, openSession } = require('./harness.cjs');

const OPTIONS = { timeout: 20000 };
const INITIAL_ORDER = ['skip-link', 'nav-choose', 'nav-conduct', 'nav-result', 'lesson-A-S001', 'open-lesson', 'close-lesson', 'key', 'lease', 'units', 'submit', 'start-over'];

test('the first render has one h1, a language, a title, a main landmark, the focus on the h1 and one ready announcement', OPTIONS, async () => {
  const session = await openSession();
  const { document } = session;
  assert.equal(document.documentElement.getAttribute('lang'), 'en');
  assert.match(document.title, /^Conduct one step/);
  assert.equal(document.activeElement.id, 'page-heading');
  assert.equal(document.announcements.length, 1, 'one write to the live region at load');
  assert.match(session.$('status').textContent, /^Ready\./);
  assert.equal(session.outcome(), 'none');
  assert.equal(session.radios().length, 2);
});

test('the Tab order is the expected one: the checker, a recorded traversal and the hand-written list agree, forwards and backwards', OPTIONS, async () => {
  const session = await openSession();
  const { document } = session;
  const ids = (list) => list.map((element) => element.id);
  assert.deepEqual(ids(document.tabOrder()), INITIAL_ORDER);
  assert.deepEqual(ids(checker.tabOrder(document)), INITIAL_ORDER);
  document.activeElement.blur();
  const recorded = [];
  for (let press = 0; press < INITIAL_ORDER.length; press += 1) { session.press('Tab'); recorded.push(document.activeElement.id); }
  assert.deepEqual(recorded, INITIAL_ORDER);
  session.press('Tab');
  assert.equal(document.activeElement.id, 'skip-link', 'the cycle closes: no trap');
  const backwards = [];
  for (let press = 0; press < INITIAL_ORDER.length; press += 1) { session.press('Tab', { shift: true }); backwards.push(document.activeElement.id); }
  assert.deepEqual(backwards, [...INITIAL_ORDER].reverse());
  assert.equal(checker.walkTab({ document, press: session.press }).trapped, false);
});

test('the skip link and the step links move the focus to a focusable target', OPTIONS, async () => {
  const session = await openSession();
  for (const [link, target] of [['skip-link', 'main'], ['nav-choose', 'choose-heading'], ['nav-conduct', 'conduct-heading'], ['nav-result', 'result-heading']]) {
    await session.act(link, () => { session.$(link).focus(); session.press('Enter'); }, { announced: 0 });
    assert.equal(session.document.activeElement.id, target);
  }
});

test('the chooser is an ARIA radio group: one tab stop, arrows move and choose with wrapping, Space chooses, each choice is announced once', OPTIONS, async () => {
  const session = await openSession();
  const [first, second] = session.radios();
  const roving = () => session.radios().map((radio) => `${radio.getAttribute('tabindex')}/${radio.getAttribute('aria-checked')}`);
  assert.deepEqual(roving(), ['0/false', '-1/false']);
  first.focus();
  const down = await session.act('ArrowDown', () => session.press('ArrowDown'), { announced: 1 });
  assert.equal(session.document.activeElement, second);
  assert.deepEqual(roving(), ['-1/false', '0/true']);
  assert.match(down.text, /^A-S003 chosen: /);
  await session.act('ArrowDown wraps', () => session.press('ArrowDown'), { announced: 1 });
  assert.equal(session.document.activeElement, first);
  await session.act('ArrowUp wraps', () => session.press('ArrowUp'), { announced: 1 });
  assert.equal(session.document.activeElement, second);
  await session.act('ArrowLeft', () => session.press('ArrowLeft'), { announced: 1 });
  await session.act('ArrowRight', () => session.press('ArrowRight'), { announced: 1 });
  assert.equal(session.document.activeElement, second);
  assert.deepEqual(roving(), ['-1/false', '0/true']);
  const same = await session.act('arrow back onto nothing new is a real change', () => session.press('ArrowUp'), { announced: 1 });
  assert.match(same.text, /^A-S001 chosen/);
  first.focus();
  await session.act('Space on the chosen radio changes nothing and says nothing', () => session.press(' '), { announced: 0 });
  second.focus();
  await session.act('Space chooses the focused radio', () => session.press(' '), { announced: 1 });
  assert.deepEqual(roving(), ['-1/false', '0/true']);
  await session.act('click chooses', () => first.click(), { announced: 1 });
  assert.deepEqual(roving(), ['0/true', '-1/false']);
  assert.equal(session.document.activeElement, first);
  session.press('Tab');
  assert.equal(session.document.activeElement.id, 'open-lesson', 'Tab leaves the group');
});

test('keys that are not part of the radio pattern, with a modifier or on another target do nothing', OPTIONS, async () => {
  const session = await openSession();
  const [first] = session.radios();
  first.focus();
  const event = (key, init = {}) => session.document.activeElement.dispatchEvent(Object.assign(new (require('./dom-nodes.cjs').Event)('keydown', { bubbles: true, key }), init));
  const before = session.document.announcements.length;
  for (const key of ['Home', 'End', 'PageUp', 'PageDown', 'Escape', 'Enter', 'toString', '__proto__', 'a']) session.press(key);
  event('ArrowDown', { ctrlKey: true });
  event('ArrowDown', { altKey: true });
  event('ArrowDown', { metaKey: true });
  session.$('lessons').dispatchEvent(Object.assign(new (require('./dom-nodes.cjs').Event)('keydown', { bubbles: true, key: 'ArrowDown' })));
  assert.equal(session.document.announcements.length, before);
  assert.deepEqual(session.radios().map((radio) => radio.getAttribute('aria-checked')), ['false', 'false']);
  session.verify('after ignored keys');
});

test('opening and closing a lesson: named frame, focus on the lesson heading, then back on the invoker, each announced once', OPTIONS, async () => {
  const session = await openSession();
  const none = await session.act('open without a choice', () => { session.$('open-lesson').focus(); session.press('Enter'); }, { announced: 1 });
  assert.match(none.text, /^Choose a lesson first/);
  assert.equal(session.document.activeElement.id, 'open-lesson');
  assert.equal(session.$('open-lesson').getAttribute('aria-disabled'), 'true');
  await session.act('choose', () => session.radios()[0].click(), { announced: 1 });
  assert.equal(session.$('open-lesson').hasAttribute('aria-disabled'), false);
  const opened = await session.act('open', () => { session.$('open-lesson').focus(); session.press('Enter'); }, { announced: 1 });
  assert.equal(session.document.activeElement.id, 'lesson-heading');
  assert.match(session.$('lesson-heading').textContent, /^Lesson A-S001: /);
  assert.match(opened.text, /^A-S001 opened in an isolated frame/);
  const frame = session.$('lesson-mount').children[0];
  assert.equal(frame.localName, 'iframe');
  assert.match(frame.title, /^A-S001: .* isolated synthetic training$/);
  assert.equal(frame.getAttribute('sandbox'), 'allow-scripts');
  assert.equal(session.$('close-lesson').hasAttribute('aria-disabled'), false);
  assert.ok(session.document.tabOrder().includes(frame), 'the frame is a tab stop between the buttons and the form');
  await session.act('open again only moves the focus', () => { session.$('open-lesson').focus(); session.press('Enter'); }, { announced: 0 });
  assert.equal(session.document.activeElement.id, 'lesson-heading');
  const closed = await session.act('close', () => { session.$('close-lesson').focus(); session.press('Enter'); }, { announced: 1 });
  assert.equal(session.document.activeElement.id, 'open-lesson');
  assert.match(closed.text, /^Lesson closed/);
  assert.equal(session.$('lesson-mount').children.length, 0);
  assert.equal(session.$('lesson-heading').hidden, true);
  const idle = await session.act('close with nothing open', () => { session.$('close-lesson').focus(); session.press('Enter'); }, { announced: 1 });
  assert.match(idle.text, /^No lesson is open/);
});

test('choosing another lesson while one is open closes it and says so; the host note is not a live region', OPTIONS, async () => {
  const session = await openSession();
  await session.act('choose', () => session.radios()[0].click(), { announced: 1 });
  await session.act('open', () => session.$('open-lesson').click(), { announced: 1 });
  const switched = await session.act('choose another', () => session.radios()[1].click(), { announced: 1 });
  assert.match(switched.text, /^A-S003 chosen: .* The open lesson was closed\./);
  assert.equal(session.$('lesson-mount').children.length, 0);
  assert.equal(session.$('close-lesson').getAttribute('aria-disabled'), 'true');
  assert.equal(session.$('host-note').getAttribute('aria-live'), null);
  assert.notEqual(session.$('host-note').getAttribute('role'), 'status');
});

test('a refused selection (a host that refuses) is announced and nothing is mounted', OPTIONS, async () => {
  const refusing = { createHost: () => ({ mount: () => ({ accepted: false }), unmount() {} }) };
  const session = await openSession({ globals: { C041LessonHost: refusing }, skip: ['/c041/lesson-host.js'] });
  await session.act('choose', () => session.radios()[0].click(), { announced: 1 });
  const refused = await session.act('open', () => { session.$('open-lesson').focus(); session.press('Enter'); }, { announced: 1 });
  assert.match(refused.text, /^Selection refused/);
  assert.equal(session.document.activeElement.id, 'open-lesson');
});

test('invalid fields are not sent: aria-invalid, described by their messages, summarised, the first invalid field focused, announced once', OPTIONS, async () => {
  const session = await openSession();
  session.fill({ key: 'x', lease: 'nowhere', units: '1e1' });
  const first = await session.act('invalid submit', () => session.submit(), { announced: 1, check: { afterSubmit: true } });
  assert.deepEqual(session.fetch.state.calls, []);
  assert.equal(session.document.activeElement.id, 'key');
  assert.match(first.text, /^Not submitted: 3 fields need correction: Idempotency key, Lease, Units\./);
  assert.equal(session.outcome(), 'validation');
  for (const field of ['key', 'lease', 'units']) {
    assert.equal(session.$(field).getAttribute('aria-invalid'), 'true');
    assert.match(session.$(field).getAttribute('aria-describedby'), new RegExp(`${field}-error`));
    assert.equal(session.$(`${field}-error`).hidden, false);
  }
  const links = session.$('error-list').children.map((item) => item.children[0].getAttribute('href'));
  assert.deepEqual(links, ['#key', '#lease', '#units']);
  await session.act('the summary link focuses the field', () => { session.$('error-list').children[2].children[0].focus(); session.press('Enter'); }, { announced: 0 });
});

test('each invalid field has a typed, fixed message; one invalid field says "field needs"; a valid resubmit clears every error', OPTIONS, async () => {
  const session = await openSession();
  session.fill({ key: '', units: '' });
  await session.act('empty', () => session.submit(), { announced: 1, check: { afterSubmit: true } });
  assert.match(session.$('key-error').textContent, /^Enter an idempotency key\./);
  assert.match(session.$('units-error').textContent, /^Enter the number of units\./);
  session.fill({ key: 'good-key-0001', units: '11' });
  const one = await session.act('one invalid', () => session.submit(), { announced: 1, check: { afterSubmit: true } });
  assert.match(one.text, /^Not submitted: 1 field needs correction: Units\./);
  assert.equal(session.$('key').hasAttribute('aria-invalid'), false);
  assert.equal(session.$('key').getAttribute('aria-describedby'), 'key-help');
  assert.equal(session.document.activeElement.id, 'units');
  session.fill({ units: '3' });
  await session.act('valid resubmit', () => session.submit(), { announced: 2 });
  assert.equal(session.$('error-summary').hidden, true);
  assert.equal(session.$('units').hasAttribute('aria-invalid'), false);
  assert.equal(session.outcome(), 'succeeded');
});
