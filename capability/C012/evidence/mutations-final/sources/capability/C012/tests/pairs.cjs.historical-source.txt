'use strict';
const assert = require('node:assert/strict'), vm = require('node:vm');
const { observe } = require('./probes.cjs');
const { create } = require('./dom.cjs');
const fixtures = require('../fixtures.js');
const { sha } = require('./integrity.cjs');
const parser = require('../../C011/tests/u074-parser.cjs');
const RULES = Object.freeze({
  'strict-directive-ordinary-context': [4, 9, 70, 75, 348],
  'fresh-commonjs-export-truth': [13, 256],
  'allowance-reservation-closed-domain': [109],
  'freshness-dominates-fixture-expiry': [122, 125, 128, 131, 134],
  'private-current-unreviewable-sentinel': [433, 435],
  'private-version-injective-finite-domain': [434, 436]
});
const description = {
  'strict-directive-ordinary-context': 'Exact directive deletion in these ordinary CJS/browser contexts. The actual source has no this, with, eval, arguments/callee or delete-sensitive operation. Ordinary local/DOM assignments and Object.defineProperty/freeze behavior are compared, not arbitrary caller-modified global prototypes.',
  'fresh-commonjs-export-truth': 'Node fresh CommonJS module.exports is the initial truthy object; the browser has no module, so the exact left typeof guard short-circuits. Replacing only the second operand by true preserves these two real initialization environments, not arbitrary fabricated module globals.',
  'allowance-reservation-closed-domain': 'All nine hash-bound accepted producer snapshots satisfy absent allowance implies absent reservation. Therefore allowance && reservation and true && reservation have the same object/null value, not just similar rendered wording. No arbitrary imported packet is admitted.',
  'freshness-dominates-fixture-expiry': 'For every active admitted snapshot, observedAtMs + freshnessMs is strictly before reservation.deadlineMs. Outside that interval an unchanged freshness clause already gives the same single STALE_OBSERVATION; inside it the expiry conjunction is false. Inactive/missing records make its prefix false. Actual source pairs cover all boundary partitions.',
  'private-current-unreviewable-sentinel': 'The exact private current value is read only as current && current.reviewable inside Boolean. In the unchanged ordinary browser prototype environment, null and the fixed string sentinel both mean not reviewable. The value is not exported or rendered; later actual results replace it. Prototype-modified hosts are not claimed.',
  'private-version-injective-finite-domain': 'For at most 1024 invalidations, n, n+1 and 2*n are exact distinct integers. The private generation is only copied to started and compared for equality, never rendered. Both actual client sources are executed with pending completions and 0,1,2,32,1024 edits; this is a bounded operation-domain proof, not an unbounded numeric lifetime claim.'
};
function choose(definition, input) {
  const rule = Object.keys(RULES).find(name => RULES[name].includes(definition.id));
  if (!rule) return null;
  assert.equal(sha(input[definition.file]), definition.sourceSha256, 'pair binds the real source');
  const original = input[definition.file].slice(definition.start, definition.end);
  if (rule.startsWith('strict-')) {
    assert.equal(original, "'use strict';"); assert.equal(definition.replacement, ';');
    const stack = [parser.parse(definition.file, input[definition.file])];
    while (stack.length) {
      const node = stack.pop();
      assert.ok(!['ThisExpression', 'WithStatement'].includes(node.type));
      if (node.type === 'Identifier') assert.ok(!['eval', 'arguments'].includes(node.name));
      if (node.type === 'UnaryExpression' && node.operator === 'delete') assert.notEqual(node.argument.type, 'Identifier');
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) for (const child of value) if (child && typeof child.type === 'string') stack.push(child);
        if (!Array.isArray(value) && value && typeof value.type === 'string') stack.push(value);
      }
    }
  }
  if (rule === 'fresh-commonjs-export-truth') {
    assert.equal(original, 'module.exports'); assert.equal(definition.replacement, 'true');
    assert.equal(vm.runInNewContext('Boolean(module.exports)', { module: { exports: {} } }), true);
    assert.equal(vm.runInNewContext('typeof module'), 'undefined');
  }
  if (rule === 'allowance-reservation-closed-domain') {
    assert.equal(original, 'allowance'); assert.equal(definition.replacement, 'true');
    assert.ok(input[definition.file].includes('const held = allowance && reservation;'));
    for (const entry of Object.values(fixtures)) {
      const packet = JSON.parse(entry.text), a = packet.allowance.ok ? packet.allowance.value.allowance : null;
      const r = packet.reservation.ok ? packet.reservation.value.reservation : null;
      if (!a) assert.equal(r, null);
      assert.equal(a && r, true && r);
    }
  }
  if (rule === 'freshness-dominates-fixture-expiry') {
    assert.equal(definition.replacement, 'false');
    assert.ok([
      "reservation && reservation.state === 'reserved' && asOfMs >= reservation.deadlineMs",
      'asOfMs >= reservation.deadlineMs', "reservation && reservation.state === 'reserved'",
      "reservation.state === 'reserved'", 'reservation'
    ].includes(original));
    for (const entry of Object.values(fixtures)) {
      const packet = JSON.parse(entry.text), r = packet.reservation.ok ? packet.reservation.value.reservation : null;
      if (r?.state === 'reserved') assert.ok(packet.observedAtMs + packet.freshnessMs < r.deadlineMs);
    }
  }
  if (rule === 'private-current-unreviewable-sentinel') {
    assert.equal(original, 'null'); assert.equal(definition.replacement, "'C012-altered'");
    assert.ok(input['page.js'].includes('Boolean(current && current.reviewable &&'));
    assert.equal(Boolean(null && null.reviewable), Boolean('C012-altered'.reviewable));
  }
  if (rule === 'private-version-injective-finite-domain') {
    assert.ok(['0', '1'].includes(original)); assert.equal(definition.replacement, String(Number(original) + 1));
    assert.equal((input['page.js'].match(/\bgeneration\b/g) || []).length, 4, 'only initialization increment copy and equality');
    for (let n = 0; n <= 1024; n++) for (const delta of [0, 1]) {
      assert.equal(n === n + delta, n + 1 === n + delta + 1);
      assert.equal(n === n + delta, n * 2 === (n + delta) * 2);
    }
  }
  return { rule, domain: description[rule] };
}
async function paired(definition, input) {
  const chosen = choose(definition, input);
  assert.ok(chosen, 'NO_DEFAULT_EQUIVALENCE: an explicit source-exact rule is required');
  const original = input[definition.file], changed = original.slice(0, definition.start) + definition.replacement + original.slice(definition.end);
  assert.equal(sha(changed), definition.mutantSha256);
  const pristine = await observe(input), counterfactual = await observe({ ...input, [definition.file]: changed });
  assert.deepEqual(pristine.failures, []); assert.deepEqual(pristine.faults, []);
  assert.deepEqual(counterfactual.failures, []); assert.deepEqual(counterfactual.faults, []);
  assert.deepEqual(counterfactual.trace, pristine.trace, 'actual complete source-exact paired observations');
  const extra = [];
  if (chosen.rule === 'freshness-dominates-fixture-expiry') {
    const a = create({ sources: input, mutation: true }), b = create({ sources: { ...input, [definition.file]: changed }, mutation: true });
    for (const [name, entry] of Object.entries(fixtures)) {
      const p = JSON.parse(entry.text), r = p.reservation.ok ? p.reservation.value.reservation : null;
      const times = [...new Set([Number.MIN_SAFE_INTEGER, p.observedAtMs - 1, p.observedAtMs, p.observedAtMs + 1,
        p.observedAtMs + p.freshnessMs, p.observedAtMs + p.freshnessMs + 1, r?.deadlineMs - 1, r?.deadlineMs, r?.deadlineMs + 1, Number.MAX_SAFE_INTEGER])].filter(Number.isSafeInteger);
      for (const time of times) {
        const left = JSON.parse(JSON.stringify(await a.context.C012Model.review(entry.text, p.subject, p.reservationId, time)));
        const right = JSON.parse(JSON.stringify(await b.context.C012Model.review(entry.text, p.subject, p.reservationId, time)));
        assert.deepEqual(right, left, 'actual temporal partition ' + name + ':' + time);
        extra.push({ name, time, pristine: left, counterfactual: right });
      }
    }
  }
  if (chosen.rule === 'private-version-injective-finite-domain') {
    for (const edits of [0, 1, 2, 32, 1024]) {
      const run = async source => {
        let release;
        const crypto = require('node:crypto').webcrypto;
        const dom = create({ sources: source, mutation: true, crypto: { subtle: { digest: (...args) => new Promise(resolve => {
          release = () => crypto.subtle.digest(...args).then(resolve);
        }) } } });
        await dom.emit('load', 'click'); const pending = dom.emit('review', 'click');
        for (let index = 0; index < edits; index++) await dom.emit('packet', 'input');
        await release(); await pending;
        return { rows: dom.rows(), disabled: dom.elements.get('acknowledge').disabled, checked: dom.elements.get('acknowledge').checked, status: dom.elements.get('status').textContent };
      };
      const left = await run(input), right = await run({ ...input, [definition.file]: changed });
      assert.deepEqual(right, left, 'actual pending client version pair with ' + edits + ' invalidations');
      extra.push({ edits, pristine: left, counterfactual: right });
    }
  }
  return { ...chosen, definitionId: definition.id, cases: pristine.trace.length + extra.length,
    assertedPairs: pristine.trace.length + extra.length, pristineSourceSha256: sha(original), counterfactualSha256: sha(changed),
    pristineTrace: pristine.trace, counterfactualTrace: counterfactual.trace, extra };
}
module.exports = { RULES, choose, paired };
