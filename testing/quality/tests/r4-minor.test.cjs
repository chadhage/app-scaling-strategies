'use strict';
// N11 to N16: residual spellings and wording, long hex runs, unknown and prototype keys, placeholders with a value, the mutants that survived
// the second review (X03, X16, X20, X22) and the claims of the README.
const fs = require('node:fs');
const path = require('node:path');
const { load, reseal, run, assert, test } = require('./support.cjs');

const GUID = '0123456789abcdef0123456789abcdef';
const dashed = `${GUID.slice(0, 8)}-${GUID.slice(8, 12)}-${GUID.slice(12, 16)}-${GUID.slice(16, 20)}-${GUID.slice(20)}`;
const codes = (r) => new Set(r.findings.map((f) => f.code));
const withRisk = (text) => { const p = load(); p.risksAndAssumptions[0].text = text; return reseal(p); };
const refused = (name, p, wanted) => test(name, () => { const c = codes(run(p)); assert.ok(wanted.some((w) => c.has(w)), `${name}: expected ${wanted.join(' or ')}, got ${[...c].join(', ') || 'no finding'}`); });

// N11: spellings of a GUID that the second version missed.
const spell = (f) => f(dashed.split('-'));
for (const [name, fn] of [
  ['a colon between the groups', (g) => g.join(':')], ['a slash between the groups', (g) => g.join('/')], ['a comma between the groups', (g) => g.join(',')],
  ['a plus between the groups', (g) => g.join('+')], ['HTML entities for the dashes', (g) => g.join('&#45;')], ['percent-encoded dashes', (g) => g.join('%2d')],
  ['a <br> between the groups', (g) => g.join('<br>')], ['quoted groups joined by a plus', (g) => g.map((x) => `'${x}'`).join('+')],
  ['a combining mark after each digit', () => [...GUID].map((c) => `${c}\u0301`).join('')], ['Cyrillic look-alike letters', () => GUID.replace(/a/g, '\u0430').replace(/c/g, '\u0441').replace(/e/g, '\u0435')]
]) refused(`N11: a GUID with ${name} is refused`, withRisk(`id ${spell(fn)}`), ['GUID_FOUND']);

refused('N11: an e-mail with a double at sign is refused', withRisk('write to owner@@example.com'), ['EMAIL_FOUND']);
refused('N11: an e-mail written in words without dot is refused', withRisk('write to owner at example com'), ['EMAIL_FOUND']);
for (const [name, text] of [['Azure enforces the ceiling', 'Azure enforces the ceiling'], ['cannot be exceeded', 'the ceiling cannot be exceeded'], ['Azure will stop spending', 'Azure will stop spending at $5'],
  ['a firm cap', 'a firm cap of $5'], ['capped by Azure', 'capped by Azure at $5']]) refused(`N11: the wording "${name}" is refused`, withRisk(text), ['HARD_WITHOUT_PHRASE']);
for (const [name, text] of [['pending confirmation', 'pending confirmation by the owner'], ['set later', 'placeholder: set later']]) refused(`N11: the wording "${name}" is refused`, withRisk(text), ['UNRESOLVED_WORDING']);
for (const [name, text] of [['Option A approved', 'Option A approved'], ['go ahead and deploy now', 'go ahead and deploy now']]) refused(`N11: the approval prose "${name}" is refused`, withRisk(text), ['APPROVAL_CLAIM']);
for (const text of ['no additional charge', 'gratis', 'complimentary', 'USD 0', 'covered by the plan']) {
  const p = load();
  p.requiredResources.find((r) => r.id === 'STORAGE').pricing = text;
  refused(`N11: a priced storage row that reads "${text}" is refused`, reseal(p), ['ZERO_COST_UNSOURCED']);
}

// N12: only 12-hex abbreviations of a commit id are allowed; a full 40-hex id is documented as refused (a hash and a secret look alike).
test('N12: a 12-hex commit abbreviation is accepted; a full commit id is refused and the README says so', () => {
  assert.equal(codes(run(withRisk('see commit a1b2c3d4e5f6'))).has('GUID_FOUND'), false);
  assert.ok(codes(run(withRisk('see commit a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4'))).has('SECRET_SHAPED'));
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8'), /full commit id[^.]*not allowed|40-hex[^.]*refused/i);
});

// N13: closed key lists for the authority, the options and the decisions; prototype keys; a placeholder that carries a value.
const unknownKey = (get, key) => { const p = load(); get(p)[key] = true; return reseal(p); };
refused('N13 DC21b: an extra key in the authority is refused', unknownKey((p) => p.authority, 'go'), ['UNKNOWN_KEY']);
refused('N13: an extra key in an option is refused', unknownKey((p) => p.options[0], 'approved'), ['UNKNOWN_KEY']);
refused('N13: an extra key in a decision is refused', unknownKey((p) => p.ownerDecisions.decisions[0], 'approved'), ['UNKNOWN_KEY']);
refused('N13 PX03: an own __proto__ key in an option (through JSON text) is refused', reseal(JSON.parse(JSON.stringify(load()).replace(/"options":\[\{/, '"options":[{"__proto__":{"approved":true},'))), ['PROTOTYPE_KEY']);
refused('N13 PX07: an own __proto__ key at the top level (through JSON text) is refused', reseal(JSON.parse(`{"__proto__":{"approved":true},${JSON.stringify(load()).slice(1)}`)), ['PROTOTYPE_KEY']);
refused('N13: an own constructor key is refused', unknownKey((p) => p.pricing, 'constructor'), ['PROTOTYPE_KEY']);
refused('N13 DC17: a placeholder that carries a value is refused', (() => { const p = load(); p.ownerDecisions.answerSheetTemplate.subscriptionId = '<OWNER-SUPPLIED: subscription ID (GUID)=my-subscription-7f3a9c1e>'; return reseal(p); })(), ['PLACEHOLDER_VALUE', 'PLACEHOLDER_REQUIRED']);

// N16: the four gaps and one test per DENY entry inside parentheses.
const manual = (p, step) => p.cleanupAndRollback.deletionOrder[step].commands;
for (const name of ['Remove-Item', 'Clear-Content', 'Stop-Process', 'Disable-Thing', 'Invoke-WebRequest', 'iex', 'icm', 'Start-Process', 'saps', 'cmd', 'pwsh', 'powershell', 'bash', 'sh', 'wsl', 'azd', 'terraform',
  'bicep', 'kubectl', 'gh', 'git', 'node', 'npm', 'curl', 'wget', 'irm', 'iwr', 'del', 'rm', 'rd', 'rmdir', 'erase', 'ri']) {
  const p = load();
  manual(p, 5).push(`Write-Output (${name} x)`);
  refused(`N16: ${name} inside parentheses is a forbidden command`, reseal(p), ['COMMAND_FORBIDDEN']);
}
{
  const p = load();
  p.requiredResources.find((r) => r.id === 'STORAGE').includedInTotals = false;
  refused('N16 X16: a priced resource kept out of the totals is refused', reseal(p), ['RESOURCE_PRICED_NO_LINE']);
  const q = load();
  const arming = q.cleanupAndRollback.armingSequence[4].commands;
  const last = arming.length - 1;
  arming[last] = arming[last].replace(/\{ throw '[^']*' \}/, "{ 'differs' }");
  refused('N16 X20: a registered-trigger check that does not throw is refused', reseal(q), ['ARMING_TRIGGER_NOT_CHECKED']);
  const s = load();
  const script = s.cleanupAndRollback.teardown.job.script;
  const at = script.findIndex((l) => l.includes('$ErrorActionPreference'));
  const stop = script.splice(at, 1)[0];
  script.splice(script.findIndex((l) => l.startsWith('try { Assert-Subscription; Assert-Lease;')) + 1, 0, stop);
  refused('N16 X22: $ErrorActionPreference = Stop after the first delete is refused', reseal(s), ['SCRIPT_NO_STOP']);
}

// N14: the README and the feature file state limits, not absolutes.
test('N14: the README names the validator a tripwire and claims neither linear scanners nor that the CLI catches everything', () => {
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  for (const claim of [/scanners are linear/i, /catches everything/i, /well under a second/i, /rejects an unguarded destructive step/i]) assert.doesNotMatch(readme, claim);
  assert.match(readme, /tripwire/i);
  assert.match(readme, /not a proof/i);
});
