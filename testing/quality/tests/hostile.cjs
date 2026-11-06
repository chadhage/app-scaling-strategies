'use strict';
// Helpers of the revision 3 hostile tests: table-driven reject and accept cases over the accepted fixture, and a faithful markdown copy.
const { load, reseal, run, NOW, assert, test } = require('./support.cjs');

const sealed = (mutate, { seal = true } = {}) => {
  const p = load();
  mutate(p);
  if (seal) reseal(p);
  return p;
};

let baselineCache;
const baseline = () => {
  if (!baselineCache) baselineCache = new Set(run(sealed(() => {})).findings.map((f) => `${f.code} ${f.path}`));
  return baselineCache;
};

function reject(group, name, mutate, codes, { settings = {}, seal = true } = {}) {
  test(`${group} rejects ${name}`, () => {
    const p = sealed(mutate, { seal });
    const result = run(p, typeof settings === 'function' ? settings(p) : settings);
    const base = baseline();
    const added = result.findings.filter((f) => !base.has(`${f.code} ${f.path}`));
    assert.ok(added.length > 0, `${name}: accepted although it must be rejected (no finding beyond the ${base.size} of the unmutated fixture)`);
    assert.ok(added.some((f) => codes.includes(f.code)), `${name}: expected one of ${codes.join(', ')}, got ${added.map((f) => f.code).join(', ')}`);
  });
}

function accept(group, name, mutate, { settings = {}, seal = true } = {}) {
  test(`${group} accepts ${name}`, () => {
    const p = sealed(mutate, { seal });
    const result = run(p, typeof settings === 'function' ? settings(p) : settings);
    assert.deepEqual(result.findings.map((f) => `${f.code} ${f.path}`), [], `${name}: a correct packet was rejected`);
  });
}

const { faithfulMarkdown, commandLines } = require('./md.cjs');

module.exports = { reject, accept, sealed, faithfulMarkdown, commandLines, load, reseal, run, NOW, assert, test };
