'use strict';
// Unit tests of the bounded helpers of the fix for the third review: the memoised fold with its counters, the mark-run guard, the character budget
// of the inventory, the parent-pointer parser with its caps, and the table helpers of the markdown comparison.
const { assert, test } = require('./support.cjs');
const text = require('../text.cjs');
const { inventory, LIMITS } = require('../limits.cjs');
const shell = require('../shell.cjs');
const md = require('../markdown-structure.cjs');

const MARKS = '\u0345\u0301\u0316\u0f71\u0f72\u0f74\u0315';
const marks = (n) => MARKS.repeat(Math.ceil(n / MARKS.length)).slice(0, n);

test('fold normalises each distinct string once and shares the result', () => {
  text.resetFold();
  assert.equal(text.fold('ＡＢＣ'), 'ABC');
  assert.equal(text.fold('ＡＢＣ'), 'ABC');
  assert.equal(text.fold('ABC'), 'ABC', 'the folded text is a fixed point: no second normalisation');
  assert.equal(text.foldStats().normalizeCalls, 1);
  assert.equal(text.foldStats().foldedChars, 3);
  assert.equal(text.foldStats().memoSize, 2);
  text.fold('plain');
  assert.equal(text.foldStats().normalizeCalls, 2);
  text.resetFold();
  assert.deepEqual(text.foldStats(), { normalizeCalls: 0, foldedChars: 0, memoSize: 0 });
});

test('hasMarkRun: 32 combining marks in a row pass, 33 are a run', () => {
  assert.equal(text.hasMarkRun(`a${marks(32)}b`), false);
  assert.equal(text.hasMarkRun(`a${marks(33)}b`), true);
  assert.equal(text.hasMarkRun(`${marks(32)}x${marks(32)}`), false, 'a letter between the runs ends the run');
});

test('squash removes the marks before NFKC composes them, look-alikes, line breaks and emphasis', () => {
  assert.equal(text.squash('a\u0301 b\u0301'), 'ab');
  assert.equal(text.squash('\u0430bc<br/>d\u2011e *f*'), 'abcd-ef');
  assert.equal(text.words('A_B-C  d'), 'a b c d');
  assert.equal(text.latin('\u0435x'), 'ex');
});

test('inventory: the strings and keys together stay inside the character budget, marks and long strings are typed refusals', () => {
  const big = (n) => ({ a: 'x'.repeat(19999), b: 'x'.repeat(n) });
  assert.equal(inventory(big(10)).error, null);
  assert.equal(inventory(big(10)).totalChars, 19999 + 10 + 2);
  const many = {};
  for (let i = 0; i < 51; i += 1) many[`k${i}`] = 'x'.repeat(19999);
  assert.equal(inventory(many).error.code, 'INPUT_TOO_LARGE');
  assert.match(inventory(many).error.message, /together/);
  assert.equal(inventory({ a: `x${marks(33)}` }).error.code, 'INPUT_COMBINING_RUN');
  assert.equal(inventory({ [`k${marks(33)}`]: 1 }).error.code, 'INPUT_COMBINING_RUN');
  assert.equal(inventory({ a: 'y'.repeat(20001) }).error.code, 'INPUT_TOO_LARGE');
  assert.equal(inventory({ ['k'.repeat(20001)]: 1 }).error.code, 'INPUT_TOO_LARGE');
  assert.equal(LIMITS.maxTotalChars, 1000000);
  assert.equal(LIMITS.maxBlockDepth, 32);
  assert.equal(LIMITS.maxStatements, 2000);
  assert.equal(LIMITS.maxMarkRun, 32);
});

test('parser: statements keep only their innermost block and every block a parent pointer', () => {
  const parsed = shell.parse('try { if (x) { y } }\nz');
  assert.equal(parsed.error, null);
  const y = parsed.statements.find((s) => s.raw === 'y');
  assert.equal(typeof y.block, 'number');
  assert.equal('blocks' in y, false, 'no copy of the block stack per statement');
  const ids = shell.chain(parsed, y.block);
  assert.equal(ids[0], 0);
  assert.equal(ids[ids.length - 1], y.block);
  assert.ok(ids.length <= LIMITS.maxBlockDepth + 1);
  assert.equal(shell.isWithin(parsed, y.block, ids[1]), true);
  assert.equal(shell.isWithin(parsed, ids[1], y.block), false);
  assert.equal(shell.anyWithin(parsed, y.block, (b) => b.kind === 'try'), true);
  assert.equal(shell.anyWithin(parsed, 0, (b) => b.kind === 'try'), false);
});

test('parser: 32 nested blocks are read, the 33rd is INPUT_TOO_DEEP; 2000 statements are read, the 2001st is INPUT_TOO_LARGE; so are 2000 blocks', () => {
  assert.equal(shell.parse('{'.repeat(32)).error, null);
  assert.equal(shell.parse('{'.repeat(33)).error.code, 'INPUT_TOO_DEEP');
  assert.equal(shell.parse(`${'a;'.repeat(1999)}a`).error, null);
  assert.equal(shell.parse(`${'a;'.repeat(2000)}a`).error.code, 'INPUT_TOO_LARGE');
  assert.equal(shell.parse('{}'.repeat(1999)).error, null);
  assert.equal(shell.parse('{}'.repeat(2001)).error.code, 'INPUT_TOO_LARGE');
  assert.deepEqual(shell.parse('(a;'.repeat(40)).statements, [], 'a refused text yields no statements');
});

test('markdown helpers: cells, money, same and tables', () => {
  assert.deepEqual(md.cells('| a | b \\| c |  |'), ['a', 'b | c', '']);
  assert.equal(md.money('$1,234.50 (x)'), 1234.5);
  assert.ok(Number.isNaN(md.money('about $5')));
  assert.equal(md.same('$0.0775', 0.0775), true);
  assert.equal(md.same('$0.085', 0.0775), false);
  assert.equal(md.same('$1', '1'), false);
  const tables = md.tablesIn(['text', '| H1 | H2 |', '| --- | :-: |', '| a | b |', '| c | d |', '', '| X |', '| - |', '| y |']);
  assert.deepEqual(tables.map((t) => [t.header, t.rows]), [[['H1', 'H2'], [['a', 'b'], ['c', 'd']]], [['X'], [['y']]]]);
  const lines = ['## A', 'x', '### B', 'y', '## C'];
  assert.deepEqual(md.sectionOf(lines, (l) => l === '## A', (l) => l.startsWith('## ')), ['## A', 'x', '### B', 'y']);
  assert.deepEqual(md.sectionOf(lines, (l) => l === '### B', (l) => l.startsWith('### ') || l.startsWith('## ')), ['### B', 'y']);
  assert.equal(md.sectionOf(lines, (l) => l === 'nope', () => false), null);
  assert.deepEqual(md.sectionOf(lines, (l) => l === '## C', () => false), ['## C']);
});

test('markdown claims: the reviewed phrasings are claims, the legitimate sentences of the packet are not', () => {
  const hit = (line) => md.CLAIMS.some(([re]) => re.test(line));
  for (const line of ['Status: approved.', 'Approval granted: yes.', 'No approval is needed.', 'Run authorised.', 'The run is free.', 'It is free of charge.', 'The whole proof costs nothing.', 'at no cost']) assert.equal(hit(line), true, line);
  for (const line of ['firstNativeConfiguration is free text', 'Slots cost nothing extra and run on the plan instances', 'zero means forbidden, not free', 'Nothing here is an approval.', 'authorizedCloudSpend 0']) assert.equal(hit(line), false, line);
});
