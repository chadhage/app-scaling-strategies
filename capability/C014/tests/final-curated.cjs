'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { NAMED } = require('./named-mutants.cjs');
const { SUITES } = require('./mutants.cjs');
const { run } = require('./final-mutations.cjs');
const { load, canonPair } = require('./final-equivalences.cjs');
const ROOT = path.resolve(__dirname, '..');
const PRIVATE = process.env.C014_PRIVATE_EVIDENCE;
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sourceHash = (value) => hash(value.replace(/\r\n/g, '\n'));

function definitions() {
  const entries = [...NAMED,
    { id: 'G6 K05 present ignores text (cost-only, paired witness)', file: 'canon.cjs', find: '.filter((other) => text.includes(other))', replace: '.filter(() => true)', equivalent: true },
    { id: 'G6 K06 empty set-aside marker joins neighbours', file: 'canon.cjs', find: "const SET_ASIDE = '\\u0000';", replace: "const SET_ASIDE = '';" },
    { id: 'G6 K07 space set-aside marker joins neighbours', file: 'canon.cjs', find: "const SET_ASIDE = '\\u0000';", replace: "const SET_ASIDE = ' ';" },
    { id: 'G2 overlapping covering secrets regress to sequential set-aside', file: 'canon.cjs', find: 'views(replaceVerbatim(text, covering, SET_ASIDE))', replace: 'views(covering.reduce((rest, other) => rest.split(other).join(SET_ASIDE), text))' },
    { id: 'G2 public mask regresses to sequential secret replacement', file: 'redact.cjs', find: 'let value = canon.replaceVerbatim(input, ordered, MASK);', replace: 'let value = ordered.reduce((value, secret) => value.split(secret).join(MASK), input);' },
    { id: 'G3 literal-plus-preserving form needle removed', file: 'canon.cjs', find: ", fold(secret.replace(/ /g, '+'))", replace: '' },
    { id: 'G9 zero-padded hex regression', file: 'canon.cjs', find: '[xX][0-9a-fA-F]+|\\d+', replace: '[xX][0-9a-fA-F]{1,6}|\\d+' },
    { id: 'G9 zero-padded decimal regression', file: 'canon.cjs', find: '[xX][0-9a-fA-F]+|\\d+', replace: '[xX][0-9a-fA-F]+|\\d{1,7}' },
    { id: 'G9 zero-padded braced regression', file: 'canon.cjs', find: '\\\\u\\{([0-9a-fA-F]+)\\}', replace: '\\\\u\\{([0-9a-fA-F]{1,6})\\}' },
    { id: 'H09 wrong HTML media type', file: 'server.cjs', find: "'text/html; charset=utf-8'", replace: "'text/plain'" },
    { id: 'H10 wrong JavaScript media type', file: 'server.cjs', find: "'text/javascript; charset=utf-8'", replace: "'text/plain'" }
  ];
  for (const [label, type] of [['html', 'text/html; charset=utf-8'], ['javascript', 'text/javascript; charset=utf-8'], ['css', 'text/css; charset=utf-8']]) {
    for (let at = 0; at < type.length; at += 1) entries.push({ id: `G10 ${label} media type character ${at} removed`, file: 'server.cjs', find: `'${type}'`, replace: `'${type.slice(0, at)}${type.slice(at + 1)}'` });
  }
  const source = fs.readFileSync(path.join(ROOT, 'canon.cjs'), 'utf8');
  let at = -1;
  for (let ordinal = 0; ordinal < 2; ordinal += 1) {
    at = source.indexOf('point <= 0x10ffff', at + 1);
    assert.ok(at >= 0);
    entries.push({ id: `G9 Unicode maximum widened at decoder ${ordinal}`, file: 'canon.cjs', start: at, find: 'point <= 0x10ffff', replace: 'point <= 0x110000' });
  }
  return entries.map((entry) => {
    const source = fs.readFileSync(path.join(ROOT, entry.file), 'utf8');
    const start = entry.start === undefined ? source.indexOf(entry.find) : entry.start;
    assert.ok(start >= 0 && source.slice(start, start + entry.find.length) === entry.find, `${entry.id}: current source matches`);
    if (entry.start === undefined) assert.equal(source.indexOf(entry.find, start + 1), -1, `${entry.id}: unique current find`);
    return { ...entry, sourceLfSha256: sourceHash(source), mutant: { start, end: start + entry.find.length, original: entry.find, replacement: entry.replace } };
  });
}

async function main() {
  assert.ok(PRIVATE && path.isAbsolute(PRIVATE));
  const entries = definitions();
  const epoch = `curated-${process.pid}-${Date.now()}`;
  const controls = {};
  for (const file of [...new Set(entries.map((entry) => entry.file))]) {
    controls[file] = await run(file, null, SUITES[file], `${epoch}-${file}-control`);
    assert.equal(controls[file].exit, 0, `${file}: pristine control`);
    assert.ok(controls[file].ranTests > 0 && controls[file].passed === controls[file].ranTests);
  }
  const results = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const suites = entry.id.startsWith('G2 overlapping covering') ? ['final-overlap'] : SUITES[entry.file];
    const result = await run(entry.file, entry.mutant, suites, `${epoch}-${index}`);
    if (entry.equivalent) {
      assert.equal(result.killed, false);
      assert.equal(result.timedOut, false);
      assert.equal(result.invalid, false);
      canonPair(load(entry.file, null), load(entry.file, entry.mutant));
      result.equivalent = true;
      result.pairedWitness = true;
      result.reason = 'Absent covering values have no verbatim occurrence, so adding them to the replacement list is an identity; present covering values and all decoded views are unchanged.';
    }
    results.push({ ...entry, ...result });
    console.log(`${result.killed ? 'NAMED' : result.equivalent ? 'PAIRED-EQUIVALENT' : result.timedOut ? 'UNDECIDED' : 'SURVIVED'} ${entry.id} ${JSON.stringify(result.failing)}`);
  }
  const bad = results.filter((result) => !result.killed && !result.equivalent || result.timedOut || result.invalid);
  const report = { schema: 'C014-current-curated/1', total: results.length, killed: results.filter((result) => result.killed).length,
    equivalent: results.filter((result) => result.equivalent).length, undecided: results.filter((result) => result.timedOut).length,
    controls, results, unresolved: bad.map((result) => result.id) };
  const out = process.argv.find((arg) => arg.startsWith('--out='));
  assert.ok(out, 'an explicit new private report path is required');
  fs.writeFileSync(out.slice(6), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  if (bad.length) process.exitCode = 1;
}
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { definitions, main };
