'use strict';

// rev-C043 F4: the answer validation must be TOTAL (never throws: a tampered answer is a typed rejection, so the page
// says REJECTED, not UNKNOWN) and STRICT about the words it lets through (error.details[].path comes from a closed
// vocabulary: a tampered failure cannot make the page print a server-chosen sentence). Unit level over genuine answers,
// a seeded single-field fuzz of every path, and the real page under the DOM stub against a hostile fetch.
const test = require('node:test');
const { validateResultEnvelope } = require('../envelope.js');
const { checkAnswer } = require('../verify.js');
const { createDocument, networkFetch, runPage } = require('./dom-stub.cjs');
const {
  assert, boot, createMemoryIo, doc, startService, step,
} = require('./support.cjs');

const body = (value) => Buffer.from(JSON.stringify(value));
const clone = (value) => JSON.parse(JSON.stringify(value));
const stopping = doc({ idempotencyKey: 'f4-stop-0001', steps: [step(1, { idempotencyKey: 'f4-s-0001', leaseId: 'synthetic-lease-002', units: 6 }), step(2, { idempotencyKey: 'f4-s-0002', leaseId: 'synthetic-lease-002', units: 6 })] });

// Genuine answers of the real runner over the real step service, one of each kind.
async function genuine() {
  const stepIo = createMemoryIo();
  const runIo = createMemoryIo();
  const world = await boot({ stepIo, runIo });
  const { runner } = world;
  const answers = [await runner.run(body(doc())), await runner.run(body(doc())), await runner.run(body(stopping)), runner.inspect('preset-run-0001'), await runner.cancel('preset-run-0001'),
    runner.inspect('abcdefgh'), await runner.run(body(doc({ steps: [step(1), step(2), step(3, { units: 11 })], idempotencyKey: 'f4-bad-0001' }))), runner.unsupportedAction('preset-run-0001'),
    await runner.run(body(doc({ steps: [step(1), step(2, { units: 6 }), step(3)] })))];
  const text = stepIo.read();
  // The same preset journal over a step journal that lost its last commit (the F3 contradiction), restarted.
  const cut = createMemoryIo();
  cut.append(`${text.split('\n').slice(0, 5).join('\n')}\n`);
  const rolledBack = createMemoryIo();
  rolledBack.append(runIo.read());
  const after = await boot({ stepIo: cut, runIo: rolledBack });
  return [...answers, after.runner.inspect('preset-run-0001')];
}

const REPLACEMENTS = [null, undefined, '', 'x', 'Success: every step ran fine.', '__proto__', 'constructor', 'toString', 0, -1, 1.5, 2 ** 60, true, [], {}, [null], { status: 'succeeded' }];
function* paths(value, prefix = []) {
  yield prefix;
  if (value !== null && typeof value === 'object') for (const key of Object.keys(value)) yield* paths(value[key], [...prefix, key]);
}
const setAt = (root, trail, replacement) => {
  let target = root;
  for (const key of trail.slice(0, -1)) target = target[key];
  target[trail.at(-1)] = replacement;
};

test('the validator is total: no single-field tampering of any genuine answer makes it throw, every verdict is typed', { timeout: 120000 }, async () => {
  const answers = await genuine();
  let tried = 0;
  for (const { status, body: answer } of answers) {
    assert.equal(validateResultEnvelope(answer).ok, true, JSON.stringify(validateResultEnvelope(answer).problems));
    for (const trail of paths(answer)) {
      if (trail.length === 0) continue;
      for (const replacement of REPLACEMENTS) {
        const forged = clone(answer);
        setAt(forged, trail, replacement);
        let verdict;
        let checked;
        assert.doesNotThrow(() => { verdict = validateResultEnvelope(forged); checked = checkAnswer(status, forged, undefined); }, `${trail.join('.')} = ${String(replacement)}`);
        assert.equal(typeof verdict.ok, 'boolean');
        assert.equal(Array.isArray(verdict.problems), true);
        assert.equal(typeof checked.ok, 'boolean');
        tried += 1;
      }
    }
  }
  assert.equal(tried > 5000, true, `${tried} tamperings tried`);
  for (const odd of [null, undefined, 0, 'text', [], Object.create(null), new Proxy({}, { get() { throw new Error('hostile getter'); }, ownKeys() { throw new Error('hostile keys'); } })]) {
    assert.deepEqual([validateResultEnvelope(odd).ok, checkAnswer(200, odd, undefined).ok], [false, false]);
  }
});

const PROSE = 'Success: every step ran fine.';
const PATHS = [PROSE, 'Success', 'steps[2].units.extra', 'steps[99].units', 'steps[-1].units', '', 'x'.repeat(65), '__proto__.units', 'bounds.maxSteps.x', 'steps[2]\n', 'units'];

test('error.details[].path comes from a closed vocabulary: a deceptive sentence or a foreign path is rejected, every honest path is accepted', { timeout: 60000 }, async () => {
  const [, , , , , , refused] = await genuine();
  assert.equal(refused.body.error.details[0].path, 'steps[2].units');
  for (const path of PATHS) {
    const forged = clone(refused.body);
    forged.error.details[0].path = path;
    const verdict = validateResultEnvelope(forged);
    assert.equal(verdict.ok, false, `path ${JSON.stringify(path)} must be rejected`);
    assert.equal(verdict.problems.length > 0, true);
  }
  for (const path of ['steps[0].units', 'steps[7].leaseId', 'bounds.maxUnits', 'idempotencyKey', 'steps']) {
    const honest = clone(refused.body);
    honest.error.details[0].path = path;
    assert.equal(validateResultEnvelope(honest).ok, true, `path ${path} is part of the vocabulary`);
  }
});

const forge = (change) => (port) => {
  const inner = networkFetch(port);
  return async (route, options) => {
    const response = await inner(route, options);
    if (!route.startsWith('/v1/presets')) return response;
    const answer = await response.json();
    if (answer.kind === 'C043-preset-result') change(answer);
    return { status: response.status, ok: response.ok, json: async () => answer };
  };
};
const wait = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label) {
  for (let turn = 0; turn < 500; turn += 1) { if (await check()) return; await wait(); }
  return assert.fail(`never held: ${label}`);
}
const everything = (document) => [...document.elements.values()].flatMap((element) => [element.textContent, ...element.children.map((child) => child.textContent)]).join('\n');

const TAMPERS = [
  ['a null step', 'catalog:0', (b) => { b.steps[1] = null; }],
  ['a step status of __proto__', 'catalog:0', (b) => { b.steps[0].status = '__proto__'; }],
  ['a step status of constructor', 'catalog:0', (b) => { b.steps[0].status = 'constructor'; }],
  ['a null usage', 'catalog:0', (b) => { b.usage = null; }],
  ['a deceptive sentence as a detail path', 'example:last', (b) => { b.error.details[0].path = PROSE; }],
  ['a single deceptive word as a detail path', 'example:last', (b) => { b.error.details[0].path = 'Success'; }],
];

test('the page shows REJECTED, never UNKNOWN, and prints none of the tampered text for every tamper pattern (DOM stub)', { timeout: 180000 }, async () => {
  for (const [name, preset, change] of TAMPERS) {
    const service = await startService();
    try {
      const page = runPage({ fetch: forge(change)(service.port), document: createDocument() });
      const { document } = page;
      await until(() => /declared presets loaded|REJECTED/.test(document.element('catalog-status').textContent), 'catalog');
      document.element('preset').value = preset;
      await document.element('preset').dispatch('change');
      await document.element('run-form').dispatch('submit');
      assert.match(document.element('status').textContent, /^REJECTED — the response is not a valid C043 result/, `${name}: ${document.element('status').textContent}`);
      assert.equal(document.element('result').children.length, 0, `${name}: nothing is shown`);
      assert.equal(everything(document).includes(PROSE), false, `${name}: no tampered sentence reaches the page`);
      assert.equal(/UNKNOWN —/.test(document.element('status').textContent), false, name);
    } finally {
      await service.stop();
    }
  }
});
