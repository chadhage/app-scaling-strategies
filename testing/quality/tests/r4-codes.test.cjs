'use strict';
// One explicit assertion per new rule code of the fix for the third review (the catalog test requires an asserting line for every code).
const { load, reseal, run, assert, test } = require('./support.cjs');
const { faithfulMarkdown } = require('./md.cjs');

const codesOf = (p, markdown) => new Set(run(reseal(p), markdown === undefined ? {} : { markdown }).findings.map((f) => f.code));
const withMd = (edit) => { const p = load(); return codesOf(p, edit(faithfulMarkdown(p), p)); };
const swap = (md, from, to) => { assert.ok(md.includes(from), `anchor not found: ${from}`); return md.replace(from, () => to); };

test('DISARM_MISSING: a plan without the guarded disarm line', () => {
  const p = load();
  const check = p.cleanupAndRollback.verification[5];
  check.commands = check.commands.filter((l) => !l.includes('Unregister-ScheduledTask'));
  assert.ok(codesOf(p).has('DISARM_MISSING'));
});

test('UNKNOWN_KEY, PROTOTYPE_KEY and PLACEHOLDER_VALUE: the closed keys and the placeholders', () => {
  const a = load();
  a.authority.go = true;
  assert.ok(codesOf(a).has('UNKNOWN_KEY'));
  const b = JSON.parse(JSON.stringify(load()).replace('"pricing":{', '"pricing":{"constructor":1,'));
  assert.ok(codesOf(b).has('PROTOTYPE_KEY'));
  const c = load();
  c.ownerDecisions.answerSheetTemplate.region = '<OWNER-SUPPLIED: one of eastus; region="eastus">';
  assert.ok(codesOf(c).has('PLACEHOLDER_VALUE'));
});

test('MARKDOWN_STATUS, MARKDOWN_HEADER and MARKDOWN_RECOMMENDATION: the status paragraph, the revision line and the recommendation', () => {
  assert.ok(withMd((md) => swap(md, '**Status: proposal only.', '**Status: approved.')).has('MARKDOWN_STATUS'));
  assert.ok(withMd((md, p) => swap(md, `Revision ${p.revision.number}, prepared`, `Revision ${p.revision.number + 1}, prepared`)).has('MARKDOWN_HEADER'));
  assert.ok(withMd((md, p) => swap(md, `Recommendation: ${p.recommendation}`, 'Recommendation: Option C.')).has('MARKDOWN_RECOMMENDATION'));
});

test('MARKDOWN_TABLE_MISMATCH and MARKDOWN_OPTION_MISMATCH: the at-a-glance rows and the option blocks', () => {
  assert.ok(withMd((md) => swap(md, 'P0v3 x 1 (cap 1)', 'P0v3 x 2 (cap 2)')).has('MARKDOWN_TABLE_MISMATCH'));
  assert.ok(withMd((md) => swap(md, '| Instances | 1 steady, cap 1', '| Instances | 2 steady, cap 2')).has('MARKDOWN_OPTION_MISMATCH'));
});

test('MARKDOWN_CODE_ORDER and MARKDOWN_CLAIM: the code blocks in order and the claims in the prose', () => {
  assert.ok(withMd((md) => `${md}\n\`\`\`powershell\nGet-Date\n\`\`\`\n`).has('MARKDOWN_CODE_ORDER'));
  assert.ok(withMd((md) => `${md}\nThe whole run is free of charge.\n`).has('MARKDOWN_CLAIM'));
});

test('INPUT_COMBINING_RUN and INPUT_TOO_LARGE: the markdown has the same caps as the JSON', () => {
  const p = load();
  const MARKS = '\u0345\u0301\u0316\u0f71\u0f72\u0f74\u0315';
  assert.ok(withMd((md) => `${md}\n${MARKS.repeat(6)}`).has('INPUT_COMBINING_RUN'));
  assert.equal(withMd((md) => `${md}\n${MARKS.repeat(4)}`).has('INPUT_COMBINING_RUN'), false, '28 marks are inside the cap');
  const big = `${faithfulMarkdown(p)}\n${'x'.repeat(19000)}\n`.repeat(1);
  assert.ok(codesOf(load(), `${big}${'y'.repeat(999999 - big.length)}`).has('INPUT_TOO_LARGE'), 'together with the strings of the packet the budget is exceeded');
});

// The named findings of the second line of defence and of the shape list: each code is asserted on its own (a mutant that drops one is killed here).
const GUARDED = "if ((az group exists --name $Group --subscription $Subscription) -eq 'false') { Unregister-ScheduledTask -TaskName 'ass-teardown-<lease-id>' -Confirm:$false } else { throw 'the group still exists: the backstop stays armed' }";
const plan = (p) => p.cleanupAndRollback;
const manual = (p, step) => plan(p).deletionOrder[step].commands;
const find = (lines, text) => lines.findIndex((l) => l.includes(text));

test('DISARM_UNGUARDED and DISARM_MISPLACED: an unguarded disarm and a guarded one in the wrong section', () => {
  const a = load();
  plan(a).verification[5].commands.push("Unregister-ScheduledTask -TaskName 'ass-teardown-<lease-id>' -Confirm:$false");
  assert.ok(codesOf(a).has('DISARM_UNGUARDED'));
  const b = load();
  manual(b, 5).push(GUARDED);
  assert.ok(codesOf(b).has('DISARM_MISPLACED'));
  assert.equal(codesOf(b).has('DISARM_UNGUARDED'), false, 'the line itself is guarded');
  const c = load();
  plan(c).verification[5].commands.push(GUARDED);
  assert.ok(codesOf(c).has('DISARM_DUPLICATE'), 'a second guarded disarm');
});

test('DUPLICATE_OPTION: a repeated option, short or long, is named', () => {
  const p = load();
  manual(p, 5)[0] = manual(p, 5)[0].replace('--name $Group', '--name $Group -n other-rg');
  assert.ok(codesOf(p).has('DUPLICATE_OPTION'));
});

test('GUARD_REDEFINED, LEASE_VARIABLE_REASSIGNED and INDIRECTION: the second line of defence names the bypasses', () => {
  const a = load();
  manual(a, 0).push('function Assert-Lease { }');
  assert.ok(codesOf(a).has('GUARD_REDEFINED'));
  const a2 = load();
  manual(a2, 0).push('function az { }');
  assert.ok(codesOf(a2).has('GUARD_REDEFINED'));
  const a3 = load();
  manual(a3, 0).push('Set-Alias az Remove-Item');
  assert.ok(codesOf(a3).has('GUARD_REDEFINED'));
  const a4 = load();
  const at = find(manual(a4, 0), 'function Assert-Subscription');
  manual(a4, 0).splice(at, 0, 'Assert-Subscription');
  assert.ok(codesOf(a4).has('GUARD_REDEFINED'), 'used before it is defined');
  const b = load();
  manual(b, 1).unshift("$Group = 'other'");
  assert.ok(codesOf(b).has('LEASE_VARIABLE_REASSIGNED'));
  const c = load();
  manual(c, 5).push("[ScriptBlock]::Create('x').Invoke()");
  assert.ok(codesOf(c).has('INDIRECTION'));
  const d = load();
  manual(d, 5).push("Write-Output 'az group delete --name other-rg --yes'");
  assert.ok(codesOf(d).has('INDIRECTION'), 'a string literal that carries a delete');
});

test('UNKNOWN_STATEMENT_SHAPE, SECTION_SHAPE_SEQUENCE and SCRIPT_ALARM_PATH: the closed list of shapes', () => {
  const a = load();
  manual(a, 1).push('Get-Date');
  assert.ok(codesOf(a).has('UNKNOWN_STATEMENT_SHAPE'));
  const b = load();
  const lines = manual(b, 1);
  [lines[0], lines[1]] = [lines[1], lines[0]];
  const found = codesOf(b);
  assert.ok(found.has('SECTION_SHAPE_SEQUENCE'), 'two reviewed lines in the wrong order');
  assert.equal(found.has('UNKNOWN_STATEMENT_SHAPE'), false, 'every line is a reviewed shape');
  const c = load();
  const script = plan(c).teardown.job.script;
  script[find(script, '[string]$AlarmDir')] = "  [string]$AlarmDir = (Join-Path $env:USERPROFILE 'Desktop')";
  assert.ok(codesOf(c).has('SCRIPT_ALARM_PATH'));
  const d = load();
  const s = plan(d).teardown.job.script;
  s.splice(find(s, 'foreach ($candidate in'), 1);
  assert.ok(codesOf(d).has('SCRIPT_ALARM_PATH'), 'no fallback folders');
});
