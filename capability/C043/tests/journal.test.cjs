'use strict';

// The strict preset reader, the preset journal (grammar, hash chain, self-check and an EXHAUSTIVE single-byte-flip test
// that reports any discarded tail) and the pure result builder.
const test = require('node:test');
const presets = require('../preset.cjs');
const result = require('../result.cjs');
const { JournalError, SHAPES, openRunLog, selfCheck } = require('../runlog.cjs');
const { sha256 } = require('../../C042/journal.cjs');
const { assert, boot, clock, createMemoryIo, doc, flaky, step } = require('./support.cjs');

const KEY = 'preset-run-0001';
const bytes = (value) => Buffer.from(JSON.stringify(value));
const codeOf = (source) => { const out = presets.parsePreset(source); return out.ok ? 'OK' : out.code; };
const lying = () => { let reads = 0; return Object.defineProperty({ ...doc() }, 'preset', { enumerable: true, get() { reads += 1; return reads === 1 ? 'bounded-sequence' : 'x'; } }); };

test('the strict reader: every hostile source is a typed failure and the steps are the frozen output of the C042 validator', { timeout: 30000 }, () => {
  const good = doc();
  const text = JSON.stringify(good);
  const circular = {}; circular.self = circular;
  const cases = [
    ['an object', good, 'OK'], ['text', text, 'OK'], ['bytes', bytes(good), 'OK'], ['more than the body limit', Buffer.alloc(2049, 32), 'BODY_TOO_LARGE'],
    ['invalid UTF-8', Buffer.from([0x7b, 0xff, 0x7d]), 'INVALID_ENCODING'], ['a byte order mark', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes(good)]), 'INVALID_JSON'],
    ['empty text', '', 'REQUIRED_JSON'], ['not JSON', '{nope', 'INVALID_JSON'], ['undefined', undefined, 'INVALID_JSON'], ['a function', () => 1, 'INVALID_JSON'],
    ['a BigInt', 10n, 'INVALID_JSON'], ['a circular object', circular, 'INVALID_JSON'], ['null', 'null', 'INVALID_SHAPE'], ['an array root', '[]', 'INVALID_SHAPE'], ['a number root', '1', 'INVALID_SHAPE'],
    ['a duplicated key', text.replace('"preset":"bounded-sequence"', '"preset":"a","preset":"b"'), 'DUPLICATE_FIELD'],
    ['an escaped duplicate', text.replace('"preset":"bounded-sequence"', '"preset":"a","\\u0070reset":"b"'), 'DUPLICATE_FIELD'],
    ['__proto__', text.replace('{"schemaVersion":1', '{"__proto__":{"x":1},"schemaVersion":1'), 'FORBIDDEN_FIELD'], ['constructor', text.replace('{"schemaVersion":1', '{"constructor":1,"schemaVersion":1'), 'FORBIDDEN_FIELD'],
    ['an unsafe number', text.replace('"maxUnits":40', '"maxUnits":1e2'), 'UNSAFE_NUMBER'], ['a fractional number', text.replace('"units":5', '"units":5.5'), 'UNSAFE_NUMBER'],
    ['a long string', text.replace('bounded-sequence', 'x'.repeat(200)), 'STRING_TOO_LONG'], ['deep nesting', `{"a":${'{"a":'.repeat(8)}1${'}'.repeat(8)}}`, 'NESTING_TOO_DEEP'],
    ['a step in another version', JSON.stringify(doc({ steps: [step(1, { schemaVersion: 2 })] })), 'UNSUPPORTED_SCHEMA_VERSION'],
    ['another step name', JSON.stringify(doc({ steps: [step(1, { step: 'release-capacity' })] })), 'UNSUPPORTED_STEP'],
    ['a getter that lies the second time', lying(), 'OK'],
  ];
  for (const [name, source, code] of cases) assert.equal(codeOf(source), code, name);
  const parsed = presets.parsePreset(text);
  assert.equal(parsed.ok && Object.isFrozen(parsed.preset) && Object.isFrozen(parsed.preset.steps) && parsed.preset.steps.every((entry) => Object.isFrozen(entry)), true);
  assert.deepEqual(Object.keys(parsed.preset.steps[0]), ['schemaVersion', 'step', 'idempotencyKey', 'leaseId', 'units']);
  assert.equal(({}).polluted, undefined);
  assert.equal(Object.keys(Object.prototype).length, 0, 'the prototype is untouched');
  const fresh = lying();
  assert.equal(presets.parsePreset(fresh).preset.preset, 'bounded-sequence', 'the object is read once, then validated: no time-of-check gap');
  const bound = presets.parsePreset(JSON.stringify(doc({ bounds: { maxSteps: 2, maxDurationMs: 1000, maxUnits: 40 } })));
  assert.deepEqual([bound.ok, bound.code, bound.bound, typeof bound.sha256], [false, 'PRESET_BOUND_EXCEEDED', { name: 'maxSteps', limit: 2, observed: 3 }, 'string']);
  assert.deepEqual(presets.parsePreset(doc({ bounds: { maxSteps: 4, maxDurationMs: 1000, maxUnits: 14 } })).bound, { name: 'maxUnits', limit: 14, observed: 15 });
  assert.equal(presets.boundProblem(parsed.preset), null);
});

test('the digest binds every field and the declared presets pass the same reader', { timeout: 30000 }, () => {
  const base = presets.parsePreset(doc()).sha256;
  assert.equal(base, presets.parsePreset(JSON.stringify(doc())).sha256);
  for (const changed of [doc({ preset: 'other-name' }), doc({ idempotencyKey: 'preset-run-0009' }), doc({ bounds: { maxSteps: 5, maxDurationMs: 1000, maxUnits: 40 } }),
    doc({ steps: [step(1), step(2), step(3, { units: 6 })] }), doc({ steps: [step(2), step(1), step(3)] })]) assert.notEqual(presets.parsePreset(changed).sha256, base);
  const outcomes = presets.CATALOG.map((entry) => presets.parsePreset(entry));
  assert.deepEqual(outcomes.map((entry) => (entry.ok ? 'ok' : entry.code)), ['ok', 'ok', 'PRESET_BOUND_EXCEEDED', 'ok']);
});

const REJECTED_APPENDS = [
  ['a second begin for one key', (log, p) => { log.append({ type: 'begin', key: KEY, presetSha256: p.sha256, preset: p.preset }); }],
  ['a begin that does not match its preset', (log, p) => { log.append({ type: 'begin', key: 'preset-run-0002', presetSha256: p.sha256, preset: p.preset }); }],
  ['a begin with a wrong digest', (log, p) => { log.append({ type: 'begin', key: 'preset-run-0002', presetSha256: '0'.repeat(64), preset: { ...p.preset, idempotencyKey: 'preset-run-0002' } }); }],
  ['a record for a run that never began', (log) => { log.append({ type: 'start', key: 'preset-run-0003', index: 1 }); }],
  ['a start out of order', (log) => { log.append({ type: 'start', key: KEY, index: 2 }); }],
  ['a step acknowledgement without a start', (log) => { log.append({ type: 'step', key: KEY, index: 1, status: 'succeeded', code: null, applied: true, byThis: true, reservedAfter: 5 }); }],
  ['a terminal record while a start is unacknowledged', (log) => { log.append({ type: 'start', key: KEY, index: 1 }); log.append({ type: 'cancel', key: KEY, elapsedMs: 0 }); }],
  ['an acknowledgement with invalid facts', (log) => { log.append({ type: 'start', key: KEY, index: 1 }); log.append({ type: 'step', key: KEY, index: 1, status: 'succeeded', code: null, applied: false, byThis: true, reservedAfter: 5 }); }],
  ['an end that completes unfinished work', (log) => { log.append({ type: 'end', key: KEY, state: 'completed', elapsedMs: 0, bound: null }); }],
  ['an end that is stopped without a failed step', (log) => { log.append({ type: 'end', key: KEY, state: 'stopped', elapsedMs: 0, bound: null }); }],
  ['an end that is bounded without exceeding it', (log) => { log.append({ type: 'end', key: KEY, state: 'bounded', elapsedMs: 5, bound: { name: 'maxDurationMs', limit: 1000, observed: 5 } }); }],
  ['an end with an unknown state', (log) => { log.append({ type: 'end', key: KEY, state: 'vanished', elapsedMs: 0, bound: null }); }],
  ['a cancel with a negative time', (log) => { log.append({ type: 'cancel', key: KEY, elapsedMs: -1 }); }],
];

test('the journal grammar refuses every out-of-order or contradictory record before anything is written', { timeout: 30000 }, () => {
  const parsed = presets.parsePreset(doc());
  for (const [name, attempt] of REJECTED_APPENDS) {
    const io = createMemoryIo();
    const log = openRunLog(io);
    log.append({ type: 'begin', key: KEY, presetSha256: parsed.sha256, preset: parsed.preset });
    const before = io.read();
    assert.throws(() => attempt(log, parsed), (error) => error instanceof JournalError && error.code === 'JOURNAL_CORRUPT', name);
    assert.equal(io.read().startsWith(before), true, name);
  }
  const io = createMemoryIo();
  const log = openRunLog(io);
  log.append({ type: 'begin', key: KEY, presetSha256: parsed.sha256, preset: parsed.preset });
  log.append({ type: 'cancel', key: KEY, elapsedMs: 3 });
  assert.throws(() => log.append({ type: 'resume', key: KEY }), { code: 'JOURNAL_CORRUPT' }, 'nothing follows a terminal record');
  assert.equal(Object.keys(SHAPES).length, 6);
});

function fullJournal() {
  const io = createMemoryIo();
  return boot({ runIo: io, executor: undefined }).then(async (booted) => {
    await booted.runner.run(doc());
    await booted.runner.run(doc({ idempotencyKey: 'preset-run-0002', steps: [step(7, { idempotencyKey: 'other-step-0007' }), step(8, { idempotencyKey: 'other-step-0008', leaseId: 'synthetic-lease-002', units: 6 }), step(9, { idempotencyKey: 'other-step-0009', leaseId: 'synthetic-lease-002', units: 6 })] }));
    const clk = booted.clk;
    clk.advance(0);
    return io;
  });
}

test('EXHAUSTIVE single-byte flips of a persisted preset journal: every flip is detected or its discarded tail is reported', { timeout: 120000 }, async () => {
  const io = await fullJournal();
  const original = Buffer.from(io.read());
  const intact = openRunLog(io).records;
  assert.equal(original.length > 1500 && intact.length >= 10, true, `the sample journal holds ${intact.length} records, ${original.length} bytes`);
  const counts = { detected: 0, reportedTail: 0, silent: 0 };
  const lastNewline = original.length - 1;
  const silent = [];
  for (let position = 0; position < original.length; position += 1) {
    for (const value of [original[position] ^ 0x01, original[position] ^ 0x20, original[position] ^ 0xff, 0x00]) {
      if (value === original[position]) continue;
      const flipped = Buffer.from(original);
      flipped[position] = value;
      const copy = createMemoryIo();
      copy.append(flipped.toString('latin1'));
      try {
        const log = openRunLog(copy);
        if (log.discardedTailBytes > 0 && log.records.length < intact.length) counts.reportedTail += 1;
        else { counts.silent += 1; silent.push(`${position}:${value}`); }
      } catch (error) {
        assert.equal(error instanceof JournalError && ['JOURNAL_CORRUPT', 'JOURNAL_UNAVAILABLE'].includes(error.code), true, `${position}: ${error.message}`);
        counts.detected += 1;
      }
    }
  }
  assert.deepEqual(silent, [], 'no flip may be accepted silently');
  assert.equal(counts.detected > 5000, true, JSON.stringify(counts));
  assert.equal(counts.reportedTail >= 1 && counts.reportedTail <= 4, true, `only flips of the final newline may be accepted, and then they are reported: ${JSON.stringify(counts)} (final newline at ${lastNewline})`);
});

test('what the journal cannot detect is stated and true: boundary truncation and a re-chained forgery need an external anchor', { timeout: 30000 }, async () => {
  const io = await fullJournal();
  const lines = io.read().split('\n').filter(Boolean);
  const shorter = createMemoryIo();
  shorter.append(`${lines.slice(0, 5).join('\n')}\n`);
  assert.equal(openRunLog(shorter).records.length, 5, 'a journal cut at a line boundary replays as a shorter, valid journal');
  const swapped = createMemoryIo();
  swapped.append(`${[lines[1], lines[0], ...lines.slice(2)].join('\n')}\n`);
  assert.throws(() => openRunLog(swapped), { code: 'JOURNAL_CORRUPT' }, 'reordering is detected');
  const oversize = createMemoryIo();
  oversize.append('x'.repeat(1024 * 1024 + 1));
  assert.throws(() => openRunLog(oversize), { code: 'JOURNAL_CORRUPT' });
  assert.throws(() => openRunLog({ read() { throw new Error('disk'); }, append() {}, truncate() {} }), { code: 'JOURNAL_UNAVAILABLE' });
  const parsed = presets.parsePreset(doc());
  const bad = [
    ['not JSON', 'nope\n'], ['not an object', '[]\n'], ['a wrong shape', `${JSON.stringify({ type: 'begin' })}\n`],
    ['a wrong self-check', `${JSON.stringify({ seq: 1, prev: '0'.repeat(64), type: 'cancel', key: KEY, elapsedMs: 0, h: 'f'.repeat(32) })}\n`],
  ];
  for (const [name, content] of bad) { const copy = createMemoryIo(); copy.append(content); assert.throws(() => openRunLog(copy), { code: 'JOURNAL_CORRUPT' }, name); }
  const mismatch = { seq: 2, prev: sha256(`${JSON.stringify({})}`), type: 'cancel', key: KEY, elapsedMs: 0 };
  const copy = createMemoryIo();
  copy.append(`${JSON.stringify({ ...mismatch, h: selfCheck(mismatch) })}\n`);
  assert.throws(() => openRunLog(copy), { code: 'JOURNAL_CORRUPT' }, 'a sequence gap');
  const first = { seq: 1, prev: '0'.repeat(64), type: 'begin', key: 'bad key', presetSha256: parsed.sha256, preset: parsed.preset };
  const keyed = createMemoryIo();
  keyed.append(`${JSON.stringify({ ...first, h: selfCheck(first) })}\n`);
  assert.throws(() => openRunLog(keyed), { code: 'JOURNAL_CORRUPT' }, 'an invalid key');
  const chained = { seq: 1, prev: 'e'.repeat(64), type: 'begin', key: KEY, presetSha256: parsed.sha256, preset: parsed.preset };
  const broken = createMemoryIo();
  broken.append(`${JSON.stringify({ ...chained, h: selfCheck(chained) })}\n`);
  assert.throws(() => openRunLog(broken), { code: 'JOURNAL_CORRUPT' }, 'a broken chain');
});

test('a write that cannot be confirmed breaks the journal until it is reopened', { timeout: 30000 }, () => {
  const parsed = presets.parsePreset(doc());
  const inner = createMemoryIo();
  const log = openRunLog(flaky(inner, (text) => (text.includes('"type":"cancel"') ? 'landed' : false)));
  log.append({ type: 'begin', key: KEY, presetSha256: parsed.sha256, preset: parsed.preset });
  assert.throws(() => log.append({ type: 'cancel', key: KEY, elapsedMs: 0 }), { code: 'JOURNAL_UNCERTAIN' });
  assert.equal(log.broken, true);
  assert.throws(() => log.append({ type: 'resume', key: KEY }), { code: 'JOURNAL_UNCERTAIN' });
  assert.equal(openRunLog(inner).runs.get(KEY).terminal.state, 'cancelled', 'reopening finds the write that did land');
});

test('the result builder refuses to report success for anything but a completed run and words refusals from the catalog', { timeout: 30000 }, async () => {
  const booted = await boot({ clk: clock() });
  await booted.runner.run(doc());
  assert.throws(() => result.build({ action: 'run' }), /completed run/);
  const refused = result.refusal('RUN_JOURNAL_UNCERTAIN', { action: 'run', key: KEY });
  assert.deepEqual([refused.status, refused.body.outcome, refused.body.run.state, refused.body.steps], [503, 'unknown', 'none', []]);
  const none = result.refusal('INVALID_JSON', { details: [{ path: '$', code: 'INVALID_JSON', message: 'x' }] });
  assert.equal(none.body.error.details.length, 1);
  assert.equal(result.codeOf({ state: 'interrupted', steps: [{ status: 'unknown' }] }), 'PRESET_UNCONFIRMED');
  assert.equal(result.codeOf({ state: 'interrupted', steps: [{ status: 'interrupted' }] }), 'PRESET_INTERRUPTED');
  assert.equal(result.codeOf({ state: 'completed', steps: [] }), null);
});
