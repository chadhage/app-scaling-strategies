'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const repository = path.resolve(__dirname, '..', '..', '..');
const output = process.env.X001_U049_NATIVE_OUT;
assert.ok(output && !fs.existsSync(output), 'a fresh owned native record is required');
const runtime = path.join(repository, '.git', 'kanban-orchestrator', 'browser-runtime');
assert.equal(fs.existsSync(runtime) && fs.readdirSync(runtime).length > 0, false, 'the private helper root starts empty; no runtime is adopted');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
let probeCaller = null;
const processes = () => {
  const script = "$ErrorActionPreference='Stop'; $caller=Get-CimInstance Win32_Process -Filter ('ProcessId='+$env:U049_PROBE_CALLER) | Select-Object ProcessId,CreationDate; $rows=@(Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | Select-Object ProcessId,ParentProcessId,CreationDate,CommandLine); [ordered]@{caller=$caller;rows=$rows}|ConvertTo-Json -Compress -Depth 5";
  const text = execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', windowsHide: true, env: { ...process.env, U049_PROBE_CALLER: String(process.pid) },
  }).trim();
  assert.ok(text, 'process probe cannot be a silent success-shaped empty answer');
  const report = JSON.parse(text);
  assert.equal(report.caller?.ProcessId, process.pid, 'the actual caller anchors every process-table confirmation');
  assert.ok(report.caller.CreationDate);
  if (probeCaller === null) probeCaller = report.caller;
  else assert.deepEqual(report.caller, probeCaller);
  assert.ok(Array.isArray(report.rows));
  return report.rows.map((row) => ({
    pid: row.ProcessId, parentPid: row.ParentProcessId, creationIdentity: row.CreationDate, commandLine: row.CommandLine,
  }));
};
const same = (left, right) => left.pid === right.pid && left.creationIdentity === right.creationIdentity;
const ownCommand = (row) => typeof row.commandLine === 'string' && row.commandLine.toLowerCase().includes(`${runtime}${path.sep}`.toLowerCase());
const created = (row) => {
  const date = /^\/Date\((-?\d+)(?:[+-]\d+)?\)\/$/.exec(row.creationIdentity || '');
  const value = date ? Number(date[1]) : Date.parse(row.creationIdentity);
  assert.ok(Number.isFinite(value), 'every adopted creation identity is readable');
  return value;
};
const record = {
  schema: 'X001-U049-final-native-ownership/1',
  scope: 'Actual private candidate using byte-exact current sealed helper and current qualifier API. No live namespace application.',
  startedAtUtc: new Date().toISOString(), before: processes(), launched: [], after: null,
  processProbeCaller: probeCaller,
  helperRawSha256: sha(fs.readFileSync(path.join(repository, 'testing', 'browser', 'isolated.cjs'))),
  sourceSha256: Object.fromEntries(['timeline.js', 'page.js', 'describe.js', 'saved.js', 'index.html', 'style.css'].map((file) => [
    file, sha(fs.readFileSync(path.join(__dirname, '..', file))),
  ])),
  qualification: null, cleanup: null,
};
assert.equal(record.before.some(ownCommand), false, 'no pre-existing process belongs to this new opaque helper runtime');
process.once('beforeExit', () => {
  if (!fs.existsSync(output)) {
    record.finishedAtUtc = new Date().toISOString();
    record.passed = false;
    record.note = 'Native observation or cleanup did not reach its complete evidence gate; raw failure remains in the recorder.';
    fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  }
});
const load = Module._load;
Module._load = function (request, parent, isMain) {
  const actual = load.call(this, request, parent, isMain);
  if (typeof request !== 'string') return actual;
  const resolved = path.resolve(request);
  if (resolved === path.join(repository, 'testing', 'browser', 'qualify', 'qualify.cjs')) {
    return { ...actual, async qualifyEdge(...args) {
      const report = await actual.qualifyEdge(...args);
      record.qualification = report;
      assert.equal(report.ok, true);
      assert.equal(report.signature.status, 'Valid');
      assert.equal(report.signature.publisher, 'Microsoft Corporation');
      assert.ok(report.qualifiedMajors.includes(report.major), 'owning API includes the actual installed major');
      assert.equal(report.major, 157);
      assert.equal(report.qualifiedMajors.includes(158), false, 'the current append-only policy has not qualified unknown major 158');
      return report;
    } };
  }
  if (resolved === path.join(repository, 'testing', 'browser', 'isolated.cjs')) {
    return { ...actual, async openIsolatedLesson(...args) {
      const session = await actual.openIsolatedLesson(...args);
      let closing;
      const close = () => {
        if (!closing) closing = (async () => {
          await session.close();
          await session.close();
          let remaining = [];
          record.cleanupObservations = [];
          for (let observation = 0; observation < 8; observation += 1) {
            record.after = processes();
            remaining = record.launched.filter((row) => record.after.some((later) => same(row, later)));
            record.cleanupObservations.push({ observation, remaining: remaining.map((row) => ({ pid: row.pid, creationIdentity: row.creationIdentity })) });
            if (remaining.length === 0) break;
          }
          const roots = fs.existsSync(runtime) ? fs.readdirSync(runtime) : [];
          record.cleanup = { remainingOwnedCreationIdentities: remaining, remainingOwnRuntimeEntries: roots,
            exactOwnedProcessCount: record.launched.length, neighborPidsNotTargeted: true, explicitPidTerminationUsed: false,
            repeatedSealedHelperCloseCompleted: true };
          record.finishedAtUtc = new Date().toISOString();
          record.passed = remaining.length === 0 && roots.length === 0;
          fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
          assert.deepEqual(remaining, [], 'every exact owned browser PID/creation identity exited');
          assert.deepEqual(roots, [], 'the helper removed its own profiles and scratch');
          console.log(JSON.stringify({ nativeOwnership: 'passed', actualMajor: record.qualification.major,
            signed: record.qualification.signature.status, helperRawSha256: record.helperRawSha256, ownedProcessCount: record.launched.length,
            remainingOwnedProcesses: remaining.length, remainingOwnRuntimeEntries: roots.length }));
        })();
        return closing;
      };
      try {
      const browser = session.page.context().browser();
      assert.ok(browser);
      const cdp = await browser.newBrowserCDPSession();
      let nativeProcessInfo;
      try { nativeProcessInfo = await cdp.send('SystemInfo.getProcessInfo'); } finally { await cdp.detach(); }
      const browserProcesses = nativeProcessInfo.processInfo.filter((row) => row.type === 'browser');
      assert.equal(browserProcesses.length, 1, 'the actual owned CDP connection identifies exactly one browser root, not its compatibility launcher');
      record.cdpBrowserPid = Number(browserProcesses[0].id);
      assert.ok(Number.isSafeInteger(record.cdpBrowserPid) && record.cdpBrowserPid > 0);
      const now = processes();
      const own = now.filter(ownCommand);
      record.launched = own;
      own.forEach(created);
      record.ownershipScope = 'Only opaque-profile-bearing identities observed alive in this serialized startup window; parent-only links and unverifiable neighbors are never adopted or targeted.';
      assert.ok(own.some((row) => row.pid === record.cdpBrowserPid), 'the actual CDP browser PID has a readable native creation identity and this private opaque profile');
      assert.ok(own.some((row) => !/\s--type=/.test(row.commandLine)), 'an actual opaque-profile browser root was observed');
      assert.ok(own.some((row) => /\s--type=/.test(row.commandLine)), 'at least one actual opaque-profile child was observed; short-lived utilities need not all remain alive');
      assert.ok(own.every((row) => !record.before.some((prior) => same(prior, row))), 'no existing PID/creation identity is adopted');
      record.launchedBinaryVersion = session.browserVersion;
      record.launchedBinarySha256 = sha(fs.readFileSync(record.qualification.path));
      assert.equal(record.launchedBinaryVersion, record.qualification.version, 'qualification and actual launch agree within this invocation, not with a historical build');
      assert.equal(record.launchedBinarySha256, record.qualification.sha256, 'the qualified executable bytes did not change during the launch');
      record.cleanRealmModuleType = await session.page.evaluate(() => typeof module);
      assert.equal(record.cleanRealmModuleType, 'undefined', 'the actual browser uses the global-script branch');
      record.eventReturnFacts = await session.page.evaluate(() => [false, true, undefined].map((value) => {
        const target = document.createElement('span');
        let later = 0;
        target.addEventListener('u049-fact', () => value);
        target.addEventListener('u049-fact', () => { later += 1; });
        const event = new Event('u049-fact', { cancelable: true });
        const dispatched = target.dispatchEvent(event);
        return { returned: String(value), dispatched, cancelled: event.defaultPrevented, later };
      }));
      assert.deepEqual(record.eventReturnFacts, ['false', 'true', 'undefined'].map((returned) => ({ returned, dispatched: true, cancelled: false, later: 1 })));
      record.historyTitleFacts = await session.page.evaluate(() => {
        const title = document.title;
        const address = location.href;
        history.replaceState(null, '', address);
        const first = { title: document.title, address: location.href, state: history.state };
        history.replaceState(null, '~', address);
        const second = { title: document.title, address: location.href, state: history.state };
        return { title, first, second };
      });
      assert.deepEqual(record.historyTitleFacts.first, record.historyTitleFacts.second, 'actual Edge ignores the legacy unused History title argument');
      assert.equal(record.historyTitleFacts.first.title, record.historyTitleFacts.title);
      if (process.env.X001_U049_NATIVE_FAIL_AFTER_OPEN === '1') assert.fail('U049 injected post-open assertion proves exact owned cleanup');
      return { ...session, close };
      } catch (error) {
        try { await close(); } catch (cleanup) { throw new AggregateError([error, cleanup], 'U049 native observation and exact owned cleanup both failed'); }
        throw error;
      }
    } };
  }
  return actual;
};
require('.\\browser.cjs');
