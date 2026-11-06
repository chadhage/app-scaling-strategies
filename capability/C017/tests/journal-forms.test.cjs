'use strict';

// F7: journal.cjs is a strict-GRAMMAR reader with a digest chain, not a canonical-form check, and it never repairs. These forms parse to the same
// logical record and are accepted while the record and its digest agree (the README states this scope); a changed value, a broken chain or a
// torn tail is still unreadable. The old header comment claimed that any irregularity makes the journal unreadable.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const s = require('./support.cjs');
const { openJournal, JournalError } = require('../journal.cjs');

const entries = [{ type: 'boot', at: 't1', bootId: 'b1' }, { type: 'boot', at: 't2', bootId: 'b2' }];

test('a byte-order mark, CRLF, padding, reordered keys, a duplicated key and 2.0 for 2 are accepted as the same logical record', (t) => {
  const made = s.scratch('jf');
  t.after(() => made.remove());
  const journal = openJournal(made.dir);
  journal.append(entries);
  const text = fs.readFileSync(journal.file, 'utf8');
  const lines = text.trimEnd().split('\n');
  const variants = {
    'a byte-order mark': `\uFEFF${text}`,
    'CRLF line endings': text.replaceAll('\n', '\r\n'),
    'padded lines': `${lines.map((line) => `  ${line}  `).join('\n')}\n`,
    'reordered keys': `${lines.map((line) => JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(line)).reverse()))).join('\n')}\n`,
    'a duplicated key (the last one wins)': `${lines.map((line) => `{"seq":999,${line.slice(1)}`).join('\n')}\n`,
    'a number written 2.0 for 2': `${lines.map((line) => line.replace(/"seq":(\d+),/, '"seq":$1.0,')).join('\n')}\n`,
  };
  for (const [name, variant] of Object.entries(variants)) {
    fs.writeFileSync(journal.file, variant);
    assert.deepEqual(openJournal(made.dir).read(), entries, name);
  }
});

test('a changed value, a broken chain and a torn tail are still unreadable, and nothing is repaired', (t) => {
  const made = s.scratch('jf');
  t.after(() => made.remove());
  const journal = openJournal(made.dir);
  journal.append(entries);
  const text = fs.readFileSync(journal.file, 'utf8');
  const lines = text.trimEnd().split('\n');
  const broken = {
    'a changed value': text.replace('"b1"', '"bX"'),
    'a swapped order': `${lines[1]}\n${lines[0]}\n`,
    'a dropped first line': `${lines[1]}\n`,
    'a torn tail': text.slice(0, -5),
    'an unknown field': text.replace('"seq":1,', '"seq":1,"extra":true,'),
  };
  for (const [name, variant] of Object.entries(broken)) {
    fs.writeFileSync(journal.file, variant);
    assert.throws(() => openJournal(made.dir).read(), (error) => error instanceof JournalError, name);
    assert.equal(fs.readFileSync(journal.file, 'utf8'), variant, `${name}: the file was not repaired`);
  }
});
