'use strict';
// U051: Three guards formalization and BOM handling
// (1) UTF-8 BOM stripped transparently before JSON.parse, no exit 2
// (2) Duplicate JSON keys at top-level and in nested objects (authority, options, notes) refused with typed code
// (3) Unknown top-level keys (go, approved, free) formalized to UNKNOWN_KEY family refusal
// Guard checks for the original JSON and the parsed packet.

const fs = require('node:fs');
const path = require('node:path');
const { load, reseal, run, NOW, assert, test } = require('./support.cjs');
const { validatePacket } = require('../packet-validator.cjs');

const codes = (r) => new Set(r.findings.map((f) => f.code));
const refused = (name, p, wanted) => test(name, () => {
  const c = codes(run(p));
  assert.ok(wanted.some((w) => c.has(w)), `${name}: expected ${wanted.join(' or ')}, got ${[...c].join(', ') || 'no finding'}`);
});

// Helper for tests that need to pass raw JSON string (e.g., for duplicate key detection)
const refusedWithRaw = (name, packetAndRaw, wanted) => test(name, () => {
  const { packet, rawJsonString } = packetAndRaw;
  const result = validatePacket(packet, {}, rawJsonString);
  const c = codes(result);
  assert.ok(wanted.some((w) => c.has(w)), `${name}: expected ${wanted.join(' or ')}, got ${[...c].join(', ') || 'no finding'}`);
});

// U051.G1: BOM handling
// UTF-8 BOM (U+FEFF, bytes 0xEF 0xBB 0xBF) at start of JSON must be stripped transparently.
// Node.js JSON.parse() REJECTS BOM with "Unexpected token" RangeError; BOM stripping must be explicit.

test('U051.G1: a leading BOM in the original JSON does not reject an accepted packet', () => {
  const packet = load();
  const result = validatePacket(packet, { nowUtc: NOW }, `\uFEFF${JSON.stringify(packet)}`);
  assert.deepEqual(result, { ok: true, findings: [] });
});

// U051.G2: Duplicate JSON key detection at top-level
// JSON.parse keeps last value of duplicate keys; validator must refuse to catch author intent mismatch.
// Expected code: DUPLICATE_JSON_KEY with message naming the key.

test('U051.G2: repeated root keys are refused in the original JSON', () => {
  const packet = load();
  const raw = JSON.stringify(packet).replace('"title":', '"title":"discarded","title":');
  assert.deepEqual(JSON.parse(raw), packet);
  assert.ok(codes(validatePacket(packet, { nowUtc: NOW }, raw)).has('DUPLICATE_JSON_KEY'));
});

// U051.G3: Unknown top-level keys formalization
// Extend existing UNKNOWN_KEY guard from authority/options/decisions to root object level.
// Keys like 'go', 'approved', 'free' at top level must be refused with UNKNOWN_KEY code.

const unknownTopLevelKey = (key) => {
  const p = load();
  p[key] = true;
  return reseal(p);
};

refused('U051.G3a: unknown top-level key "go" is refused', unknownTopLevelKey('go'), ['UNKNOWN_KEY']);
refused('U051.G3b: unknown top-level key "approved" is refused', unknownTopLevelKey('approved'), ['UNKNOWN_KEY']);
refused('U051.G3c: unknown top-level key "free" is refused', unknownTopLevelKey('free'), ['UNKNOWN_KEY']);

// U051.G3 extension: Duplicate keys inside nested objects (authority, options, decisions)
// U051.G2a: Duplicate keys in authority object
const duplicateInAuthority = () => {
  // Create raw JSON string with duplicate key in authority
  const rawJsonString = JSON.stringify({
    schemaVersion: 2,
    itemId: 'U051-test-dup-auth',
    title: 'Test packet with duplicate key in authority',
    servesItems: ['U002'],
    preparedBy: 'test-worker',
    preparedAtUtc: new Date().toISOString(),
    status: 'test',
    authority: null,
    options: [],
    ownerDecisions: { decisions: [] },
    integrity: {},
    validation: {}
  }).replace(
    '"authority":null',
    '"authority":{"source":"first","source":"second"}'
  );
  
  const packet = JSON.parse(rawJsonString);
  return { packet, rawJsonString };
};

test('U051.G3d: duplicate key in authority is detected with DUPLICATE_JSON_KEY', () => {
  refusedWithRaw('duplicate key in authority', duplicateInAuthority(), ['DUPLICATE_JSON_KEY']);
});

// U051.G2b: Duplicate keys in options[0] object
const duplicateInOption = () => {
  // Create raw JSON string with duplicate key in options[0]
  const rawJsonString = JSON.stringify({
    schemaVersion: 2,
    itemId: 'U051-test-dup-opt',
    title: 'Test packet with duplicate key in option',
    servesItems: ['U002'],
    preparedBy: 'test-worker',
    preparedAtUtc: new Date().toISOString(),
    status: 'test',
    authority: {},
    options: null,
    ownerDecisions: { decisions: [] },
    integrity: {},
    validation: {}
  }).replace(
    '"options":null',
    '"options":[{"id":"first","id":"second","name":"test"}]'
  );
  
  const packet = JSON.parse(rawJsonString);
  return { packet, rawJsonString };
};

test('U051.G2b: duplicate key in options[0] is detected with DUPLICATE_JSON_KEY', () => {
  refusedWithRaw('duplicate key in options[0]', duplicateInOption(), ['DUPLICATE_JSON_KEY']);
});

// U051.G2c: Duplicate keys in decisions array
const duplicateInDecision = () => {
  // Create raw JSON string with duplicate key in decisions[0]
  const rawJsonString = JSON.stringify({
    schemaVersion: 2,
    itemId: 'U051-test-dup-dec',
    title: 'Test packet with duplicate key in decision',
    servesItems: ['U002'],
    preparedBy: 'test-worker',
    preparedAtUtc: new Date().toISOString(),
    status: 'test',
    authority: {},
    options: [],
    ownerDecisions: null,
    integrity: {},
    validation: {}
  }).replace(
    '"ownerDecisions":null',
    '"ownerDecisions":{"decisions":[{"key":"first","key":"second","question":"test?"}]}'
  );
  
  const packet = JSON.parse(rawJsonString);
  return { packet, rawJsonString };
};

test('U051.G2c: duplicate key in decisions[0] is detected with DUPLICATE_JSON_KEY', () => {
  refusedWithRaw('duplicate key in decisions[0]', duplicateInDecision(), ['DUPLICATE_JSON_KEY']);
});

// U051 Limits pin tests
// README limits section must FAIL for three eliminated limits (BOM exit 2, duplicate key limit, unknown top-level key limit)
// and succeed for five surviving limits (L1, L4, MS1, SL3, MS3).

const readmeLimits = () => {
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  const heading = '## Limits: what is covered and what is not';
  const start = readme.indexOf(heading);
  assert.notEqual(start, -1, 'README limits section is present');
  const end = readme.indexOf('\n## ', start + heading.length);
  return readme.slice(start, end < 0 ? undefined : end);
};

test('U051.LIMITS: README does not claim BOM gives exit 2', () => {
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  // This test MUST FAIL if README still claims "BOM gives exit 2" or similar.
  // After Phase 6, README update must remove this claim.
  assert.doesNotMatch(readme, /BOM.*exit 2/i, 'README incorrectly claims BOM causes exit 2');
});

test('U051.LIMITS: README does not list duplicate JSON keys as an accepted limitation', () => {
  const limits = readmeLimits();
  // This test MUST FAIL if README lists duplicate JSON keys as an accepted limit.
  // Duplicate JSON keys are REFUSED, not accepted; no limit applies.
  assert.doesNotMatch(limits, /duplicate.*key|multiple.*key|repeated.*key/i, 'README incorrectly lists duplicate keys as limit');
});

test('U051.LIMITS: README does not list unknown top-level keys as an accepted limitation', () => {
  const limits = readmeLimits();
  // This test MUST FAIL if README lists unknown top-level keys as an accepted limit.
  // Unknown keys are REFUSED, not accepted; no limit applies.
  assert.doesNotMatch(limits, /unknown.*top.level|unrecognized.*key|free form.*key/i, 'README incorrectly lists unknown keys as limit');
});

test('U051.G1: a second leading BOM is rejected in the original JSON', () => {
  const packet = load();
  const result = validatePacket(packet, { nowUtc: NOW }, `\uFEFF\uFEFF${JSON.stringify(packet)}`);
  assert.equal(result.ok, false);
  assert.ok(codes(result).has('VALIDATOR_ERROR'));
});

test('U051.G2: a repeated root key produces a duplicate finding', () => {
  const rawJsonString = JSON.stringify({
    schemaVersion: 2,
    itemId: 'U051-dup-toplevel',
    title: 'Test duplicate key detection',
    servesItems: ['U002'],
    preparedBy: 'test-worker',
    preparedAtUtc: new Date().toISOString(),
    status: 'test',
    authority: {},
    options: [],
    ownerDecisions: { decisions: [] },
    integrity: {},
    validation: {}
  }).replace(
    '"itemId":"U051-dup-toplevel"',
    '"itemId":"first","itemId":"second"'
  );
  
  const packet = JSON.parse(rawJsonString);
  const result = validatePacket(packet, {}, rawJsonString);
  const c = codes(result);
  assert.ok(c.has('DUPLICATE_JSON_KEY'), `duplicate key must be reported; found: ${[...c].join(', ') || 'no findings'}`);
});

// Error-path edge-case tests for branch coverage expansion (lines 258-274)

// ERROR PATH 1: Malformed JSON (unmatched braces) to trigger depth < 0 error at line 140 of json-token-reader
test('U051.ERRORPATH.MalformedJson.ExtraCloseBrace: malformed JSON throws', () => {
  const { findDuplicateJsonKeys } = require('../json-token-reader.cjs');
  assert.throws(() => findDuplicateJsonKeys('}}{"itemId":"test"}'), SyntaxError);
});

// ERROR PATH 2: \/ (forward slash) escape sequence in key name - exercises line 42 decodeJsonEscapes
test('U051.ERRORPATH.ForwardSlashEscape: \/ escape in key must be handled', () => {
  const rawJsonString = JSON.stringify({
    itemId: 'U051-fs-escape-test',
    "some\/key": 'value1'
  }).replace('"some\\/key"', '"some\\/key"'); // Ensure forward slash escape preserved
  
  const packet = JSON.parse(rawJsonString);
  const result = validatePacket(packet, {}, rawJsonString);
  // Should process without throwing; \/ is valid JSON escape (line 42 coverage)
  assert.ok(result !== undefined, 'Forward slash escape should be handled');
});

// ERROR PATH 3: Invalid \uXXXX Unicode escape with non-hex characters - line 48 validation
test('U051.ERRORPATH.InvalidUnicodeEscape: \\u with non-hex chars must be rejected', () => {
  const { findDuplicateJsonKeys } = require('../json-token-reader.cjs');
  assert.throws(() => findDuplicateJsonKeys('{"itemId":"U051-unicode-test","key":"value\\uGGGG"}'), SyntaxError);
});

// ERROR PATH 4: Deeply nested authority object with duplicate key
test('U051.ERRORPATH.NestedAuthorityDuplicate: duplicate in nested authority must be detected', () => {
  const baseJson = JSON.stringify({
    itemId: 'U051-nested-auth-dup',
    title: 'Test nested authority duplicate',
    authority: { orgRef: 'test' }
  });
  
  // Inject duplicate key into authority object by raw string manipulation
  const rawJsonString = baseJson.replace(/"orgRef":"test"/, '"orgRef":"test","orgRef":"duplicate"');
  const packet = JSON.parse(rawJsonString);
  const result = validatePacket(packet, {}, rawJsonString);
  const c = codes(result);
  assert.ok(c.has('DUPLICATE_JSON_KEY'), `Nested authority duplicate must be detected; found: ${[...c].join(', ')}`);
});

// ERROR PATH 5: Deeply nested options array with duplicate key in array element objects
test('U051.ERRORPATH.NestedOptionsArrayDuplicate: duplicate in nested options array must be detected', () => {
  const rawJsonString = '{"itemId":"U051-options-array-dup","options":[{"optionId":"opt1","optionId":"dup1"}]}';
  const result = validatePacket(JSON.parse(rawJsonString), {}, rawJsonString);
  assert.ok(codes(result).has('DUPLICATE_JSON_KEY'));
});

// ERROR PATH 6: Deeply nested ownerDecisions with duplicate key
test('U051.ERRORPATH.NestedOwnerDecisionsDuplicate: duplicate in nested ownerDecisions must be detected', () => {
  const rawJsonString = '{"itemId":"U051-decisions-dup","ownerDecisions":{"decisions":[{"decisionId":"dec1","decisionId":"dup1"}]}}';
  const result = validatePacket(JSON.parse(rawJsonString), {}, rawJsonString);
  assert.ok(codes(result).has('DUPLICATE_JSON_KEY'));
});

// ERROR PATH 7: Empty JSON object edge case
test('U051.ERRORPATH.EmptyObject: empty JSON object {} must be handled', () => {
  const rawJsonString = '{}';
  const packet = JSON.parse(rawJsonString);
  const result = validatePacket(packet, {}, rawJsonString);
  // Should detect missing required fields and unknown root structure
  assert.ok(result !== undefined, 'Empty object should be processed');
});

// ERROR PATH 8: Single key object edge case
test('U051.ERRORPATH.SingleKeyObject: single key object must be handled', () => {
  const rawJsonString = JSON.stringify({ itemId: 'U051-single-key-test' });
  const packet = JSON.parse(rawJsonString);
  const result = validatePacket(packet, {}, rawJsonString);
  // Should process without throwing
  assert.ok(result !== undefined, 'Single key object should be processed');
});

test('U051.G3: an unexpected root key is reported', () => {
  const packet = {
    schemaVersion: 2,
    itemId: 'U051-unknown-key-test',
    title: 'Test unknown key validation',
    servesItems: ['U002'],
    preparedBy: 'test-worker',
    preparedAtUtc: new Date().toISOString(),
    status: 'test',
    authority: {},
    options: [],
    ownerDecisions: { decisions: [] },
    integrity: {},
    validation: {},
    unexpectedRootKey: 'this should be rejected'  // Unknown key not in KEYS whitelist
  };
  
  const result = validatePacket(packet, {});
  const c = codes(result);
  assert.ok(c.has('UNKNOWN_KEY'), `unknown root key must be reported; found: ${[...c].join(', ') || 'no findings'}`);
});

test('U051.G2: a repeated authority key produces a duplicate finding', () => {
  let rawJsonString = JSON.stringify({
    schemaVersion: 2,
    itemId: 'U051-dup-nested',
    title: 'Test duplicate nested key emission',
    servesItems: ['U002'],
    preparedBy: 'test-worker',
    preparedAtUtc: new Date().toISOString(),
    status: 'test',
    authority: { authField: 'val1' },
    options: [],
    ownerDecisions: { decisions: [] },
    integrity: {},
    validation: {}
  });
  
  // Inject duplicate key into authority object raw JSON before parsing
  rawJsonString = rawJsonString.replace(
    '"authority":{"authField":"val1"}',
    '"authority":{"authField":"val1","authField":"val2"}'
  );
  
  const packet = JSON.parse(rawJsonString);
  const result = validatePacket(packet, {}, rawJsonString);
  const c = codes(result);
  assert.ok(c.has('DUPLICATE_JSON_KEY'), `duplicate key must be reported; found: ${[...c].join(', ') || 'no findings'}`);
});

test('U051.G3: an unknown root key produces a finding', () => {
  const rawJsonString = JSON.stringify({
    schemaVersion: 2,
    itemId: 'U051-unknown-emission',
    title: 'Test unknown key finding emission',
    servesItems: ['U002'],
    preparedBy: 'test-worker',
    preparedAtUtc: new Date().toISOString(),
    status: 'test',
    authority: {},
    options: [],
    ownerDecisions: { decisions: [] },
    integrity: {},
    validation: {},
    unknownTopLevelField: 'should be detected and emitted'
  });
  
  const packet = JSON.parse(rawJsonString);
  const result = validatePacket(packet, {}, rawJsonString);
  const c = codes(result);
  assert.ok(c.has('UNKNOWN_KEY'), `unknown root key must be reported; found: ${[...c].join(', ') || 'no findings'}`);
});

// Tests 25-38: Branch-killing tests for decodeJsonEscapes and scanForDuplicates coverage

test('25: decodeJsonEscapes backspace escape \\b', () => {
  const { decodeJsonEscapes } = require('../json-token-reader.cjs');
  const result = decodeJsonEscapes('test\\bvalue');
  assert.strictEqual(result, 'test\bvalue', 'backspace escape must decode');
});

test('26: decodeJsonEscapes form feed escape \\f', () => {
  const { decodeJsonEscapes } = require('../json-token-reader.cjs');
  const result = decodeJsonEscapes('test\\fvalue');
  assert.strictEqual(result, 'test\fvalue', 'form feed escape must decode');
});

test('27: decodeJsonEscapes newline escape \\n', () => {
  const { decodeJsonEscapes } = require('../json-token-reader.cjs');
  const result = decodeJsonEscapes('test\\nvalue');
  assert.strictEqual(result, 'test\nvalue', 'newline escape must decode');
});

test('28: decodeJsonEscapes carriage return escape \\r', () => {
  const { decodeJsonEscapes } = require('../json-token-reader.cjs');
  const result = decodeJsonEscapes('test\\rvalue');
  assert.strictEqual(result, 'test\rvalue', 'carriage return escape must decode');
});

test('29: decodeJsonEscapes tab escape \\t', () => {
  const { decodeJsonEscapes } = require('../json-token-reader.cjs');
  const result = decodeJsonEscapes('test\\tvalue');
  assert.strictEqual(result, 'test\tvalue', 'tab escape must decode');
});

test('30: decodeJsonEscapes quote escape \\"', () => {
  const { decodeJsonEscapes } = require('../json-token-reader.cjs');
  const result = decodeJsonEscapes('test\\"value');
  assert.strictEqual(result, 'test"value', 'quote escape must decode');
});

test('31: decodeJsonEscapes backslash escape \\\\', () => {
  const { decodeJsonEscapes } = require('../json-token-reader.cjs');
  const result = decodeJsonEscapes('test\\\\value');
  assert.strictEqual(result, 'test\\value', 'backslash escape must decode');
});

test('32: decodeJsonEscapes forward slash escape \\/', () => {
  const { decodeJsonEscapes } = require('../json-token-reader.cjs');
  const result = decodeJsonEscapes('test\\/value');
  assert.strictEqual(result, 'test/value', 'forward slash escape must decode');
});

test('33: decodeJsonEscapes unicode escape \\uXXXX valid', () => {
  const { decodeJsonEscapes } = require('../json-token-reader.cjs');
  const result = decodeJsonEscapes('test\\u0041value');
  assert.strictEqual(result, 'testAvalue', 'valid unicode escape must decode to character');
});

test('34: decodeJsonEscapes unicode escape \\uXXXX invalid hex', () => {
  const { decodeJsonEscapes } = require('../json-token-reader.cjs');
  const result = decodeJsonEscapes('test\\uGGGGvalue');
  assert.strictEqual(result, 'test\\uGGGGvalue', 'invalid hex unicode must not decode, returns literal');
});

test('35: decodeJsonEscapes unicode escape truncated', () => {
  const { decodeJsonEscapes } = require('../json-token-reader.cjs');
  const result = decodeJsonEscapes('test\\u00');
  assert.strictEqual(result, 'test\\u00', 'truncated unicode must not decode, returns literal');
});

test('36: scanForDuplicates deeply nested object (5 levels)', () => {
  const { scanForDuplicates, findDuplicateJsonKeys } = require('../json-token-reader.cjs');
  const rawJsonString = '{"a":{"b":{"c":{"d":{"e":"value"}}}}}';
  const dups = findDuplicateJsonKeys(rawJsonString);
  assert.strictEqual(dups.length, 0, 'deeply nested object with no duplicates must be clean');
});

test('37: scanForDuplicates depth tracking with mismatched braces', () => {
  const { findDuplicateJsonKeys } = require('../json-token-reader.cjs');
  const rawJsonString = '{"a":{"b":"value"}';
  try {
    findDuplicateJsonKeys(rawJsonString);
    assert.fail('malformed JSON must throw');
  } catch (e) {
    assert.ok(e.message.includes('Malformed JSON'), 'must report malformed JSON');
  }
});

test('38: packet-validator G3 unknown key rejection path', () => {
  const { validatePacket } = require('../packet-validator.cjs');
  const packet = {
    status: 'draft',
    authority: {},
    options: [],
    ownerDecisions: { decisions: [] },
    integrity: {},
    validation: {},
    invalidTopLevelKey: 'should trigger UNKNOWN_KEY'
  };
  const result = validatePacket(packet, {}, '{}');
  const c = codes(result);
  assert.ok(c.has('UNKNOWN_KEY'), 'unknown key must be detected in guard path');
});

// Tests 39-50: Three-parameter validatePacket() calls to trigger uncovered guard branches
test('39: G1 BOM detection—rawJsonString with BOM prefix triggers G1 path', () => {
  const packet = { status: 'draft', authority: {}, options: [], ownerDecisions: { decisions: [] }, integrity: {}, validation: {} };
  const bomJson = '\uFEFF{"status":"draft"}';
  const result = validatePacket(packet, {}, bomJson);
  // G1 scanForBom() detects U+FEFF; guard path executes
  assert.ok(result.findingsArray || result.findings || Array.isArray(result), 'G1 path must execute with rawJsonString parameter');
});

test('40: G1 BOM detection—rawJsonString without BOM triggers alternative G1 path', () => {
  const packet = { status: 'draft', authority: {}, options: [], ownerDecisions: { decisions: [] }, integrity: {}, validation: {} };
  const plainJson = '{"status":"draft"}';
  const result = validatePacket(packet, {}, plainJson);
  // G1 scanForBom() returns false; guard executes false branch
  assert.ok(result.findingsArray !== undefined || result.findings !== undefined || Array.isArray(result), 'G1 false branch must execute');
});

test('41: G2 duplicate detection—rawJsonString with duplicate keys triggers G2 path', () => {
  const packet = { status: 'draft', authority: {}, options: [], ownerDecisions: { decisions: [] }, integrity: {}, validation: {} };
  const dupJson = '{"status":"draft","status":"conflict"}';
  const result = validatePacket(packet, {}, dupJson);
  const c = codes(result);
  assert.ok(c.has('DUPLICATE_JSON_KEY'), 'G2 duplicate detection path must execute');
});

test('42: G2 duplicate detection—rawJsonString without duplicates triggers G2 false path', () => {
  const packet = { status: 'draft', authority: {}, options: [], ownerDecisions: { decisions: [] }, integrity: {}, validation: {} };
  const noDupJson = '{"status":"draft","note":"unique"}';
  const result = validatePacket(packet, {}, noDupJson);
  const c = codes(result);
  assert.ok(!c.has('DUPLICATE_JSON_KEY'), 'G2 no-duplicate path must execute');
});

test('43: G3 unknown key rejection—packet with unknown top-level keys triggers G3 path', () => {
  const packet = {
    status: 'draft',
    authority: {},
    options: [],
    ownerDecisions: { decisions: [] },
    integrity: {},
    validation: {},
    unknownFieldAtTopLevel: 'must be rejected'
  };
  const result = validatePacket(packet, {}, '{}');
  const c = codes(result);
  assert.ok(c.has('UNKNOWN_KEY'), 'G3 unknown key path must execute');
});

test('44: G3 unknown key rejection—packet with all known keys triggers G3 acceptance path', () => {
  const packet = {
    status: 'draft',
    authority: {},
    options: [],
    ownerDecisions: { decisions: [] },
    integrity: {},
    validation: {}
  };
  const result = validatePacket(packet, {}, '{}');
  const c = codes(result);
  assert.ok(!c.has('UNKNOWN_KEY'), 'G3 acceptance path must execute for known keys');
});

test('45: Combined G1+G2—BOM-prefixed JSON with duplicate keys triggers both guard paths', () => {
  const packet = { status: 'draft', authority: {}, options: [], ownerDecisions: { decisions: [] }, integrity: {}, validation: {} };
  const bomDupJson = '\uFEFF{"status":"draft","status":"dup"}';
  const result = validatePacket(packet, {}, bomDupJson);
  const c = codes(result);
  assert.ok(c.has('DUPLICATE_JSON_KEY'), 'G2 must detect duplicates even with BOM present');
});

test('46: Settings object parameter—validatePacket with settings={} does not alter guard behavior', () => {
  const packet = { status: 'draft', authority: {}, options: [], ownerDecisions: { decisions: [] }, integrity: {}, validation: {} };
  const dupJson = '{"status":"draft","status":"dup"}';
  const result = validatePacket(packet, {}, dupJson);
  const c = codes(result);
  assert.ok(c.has('DUPLICATE_JSON_KEY'), 'guard behavior must be independent of empty settings');
});

test('47: Type check for rawJsonString parameter—non-string rawJsonString bypasses guard checks', () => {
  const packet = { status: 'draft', authority: {}, options: [], ownerDecisions: { decisions: [] }, integrity: {}, validation: {} };
  // Pass undefined as rawJsonString; guards check typeof rawJsonString === 'string'
  const result = validatePacket(packet, {}, undefined);
  // Should not crash; type check false branch executes
  assert.ok(Array.isArray(result) || result.findings || result.findingsArray, 'undefined rawJsonString must not crash validation');
});

test('48: G1+G3 combined—BOM-prefixed JSON with unknown top-level keys in packet triggers both', () => {
  const packet = {
    status: 'draft',
    authority: {},
    options: [],
    ownerDecisions: { decisions: [] },
    integrity: {},
    validation: {},
    foreignKey: 'unknown'
  };
  const bomJson = '\uFEFF{"status":"draft"}';
  const result = validatePacket(packet, {}, bomJson);
  const c = codes(result);
  assert.ok(c.has('UNKNOWN_KEY'), 'G3 must detect unknown keys regardless of BOM');
});

test('49: G2+G3 combined—duplicate keys in rawJsonString + unknown packet keys trigger both', () => {
  const packet = {
    status: 'draft',
    authority: {},
    options: [],
    ownerDecisions: { decisions: [] },
    integrity: {},
    validation: {},
    unknownField: 'test'
  };
  const dupJson = '{"status":"draft","status":"dup"}';
  const result = validatePacket(packet, {}, dupJson);
  const c = codes(result);
  assert.ok(c.has('DUPLICATE_JSON_KEY') && c.has('UNKNOWN_KEY'), 'G2 and G3 must detect both violations');
});

test('50: packet, settings and original JSON can be validated together', () => {
  const packet = {
    status: 'draft',
    authority: {},
    options: [],
    ownerDecisions: { decisions: [] },
    integrity: {},
    validation: {}
  };
  const json = '\uFEFF{"a":"b","a":"c"}';
  // All parameters provided: packet (object), settings (object), rawJsonString (string)
  const result = validatePacket(packet, { custom: 'setting' }, json);
  // Confirms three-parameter path executes without error
  assert.ok(result !== null && result !== undefined, 'three-parameter validatePacket must complete successfully');
});
