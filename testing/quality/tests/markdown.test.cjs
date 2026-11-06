'use strict';
// V8: each derived fact of the markdown copy has its own exact code; the faithful copy passes and so does every kind of fence.
const { assert, test, load, reseal, run, goodMarkdown } = require('./support.cjs');
const { split } = require('../rules-markdown.cjs');

const codesOf = (edit) => {
  const p = reseal(load());
  const md = edit ? edit(goodMarkdown(p), p) : goodMarkdown(p);
  return new Set(run(p, { markdown: md }).findings.map((f) => f.code));
};

test('the faithful markdown passes, also with CRLF line ends and with other kinds of fenced blocks', () => {
  assert.deepEqual([...codesOf()], []);
  assert.deepEqual([...codesOf((md) => md.replace(/\n/g, '\r\n'))], []);
  assert.deepEqual([...codesOf((md) => `${md}\n\`\`\`json\n{"answer": "no"}\n\`\`\`\n`)], []);
});

const BAD = {
  MARKDOWN_HASH_MISSING: (md, p) => md.split(p.integrity.packetSha256).join('<hash>'),
  MARKDOWN_HEADING_MISSING: (md) => md.replace('## 4. Cleanup and rollback plan', 'Cleanup'),
  MARKDOWN_CEILING_MISSING: (md) => md.replace('$15.00', '$16.00'),
  MARKDOWN_DEFAULT_MISSING: (md) => md.replace('default region eastus', 'default region westus3'),
  MARKDOWN_QUOTA_MISSING: (md) => md.replace(/failed-2026-11-05/g, 'passed'),
  MARKDOWN_EXPIRY_MISSING: (md) => md.replace('usable until', 'usable at'),
  MARKDOWN_ALLOWANCE_MISSING: (md, p) => md.replace(p.repositoryState.relationToThisPacket.allowanceVersusBounds, ''),
  MARKDOWN_APPROVALS_MISSING: (md) => md.replace('all six flags false', 'all six flags checked'),
  MARKDOWN_DECISION_MISMATCH: (md) => md.replace('- Default: **no**', '- Default: **yes**'),
  MARKDOWN_AMOUNT_UNKNOWN: (md) => `${md}\nA surprise of $123.45.`,
  MARKDOWN_COMMAND_MISMATCH: (md) => md.replace('```powershell', '```powershell\nGet-Date'),
  MARKDOWN_COMMAND_MISSING: (md) => md.replace('  Add-Type -AssemblyName PresentationFramework', '# removed'),
  DELETE_OUTSIDE_COMMANDS: (md) => `${md}\nRun az group delete --name prod-rg now.`,
  HARD_WITHOUT_PHRASE: (md) => `${md}\nA hard cap.`,
  GUID_FOUND: (md) => `${md}\n11111111-2222-3333-4444-555555555555`,
  EMAIL_FOUND: (md) => `${md}\nowner@example.com`,
  SECRET_SHAPED: (md) => `${md}\nAZURE_CLIENT_SECRET=abc123def456`
};
for (const [code, edit] of Object.entries(BAD)) {
  test(`${code}: ${code.replace(/_/g, ' ').toLowerCase()} in the markdown copy`, () => {
    assert.ok(codesOf(edit).has(code), `${code} expected, got ${[...codesOf(edit)].join(', ') || 'nothing'}`);
  });
}

test('the amounts the markdown tables print are group sums of the usage lines, not unknown figures', () => {
  const p = reseal(load());
  const sum = p.options[1].worstCase.usage.filter((u) => /^(?:blob|table|queue)\./.test(u.lineKey)).reduce((s, u) => s + u.cost, 0);
  const md = `${goodMarkdown(p)}\nStorage usage $${(Math.round(sum * 1e8) / 1e8)} and logs $${p.options[1].worstCase.usage.filter((u) => u.lineKey.startsWith('la.')).reduce((s, u) => s + u.cost, 0)}`;
  assert.deepEqual(run(p, { markdown: md }).findings.map((f) => f.code), []);
});

test('split keeps the original line numbers of the prose and separates command fences from other fences', () => {
  const { prose, proseNo, code } = split('a\n```powershell\nx\n```\nb\n```json\n{}\n```\nc');
  assert.deepEqual(prose, ['a', 'b', '{}', 'c']);
  assert.deepEqual(proseNo, [1, 5, 7, 9]);
  assert.deepEqual(code, ['x']);
});

test('a junk packet with a markdown copy reports the missing facts and the checks never throw on missing structures', () => {
  const r = run({}, { markdown: '# x' });
  assert.ok(r.findings.some((f) => f.code === 'MARKDOWN_HEADING_MISSING') && r.findings.some((f) => f.code === 'MARKDOWN_HASH_MISSING'));
  const p = reseal(load());
  p.options = [null, { id: 'A', name: 'x', spendCeilingUsd: 'x', regionCandidates: [null, { region: 'eastus', quotaStatus: 'untested' }], worstCase: { usage: [null, { cost: 'x' }, { lineKey: 'la.x', cost: 1 }] } }, 5];
  for (const k of ['defaultChoice', 'ownerDecisions', 'repositoryState', 'cleanupAndRollback', 'pricing', 'integrity']) p[k] = null;
  const found = run(p, { markdown: goodMarkdown(load()).replace(/\n## 0b[\s\S]*?\n## 1/, '\n## 1') });
  assert.equal(found.ok, false);
  const q = reseal(load());
  q.cleanupAndRollback.teardown = null;
  q.ownerDecisions.decisions = [null, 'x'];
  assert.equal(run(q, { markdown: goodMarkdown(load()) }).ok, false);
});
