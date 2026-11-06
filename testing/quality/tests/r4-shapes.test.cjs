'use strict';
// Hostile fixtures of the third review (N1, N2, N4 to N6, N10): every case mutates the accepted fixture, re-seals it and must be refused by name.
// The mutations use regular-expression anchors that exist in revision 3 and in revision 4 of the packet, so the same cases are the RED against
// the published validator (which accepts them) and the GREEN against the closed-shape validator.
const { load, reseal, run, assert, test } = require('./support.cjs');
const { faithfulMarkdown } = require('./md.cjs');

const cr = (p) => p.cleanupAndRollback;
const script = (p) => cr(p).teardown.job.script;
const manual = (p, step) => cr(p).deletionOrder[step].commands;
const idx = (lines, text) => { const i = lines.findIndex((l) => l.includes(text)); if (i < 0) throw new Error(`anchor not found: ${text}`); return i; };
const sub = (lines, from, to) => { const i = idx(lines, from); lines[i] = lines[i].replace(from, () => to); };
const insertBefore = (lines, text, ...add) => lines.splice(idx(lines, text), 0, ...add);
const UNREG = "Unregister-ScheduledTask -TaskName 'ass-teardown-<lease-id>' -Confirm:$false";
const SHAPE = ['UNKNOWN_STATEMENT_SHAPE', 'SECTION_SHAPE_SEQUENCE'];

function reject(name, mutate, codes) {
  test(`hostile: ${name}`, () => {
    const p = load();
    mutate(p);
    reseal(p);
    const r = run(p, { markdown: faithfulMarkdown(p) });
    assert.equal(r.ok, false, `${name}: accepted although it must be refused`);
    assert.ok(r.findings.some((f) => codes.includes(f.code)), `${name}: expected ${codes.join(' or ')}, got ${[...new Set(r.findings.map((f) => f.code))].join(', ')}`);
  });
}

test('control: the unmodified fixture and its faithful markdown are accepted', () => {
  const p = load();
  assert.deepEqual(run(p, { markdown: faithfulMarkdown(p) }).findings, []);
});

// N4: az (argparse) keeps the LAST occurrence of a repeated option, so a guarded first occurrence proves nothing.
const DUP = ['DUPLICATE_OPTION'];
reject('N4 H1a: group delete in the script with a second --name', (p) => sub(script(p), '--yes --subscription $Subscription } catch', '--yes --subscription $Subscription --name other-rg } catch'), DUP);
reject('N4 H1b: group delete in the script with a second --subscription', (p) => sub(script(p), 'az group delete --name $Group --yes --subscription $Subscription', 'az group delete --name $Group --yes --subscription $Subscription --subscription other-sub'), DUP);
reject('N4 H1c: manual group delete with -n after --name', (p) => sub(manual(p, 5), '--name $Group', '--name $Group -n other-rg'), DUP);
reject('N4 DL12: duplicate --resource-group in the manual web app delete', (p) => sub(manual(p, 1), 'az webapp delete --resource-group $Group', 'az webapp delete --resource-group $Group --resource-group other-rg'), DUP);
reject('N4 DL16: -g after --resource-group', (p) => sub(manual(p, 1), 'az webapp delete --resource-group $Group', 'az webapp delete --resource-group $Group -g other-rg'), DUP);
reject('N4 DL17: --name=value twice', (p) => sub(manual(p, 5), '--name $Group', '--name=$Group --name=other-rg'), DUP);
reject('N4: an empty duplicate --subscription', (p) => sub(manual(p, 5), '--subscription $Subscription', '--subscription $Subscription --subscription ""'), DUP);
reject('N4: a duplicate in another case', (p) => sub(manual(p, 5), '--name $Group', '--name $Group --NAME other-rg'), DUP);
reject('N4 SP22: the guard command az group show with --subscription twice', (p) => sub(cr(p).guards[2].commands, '-o json', '-o json --subscription other-sub'), DUP);

// N5: guard functions are defined once, before their first use, and nothing reassigns the lease variables.
reject('N5 H2a: Assert-Lease redefined as an empty function after the guards', (p) => manual(p, 0).push('function Assert-Lease { }'), [...SHAPE, 'GUARD_REDEFINED']);
reject('N5 H2b: both guards redefined as empty functions before the first try of the script', (p) => insertBefore(script(p), 'try {', 'function Assert-Subscription { }', 'function Assert-Lease { }'), [...SHAPE, 'GUARD_REDEFINED']);
reject('N5 H3: $Group reassigned between the guards and the delete', (p) => sub(script(p), 'Assert-Lease; az group delete', "Assert-Lease; $Group = 'other-rg'; az group delete"), [...SHAPE, 'LEASE_VARIABLE_REASSIGNED']);
reject('N5 U54b: $Subscription reassigned in the manual block', (p) => sub(manual(p, 5), 'Assert-Lease; az group delete', "Assert-Lease; $Subscription = 'other'; az group delete"), [...SHAPE, 'LEASE_VARIABLE_REASSIGNED']);
reject('N5: $Lease reassigned after step 0', (p) => manual(p, 1).unshift("$Lease = 'x'"), [...SHAPE, 'LEASE_VARIABLE_REASSIGNED']);
reject('N5: a function named az', (p) => manual(p, 0).push('function az { }'), SHAPE);
reject('N5: an alias for az', (p) => manual(p, 0).push('Set-Alias az Remove-Item'), SHAPE);
reject('N5: a filter named like a guard', (p) => manual(p, 0).push('filter Assert-Lease { }'), SHAPE);

// N6: indirection hides a delete: nothing but the closed list of statement shapes runs inside a guarded step.
const DELETE_TEXT = 'az group delete --name other-rg --yes';
const IND = [...SHAPE, 'INDIRECTION'];
reject('N6 H4: [System.Diagnostics.Process]::Start', (p) => manual(p, 5).push(`[System.Diagnostics.Process]::Start('az', 'group delete --name other-rg --yes')`), IND);
reject('N6 H5: [ScriptBlock]::Create(...).Invoke()', (p) => manual(p, 5).push(`[ScriptBlock]::Create('${DELETE_TEXT}').Invoke()`), IND);
reject('N6 U44: InvokeScript', (p) => manual(p, 5).push(`$ExecutionContext.InvokeCommand.InvokeScript('${DELETE_TEXT}')`), IND);
reject('N6 U34: Set-Content a script and run it', (p) => manual(p, 5).push(`Set-Content x.ps1 '${DELETE_TEXT}'`, '.\\x.ps1'), IND);
reject('N6 U35: dot-sourcing', (p) => manual(p, 5).push('. .\\x.ps1'), IND);
reject('N6: Invoke-Expression', (p) => manual(p, 5).push(`Invoke-Expression '${DELETE_TEXT}'`), IND);
reject('N6: iex with a variable', (p) => manual(p, 5).push('$c = "az group delete --name other-rg --yes"', 'iex $c'), IND);
reject('N6 U11: a here-string around the delete', (p) => manual(p, 5).push("@'", DELETE_TEXT, "'@"), IND);
reject('N6: a string literal that carries a delete', (p) => manual(p, 5).push(`Write-Output '${DELETE_TEXT}'`), IND);

// N10: positive requirements on the unattended script.
reject('N10 H7: the alarm folder is a literal path', (p) => sub(script(p), '[string]$AlarmDir =', "[string]$AlarmDir = 'C:\\Users\\someone\\Desktop' #"), [...SHAPE, 'SCRIPT_ALARM_PATH']);
reject('N10 H8: the final existence check removed', (p) => script(p).splice(idx(script(p), 'the group still exists after its delete'), 1), SHAPE);
reject('N10 H9: every catch records into a variable nobody reads', (p) => { p.cleanupAndRollback.teardown.job.script = script(p).map((l) => l.split('$failures.Add(').join('$nobody.Add(')); }, SHAPE);
reject('N10 SC05b: $ErrorActionPreference reset after the Stop line', (p) => script(p).splice(idx(script(p), 'ErrorActionPreference') + 1, 0, "$ErrorActionPreference = 'Continue'"), SHAPE);
reject('N10 SC04c: -ine instead of -cne for the lease id', (p) => sub(script(p), '-cne $Lease', '-ine $Lease'), SHAPE);
reject('N10 SC11b: exit 1 unconditionally at the end', (p) => { script(p)[script(p).length - 1] = 'exit 1'; }, SHAPE);
reject('N10: a silent catch', (p) => sub(script(p), 'catch { $failures.Add("slot:', 'catch { <# #> } #'), SHAPE);

// N2: the disarm of the only automatic backstop exists once, after the verification, and only behind az group exists = false.
const DISARM = ['DISARM_UNGUARDED', 'DISARM_MISPLACED', 'DISARM_DUPLICATE'];
reject('N2 UN1: an unguarded Unregister-ScheduledTask in the middle of the pasted block', (p) => manual(p, 5).unshift(UNREG), DISARM);
reject('N2 UN2: an unguarded Unregister-ScheduledTask as the first statement of the script', (p) => script(p).unshift(UNREG), DISARM);
reject('N2: the disarm as the last line of the pasted block (revision 3)', (p) => { manual(p, 6).push(UNREG); }, DISARM);
reject('N2: Disable-ScheduledTask in a verification step', (p) => cr(p).verification[1].commands.push("Disable-ScheduledTask -TaskName 'ass-teardown-<lease-id>'"), DISARM);
reject('N2: Stop-ScheduledTask in the script', (p) => script(p).unshift("Stop-ScheduledTask -TaskName 'ass-teardown-<lease-id>'"), DISARM);
reject('N2: schtasks /delete', (p) => manual(p, 5).push('schtasks /delete /tn ass-teardown-<lease-id> /f'), DISARM);

test('N2: the disarm of revision 4 is guarded, single and after the checks; a second guarded copy is refused', () => {
  const p = load();
  const all = [...cr(p).deletionOrder, ...cr(p).verification, ...cr(p).armingSequence].flatMap((s) => s.commands);
  const unreg = all.filter((l) => /Unregister-ScheduledTask/.test(l));
  assert.equal(unreg.length, 1);
  assert.match(unreg[0], /^if \(\(az group exists --name \$Group --subscription \$Subscription\) -eq 'false'\) \{ Unregister-ScheduledTask .* \} else \{ throw '[^']+' \}$/);
  assert.equal(cr(p).deletionOrder.flatMap((s) => s.commands).filter((l) => /Unregister/.test(l)).length, 0, 'the pasted block must not carry the disarm');
  const q = load();
  cr(q).verification[5].commands.push(unreg[0]);
  reseal(q);
  const r = run(q);
  assert.ok(r.findings.some((f) => f.code === 'DISARM_DUPLICATE'), 'a second guarded disarm must be refused');
});

// N1: revision 3 itself (kept as a fixture) carries the defects of the review.
test('N1 and N2: revision 3 is refused for its alarm path and its unguarded disarm', () => {
  const p = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'fixtures', 'packet-revision-3.json'), 'utf8'));
  const codes = new Set(run(p, { markdown: faithfulMarkdown(p) }).findings.map((f) => f.code));
  assert.ok(codes.has('SCRIPT_ALARM_PATH'), 'N1: the alarm folder built by hand must be refused');
  assert.ok(DISARM.some((c) => codes.has(c)), 'N2: the unguarded disarm in the pasted block must be refused');
});
