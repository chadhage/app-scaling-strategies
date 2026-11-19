'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { load, reseal, NOW, assert, test } = require('./support.cjs');
const { LIMITS } = require('../limits.cjs');

const SUBJECT = process.env.U051_SUBJECT === undefined
  ? path.join(__dirname, '..')
  : path.resolve(process.env.U051_SUBJECT);
const CLI = path.join(SUBJECT, 'validate-packet.cjs');
const accepted = () => JSON.stringify(load());

function cli(text, file = '-') {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  return spawnSync(process.execPath, [CLI, file, '--now', NOW, '--json'], {
    input: text, env, encoding: 'utf8', windowsHide: true, timeout: 30000
  });
}

function result(child, expected) {
  assert.equal(child.error, undefined);
  assert.equal(child.signal, null);
  assert.equal(child.status, expected, child.stdout + child.stderr);
  assert.equal(child.stderr, '');
  const answer = JSON.parse(child.stdout);
  assert.equal(answer.ok, expected === 0);
  return answer;
}

function refused(text, code, key) {
  const answer = result(cli(text), 1);
  const findings = answer.findings.filter((f) => f.code === code);
  assert.ok(findings.length > 0, `expected ${code}, got ${JSON.stringify(answer)}`);
  if (key !== undefined) {
    assert.ok(findings.some((f) => f.message.includes(JSON.stringify(key))), JSON.stringify(findings));
  }
  for (const finding of findings) assert.doesNotMatch(finding.message, /[\r\n\u2028\u2029]/);
  return findings;
}

function duplicate(text, key) {
  const token = `${JSON.stringify(key)}:`;
  assert.ok(text.includes(token), `the control must contain ${token}`);
  return text.replace(token, `${token}"discarded earlier value",${token}`);
}

test('U051 CLI accepts every documented field in the unchanged accepted packet', () => {
  assert.deepEqual(result(cli(accepted()), 0), { ok: true, findings: [] });
});

test('U051 CLI reads a real BOM file exactly like the same plain file', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'u051-bom-files-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const plain = path.join(dir, 'plain.json');
  const bom = path.join(dir, 'bom.json');
  fs.writeFileSync(plain, accepted());
  fs.writeFileSync(bom, `\uFEFF${accepted()}`);
  const plainResult = result(cli(undefined, plain), 0);
  assert.deepEqual(result(cli(undefined, bom), 0), plainResult);
});

test('U051 CLI strips the BOM before the exact JSON text size boundary', () => {
  const plain = accepted().padEnd(LIMITS.maxJsonBytes, ' ');
  assert.deepEqual(result(cli(`\uFEFF${plain}`), 0), result(cli(plain), 0));
});

for (const key of ['go', 'approved', 'free']) {
  test(`U051 CLI refuses unknown root ${key}`, () => {
    const packet = load();
    packet[key] = true;
    const findings = refused(JSON.stringify(reseal(packet)), 'UNKNOWN_KEY');
    assert.ok(findings.some((finding) => finding.path === key));
  });
}

test('U051 CLI safely reports control characters in unknown root keys', () => {
  const packet = load();
  packet['extra\n\u2028field'] = true;
  const findings = refused(JSON.stringify(reseal(packet)), 'UNKNOWN_KEY');
  assert.ok(findings.some((finding) => finding.path === 'extra\\n\\u2028field'));
  for (const finding of findings) assert.doesNotMatch(finding.path + finding.message, /[\r\n\u2028\u2029]/);
});

for (const [location, key] of [['root', 'title'], ['authority', 'source'], ['option', 'id']]) {
  test(`U051 CLI refuses a duplicate ${location} key without relying on a changed last value`, () => {
    const packet = load();
    const plain = JSON.stringify(packet);
    const scope = location === 'authority' ? JSON.stringify(packet.authority)
      : location === 'option' ? JSON.stringify(packet.options[0]) : plain;
    const repeated = plain.replace(scope, duplicate(scope, key));
    assert.deepEqual(JSON.parse(repeated), JSON.parse(plain));
    refused(repeated, 'DUPLICATE_JSON_KEY', key);
  });
}

test('U051 CLI refuses a duplicate in a nested note with an accepted last-value control', () => {
  const packet = load();
  packet.fixtureNote = { notes: [{ message: 'A neutral note.' }] };
  const plain = JSON.stringify(reseal(packet));
  result(cli(plain), 0);
  const repeated = duplicate(plain, 'message');
  assert.deepEqual(JSON.parse(repeated), JSON.parse(plain));
  refused(repeated, 'DUPLICATE_JSON_KEY', 'message');
});

test('U051 CLI compares decoded escaped keys', () => {
  const plain = accepted();
  const repeated = plain.replace('"title":', '"\\u0074itle":"discarded earlier value","title":');
  assert.deepEqual(JSON.parse(repeated), JSON.parse(plain));
  refused(repeated, 'DUPLICATE_JSON_KEY', 'title');
});

test('U051 CLI checks the original wrapper rather than only the unwrapped packet', () => {
  const wrapped = `{"packet":{},"packet":${accepted()}}`;
  assert.deepEqual(JSON.parse(wrapped).packet, load());
  refused(wrapped, 'DUPLICATE_JSON_KEY', 'packet');
});

test('U051 CLI applies bounds to values hidden by repeated keys', () => {
  const hidden = `{"lost":[${Array(LIMITS.maxNodes - 1).fill('null').join(',')}],"lost":[]}`;
  const answer = result(cli(hidden), 1);
  assert.equal(answer.findings[0].code, 'INPUT_TOO_LARGE');
});

test('U051 CLI strips only one leading BOM', () => {
  const child = cli(`\uFEFF\uFEFF${accepted()}`);
  assert.equal(child.status, 2);
  assert.match(child.stderr, /cannot read the input/);
});

test('U051 packet validation rejects a supplied non-string JSON source', () => {
  const { validatePacket } = require(path.join(SUBJECT, 'packet-validator.cjs'));
  const answer = validatePacket(load(), { nowUtc: NOW }, null);
  assert.equal(answer.ok, false);
  assert.deepEqual(answer.findings.map((finding) => finding.code), ['VALIDATOR_ERROR']);
});

const scan = (text) => require(path.join(SUBJECT, 'json-token-reader.cjs')).findDuplicateJsonKeys(text);
const typedBound = (text, code) => assert.ok(scan(text).some((f) => f.code === code));

test('U051 reader uses independent object scopes, including objects inside nested arrays', () => {
  assert.deepEqual(scan('{"a":[{"x":1},[{"x":2}]],"b":{"x":3},"text":"\\\"x\\\": [] {}"}'), []);
  const findings = scan('{"a":[{"x":1,"x":2}],"b":{"x":3}}');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, 'DUPLICATE_JSON_KEY');
  assert.equal(findings[0].path, 'a[0].x');
});

for (const key of ['quote"', 'backslash\\', 'slash/', '\b', '\f', '\n', '\r', '\t', '__proto__', '\uD835\uDC9C']) {
  test(`U051 reader decodes and safely names ${JSON.stringify(key)}`, () => {
    const first = JSON.stringify(key).replace(/\//g, '\\/');
    const findings = scan(`{${first}:0,${JSON.stringify(key)}:1}`);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].code, 'DUPLICATE_JSON_KEY');
    assert.ok(findings[0].message.includes(JSON.stringify(key)));
    assert.doesNotMatch(findings[0].path + findings[0].message, /[\r\n\u2028\u2029]/);
  });
}

test('U051 reader escapes Unicode line separators in duplicate key findings', () => {
  for (const [key, escaped] of [['\u2028', '\\u2028'], ['\u2029', '\\u2029']]) {
    const quoted = JSON.stringify(key);
    const [finding] = scan(`{${quoted}:0,${quoted}:1}`);
    assert.equal(finding.code, 'DUPLICATE_JSON_KEY');
    assert.ok(finding.message.includes(escaped));
    assert.doesNotMatch(finding.path + finding.message, /[\r\n\u2028\u2029]/);
  }
});

test('U051 reader preserves the larger markdown limit only for result wrappers', () => {
  const markdown = 'x'.repeat(LIMITS.maxStringLength + 1);
  assert.deepEqual(scan(JSON.stringify({ packet: {}, packetMarkdown: markdown })), []);
  assert.deepEqual(scan(JSON.stringify({ packetMarkdown: markdown, packet: {} })), []);
  typedBound(JSON.stringify({ packetMarkdown: markdown }), 'INPUT_TOO_LARGE');
  typedBound(JSON.stringify({ packetMarkdown: markdown, packet: null }), 'INPUT_TOO_LARGE');
});

test('U051 reader applies the shared nesting cap at the exact boundary', () => {
  assert.deepEqual(scan('['.repeat(LIMITS.maxDepth) + 'null' + ']'.repeat(LIMITS.maxDepth)), []);
  typedBound('['.repeat(LIMITS.maxDepth + 1) + 'null' + ']'.repeat(LIMITS.maxDepth + 1), 'INPUT_TOO_DEEP');
});

test('U051 reader counts original values, including values hidden by repeated keys', () => {
  const within = `[${Array(LIMITS.maxNodes - 1).fill('null').join(',')}]`;
  assert.deepEqual(scan(within), []);
  typedBound(`[${Array(LIMITS.maxNodes).fill('null').join(',')}]`, 'INPUT_TOO_LARGE');
  const repeated = `{${Array(LIMITS.maxNodes).fill('"x":null').join(',')}}`;
  typedBound(repeated, 'INPUT_TOO_LARGE');
});

test('U051 reader applies string, total-character, raw-text and combining-run caps', () => {
  assert.deepEqual(scan(JSON.stringify('x'.repeat(LIMITS.maxStringLength))), []);
  typedBound(JSON.stringify('x'.repeat(LIMITS.maxStringLength + 1)), 'INPUT_TOO_LARGE');
  typedBound(`"${'\\u0061'.repeat(LIMITS.maxStringLength + 1)}"`, 'INPUT_TOO_LARGE');
  typedBound(JSON.stringify({ ['x'.repeat(LIMITS.maxStringLength + 1)]: null }), 'INPUT_TOO_LARGE');
  const strings = Array(LIMITS.maxTotalChars / LIMITS.maxStringLength).fill('x'.repeat(LIMITS.maxStringLength));
  assert.deepEqual(scan(JSON.stringify(strings)), []);
  typedBound(JSON.stringify([...strings, 'x']), 'INPUT_TOO_LARGE');
  typedBound(' '.repeat(LIMITS.maxJsonBytes + 1), 'INPUT_TOO_LARGE');
  typedBound(JSON.stringify(`a${'\u0301'.repeat(LIMITS.maxMarkRun + 1)}`), 'INPUT_COMBINING_RUN');
});

test('U051 reader accepts all JSON scalar and container forms and one leading BOM', () => {
  for (const text of ['{}', '[]', 'null', 'true', 'false', '-1.25e+2', '"value"', '{"x":null,"y":[true,false,-2,{}]}']) {
    assert.deepEqual(scan(`\uFEFF \t\r\n${text} \n`), []);
  }
});

test('U051 reader rejects malformed token streams explicitly', () => {
  for (const text of ['', '{', '[', '}', ']', '{"x" 1}', '{"x":}', '{"x":1,}', '[1,]', '[1 2]', '{}{}',
    '{"x":1 "y":2}', '{x:1}', '"unfinished', '"bad\\uGGGG"', 'tru', '01']) {
    assert.throws(() => scan(text), SyntaxError, JSON.stringify(text));
  }
  assert.throws(() => scan(null), TypeError);
});
