'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { AsyncLocalStorage } = require('node:async_hooks');
const { createHash } = require('node:crypto');
const childProcess = require('node:child_process');
const ROOT = process.env.U007_FINAL_ROOT;
assert.ok(ROOT && path.isAbsolute(ROOT), 'an explicitly owned final capture directory is required');
const IO = path.join(ROOT, 'native-io');
const candidate = path.resolve(__dirname, '..', '..', '..', '..');
const runtime = path.join(candidate, '.git', 'kanban-orchestrator', 'browser-runtime');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const fixture = 'testing\\browser\\fixtures\\counter.html';
const title = 'Independent browser counter fixture';
const scope = new AsyncLocalStorage();
const creations = new Map();
const launches = [];
const observations = [];
const childRecords = [];
const observationErrors = [];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const below = (parent, file) => {
  const relative = path.relative(parent, file);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};
const identity = (file) => {
  const stat = fs.lstatSync(file, { bigint: true });
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'owned profile is an ordinary directory');
  return { dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) };
};
const recordCreation = (label, file) => {
  if (!label || typeof file !== 'string' || !below(runtime, file)) return;
  try {
    const record = { label, path: file, createdBy: 'successful exclusive fs.mkdtemp of this invocation', identity: identity(file) };
    creations.set(file, record);
    console.log('U007-NATIVE-CREATED', JSON.stringify(record));
  } catch (error) { observationErrors.push({ stage: 'creation observation', label, path: file, message: error.message }); }
};
const originalMkdtemp = fs.mkdtemp;
const originalPromiseMkdtemp = fs.promises.mkdtemp;
fs.mkdtemp = function (...args) {
  const label = scope.getStore();
  const callback = args.at(-1);
  if (typeof callback !== 'function') return originalMkdtemp.apply(this, args);
  args[args.length - 1] = function (error, file) {
    if (!error) recordCreation(label, file);
    return callback.apply(this, arguments);
  };
  return originalMkdtemp.apply(this, args);
};
fs.promises.mkdtemp = async function (...args) {
  const label = scope.getStore();
  const file = await originalPromiseMkdtemp.apply(this, args);
  recordCreation(label, file);
  return file;
};
const originalSpawn = childProcess.spawn;
fs.mkdirSync(IO, { recursive: false });
childProcess.spawn = function (command, args, options) {
  const child = originalSpawn.call(this, command, args, options);
  if (![EDGE.toLowerCase(), POWERSHELL.toLowerCase()].includes(String(command).toLowerCase())) return child;
  const id = 'child-' + String(childRecords.length + 1).padStart(4, '0');
  const directory = path.join(IO, id);
  fs.mkdirSync(directory);
  const record = { id, label: scope.getStore() || 'unscoped-owned-helper', pid: child.pid, command, args, cwd: options?.cwd || process.cwd() };
  childRecords.push(record);
  write(path.join(directory, 'command.json'), record);
  const streams = { stdout: [], stderr: [], stdin: [] };
  for (const stream of ['stdout', 'stderr']) child[stream]?.on('data', (bytes) => streams[stream].push(Buffer.from(bytes)));
  if (String(command).toLowerCase() === POWERSHELL.toLowerCase() && child.stdin) {
    const writeStdin = child.stdin.write;
    const endStdin = child.stdin.end;
    const bytesOf = (bytes, encoding) => Buffer.isBuffer(bytes) ? Buffer.from(bytes) : Buffer.from(bytes, typeof encoding === 'string' ? encoding : 'utf8');
    let ending = false;
    child.stdin.write = function (bytes, ...rest) {
      if (!ending) streams.stdin.push(bytesOf(bytes, rest[0]));
      return writeStdin.call(this, bytes, ...rest);
    };
    child.stdin.end = function (bytes, ...rest) {
      if (bytes !== undefined && typeof bytes !== 'function') streams.stdin.push(bytesOf(bytes, rest[0]));
      ending = true;
      try { return endStdin.call(this, bytes, ...rest); }
      finally { ending = false; }
    };
  }
  child.once('close', (code, signal) => {
    const captured = {};
    for (const [stream, chunks] of Object.entries(streams)) {
      const bytes = Buffer.concat(chunks);
      fs.writeFileSync(path.join(directory, stream + '.raw'), bytes, { flag: 'wx' });
      captured[stream] = { path: stream + '.raw', bytes: bytes.length, sha256: hash(bytes) };
    }
    write(path.join(directory, 'exit.json'), { code, signal });
    write(path.join(directory, 'manifest.json'), { ...record, code, signal, streams: captured });
    record.closed = true;
    record.code = code;
    record.signal = signal;
  });
  if (String(command).toLowerCase() === EDGE.toLowerCase()) {
    try {
      const profiles = args.filter((arg) => arg.startsWith('--user-data-dir='));
      assert.equal(profiles.length, 1, 'this owned launch names exactly one profile');
      const profile = profiles[0].slice('--user-data-dir='.length);
      const created = creations.get(profile);
      assert.ok(created && created.label === record.label, 'profile authority comes from this invocation mkdtemp, not directory discovery');
      assert.deepEqual(identity(profile), created.identity);
      launches.push({ ...record, profile, profileIdentity: created.identity });
      console.log('U007-NATIVE-LAUNCH', JSON.stringify(launches.at(-1)));
    } catch (error) { observationErrors.push({ stage: 'launch observation', label: record.label, pid: child.pid, message: error.message }); }
  }
  return child;
};
const api = require('../scratch-session.cjs');
const { createOwnedAdapters } = require('../owned.cjs');
const { readQualified } = require('../../qualify/adapters.cjs');
const sealed = require('../../isolated.cjs');
const { openLookAlike } = require('./u006-owned-lookalike.cjs');
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'psmodulepath'));
let queryNumber = 0;
function nativeQuery(script) {
  script = "$ProgressPreference='SilentlyContinue';$ErrorActionPreference='Stop';" + script;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded];
  const result = childProcess.spawnSync(POWERSHELL, args, { env: cleanEnv(), windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  const directory = path.join(IO, 'query-' + String(++queryNumber).padStart(3, '0'));
  fs.mkdirSync(directory);
  const streams = {};
  for (const name of ['stdout', 'stderr']) {
    const bytes = result[name] || Buffer.alloc(0);
    fs.writeFileSync(path.join(directory, name + '.raw'), bytes, { flag: 'wx' });
    streams[name] = { path: name + '.raw', bytes: bytes.length, sha256: hash(bytes) };
  }
  fs.writeFileSync(path.join(directory, 'script.ps1'), script, { flag: 'wx' });
  write(path.join(directory, 'manifest.json'), { command: POWERSHELL, args, scriptSha256: hash(Buffer.from(script)), executableScriptSha256: hash(Buffer.from(script, 'utf16le')), code: result.status, signal: result.signal, spawnError: result.error?.message || null, streams });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, String(result.stderr));
  assert.equal((result.stderr || Buffer.alloc(0)).length, 0);
  return JSON.parse(result.stdout.toString('utf8'));
}
const edge = nativeQuery(`$p='${EDGE}';$s=Get-AuthenticodeSignature -LiteralPath $p;ConvertTo-Json -Compress @{status=[string]$s.Status;subject=[string]$s.SignerCertificate.Subject;version=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion;sha256=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash}`);
assert.equal(edge.status, 'Valid');
assert.match(edge.subject, /O=Microsoft Corporation/);
assert.equal(Number(edge.version.split('.')[0]), 157, 'use the actually qualified installed major, not an unknown replacement');
const qualified = readQualified().qualifiedMajors;
assert.ok(qualified.includes(157));
assert.ok(!qualified.includes(158));
const adaptersFor = () => {
  const base = createOwnedAdapters();
  const requests = [];
  return { requests, adapters: { ...base, kill: async (entries, options) => {
    requests.push(...entries.map(({ pid, createdAt }) => ({ pid, createdAt })));
    return base.kill(entries, options);
  } } };
};
const same = (left, right) => left.pid === right.pid && left.createdAt === right.createdAt;
const tableOf = (adapters) => adapters.list({ timeoutMs: 60000 });
async function browserIdentity(session, adapters, launch) {
  const browser = session.page.context().browser();
  const connection = await browser.newBrowserCDPSession();
  try {
    const info = await connection.send('SystemInfo.getProcessInfo');
    const roots = info.processInfo.filter((entry) => entry.type === 'browser');
    assert.equal(roots.length, 1);
    const table = await tableOf(adapters);
    const root = table.find((entry) => entry.pid === roots[0].id);
    assert.ok(root && /^\d+$/.test(root.createdAt), 'CDP root has a readable native creation identity');
    assert.ok(session.owned.recorded().some((entry) => same(entry, root)), 'authenticated root belongs to this U005 invocation');
    const independent = nativeQuery(`Get-CimInstance Win32_Process -Filter 'ProcessId=${root.pid}' -Property ProcessId,ParentProcessId,CommandLine,ExecutablePath | Select-Object ProcessId,ParentProcessId,CommandLine,ExecutablePath | ConvertTo-Json -Compress`);
    assert.equal(independent.ProcessId, root.pid);
    assert.ok(independent.CommandLine.includes('--user-data-dir=' + launch.profile) || independent.CommandLine.includes('--user-data-dir="' + launch.profile + '"'), 'native browser command line names the positively created profile');
    assert.equal(await session.page.title(), title);
    assert.equal(session.browserVersion, edge.version);
    assert.ok(session.owned.roots.length >= 1);
    assert.ok(session.owned.roots.every((entry) => table.some((row) => same(entry, row))), 'recorded roots are alive; transient utility children need not be');
    const liveRecorded = session.owned.recorded().filter((entry) => table.some((row) => same(entry, row)));
    assert.ok(liveRecorded.length >= 1);
    return { pid: root.pid, createdAt: root.createdAt, rootCount: session.owned.roots.length, recorded: session.owned.recorded(), liveRecordedLowerBound: liveRecorded.length, nativeProfileBinding: independent };
  } finally { await connection.detach(); }
}
async function open(label, server, loopback) {
  const recording = adaptersFor();
  const options = { adapters: recording.adapters, deadlineMs: 120000, graceMs: 60000, listMs: 60000, terminateMs: 120000, gracefulMs: 60000, settleMs: 60000, exitSettleMs: 45000 };
  const before = launches.length;
  const session = await scope.run(label, () => loopback
    ? api.openLoopbackScratchSession(fixture, server, options)
    : api.openLessonScratchSession(fixture, options));
  try {
    const ownLaunches = launches.slice(before).filter((entry) => entry.label === label);
    assert.equal(ownLaunches.length, 1);
    const record = { label, session, ...recording, launch: ownLaunches[0], paths: session.scratchPaths() };
    assert.equal(record.paths.length, 1);
    assert.ok(below(runtime, record.paths[0]));
    assert.deepEqual(observationErrors, [], 'observational hooks never change producer behavior, but missing proof cannot pass');
    record.identity = await browserIdentity(session, recording.adapters, record.launch);
    return record;
  } catch (error) {
    await session.close().catch((cleanupError) => { throw new AggregateError([error, cleanupError], 'Native identity check and owned session cleanup failed'); });
    throw error;
  }
}
async function close(record) {
  const pending = record.session.close();
  assert.equal(record.session.close(), pending, 'repeated close shares the same actual lifecycle');
  record.outcome = await pending;
  assert.equal(record.outcome.clean, true, JSON.stringify(record.outcome));
  assert.equal(record.outcome.process.confirmed, true);
  assert.equal(record.outcome.scratch.clean, true);
  assert.ok(record.paths.every((file) => !fs.existsSync(file)), 'fresh observation confirms owned roots absent');
  const after = await tableOf(record.adapters);
  assert.deepEqual(record.identity.recorded.filter((entry) => after.some((row) => same(entry, row))), []);
  const accepted = new Set(record.identity.recorded.map((entry) => `${entry.pid}:${entry.createdAt}`));
  assert.ok(record.requests.every((entry) => accepted.has(`${entry.pid}:${entry.createdAt}`)));
  const requestCount = record.requests.length;
  assert.equal(await record.session.close(), record.outcome);
  assert.equal(record.requests.length, requestCount, 'repeated scope close has no additional kill request');
  record.closed = true;
}
async function finishProfiles(labels, table) {
  const result = [];
  for (const launch of launches.filter((entry) => labels.includes(entry.label))) {
    if (fs.existsSync(launch.profile)) {
      assert.deepEqual(identity(launch.profile), launch.profileIdentity, 'never remove a replacement profile');
      assert.ok(!table.some((row) => row.pid === launch.pid), 'the positively spawned launcher has exited before fixture cleanup');
      for (let attempt = 0; attempt < 4 && fs.existsSync(launch.profile); attempt += 1) {
        assert.deepEqual(identity(launch.profile), launch.profileIdentity);
        try { await fs.promises.rm(launch.profile, { recursive: true, force: false, maxRetries: 0 }); }
        catch (error) {
          result.push({ path: launch.profile, attempt: attempt + 1, code: error.code });
          if (!['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(error.code) || attempt === 3) throw error;
          await new Promise((resolve) => setTimeout(resolve, [25, 50, 100][attempt]));
        }
      }
    }
    assert.equal(fs.existsSync(launch.profile), false, 'positively created owned profile is absent');
    result.push({ path: launch.profile, absent: true });
  }
  return result;
}
for (const order of [[0, 1], [1, 0]]) {
  const mode = order[0] === 0 ? 'FIFO' : 'LIFO';
  test(`U007-NATIVE-${mode}: qualified two-session lesson/loopback scratch lifecycles, repeated scopes and same-image neighbor`, { timeout: 1800000 }, async () => {
    const sessions = [];
    const labels = [mode + '-neighbor', mode + '-A', mode + '-B'];
    const errors = [];
    const server = http.createServer((request, response) => {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : fs.readFileSync(path.join(candidate, fixture)));
    });
    let neighbor;
    try {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      assert.equal(server.address().address, '127.0.0.1');
      const neighborBefore = launches.length;
      neighbor = await scope.run(labels[0], () => openLookAlike(fixture, { opener: sealed.openIsolatedLesson }));
      const neighborLaunch = launches.slice(neighborBefore).find((entry) => entry.label === labels[0]);
      assert.ok(neighborLaunch);
      assert.equal(neighbor.browserVersion, edge.version);
      assert.equal(await neighbor.isAlive(), true);
      sessions.push(await open(labels[1], server, false));
      sessions.push(await open(labels[2], server, true));
      assert.notEqual(sessions[0].identity.pid, sessions[1].identity.pid);
      for (const session of sessions) assert.notEqual(session.identity.pid, neighbor.identity.pid);
      const keys = sessions.map((session) => new Set(session.identity.recorded.map((entry) => `${entry.pid}:${entry.createdAt}`)));
      assert.equal([...keys[0]].some((key) => keys[1].has(key)), false);
      await sessions[1].session.page.locator('#message').fill(mode);
      await sessions[1].session.page.getByRole('button', { name: 'Increment' }).click();
      const first = sessions[order[0]], second = sessions[order[1]];
      await close(first);
      assert.equal(await second.session.page.title(), title);
      assert.equal(await neighbor.isAlive(), true, 'same signed image neighbor survives first scope cleanup');
      assert.equal(fs.existsSync(second.paths[0]), true, 'other live owned scratch survives');
      assert.equal(fs.existsSync(second.launch.profile), true);
      assert.equal(fs.existsSync(neighborLaunch.profile), true);
      await close(second);
      assert.equal(await neighbor.isAlive(), true, 'same-image neighbor survives both scope cleanups');
      assert.ok(sessions.every((session) => session.requests.every((entry) => !same(entry, neighbor.identity))));
      const neighborClose = await neighbor.close();
      assert.equal(neighborClose.clean, true);
      const finalTable = await tableOf(sessions[0].adapters);
      assert.equal(finalTable.some((entry) => same(entry, neighbor.identity)), false);
      const profiles = await finishProfiles(labels, finalTable);
      const observation = {
        mode, edge, qualifiedMajors: qualified, server: server.address(), neighbor: { identity: neighbor.identity, profile: neighborLaunch.profile, survivedBothOwnedCleanups: true, close: neighborClose },
        sessions: sessions.map(({ label, identity, launch, paths, requests, outcome }) => ({ label, identity, launch, paths, requests, outcome })),
        profiles, repeatedScopes: true, unknownPathAdoption: false, imageNameKill: false, sharedRuntimeGloballyCleanClaimed: false,
      };
      observations.push(observation);
      console.log('U007-FINAL-NATIVE-OBSERVATION', JSON.stringify(observation));
    } catch (error) { errors.push(error); }
    finally {
      for (const record of sessions) {
        if (!record.closed) {
          try { await record.session.close(); } catch (error) { errors.push(error); }
          try { await record.session.owned.terminate({ timeoutMs: 120000, listMs: 60000 }); } catch (error) { errors.push(error); }
        }
      }
      if (neighbor) { try { await neighbor.close(); } catch (error) { errors.push(error); } }
      if (sessions.length) {
        try { await finishProfiles(labels, await tableOf(sessions[0].adapters)); } catch (error) { errors.push(error); }
      }
      if (server.listening) await new Promise((resolve) => server.close(resolve));
    }
    if (errors.length) throw new AggregateError(errors, `Actual ${mode} lifecycle and all owned cleanup outcomes`);
  });
}
test.after(() => {
  fs.mkdtemp = originalMkdtemp;
  fs.promises.mkdtemp = originalPromiseMkdtemp;
  childProcess.spawn = originalSpawn;
  write(path.join(ROOT, 'native-observations.json'), { schema: 'U007-final-native-observations/1', edge, observations, launches, creations: [...creations.values()], nativeChildren: childRecords, observationErrors });
  assert.deepEqual(observationErrors, []);
  assert.equal(observations.length, 2);
  assert.equal(childRecords.filter((record) => !record.closed).length, 0, 'no own fixture or native helper remains running');
});
