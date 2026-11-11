'use strict';
const assert = require('node:assert/strict');
const fixtures = require('../fixtures.js');
const LABELS = [
  ['scope', 'Observation scope'], ['reservation', 'Observed reservation'],
  ['reserved-capacity', 'Reserved capacity — already held'], ['estimated-capacity', 'Estimated capacity — proposed, not held'],
  ['reserved-cost', 'Reserved cost — already held'], ['estimated-cost', 'Estimated cost — proposed, not spent'],
  ['remaining-capacity', 'Remaining own capacity allowance'], ['remaining-cost', 'Remaining own spend allowance'],
  ['active-allowance', 'Active reservation allowance'], ['replay-allowance', 'Lifetime replay-key allowance'],
  ['price', 'Synthetic estimate assumption'], ['cloud-cost', 'Separate cloud estimate'],
  ['cloud-resources', 'Cloud resource assumption'], ['duration', 'Duration assumption'],
  ['comparison', 'C002 capacity assumption'], ['observation', 'As-of / freshness scope'],
  ['assumptions', 'Assumptions and gaps'], ['matrix', 'C003 documented capability boundary'],
  ['provenance', 'Accepted producer source'], ['target', 'Native target'],
  ['producer-outcome', 'Observed producer decision'], ['authority', 'Authority boundary']
];
function expected(name, asOf) {
  const packet = JSON.parse(fixtures[name].text), plan = packet.planResult.plan;
  const unknown = 'Unknown — no verified synthetic observation';
  const inactive = name === 'released' || name === 'expired', missing = name === 'missing', absent = name === 'absent';
  const observation = asOf === undefined ? packet.observedAtMs : asOf;
  const cloud = name === 'unverified' ? '125 USD minor units — unverified; blocked'
    : name === 'native' ? 'Missing — amount unknown / null, not zero'
    : name === 'unknown' ? 'Unknown — amount unknown / null, not zero'
    : 'Not applicable — no cloud execution; amount unknown / null, not zero';
  const values = {
    scope: 'C011 bounded SYNTHETIC in-memory fixture; not Azure inventory, reservation or spend',
    reservation: missing || absent ? unknown : `rsv-00000001 — ${inactive ? name : 'reserved'}`,
    'reserved-capacity': missing || absent ? unknown : `${inactive ? 0 : 3} synthetic units`,
    'estimated-capacity': `${name === 'refused' ? 6 : 2} synthetic units`,
    'reserved-cost': missing || absent ? unknown : `${inactive ? 0 : 12} fictional spend units`,
    'estimated-cost': `${name === 'refused' ? 24 : 8} fictional spend units`,
    'remaining-capacity': missing ? unknown : `${inactive ? 8 : 5} synthetic units`,
    'remaining-cost': missing ? unknown : `${inactive ? 48 : 36} fictional spend units`,
    'active-allowance': missing ? unknown : `${inactive ? 0 : 1} / 20`,
    'replay-allowance': missing ? unknown : '999 remaining / 1000; release does not restore keys',
    price: 'p1: standard at 4 fictional spend units per synthetic unit',
    'cloud-cost': cloud,
    'cloud-resources': ['native', 'unverified'].includes(name) ? 'Unknown — not inventoried' : '0 — explicitly resource-free local cloud scope',
    duration: '30 synthetic comparison seconds; supplied bounds 1..300; native elapsed / billing unknown',
    comparison: JSON.stringify(plan.capacity) + '; synthetic comparison only, not an Azure SKU',
    observation: `Synthetic clock t=${packet.observedAtMs} ms; reviewed at ${observation} ms; maximum age 1000 ms; not current wall-clock inventory`,
    assumptions: 'Fixed C011 p1 prices and own lease caps; C004 explicit local or blocked-native plan. No quote, quota check, cloud inventory, tax, discount or billing-duration verification. Local machine costs unknown.',
    matrix: '17 rows: 2 planned, 9 documented-supported, 4 unsupported, 2 unknown, 0 native-qualified',
    provenance: [
      'C003 1583da90c1013ba95fdf268d6901f8a14bdf900a (kanban/C003/1583da90c101)',
      'C004 a7a980284fd4f46608e82911a5a6242606a13bbd (kanban/C004/a7a980284fd4)',
      'C011 2b7e681098ea463c21cd9e624474d3c26c86440a (kanban/C011/2b7e681098ea)'
    ].join('; '),
    target: 'OS, SKU, subscription, resource group and region: unknown; Node 24 / Express / Linux production design unvalidated; Node 22.23.4 is tooling',
    'producer-outcome': name === 'refused' ? 'C011 LEASE_CAP_EXCEEDED; refused with unchanged books' : 'No proposed reservation executed by this page',
    authority: 'Display / review only — not server consent or permission to run. All Azure, IaC, scaffold, identity, deployment and expenditure flags false; native Azure runs and spend 0 (forbidden, not free).'
  };
  assert.deepEqual(Object.keys(values).sort(), LABELS.map(item => item[0]).sort(), 'oracle covers every labelled output');
  return LABELS.map(([key, label]) => [key, label, values[key]]);
}
function invariant(dom, name = null, asOf) {
  const ids = [...dom.html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'actual markup ids are unique after every action');
  assert.equal((dom.html.match(/role="status"/g) || []).length, 1, 'one polite region after every action');
  assert.equal((dom.html.match(/aria-live="polite"/g) || []).length, 1);
  const rows = dom.rows();
  assert.deepEqual(rows, name ? expected(name, asOf) : [], 'all actual rendered keys labels and values after every action');
  assert.equal(new Set(rows.map(row => row[0])).size, rows.length);
  assert.equal(dom.elements.get('acknowledge').disabled, name !== 'held', 'only useful valid local facts enable review marking');
}
module.exports = { LABELS, expected, invariant };
