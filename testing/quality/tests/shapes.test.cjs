'use strict';
// The closed list of statement shapes (shapes.cjs): the fixture matches the reviewed sequence of every container, every shape is used and
// unambiguous, and a systematic generator of hostile variants of EVERY line of the fixture (a deleted or duplicated word, another identity, an
// appended statement, a call operator, hidden characters, another case) is refused by name. The loosening test mutates each shape in turn and
// proves that the variants would notice (the shape list has no shape whose strictness no test depends on).
const { load, assert, test } = require('./support.cjs');
const { SHAPES, EXPECTED, containersOf, shapeOf, compile, normalize } = require('../shapes.cjs');

const fixture = () => containersOf(load().cleanupAndRollback);
const IDENTITIES = [['$Subscription', '$Other'], ['<subscription-id>', '<other>'], ['$Group', '$Other'], ['<rg>', '<other>'], ['$Lease', '$Other'], ['<lease-id>', '<other>'], ['$App', '$Other'], ['<app>', '<other>'],
  ['$Plan', '$Other'], ['<plan>', '<other>'], ['$Workspace', '$Other'], ['<law>', '<other>'], ['$Storage', '$Other'], ['<storage>', '<other>']];

function variants(line, shape) {
  const base = normalize(line);
  const words = base.split(' ');
  const out = [['append', `${base}; Remove-Item x`], ['call operator', `& ${base}`], ['zero-width space', base.replace(' ', ' \u200b')], ['non-breaking space', base.replace(' ', '\u00a0')], ['hidden prefix', `\u200b${base}`],
    ['upper case', base.toUpperCase()], ['look-alike letter', base.replace('e', '\u0435')]];
  for (const [from, to] of IDENTITIES) if (base.includes(from)) out.push([`${from} replaced`, base.split(from).join(to)]);
  // A free-text slot (the message of a throw) legitimately accepts other words: only the structure around it is varied.
  if (!/<<MSG>>/.test(shape.template)) words.forEach((w, i) => { out.push([`word ${i + 1} deleted`, [...words.slice(0, i), ...words.slice(i + 1)].join(' ')]); out.push([`word ${i + 1} duplicated`, [...words.slice(0, i + 1), w, ...words.slice(i + 1)].join(' ')]); });
  return out.filter(([, text]) => text !== base);
}

const linesWithShapes = () => Object.entries(fixture()).flatMap(([name, lines]) => lines.map((line, i) => ({ name, i, line, id: shapeOf(line) })));

test('the fixture matches the reviewed sequence of shapes in every container', () => {
  for (const [name, lines] of Object.entries(fixture())) assert.deepEqual(lines.map(shapeOf), EXPECTED[name], name);
});

test('every shape is used by a reviewed sequence and every reviewed sequence names a known shape', () => {
  const ids = new Set(SHAPES.map((s) => s.id));
  assert.equal(ids.size, SHAPES.length, 'shape ids are unique');
  const used = new Set(Object.values(EXPECTED).flat());
  assert.deepEqual([...used].filter((id) => !ids.has(id)), [], 'an unknown shape is named');
  assert.deepEqual([...ids].filter((id) => !used.has(id)), [], 'a dead shape is attack surface');
});

test('every line of the fixture matches exactly one shape', () => {
  for (const { name, i, line } of linesWithShapes()) assert.equal(SHAPES.filter((s) => s.re.test(normalize(line))).length, 1, `${name}[${i}]: ${line.slice(0, 60)}`);
});

test('every hostile variant of every line of the fixture is refused', () => {
  let count = 0;
  for (const { name, i, line, id } of linesWithShapes()) {
    const shape = SHAPES.find((s) => s.id === id);
    for (const [what, text] of variants(line, shape)) {
      count += 1;
      assert.equal(shapeOf(text), null, `${name}[${i}] ${what}: accepted as ${shapeOf(text)}`);
    }
  }
  assert.ok(count > 1000, `the generator produced ${count} variants`);
});

test('loosening any one shape is noticed: some variant of its own line is accepted (the systematic mutation of the shape list)', () => {
  const lines = linesWithShapes();
  for (const shape of SHAPES) {
    const original = shape.re;
    shape.re = /^[\s\S]*$/;
    try {
      const own = lines.filter((l) => l.id === shape.id);
      assert.ok(own.length > 0, `${shape.id} has a line in the fixture`);
      assert.ok(own.some(({ line }) => variants(line, shape).some(([, text]) => shapeOf(text) !== null)), `${shape.id}: loosening it would go unnoticed`);
    } finally { shape.re = original; }
  }
});

test('the slots have closed vocabularies and bounded lengths', () => {
  const re = compile("x <<PH>> '<<MSG>>' <<SUB>> <<RG>> <<WORD>> <<CARD>>");
  assert.ok(re.test("x <region> 'text of a message' <subscription-id> $Group abc-1 C062"));
  assert.ok(!re.test("x <a b> 'text' <subscription-id> $Group abc C062"), 'a placeholder holds no space');
  assert.ok(!re.test(`x <${'a'.repeat(41)}> 'text' <subscription-id> $Group abc C062`), 'a placeholder is at most 40 characters');
  assert.ok(!re.test("x <region> 'it's' <subscription-id> $Group abc C062"), 'a message holds no quote');
  assert.ok(!re.test("x <region> '$(x)' <subscription-id> $Group abc C062"), 'a message holds no dollar sign');
  assert.ok(!re.test(`x <region> '${'a'.repeat(201)}' <subscription-id> $Group abc C062`), 'a message is at most 200 characters');
  assert.ok(!re.test("x <region> 'text' <other> $Group abc C062"), 'only the subscription vocabulary fits the subscription slot');
});

test('shapes are matched on the text as written: only plain spaces are collapsed', () => {
  assert.equal(shapeOf('az  account   show --query id -o tsv'), 'az-account-show');
  assert.equal(shapeOf('az account show --query id -o tsv\r'), null, 'a carriage return is not whitespace of the plan');
  assert.equal(shapeOf(42), null);
});
