'use strict';
// Closed statement shapes (N4, N5, N6, N10, N2): the code of the plan (guards, arming, guard functions, deletion block, verification, rollback and the
// unattended teardown script) is a CLOSED list. Every line of every container must match one of the shapes below (literal text with slots whose
// vocabularies are closed lists) and the sequence of shapes of each container must be the reviewed one. A duplicated option, a redefined guard, a
// reassigned lease variable, an indirection, a second disarm or any other statement matches no shape and is refused by construction
// (UNKNOWN_STATEMENT_SHAPE, SECTION_SHAPE_SEQUENCE); the rules of rules-commands.cjs are the second line of defence and give the named findings.
// This is a tripwire for accidental edits and for these shapes, not a proof: a packet for another configuration needs a new reviewed list.
const { fold } = require('./text.cjs');
const { isObj, isArr } = require('./util.cjs');

const SLOT = {
  SUB: '(?:<subscription-id>|\\$Subscription)', RG: '(?:<rg>|\\$Group)', LEASE: '(?:<lease-id>|\\$Lease)', APP: '(?:<app>|\\$App)', PLAN: '(?:<plan>|\\$Plan)',
  LAW: '(?:<law>|\\$Workspace)', STORAGE: '(?:<storage>|\\$Storage)', PH: '<[A-Za-z0-9|._-]{1,40}>', WORD: '[a-z0-9-]{1,60}', CARD: 'C[0-9]{3}', MSG: '[^\'$`\\r\\n]{1,200}'
};
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compile = (template) => new RegExp(`^${template.split(/(<<[A-Z]+>>)/).map((part) => (/^<<[A-Z]+>>$/.test(part) ? SLOT[part.slice(2, -2)] : escape(part))).join('')}$`);

const SWAP = 'az webapp deployment slot swap --resource-group <<RG>> --name <<APP>> --slot staging --target-slot production --subscription <<SUB>>';
const DEPLOY = '--location <<PH>> --template-file <<PH>> --parameters <<PH>>=<<PH>> <<PH>>=<<PH>> <<PH>> --subscription <<SUB>>';
const GATE = 'Assert-Subscription; Assert-Lease; ';
const wrap = (command, label) => `try { ${GATE}${command} } catch { $failures.Add("${label}: $($_.Exception.Message)") }`;
const MESSAGE = '$m = "TEARDOWN FAILED for lease ${Lease} ($($failures.Count) problems): $($failures -join \' | \'). The meter may still run: delete the lease by hand now (deletion order of the packet)."';
const D = {
  slot: 'az webapp deployment slot delete --resource-group $Group --name $App --slot staging --subscription $Subscription', webapp: 'az webapp delete --resource-group $Group --name $App --subscription $Subscription',
  plan: 'az appservice plan delete --resource-group $Group --name $Plan --yes --subscription $Subscription', law: 'az monitor log-analytics workspace delete --resource-group $Group --workspace-name $Workspace --force --yes --subscription $Subscription',
  storage: 'az storage account delete --resource-group $Group --name $Storage --yes --subscription $Subscription',
  role: 'az role assignment delete --assignee <<PH>> --scope "/subscriptions/$Subscription/resourceGroups/$Group/providers/Microsoft.Storage/storageAccounts/$Storage" --subscription $Subscription',
  identity: 'az identity delete --resource-group $Group --name <<PH>> --subscription $Subscription', group: 'az group delete --name $Group --yes --subscription $Subscription'
};

// [id, template]: the whole vocabulary of statements the plan may use.
const TEMPLATES = [
  ['az-account-show', 'az account show --query id -o tsv'],
  ['az-group-exists', 'az group exists --name <<RG>> --subscription <<SUB>>'],
  ['az-group-show', 'az group show --name <<RG>> --subscription <<SUB>> -o json'],
  ['az-deploy-validate', `az deployment sub validate ${DEPLOY}`],
  ['az-deploy-whatif', `az deployment sub what-if ${DEPLOY}`],
  ['az-group-create', 'az group create --name <<RG>> --location <<PH>> --subscription <<SUB>> --tags lease-id=<<LEASE>> lease-owner=<<PH>> "lease-expires-utc=$expires" purpose=<<WORD>> card=<<CARD>> option=<<PH>> cost-ceiling-usd=<<PH>>'],
  ['az-extension', 'az extension add --name resource-graph'],
  ['graph-resources', 'az graph query -q "resources | where tags[\'lease-id\'] == \'<<LEASE>>\' | project id, type" --subscriptions <<SUB>>'],
  ['graph-groups', 'az graph query -q "resourcecontainers | where type =~ \'microsoft.resources/subscriptions/resourcegroups\' and name =~ \'<<RG>>\' | project id" --subscriptions <<SUB>>'],
  ['graph-identity', 'az graph query -q "resources | where type =~ \'microsoft.managedidentity/userassignedidentities\' and tags[\'lease-id\'] == \'<<LEASE>>\' | project id" --subscriptions <<SUB>>'],
  ['law-deleted', 'az monitor log-analytics workspace list-deleted-workspaces --subscription <<SUB>> --query "[?name==\'<<LAW>>\'].id" -o tsv'],
  ['role-list', 'az role assignment list --all --subscription <<SUB>> --query "[?contains(scope, \'<<RG>>\')].id" -o tsv'],
  ['verify-loop', "foreach ($i in 1..12) { if ((az group exists --name <<RG>> --subscription <<SUB>>) -eq 'false') { 'gone'; break }; Start-Sleep -Seconds 300 }"],
  ['swap', SWAP], ['swap-preview', `${SWAP} --action preview`], ['swap-swap', `${SWAP} --action swap`], ['swap-reset', `${SWAP} --action reset`],
  ['expires', "$expires = [DateTime]::UtcNow.AddHours(<<PH>>).ToString('yyyy-MM-ddTHH:mm:ssZ', [Globalization.CultureInfo]::InvariantCulture)"],
  ['task-action', '$action = New-ScheduledTaskAction -Execute \'pwsh.exe\' -Argument "-NoProfile -File `"<<PH>>\\teardown-<<LEASE>>.ps1`" -Subscription <<SUB>> -Group <<RG>> -Lease <<LEASE>> -App <<APP>> -Plan <<PLAN>>"'],
  ['task-trigger', '$trigger = New-ScheduledTaskTrigger -Once -At ([DateTimeOffset]::Parse($expires, [Globalization.CultureInfo]::InvariantCulture).LocalDateTime)'],
  ['task-settings', '$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Hours 2)'],
  ['task-register', "Register-ScheduledTask -TaskName 'ass-teardown-<<LEASE>>' -Action $action -Trigger $trigger -Settings $settings -Description 'Backstop: delete lease <<LEASE>> at its deadline'"],
  ['task-get', "$task = Get-ScheduledTask -TaskName 'ass-teardown-<<LEASE>>'"],
  ['task-registered', '$registered = [DateTimeOffset]::Parse($task.Triggers[0].StartBoundary, [Globalization.CultureInfo]::InvariantCulture).UtcDateTime'],
  ['task-print', '$task | Select-Object TaskName, State; "registered trigger (UTC): $($registered.ToString(\'yyyy-MM-ddTHH:mm:ssZ\', [Globalization.CultureInfo]::InvariantCulture)); deadline: $expires"'],
  ['task-check', "if ([Math]::Abs(($registered - [DateTimeOffset]::Parse($expires, [Globalization.CultureInfo]::InvariantCulture).UtcDateTime).TotalSeconds) -gt 120) { throw '<<MSG>>' }"],
  ['task-none', "Get-ScheduledTask -TaskName 'ass-teardown-<<LEASE>>' -ErrorAction SilentlyContinue"],
  ['disarm', "if ((az group exists --name <<RG>> --subscription <<SUB>>) -eq 'false') { Unregister-ScheduledTask -TaskName 'ass-teardown-<<LEASE>>' -Confirm:$false } else { throw '<<MSG>>' }"],
  ['vars', "$Subscription = '<subscription-id>'; $Group = '<rg>'; $Lease = '<lease-id>'; $App = '<app>'; $Plan = '<plan>'; $Workspace = '<law>'; $Storage = '<storage>'"],
  ['errpref', "$ErrorActionPreference = 'Stop'; $PSNativeCommandUseErrorActionPreference = $true"],
  ['fn-sub-open', 'function Assert-Subscription {'],
  ['fn-sub-body', "if ((az account show --query id -o tsv) -ne $Subscription) { throw 'G2: <<MSG>>' }"],
  ['fn-lease-open', 'function Assert-Lease {'],
  ['fn-lease-get', '$g = az group show --name $Group --subscription $Subscription -o json | ConvertFrom-Json'],
  ['fn-lease-if', "if (-not $g -or $g.name -ine $Group -or $g.tags.'lease-id' -cne $Lease -or -not $g.tags.'lease-expires-utc') { throw 'G3: <<MSG>>' }"],
  ['close', '}'],
  ...Object.entries(D).map(([name, command]) => [`m-${name}`, `${GATE}${command}`]),
  ['param-open', 'param('],
  ['param-1', '[Parameter(Mandatory)][string]$Subscription, [Parameter(Mandatory)][string]$Group, [Parameter(Mandatory)][string]$Lease,'],
  ['param-2', "[Parameter(Mandatory)][string]$App, [Parameter(Mandatory)][string]$Plan, [string]$Workspace = '',"],
  ['param-alarm', "[string]$AlarmDir = [Environment]::GetFolderPath('Desktop')"],
  ['param-close', ')'],
  ['failures-init', '$failures = [System.Collections.Generic.List[string]]::new()'],
  ['alarm-dir', 'foreach ($candidate in @($AlarmDir, $env:TEMP, $PSScriptRoot)) { if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Container)) { $AlarmDir = $candidate; break } }'],
  ['s-first', 'try { Assert-Subscription; if ((az group exists --name $Group --subscription $Subscription) -eq \'false\') { exit 0 } } catch { $failures.Add("first check: $($_.Exception.Message)") }'],
  ['s-slot', wrap(D.slot, 'slot')], ['s-webapp', wrap(D.webapp, 'web app')], ['s-plan', wrap(D.plan, 'plan')], ['s-law', `if ($Workspace) { ${wrap(D.law, 'workspace')} }`], ['s-group', wrap(D.group, 'group')],
  ['s-final', 'try { Assert-Subscription; if ((az group exists --name $Group --subscription $Subscription) -ne \'false\') { $failures.Add(\'the group still exists after its delete\') } } catch { $failures.Add("final check: $($_.Exception.Message)") }'],
  ['alarm-open', 'if ($failures.Count -gt 0) {'], ['alarm-m', MESSAGE],
  ['alarm-file', '$alarmFile = Join-Path $AlarmDir "AZURE-LEASE-TEARDOWN-FAILED-${Lease}.txt"'],
  ['alarm-try', 'try { Set-Content -Path $alarmFile -Value $m; $m += " The same text is in the file $alarmFile." } catch { $m += \' (the alarm file could not be written: this dialog is the only alarm)\' }'],
  ['add-type', 'Add-Type -AssemblyName PresentationFramework'], ['dialog', "[void][System.Windows.MessageBox]::Show($m, 'Azure lease teardown FAILED')"],
  ['exit1', 'exit 1'], ['exit0', 'exit 0']
];

const SHAPES = TEMPLATES.map(([id, template]) => ({ id, template, re: compile(template) }));
const GUARD_FUNCTIONS = ['fn-sub-open', 'fn-sub-body', 'close', 'fn-lease-open', 'fn-lease-get', 'fn-lease-if', 'close'];

// The reviewed sequence of shapes of every container.
const EXPECTED = {
  guards: ['az-group-exists', 'az-account-show', 'az-group-show'],
  armingSequence: ['az-account-show', 'az-group-exists', 'az-deploy-validate', 'az-deploy-whatif', 'expires', 'task-action', 'task-trigger', 'task-settings', 'task-register', 'task-get', 'task-registered', 'task-print',
    'task-check', 'az-group-create', 'az-group-show'],
  guardFunctions: GUARD_FUNCTIONS,
  deletionOrder: ['vars', 'errpref', ...GUARD_FUNCTIONS, 'm-slot', 'm-webapp', 'm-plan', 'm-law', 'm-storage', 'm-role', 'm-identity', 'm-group'],
  verification: ['az-account-show', 'verify-loop', 'az-account-show', 'az-extension', 'graph-resources', 'graph-groups', 'az-account-show', 'law-deleted', 'az-account-show', 'graph-identity', 'role-list', 'disarm', 'task-none'],
  rollback: ['swap', 'swap-preview', 'swap-swap', 'swap-reset'],
  script: ['param-open', 'param-1', 'param-2', 'param-alarm', 'param-close', 'errpref', 'failures-init', 'alarm-dir', ...GUARD_FUNCTIONS, 's-first', 's-slot', 's-webapp', 's-plan', 's-law', 's-group', 's-final',
    'alarm-open', 'alarm-m', 'alarm-file', 'alarm-try', 'add-type', 'dialog', 'exit1', 'close', 'exit0']
};

// Strict on purpose: the text is compared as written (only plain spaces are trimmed and collapsed), so a zero-width character, a non-breaking space,
// a carriage return or a look-alike letter makes a line unknown instead of being folded into a known shape.
function normalize(line) {
  const s = String(line);
  let from = 0;
  let to = s.length;
  while (from < to && s[from] === ' ') from += 1;
  while (to > from && s[to - 1] === ' ') to -= 1;
  return s.slice(from, to).replace(/ {2,}/g, ' ');
}
function shapeOf(line) {
  const text = normalize(line);
  const hit = SHAPES.find((s) => s.re.test(text));
  return hit ? hit.id : null;
}

const DISARM_WORDS = /\b(?:unregister|disable|stop)-scheduled(?:task|job)\b|\bschtasks(?:\.exe)?\b/i;
const BASE = 'cleanupAndRollback';
const linesIn = (plan, section) => (isArr(plan[section]) ? plan[section].flatMap((s) => (isObj(s) && isArr(s.commands) ? s.commands : [])) : []).filter((l) => typeof l === 'string');

function containersOf(plan) {
  const job = isObj(plan.teardown) && isObj(plan.teardown.job) ? plan.teardown.job : {};
  return {
    guards: linesIn(plan, 'guards'), armingSequence: linesIn(plan, 'armingSequence'), guardFunctions: (isArr(plan.guardFunctions) ? plan.guardFunctions : []).filter((l) => typeof l === 'string'),
    deletionOrder: linesIn(plan, 'deletionOrder'), verification: linesIn(plan, 'verification'), rollback: linesIn(plan, 'rollback'),
    script: (isArr(job.script) ? job.script : []).filter((l) => typeof l === 'string')
  };
}

function differsAt(got, want) {
  const n = Math.max(got.length, want.length);
  for (let i = 0; i < n; i += 1) if (got[i] !== want[i]) return i;
  return -1;
}

// The disarm of the only automatic backstop: exactly one, in the guarded shape, in the verification container (after the checks), nowhere else.
function checkDisarm(containers, add) {
  let guarded = 0;
  for (const [name, lines] of Object.entries(containers)) {
    lines.forEach((line, i) => {
      if (!DISARM_WORDS.test(fold(line))) return;
      const where = `${BASE}.${name} (command ${i + 1})`;
      if (shapeOf(line) !== 'disarm') add('DISARM_UNGUARDED', where, `the disarm of the teardown task must be the guarded line (az group exists must answer false, else throw and keep the backstop armed): ${line.slice(0, 80)}`);
      else if (name !== 'verification') add('DISARM_MISPLACED', where, 'the disarm belongs after the four verifications (verification check 6), never in the pasted deletion block, the script or another section');
      else guarded += 1;
    });
  }
  if (guarded > 1) add('DISARM_DUPLICATE', `${BASE}.verification`, 'the teardown task is disarmed once: a second disarm line is refused');
  if (guarded === 0) add('DISARM_MISSING', `${BASE}.verification`, 'the guarded disarm line is missing from the verification section');
}

function checkShapes(plan, add) {
  const containers = containersOf(plan);
  for (const [name, lines] of Object.entries(containers)) {
    const ids = lines.map((line, i) => {
      const id = shapeOf(line);
      if (id === null) add('UNKNOWN_STATEMENT_SHAPE', `${BASE}.${name} (command ${i + 1})`, `this statement is not one of the reviewed shapes of the plan: ${normalize(line).slice(0, 90)}`);
      return id;
    });
    const at = differsAt(ids, EXPECTED[name]);
    if (at >= 0) add('SECTION_SHAPE_SEQUENCE', `${BASE}.${name}`, `the shapes of this section differ from the reviewed sequence at command ${at + 1}: found ${ids[at] || 'nothing'}, expected ${EXPECTED[name][at] || 'the end'}`);
  }
  const alarmParam = containers.script.find((l) => /^\s*\[string\]\$AlarmDir\b/i.test(l)) ?? '';
  if (shapeOf(alarmParam) !== 'param-alarm' || !containers.script.some((l) => shapeOf(l) === 'alarm-dir')) {
    add('SCRIPT_ALARM_PATH', `${BASE}.teardown.job.script`, "the alarm folder must come from [Environment]::GetFolderPath('Desktop') (the Desktop may be redirected) and fall back to the temp folder and the script folder; a path built by hand writes no file");
  }
  checkDisarm(containers, add);
}

module.exports = { SHAPES, EXPECTED, SLOT, compile, shapeOf, containersOf, checkShapes, checkDisarm, normalize, DISARM_WORDS };
