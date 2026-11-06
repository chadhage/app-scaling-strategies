'use strict';
// V4/V10 (delete and subscription guards over every command), A1 to A5 (arming and unattended teardown): hostile plans accepted wrongly before.
const { reject, accept } = require('./hostile.cjs');

const cr = (p) => p.cleanupAndRollback;
const del = (p, n) => cr(p).deletionOrder.find((s) => s.n === n);
const script = (p) => cr(p).teardown.job.script;
const edit = (lines, from, to) => lines.map((l) => l.split(from).join(to));
const GUARDED = ['DELETE_UNGUARDED', 'DELETE_TARGET', 'DELETE_OUTSIDE_COMMANDS', 'COMMAND_FORBIDDEN', 'COMMAND_DYNAMIC', 'PLAN_SHAPE', 'AZ_COMMAND_NOT_ALLOWED', 'AZ_NO_SUBSCRIPTION'];
const GROUP_DELETE = 'az group delete --name $Group --yes --subscription $Subscription';
const FINAL = (p) => `Assert-Subscription; Assert-Lease; ${GROUP_DELETE}`;
// Spellings that are guarded deletes when the guard calls stand in front of them: the unguarded form must be rejected.
const NO_GUARD = new Set(['upper verb', 'az.cmd', 'az.exe']);

// ---- V4: the delete must name the guarded target and carry its own preceding guards
reject('V4 target', 'a delete of another resource group in a step that keeps its guard calls', (p) => { del(p, 5).commands = [FINAL(p).replace('$Group', 'rg-someone-elses')]; }, ['DELETE_TARGET']);
reject('V4 target', 'a delete of a resource-level command in another group', (p) => { del(p, 1).commands = edit(del(p, 1).commands, '--resource-group $Group', '--resource-group rg-other'); }, ['DELETE_TARGET']);
reject('V4 target', 'a delete in another subscription', (p) => { del(p, 5).commands = [FINAL(p).replace('--subscription $Subscription', '--subscription other-subscription')]; }, ['DELETE_TARGET', 'AZ_NO_SUBSCRIPTION']);
reject('V4 target', 'a role assignment delete scoped to another group', (p) => { del(p, 4).commands = edit(del(p, 4).commands, 'resourceGroups/$Group', 'resourceGroups/rg-other'); }, ['DELETE_TARGET']);
reject('V4 shape', 'commands given as a string', (p) => { del(p, 5).commands = FINAL(p); }, GUARDED);
reject('V4 shape', 'the old command field holding an array', (p) => { const s = del(p, 5); s.command = [GROUP_DELETE]; s.commands = []; }, GUARDED);
reject('V4 shape', 'a field named cmds', (p) => { const s = del(p, 5); s.cmds = [GROUP_DELETE]; s.commands = []; }, GUARDED);
reject('V4 shape', 'a delete in the why text only', (p) => { const s = del(p, 5); s.why = 'then run az group delete --name prod-rg --yes'; s.commands = []; }, GUARDED);
reject('V4 shape', 'a delete in the how field of a verification step', (p) => { cr(p).verification[0].how = 'az group delete --name prod-rg'; }, GUARDED);
for (const [where, mutate] of Object.entries({
  risk: (p) => { p.risksAndAssumptions[0].text = 'cleanup: az group delete --name prod-rg --yes'; }, backstop: (p) => { cr(p).teardown.backstops[0] = 'az group delete --name prod-rg --yes'; },
  manual: (p) => { cr(p).manualBeforeDeletion.action = 'then az group delete --name prod-rg --yes'; }, title: (p) => { p.title = 'run az group delete --name prod-rg --yes'; }
})) reject('V4 prose', `an unguarded delete in a ${where} text`, mutate, ['DELETE_OUTSIDE_COMMANDS']);
for (const [name, line] of Object.entries({
  'Remove-AzResourceGroup': 'Remove-AzResourceGroup -Name $Group -Force', 'REST delete': "Invoke-RestMethod -Method Delete -Uri 'https://management.azure.com/x'", 'complete mode': 'az deployment group create --resource-group $Group --mode Complete --template-file t.bicep --subscription $Subscription',
  'Invoke-Expression': "Invoke-Expression ('az group ' + 'delete --name ' + $Group)", 'verb variable': "$v = 'delete'; az group $v --name $Group --yes --subscription $Subscription", 'upper verb': 'az group DELETE --name $Group --yes --subscription $Subscription',
  'az.cmd': 'az.cmd group delete --name $Group --yes --subscription $Subscription', 'az.exe': 'az.exe group delete --name $Group --yes --subscription $Subscription', 'here-string': "Invoke-Expression @'\naz group delete --name $Group --yes\n'@",
  'azd': 'azd down --force', 'terraform': 'terraform destroy -auto-approve', 'resource delete': 'az resource delete --ids x --subscription $Subscription', 'webapp stop': 'Stop-AzWebApp -Name x', 'rest method': 'az rest --method delete --url https://management.azure.com/x'
})) reject('V4 forms', `${name} ${NO_GUARD.has(name) ? 'without' : 'with'} the guard calls in front`, (p) => { del(p, 5).commands = [`${NO_GUARD.has(name) ? '' : 'Assert-Subscription; Assert-Lease; '}${line}`]; }, GUARDED);
reject('V4 order', 'a continuation that splits the delete over two elements', (p) => { del(p, 5).commands = ['az group `', 'delete --name $Group --yes --subscription $Subscription']; }, ['DELETE_UNGUARDED']);
reject('V4 order', 'the guards placed after the delete', (p) => { del(p, 5).commands = [GROUP_DELETE, 'Assert-Subscription; Assert-Lease']; }, ['DELETE_UNGUARDED']);
reject('V4 order', 'one guard line for two deletes', (p) => { del(p, 1).commands = ['Assert-Subscription; Assert-Lease', ...del(p, 1).commands.map((c) => c.replace('Assert-Subscription; Assert-Lease; ', ''))]; }, ['DELETE_UNGUARDED']);
reject('V4 order', 'a delete behind || (it would run when the guard fails)', (p) => { del(p, 5).commands = [`Assert-Subscription; Assert-Lease || ${GROUP_DELETE}`]; }, ['DELETE_UNGUARDED']);
accept('V4 order', 'a delete chained after && behind its guards', (p) => { del(p, 5).commands = [`Assert-Subscription && Assert-Lease && ${GROUP_DELETE}`]; });
reject('V4 manual', 'the manual block without inline guards (A5)', (p) => { for (const n of [1, 2, 3, 4, 5]) del(p, n).commands = edit(del(p, n).commands, 'Assert-Subscription; Assert-Lease; ', ''); }, ['DELETE_UNGUARDED']);
reject('V4 manual', 'the manual block without the guard functions (A5)', (p) => { del(p, 0).commands = del(p, 0).commands.filter((c) => !/^function|^\s|^}/.test(c)); }, ['DELETE_UNGUARDED', 'SCRIPT_GUARD_FUNCTION']);
reject('V4 manual', 'a manual block that guards only the group delete', (p) => { del(p, 1).commands = edit(del(p, 1).commands, 'Assert-Lease; ', ''); }, ['DELETE_UNGUARDED']);

// ---- V10: every az command carries its own --subscription with the approved value
for (const [name, line] of Object.entries({
  'az.cmd': 'az.cmd group show --name <rg>', 'shared flag after &&': 'az group exists --name <rg> --subscription <subscription-id> && az group show --name <rg>', 'shared flag after a pipe': 'az group show --name <rg> --subscription <subscription-id> | az group list',
  'empty value': 'az group show --name <rg> --subscription ""', 'empty equals': 'az group show --name <rg> --subscription=', 'other value': 'az group show --name <rg> --subscription other-subscription', 'bare flag': 'az group show --name <rg> --subscription',
  'account set': 'az account set --subscription <subscription-id>', 'az login': 'az login', 'az.exe chain': 'az.exe group list; az.exe group show --name <rg>'
})) reject('V10 pin', name, (p) => { cr(p).verification[0].commands.push(line); }, ['AZ_NO_SUBSCRIPTION', 'AZ_COMMAND_NOT_ALLOWED']);
accept('V10 pin', 'the flag in another case and with =', (p) => { cr(p).verification[0].commands.push('az group show --name <rg> --SUBSCRIPTION=<subscription-id>'); });

// ---- A1 to A3: arming
reject('A1 quota gate', 'validate and what-if with --location only', (p) => { cr(p).armingSequence[2].commands = cr(p).armingSequence[2].commands.map((c) => c.replace(/ --parameters \S+ \S+ \S+/, '')); }, ['ARMING_QUOTA_PARAMETERS']);
reject('A1 quota gate', 'parameters that do not carry the SKU', (p) => { cr(p).armingSequence[2].commands = cr(p).armingSequence[2].commands.map((c) => c.replace('<sku-parameter>=<sku>', '')); }, ['ARMING_QUOTA_PARAMETERS']);
reject('A1 arming', 'the exists gate after the create inside one step', (p) => { const a = cr(p).armingSequence; a[5].commands = [...a[5].commands, ...a[1].commands]; a[1].commands = []; }, ['ARMING_ORDER', 'ARMING_NO_EXISTS_GATE']);
reject('A1 arming', 'the job registration only as a word in a comment', (p) => { cr(p).armingSequence[4].commands = ['# Register-ScheduledTask later']; }, ['ARMING_NO_JOB']);
reject('A1 arming', 'the tags only in the group name text', (p) => { cr(p).armingSequence[5].commands = ['az group create --name lease-id=x-lease-expires-utc --location <region> --subscription <subscription-id>']; }, ['ARMING_TAGS']);
reject('A2 culture', 'a ToString format without InvariantCulture', (p) => { cr(p).armingSequence[3].commands = edit(cr(p).armingSequence[3].commands, ", [Globalization.CultureInfo]::InvariantCulture", ''); }, ['TIME_NOT_INVARIANT']);
reject('A2 culture', 'a Parse without InvariantCulture', (p) => { cr(p).armingSequence[4].commands = cr(p).armingSequence[4].commands.map((c) => c.replace('[DateTimeOffset]::Parse($expires, [Globalization.CultureInfo]::InvariantCulture)', '[DateTimeOffset]::Parse($expires)')); }, ['TIME_NOT_INVARIANT']);
reject('A3 trigger', 'a registration check that never reads or compares the trigger time', (p) => { cr(p).armingSequence[4].commands = cr(p).armingSequence[4].commands.filter((c) => !/registered|StartBoundary/.test(c)); }, ['ARMING_TRIGGER_NOT_CHECKED']);

// ---- V4 and A4: the unattended script
const s0 = (p) => script(p);
reject('V4 script', 'an Assert-Subscription inside if ($false) on a line of its own', (p) => { s0(p).splice(s0(p).findIndex((l) => l.includes('group delete')), 0, 'if ($false) { Assert-Subscription }'); const i = s0(p).findIndex((l) => l.includes('group delete')); s0(p)[i] = s0(p)[i].replace('Assert-Subscription; ', ''); }, ['SCRIPT_DELETE_UNGUARDED']);
reject('V4 script', 'the guard calls only inside an if ($false) block on the delete line', (p) => { const i = s0(p).findIndex((l) => l.includes('group delete')); s0(p)[i] = s0(p)[i].replace('Assert-Subscription; Assert-Lease;', 'if ($false) { Assert-Subscription; Assert-Lease };'); }, ['SCRIPT_DELETE_UNGUARDED']);
reject('V4 script', 'an empty guard function with the check in a comment', (p) => { const i = s0(p).indexOf('function Assert-Subscription {'); s0(p)[i + 1] = '  # az account show --query id -o tsv -ne $Subscription throw'; }, ['SCRIPT_GUARD_FUNCTION']);
reject('V4 script', 'a guard that writes instead of throwing', (p) => { s0(p).forEach((l, i) => { s0(p)[i] = l.replace("throw 'G3:", "Write-Output 'G3:"); }); }, ['SCRIPT_GUARD_FUNCTION']);
reject('V4 script', 'a delete on another group than the one the guard verified', (p) => { const i = s0(p).findIndex((l) => l.includes('group delete')); s0(p)[i] = s0(p)[i].replace('--name $Group', '--name rg-other'); }, ['DELETE_TARGET', 'SCRIPT_DELETE_UNGUARDED']);
reject('V4 script', 'the guard word only inside a string before the delete', (p) => { const i = s0(p).findIndex((l) => l.includes('group delete')); s0(p)[i] = s0(p)[i].replace('Assert-Subscription; Assert-Lease;', "'Assert-Subscription; Assert-Lease';"); }, ['SCRIPT_DELETE_UNGUARDED']);
reject('V4 script', 'ErrorActionPreference never set to Stop', (p) => { s0(p).forEach((l, i) => { s0(p)[i] = l.replace("$ErrorActionPreference = 'Stop'; ", ''); }); }, ['SCRIPT_NO_STOP']);
reject('V4 script', 'a catch block that swallows the error', (p) => { s0(p).forEach((l, i) => { s0(p)[i] = l.replace(/catch \{ \$failures\.Add\("web app: [^}]*\}$/, 'catch { }'); }); }, ['SCRIPT_CATCH_SILENT']);
reject('A4 script', 'deletes that are not wrapped (stop at the first failure)', (p) => { s0(p).forEach((l, i) => { s0(p)[i] = l.replace(/^try \{ (Assert-Subscription; Assert-Lease; az [^}]*) \} catch \{.*$/, '$1'); }); }, ['SCRIPT_DELETE_NOT_WRAPPED']);
reject('A4 script', 'no final group delete', (p) => { cr(p).teardown.job.script = s0(p).filter((l) => !l.includes('az group delete')); }, ['SCRIPT_NO_FINAL_GROUP_DELETE']);
reject('A4 script', 'an early exit before the group delete', (p) => { const i = s0(p).findIndex((l) => l.includes('az appservice plan delete')); s0(p).splice(i, 0, 'exit 1'); }, ['SCRIPT_NO_FINAL_GROUP_DELETE']);
reject('A4 script', 'a group delete that only runs when the plan delete succeeded', (p) => { const i = s0(p).findIndex((l) => l.includes('az group delete')); s0(p)[i] = `if ($failures.Count -eq 0) { ${s0(p)[i]} }`; }, ['SCRIPT_NO_FINAL_GROUP_DELETE']);
reject('A4 script', 'no non-zero exit', (p) => { cr(p).teardown.job.script = s0(p).filter((l) => !/exit 1/.test(l)); }, ['SCRIPT_NO_FAILURE_EXIT']);
reject('A4 script', 'no persistent alarm file', (p) => { cr(p).teardown.job.script = s0(p).filter((l) => !/Set-Content/.test(l)); }, ['SCRIPT_NO_ALARM_FILE']);
reject('A4 script', 'no statement of what the job cannot guarantee', (p) => { delete cr(p).teardown.limits; }, ['TEARDOWN_LIMITS_MISSING']);
