'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { generate } = require('./mutants.cjs');
const { seedConfig } = require('./canaries.cjs');
const { call, exchange, build } = require('./harness.cjs');
const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'evidence', 'mutants', 'equivalents-final.json');
const hash = (source) => crypto.createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex');
const reasons = {
  'canon.cjs': {
    41: 'An added empty percent-run match is replaced by the empty string. Nonempty byte runs are identical; native global replacement advances after an empty match.',
    69: 'The named dictionary has no one-letter key. The added one-letter matches return their original text; the upper bound and all real dictionary matches are unchanged.',
    71: 'The named dictionary keys have length two through four. Both upper bounds exceed four: an unknown longer run cannot be cut immediately after a valid four-letter key.',
    72: 'Both named-reference upper bounds exceed the dictionary maximum of four. Additional longer matches are unknown and return their original text unchanged.',
    78: 'The outer numeric grammar permits x/X only as the first character, or decimal digits with no x/X. Removing the inner start anchor cannot change its decision.',
    83: 'Replacing a leading empty zero-run by empty text is an identity. A nonempty leading zero-run is consumed identically by the greedy plus and star forms.',
    88: 'With leading zeros removed, excess significant digits imply a value above U+10FFFF. The independent point comparison still returns the entire original reference.',
    90: 'Every seven-significant-hex-digit value is at least 0x1000000, above U+10FFFF. The unchanged value comparison refuses all newly parsed values.',
    91: 'Every eight-significant-decimal-digit value is at least 10000000, above U+10FFFF. The unchanged value comparison refuses all newly parsed values.',
    127: 'Leading zero-star replacement adds only an empty identity replacement when the first digit is nonzero. A leading zero-run is stripped identically.',
    132: 'The braced length guard is redundant with the unchanged U+10FFFF comparison after leading zeros are stripped; every excess significant value is above the maximum.',
    134: 'A seven-significant-hex-digit braced value is above U+10FFFF. Widening the preliminary digit guard changes work but not the final value decision.',
    141: 'An empty padding match at the end of base64 is replaced by empty text. Existing nonempty padding runs are trimmed identically.',
    144: 'Native Buffer base64 contains equals signs only in its trailing padding. Its first equals run therefore already ends at the end of the string.',
    163: 'The extra Uint32Array cell is zero-initialized and is never written by an occurrence start. Visiting it can append no interval or output; it adds one empty iteration.',
    173: 'Every nonempty occurrence ends at position at least one, replacing either initial endpoint zero or one with the same positive maximum. Empty needles are skipped.',
    175: 'The extra out-of-bounds typed-array iteration occurs after the final real interval was flushed. It may set local sentinel/NaN state, but no output statement can run afterwards.',
    206: 'With no covering secret, interval replacement returns the original text. Recomputing its views gives the same values as the shared views; only work changes.',
    208: 'With no covering secret, the exact views are the shared views. Folding them again returns the same strings as sharedFolded; only work changes.'
  },
  'redact.cjs': {
    189: 'A null int returns null without a redaction whether nullable is true or false: miss also returns null and counts neither null nor undefined. Other values take the same range decision.',
    190: 'A null id returns null with no redaction in either nullable branch. Invalid nonnull ids are missed and counted identically; valid ids take the same tested branch.',
    203: 'The bool walker never reads node.nullable. Both flags use the same boolean-or-miss expression and therefore the same body and redaction count.',
    206: 'The nullable audit integer flag only changes whether null passes through miss, which returns null without counting it. All nonnull values are judged identically.'
  },
  'vault.cjs': {
    93: 'Three distinct required connection keys and their six-character values require at least 44 characters. A lower regex minimum of 15 cannot admit a structurally valid new value.',
    94: 'The minimum valid connection string is 44 characters, independently of the printable-character regex. Raising the regex minimum from 16 to 17 excludes no valid configuration.',
    110: 'Only a one-character unknown key is additionally ignored. The parsed Server, User Id, Password and Database keys all have length at least six and cannot be affected.',
    111: 'Moving the first-equals cutoff from one to two affects only one-character keys. No returned connection field reads such a key, so parsed fields and validation are unchanged.'
  },
  'evidence.cjs': {
    18: 'Actual redactor epochs start at zero and grow. Both fresh negative sentinel epochs differ from every real epoch, so the first publication and subsequent cache refreshes are identical.',
    19: 'For a within-bound array, splice(0, length minus RING) has a nonpositive deletion count and changes nothing. Above the bound it performs the same deletion.',
    21: 'At equality with RING the deletion count is zero. Running or skipping that no-op yields identical records, sequence values and public bundles.',
    48: 'Fresh audit/run slots use a negative sentinel, while actual epochs are nonnegative. Both sentinels force the same first publication and later epoch updates.'
  },
  'server.cjs': {
    49: 'A four-digit no-leading-zero limit is at least 1000 and fails the unchanged <=200 value check. The expanded regex therefore admits no new limit.',
    59: 'For ordinary issued tokens, route already set the same immutable token role. A failure in the repeated authentication throws before this assignment, so removing it changes no observed role.',
    155: 'The once-listening path runs before connections and the connection path calls failClosed only while broken is null. The inner warning condition is therefore true on each reachable call.',
    163: 'After failure, repeating failClosed writes the same constant and its own guard suppresses duplicate warnings. Each subsequent socket is still destroyed without serving bytes.'
  }
};

function initialize() {
  const entries = [];
  for (const [file, indexes] of Object.entries(reasons)) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const generated = generate(source, file);
    for (const [index, reason] of Object.entries(indexes)) {
      const mutant = generated[Number(index)];
      assert.ok(mutant, `${file} #${index} exists`);
      entries.push({ file, index: Number(index), kind: mutant.kind, original: mutant.original.slice(0, 60), replacement: mutant.replacement.slice(0, 40),
        sourceLfSha256: hash(source), reason, witness: 'tests/final-equivalences.cjs:execute; current paired production functions and premise checks' });
    }
  }
  assert.equal(entries.length, 35);
  fs.writeFileSync(FILE, JSON.stringify(entries, null, 2) + '\n', { flag: 'wx' });
  return entries;
}

function load(file, mutant, io) {
  const filename = path.join(ROOT, file);
  let source = fs.readFileSync(filename, 'utf8');
  if (mutant) {
    assert.equal(source.slice(mutant.start, mutant.end), mutant.original, 'the current tuple really matches the executed source');
    source = source.slice(0, mutant.start) + mutant.replacement + source.slice(mutant.end);
  }
  if (file === 'server.cjs') source += '\nmodule.exports = { ...module.exports, proofParseLimit: parseLimit, proofMaxLimit: MAX_LIMIT };\n';
  if (file === 'canon.cjs') source += '\nmodule.exports = { ...module.exports, proofNamed: NAMED };\n';
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(ROOT);
  const original = instance.require.bind(instance);
  instance.require = (id) => id === '../C009/http-io.cjs' && io ? io : original(id);
  const wrapper = new vm.Script(Module.wrap(source), { filename: `<C014-equivalence:${file}:${hash(source).slice(0, 12)}>` }).runInThisContext();
  wrapper.call(instance.exports, instance.exports, instance.require, instance, filename, ROOT);
  return instance.exports;
}

function canonPair(base, changed) {
  assert.deepEqual(changed.proofNamed, base.proofNamed);
  assert.ok(Object.keys(base.proofNamed).every((key) => key.length >= 2 && key.length <= 4), 'actual named-dictionary bounds justify the wider regex bounds');
  for (const text of ['', 'plain', '%41%42%43', '%FF%61', '%0', '%zz', 'a+literal%2B+space', '&#123xAF;', '&ampz;', '&ampZ;', '&amp;&LT;&gt;&quot;&apos;&nbsp;']) {
    for (const name of ['fold', 'percentDecode', 'htmlDecode', 'unicodeUnescape', 'views']) assert.deepEqual(changed[name](text), base[name](text), name);
  }
  for (const point of [0, 1, 9, 10, 15, 16, 65, 122, 255, 0xffff, 0x10ffff, 0x110000, 0xffffff, 0x1000000, 9999999, 10000000]) {
    for (const pad of [1, 7, 8, 12]) {
      for (const text of [`&#${point.toString(10).padStart(pad, '0')};`, `&#x${point.toString(16).padStart(pad, '0')};`, `&#X${point.toString(16).toUpperCase().padStart(pad, '0')}`]) assert.equal(changed.htmlDecode(text), base.htmlDecode(text));
      for (const text of [`\\u{${point.toString(16).padStart(pad, '0')}}`, `\\u{${point.toString(16).toUpperCase().padStart(pad, '0')}}`]) assert.equal(changed.unicodeUnescape(text), base.unicodeUnescape(text));
    }
  }
  assert.equal(changed.htmlDecode(`&#x${'f'.repeat(10000)};`), base.htmlDecode(`&#x${'f'.repeat(10000)};`));
  const held = ['abcdef', 'abc def', 'abcdefgh', 'efghijkl', '???>>>???>>>???>>>', 'CNRY leak+0123456789=abcdef'];
  for (let length = 6; length < 90; length += 1) assert.deepEqual(changed.needlesFor('z'.repeat(length)), base.needlesFor('z'.repeat(length)));
  for (const secret of held) assert.deepEqual(changed.needlesFor(secret), base.needlesFor(secret));
  const registry = new Map(held.map((value) => [value, base.needlesFor(value)]));
  const texts = ['', 'ordinary text', 'abcdefghijkl', 'abcabcdefdef', 'abcabc defdef', ...held, ...held.map(encodeURIComponent), ...held.map((text) => text.toUpperCase())];
  for (const text of texts) {
    assert.equal(changed.replaceVerbatim(text, held, '[redacted]'), base.replaceVerbatim(text, held, '[redacted]'));
    assert.equal(changed.encodedIn(text, registry), base.encodedIn(text, registry));
  }
  assert.equal(changed.replaceVerbatim('abc', [], '[redacted]'), 'abc');
  assert.equal(changed.replaceVerbatim('abc', [''], '[redacted]'), 'abc');
  assert.ok(16 ** 6 > 0x10ffff && 10 ** 7 > 0x10ffff, 'the significant-digit redundancy premises hold');
}

function redactPair(base, changed) {
  const first = base.createRedactor();
  const second = changed.createRedactor();
  const trace = { seq: 0, kind: 'request', method: 'GET', route: 'asset', status: 200, role: null, code: null, steps: [] };
  const answer = { outcome: 'ok', command: 'config.check', revision: 0, actor: { subject: 'operator', role: 'operator' }, result: { id: null, checked: null }, auditSeq: 0, ignoredClaims: [] };
  const error = { outcome: 'ok', error: { code: 'ok', message: 'public note' }, role: null, command: null, requiredRoles: [], field: null, auditSeq: null, ignoredClaims: [] };
  const same = (kind, value) => {
    const a = first.publish(kind, value);
    const b = second.publish(kind, value);
    assert.deepEqual([b.value, b.redactions], [a.value, a.redactions]);
  };
  for (const value of [null, undefined, -1, 0, 1, 1.5, 'x', 'run-0001', true, false]) {
    same('trace', { ...trace, seq: value });
    same('answer', { ...answer, result: { id: value, checked: value } });
    same('error', { ...error, auditSeq: value });
  }
}

function vaultPair(base, changed) {
  const outcome = (api, config) => {
    try { const vault = api.createVault(config); return { status: vault.status(), secrets: vault.secrets() }; }
    catch (error) { return { name: error.name, code: error.code, field: error.field, message: error.message }; }
  };
  const prefix = 'Server=abcdef;User Id=abcdef;Password=';
  assert.equal((prefix + 'abcdef').length, 44, 'three distinct keys and three minimum values impose 44 characters');
  for (let length = 0; length < 70; length += 1) {
    const config = seedConfig();
    config.connectionString = (prefix + 'x'.repeat(length)).slice(0, length);
    assert.deepEqual(outcome(changed, config), outcome(base, config));
  }
  for (let code = 32; code <= 126; code += 1) {
    const text = `${prefix}abcdef;${String.fromCharCode(code)}=ignored;Database=abcdef`;
    assert.deepEqual(changed.parseConnection(text), base.parseConnection(text), 'one-character keys do not affect returned fields');
  }
}

function evidencePair(base, changed) {
  const { createRedactor } = require('../redact.cjs');
  const first = createRedactor();
  const second = createRedactor();
  const run = { id: 'run-0001', units: 1, owner: 'operator', revision: 1, status: 'ok', artifacts: [], steps: [] };
  const audit = { seq: 1, outcome: 'applied', code: 'ok', command: 'config.check', subject: 'operator', role: 'operator' };
  const ledger = { snapshot: () => ({ revision: 1, state: { runs: [run] } }), auditLog: () => [audit] };
  const sign = (text) => crypto.createHash('sha256').update(text).digest('hex');
  const a = base.createEvidence({ redactor: first, ledger, sign });
  const b = changed.createEvidence({ redactor: second, ledger, sign });
  assert.equal(base.RING, changed.RING);
  for (let index = 0; index < base.RING + 3; index += 1) {
    const trace = { kind: 'request', method: 'GET', route: 'asset', status: 200, role: null, code: 'ok', steps: [{ event: 'note', detail: 'public note' }] };
    const log = { level: 'info', event: 'request', route: 'asset', status: 200, role: null, code: 'ok' };
    for (const [kind, raw] of [['trace', trace], ['logs', log]]) {
      assert.equal(b.record(kind, raw), a.record(kind, raw));
      assert.equal(b.size(kind), a.size(kind));
    }
    if ([0, 1, base.RING - 1, base.RING, base.RING + 2].includes(index)) assert.deepEqual(b.bundleBody().value, a.bundleBody().value);
  }
  for (let epoch = 0; epoch < 4; epoch += 1) {
    assert.equal(first.epoch(), second.epoch());
    assert.ok(first.epoch() >= 0);
    for (const kind of ['trace', 'runs', 'audit', 'logs']) assert.deepEqual(b.listBody(kind, 200).value, a.listBody(kind, 200).value);
    assert.deepEqual(b.bundleBody().value, a.bundleBody().value);
    first.register(`fictional epoch value ${epoch}`);
    second.register(`fictional epoch value ${epoch}`);
  }
}

async function roleObservation(api) {
  const config = seedConfig();
  const app = await api.startLocal({ config, now: () => 1000 });
  try {
    const expired = app.service.issueToken('operator', { ttlMs: 0 });
    const observed = [];
    for (const token of [null, ...Object.values(config.tokens), 'malformed', `c009_${'A'.repeat(43)}`, expired]) {
      for (const route of ['/scope.json', '/v1/manage/config', '/v1/evidence/runs']) {
        const answer = await call(app.port, 'GET', route, { token });
        observed.push([answer.status, answer.json()]);
      }
    }
    await new Promise((resolve) => setImmediate(resolve));
    return { observed, roles: app.service.listBody('logs', 200).value.items.map((row) => [row.status, row.role, row.route, row.code]) };
  } finally { await app.close(); }
}

async function healthObservation(mutant) {
  const io = require('../../C009/http-io.cjs');
  let probes = 0;
  const api = load('server.cjs', mutant, { ...io, canStopReading: () => ++probes === 1 });
  const warnings = [];
  const original = process.emitWarning;
  process.emitWarning = (_text, options) => warnings.push(options.code);
  let app;
  try {
    app = await api.startLocal({ config: seedConfig() });
    const answers = [];
    for (let turn = 0; turn < 3; turn += 1) answers.push((await exchange(app.port, build('GET', '/scope.json', { port: app.port }), { settleMs: 10000 })).bytes.length);
    return { answers, warnings, health: app.health() };
  } finally {
    if (app) await app.close();
    process.emitWarning = original;
  }
}

async function serverPair(base, changed, entry, mutant) {
  if (entry.index === 49) {
    assert.equal(base.proofMaxLimit, 200);
    assert.equal(changed.proofMaxLimit, 200);
    for (let limit = 0; limit < 10000; limit += 1) {
      const url = new URL(`http://127.0.0.1/v1/evidence/trace?limit=${limit}`);
      assert.equal(changed.proofParseLimit(url), base.proofParseLimit(url));
    }
    for (const value of ['01', '0001', '200x', '200.0', '1e2', '-1', '', ' 1', '1\n']) {
      const url = new URL(`http://127.0.0.1/v1/evidence/trace?limit=${encodeURIComponent(value)}`);
      assert.equal(changed.proofParseLimit(url), base.proofParseLimit(url));
    }
  } else if (entry.index === 59) assert.deepEqual(await roleObservation(changed), await roleObservation(base));
  else assert.deepEqual(await healthObservation(mutant), await healthObservation(null));
}

async function execute() {
  const definitions = JSON.parse(fs.readFileSync(FILE));
  const results = [];
  for (const entry of definitions) {
    const source = fs.readFileSync(path.join(ROOT, entry.file), 'utf8');
    assert.equal(hash(source), entry.sourceLfSha256, `${entry.file}: equivalence source is current`);
    const mutant = generate(source, entry.file)[entry.index];
    assert.ok(mutant);
    assert.deepEqual([mutant.kind, mutant.original.slice(0, 60), mutant.replacement.slice(0, 40)], [entry.kind, entry.original, entry.replacement], 'the proof names this exact current tuple');
    const base = load(entry.file, null);
    const changed = load(entry.file, mutant);
    if (entry.file === 'canon.cjs') canonPair(base, changed);
    else if (entry.file === 'redact.cjs') redactPair(base, changed);
    else if (entry.file === 'vault.cjs') vaultPair(base, changed);
    else if (entry.file === 'evidence.cjs') evidencePair(base, changed);
    else await serverPair(base, changed, entry, mutant);
    results.push({ file: entry.file, index: entry.index, sourceLfSha256: entry.sourceLfSha256, pairedWitness: true, reason: entry.reason });
  }
  assert.equal(results.length, 35);
  return { schema: 'C014-current-equivalence-witnesses/1', total: results.length, passed: results.length, results };
}
if (require.main === module) {
  if (process.argv[2] === '--initialize') console.log(`Declared ${initialize().length} exact current paired witnesses.`);
  else execute().then((report) => console.log(JSON.stringify(report, null, 2))).catch((error) => { console.error(error); process.exitCode = 1; });
}
module.exports = { initialize, execute, load, canonPair };
