'use strict';
// N9: the markdown copy is compared with the JSON (status line, at-a-glance table, option blocks, decisions, recommendation, code blocks in order) and
// scanned with the wording rules; every hostile edit of the third review must fail by name, the faithful copy must pass.
const { load, run, assert, test } = require('./support.cjs');
const { faithfulMarkdown } = require('./md.cjs');

const MD = /^(?:MARKDOWN_|APPROVAL_CLAIM)/;
const first = (md, from, to) => { if (!md.includes(from)) throw new Error(`anchor not found: ${from}`); return md.replace(from, () => to); };
const lines = (md) => md.split('\n');
const after = (md, anchor, ...add) => { const l = lines(md); const i = l.findIndex((x) => x.startsWith(anchor)); if (i < 0) throw new Error(`anchor not found: ${anchor}`); l.splice(i + 1, 0, ...add); return l.join('\n'); };
const swap = (md, a, b) => { const l = lines(md); const i = l.findIndex((x) => a.test(x)); const j = l.findIndex((x) => b.test(x)); if (i < 0 || j < 0) throw new Error('anchor not found'); [l[i], l[j]] = [l[j], l[i]]; return l.join('\n'); };

function refuse(name, edit) {
  test(`markdown refuses ${name}`, () => {
    const p = load();
    const r = run(p, { markdown: edit(faithfulMarkdown(p), p) });
    assert.equal(r.ok, false, `${name}: accepted although the markdown differs from the JSON`);
    assert.ok(r.findings.some((f) => MD.test(f.code)), `${name}: expected a MARKDOWN_ finding, got ${[...new Set(r.findings.map((f) => f.code))].join(', ')}`);
  });
}

test('markdown: the faithful copy of the fixture is accepted', () => {
  const p = load();
  assert.deepEqual(run(p, { markdown: faithfulMarkdown(p) }).findings, []);
});

// Inserted claims (K1 to K3, H11, MD36).
refuse('an inserted "Status: approved." line', (md) => after(md, '**Status', 'Status: approved.'));
refuse('an inserted "Approval granted: yes. Run authorised." line', (md) => after(md, '**Status', 'Approval granted: yes. Run authorised.'));
refuse('an inserted "No approval is needed; the run is free." line', (md) => after(md, '**Status', 'No approval is needed; the run is free.'));
refuse('an inserted "free of charge: $0" line', (md) => after(md, '**Status', 'The whole native proof is free of charge: $0.'));
refuse('an inserted "costs nothing" line', (md) => after(md, '**Status', 'The whole native proof costs nothing.'));
refuse('an appended "free" claim', (md) => `${md}\nThe run is free.`);
refuse('the status line turned into approved (MD08)', (md) => first(md, '**Status: proposal only. Nothing here is an approval.**', '**Status: approved.**'));
refuse('a second status line that says proposal only (a duplicate)', (md) => after(md, '**Status', '**Status: proposal only. Nothing here is an approval.**'));

// A contradicting recommendation (MD44, H13).
refuse('an inserted contradicting recommendation', (md) => after(md, 'Recommendation:', 'Recommendation: Option C in centralus with P2v3 instances.'));
refuse('a replaced recommendation', (md, p) => first(md, `Recommendation: ${p.recommendation}`, 'Recommendation: Option C in centralus with P2v3 instances.'));

// Replaced figures in tables (MD06b, MD06c, MD45, MD46) and option blocks.
refuse('a price replaced by another number of the JSON (MD06b)', (md) => first(md, '| $0.0775 |', '| $0.085 |'));
refuse('a worst-case unit price replaced by another existing price (MD06c)', (md) => first(md, '| $0.085 | $0.595 |', '| $0.0775 | $0.595 |'));
refuse('the at-a-glance plan size of option A changed (MD45)', (md) => first(md, 'P0v3 x 1 (cap 1)', 'P0v3 x 3 (cap 5)'));
refuse('the at-a-glance expected run of option A changed from 3 h to 30 h (MD46)', (md) => first(md, '| 3 h |', '| 30 h |'));
refuse('the instances row of option A changed', (md) => first(md, '| Instances | 1 steady, cap 1', '| Instances | 2 steady, cap 3'));
refuse('the plan row of option A names another SKU', (md) => first(md, 'Plan - Linux: P0v3 (', 'Plan - Linux: P2 v3 ('));
refuse('the expected run row of option A changed', (md) => first(md, '3 h: ', '30 h: '));
refuse('the region candidates of option A changed', (md) => first(md, '| Region candidates | eastus2, eastus,', '| Region candidates | centralus, eastus,'));
refuse('a region price row of option A changed', (md) => first(md, '| eastus2 | $0.0775 (eff', '| eastus2 | $0.0975 (eff'));
refuse('the spend ceiling row of option A changed', (md) => first(md, '$5.00 (500 USD cents', '$15.00 (1500 USD cents'));
refuse('a missing option block', (md) => first(md, '### Option B:', '### Notes on B:'));

// Price expiry variants (MD41).
refuse('a second, contradicting expiry date', (md) => `${md}\nThe prices stay usable until 2026-12-31.`);
refuse('another expiry in the header', (md, p) => first(md, `usable until ${new Date(Date.parse(`${p.pricing.pricingDateUtc}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10)}`, 'usable until 2026-12-31'));

// Code blocks are compared in order (MD30, MD31, MD32), not as a set.
refuse('script lines reordered in the markdown (MD30)', (md) => swap(md, /^try \{ Assert-Subscription; Assert-Lease; az webapp deployment slot delete /, /^try \{ Assert-Subscription; Assert-Lease; az group delete /));
refuse('a line moved elsewhere in the markdown code (MD31)', (md) => swap(md, /^az account show --query id -o tsv$/, /^az group show --name <rg> --subscription <subscription-id> -o json$/));
refuse('the deletion lines reordered (MD32)', (md) => swap(md, /^Assert-Subscription; Assert-Lease; az webapp delete /, /^Assert-Subscription; Assert-Lease; az group delete /));
refuse('a code line duplicated', (md) => first(md, 'exit 0\n', 'exit 0\nexit 0\n'));
