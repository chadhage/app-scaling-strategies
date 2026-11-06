'use strict';
// N1 and N2 behaviour of the PowerShell text of the packet, run by pwsh against a FAKE az (a PowerShell function: never Azure, no scheduled task is
// created). The unattended teardown script is taken from the accepted fixture; only its two dialog lines are replaced by Write-Output. Scenarios:
// the alarm file EXISTS after a failure with a normal folder, a redirected (missing) Desktop and no usable folder at all; the disarm line refuses to
// run while the group exists.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { after } = require('node:test');
const { load, assert, test } = require('./support.cjs');

const root = fs.mkdtempSync(path.join(__dirname, 'teardown-'));
after(() => fs.rmSync(root, { recursive: true, force: true }));
const cleanEnv = () => { const e = { ...process.env }; delete e.NODE_TEST_CONTEXT; delete e.NODE_V8_COVERAGE; return e; };

const FAKE = `
$f = $env:FAKE | ConvertFrom-Json
$global:deleted = $false
function az {
  $line = $args -join ' '
  Add-Content -LiteralPath $env:FAKE_LOG -Value $line
  if ($line -like 'account show*') { return $f.sub }
  if ($line -like 'group exists*') { if ($global:deleted) { return 'false' } else { return $f.exists } }
  if ($line -like 'group show*') { return $f.show }
  $kind = if ($line -like 'webapp deployment slot delete*') { 'slot' } elseif ($line -like 'webapp delete*') { 'webapp' } elseif ($line -like 'appservice plan delete*') { 'plan' } elseif ($line -like 'group delete*') { 'group' } else { $null }
  if ($kind) { if ($f.fail -contains $kind) { throw "$kind failed" }; if ($kind -eq 'group') { $global:deleted = $true } }
}
function Unregister-ScheduledTask { Add-Content -LiteralPath $env:FAKE_LOG -Value 'UNREGISTERED' }
`;

const SHOW = JSON.stringify({ name: 'rg1', tags: { 'lease-id': 'lease1', 'lease-expires-utc': '2026-11-07T00:00:00Z' } });
const scenario = (over = {}) => ({ sub: 'sub1', exists: 'true', show: SHOW, fail: [], ...over });
let counter = 0;

function teardownScript() {
  const lines = load().cleanupAndRollback.teardown.job.script;
  assert.equal(lines.filter((l) => l.includes('Add-Type -AssemblyName PresentationFramework') || l.includes('[System.Windows.MessageBox]::Show')).length, 2, 'the two dialog lines are the only ones replaced');
  return lines.map((l) => (l.includes('Add-Type -AssemblyName') ? '$null' : l.includes('[System.Windows.MessageBox]::Show') ? "  Write-Output ('DIALOG: ' + $m)" : l)).join('\n');
}

// Runs one scenario in its own folder; returns the exit code, the output, the fake az log and the folders.
function runTeardown({ fake = scenario(), alarmDir, tempDir, params = '' }) {
  counter += 1;
  const dir = path.join(root, `s${counter}`);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'teardown.ps1'), teardownScript());
  fs.writeFileSync(path.join(dir, 'fake.ps1'), FAKE);
  const log = path.join(dir, 'az.log');
  fs.writeFileSync(log, '');
  const alarm = alarmDir === undefined ? '' : ` -AlarmDir '${alarmDir}'`;
  const command = `. '${path.join(dir, 'fake.ps1')}'; & '${path.join(dir, 'teardown.ps1')}' -Subscription sub1 -Group rg1 -Lease lease1 -App app1 -Plan plan1${alarm}${params}; exit $LASTEXITCODE`;
  const env = { ...cleanEnv(), FAKE: JSON.stringify(fake), FAKE_LOG: log };
  if (tempDir !== undefined) env.TEMP = tempDir;
  const r = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', command], { env, encoding: 'utf8', timeout: 180000, windowsHide: true });
  return { status: r.status, out: `${r.stdout}${r.stderr}`, log: fs.readFileSync(log, 'utf8'), dir };
}

const ALARM = 'AZURE-LEASE-TEARDOWN-FAILED-lease1.txt';
const exists = (...parts) => fs.existsSync(path.join(...parts));

test('N1: a happy run deletes in order, writes no alarm and exits 0', () => {
  const folder = fs.mkdtempSync(path.join(root, 'alarm-'));
  const r = runTeardown({ alarmDir: folder });
  assert.equal(r.status, 0, r.out);
  assert.match(r.log, /group delete/);
  assert.equal(exists(folder, ALARM), false);
  assert.doesNotMatch(r.out, /DIALOG/);
});

test('N1: after a failed delete the alarm file EXISTS in a normal folder and the dialog names it', () => {
  const folder = fs.mkdtempSync(path.join(root, 'alarm-'));
  const r = runTeardown({ fake: scenario({ fail: ['group'] }), alarmDir: folder });
  assert.equal(r.status, 1, r.out);
  assert.equal(exists(folder, ALARM), true, 'the persistent alarm file must exist');
  assert.match(r.out, /DIALOG: TEARDOWN FAILED for lease lease1/);
  assert.ok(r.out.includes(path.join(folder, ALARM)), 'the dialog says where the file is');
  assert.match(fs.readFileSync(path.join(folder, ALARM), 'utf8'), /TEARDOWN FAILED for lease lease1/);
});

test('N1: a redirected or missing Desktop falls back to the temp folder: the file exists there', () => {
  const missing = path.join(root, 'no-such-desktop');
  const temp = fs.mkdtempSync(path.join(root, 'temp-'));
  const r = runTeardown({ fake: scenario({ fail: ['group'] }), alarmDir: missing, tempDir: temp });
  assert.equal(r.status, 1, r.out);
  assert.equal(exists(missing, ALARM), false);
  assert.equal(exists(temp, ALARM), true, 'the alarm file must be written to the temp folder');
  assert.ok(r.out.includes(path.join(temp, ALARM)));
});

test('N1: with neither the Desktop nor the temp folder the file is written next to the script', () => {
  const r = runTeardown({ fake: scenario({ fail: ['slot'] }), alarmDir: path.join(root, 'no-desktop'), tempDir: path.join(root, 'no-temp') });
  assert.equal(r.status, 1, r.out);
  assert.equal(exists(r.dir, ALARM), true, 'the alarm file must be written to the script folder');
});

test('N1: when the file cannot be written the dialog says so', () => {
  const folder = fs.mkdtempSync(path.join(root, 'alarm-'));
  fs.mkdirSync(path.join(folder, ALARM));
  const r = runTeardown({ fake: scenario({ fail: ['group'] }), alarmDir: folder });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /the alarm file could not be written: this dialog is the only alarm/);
});

test('guards: a wrong subscription or other lease tags delete nothing and alarm', () => {
  for (const fake of [scenario({ sub: 'other' }), scenario({ show: JSON.stringify({ name: 'rg1', tags: { 'lease-id': 'other', 'lease-expires-utc': 'x' } }) })]) {
    const folder = fs.mkdtempSync(path.join(root, 'alarm-'));
    const r = runTeardown({ fake, alarmDir: folder });
    assert.equal(r.status, 1, r.out);
    assert.doesNotMatch(r.log, /delete/, 'no delete may run');
    assert.equal(exists(folder, ALARM), true);
  }
});

// N2: the disarm line of verification check 6, run with the variables of the deletion block and a fake Unregister-ScheduledTask.
function runDisarm(fake) {
  counter += 1;
  const dir = path.join(root, `d${counter}`);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'fake.ps1'), FAKE);
  const log = path.join(dir, 'az.log');
  fs.writeFileSync(log, '');
  const line = load().cleanupAndRollback.verification.flatMap((v) => v.commands).find((l) => l.includes('Unregister-ScheduledTask'));
  const command = `. '${path.join(dir, 'fake.ps1')}'; $ErrorActionPreference = 'Stop'; $Group = 'rg1'; $Subscription = 'sub1'; ${line}`;
  const r = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', command], { env: { ...cleanEnv(), FAKE: JSON.stringify(fake), FAKE_LOG: log }, encoding: 'utf8', timeout: 180000, windowsHide: true });
  return { status: r.status, out: `${r.stdout}${r.stderr}`, log: fs.readFileSync(log, 'utf8') };
}

test('N2: the disarm unregisters the job only when az group exists answers false', () => {
  const gone = runDisarm(scenario({ exists: 'false' }));
  assert.equal(gone.status, 0, gone.out);
  assert.match(gone.log, /UNREGISTERED/);
});

test('N2: while the group still exists the disarm throws and the backstop stays armed', () => {
  const still = runDisarm(scenario({ exists: 'true' }));
  assert.notEqual(still.status, 0);
  assert.match(still.out, /the group still exists: the backstop stays armed/);
  assert.doesNotMatch(still.log, /UNREGISTERED/);
});
