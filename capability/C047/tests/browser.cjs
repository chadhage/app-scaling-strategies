'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const { AsyncLocalStorage } = require('node:async_hooks');
const { assert, fixture, login, request, subject } = require('./kit.cjs');
const { sha } = require('./ast.cjs'), { birth } = require('./process.cjs');
const output = process.env.C047_CAPTURE_DIR, own = path.resolve(__dirname, '..'), physical = path.resolve(own, '..', '..');
assert.equal(typeof output, 'string', 'EXPLICIT_OWN_NATIVE_CAPTURE');
assert.equal(Date.parse(process.env.C047_WORKER_DEADLINE) - Date.now() >= 900000, true, 'FIXED_DEADLINE_NATIVE_BUDGET_NOT_EXTENDED');
const imports = JSON.parse(fs.readFileSync(path.join(own, 'browser-imports.json')));
for (const entry of imports.acceptedHelperEntries) assert.equal(sha(fs.readFileSync(path.join(physical, ...entry.path.split('/')))), entry.physicalCopySha256, 'EXACT_ACCEPTED_NATIVE_HELPER:' + entry.path);
for (const entry of imports.existingPackageFiles) assert.equal(sha(fs.readFileSync(path.join(physical, 'testing', 'browser', 'node_modules', ...entry.path.split('/')))), entry.sha256, 'EXACT_EXISTING_PLAYWRIGHT_BYTES:' + entry.path);
const { qualifyEdge } = require(path.join(physical, 'testing', 'browser', 'qualify', 'qualify.cjs'));
const { openLoopbackScratchSession } = require(path.join(physical, 'testing', 'browser', 'lifecycle', 'scratch-session.cjs'));
const { createOwnedAdapters } = require(path.join(physical, 'testing', 'browser', 'lifecycle', 'owned.cjs'));
const runtime = path.join(physical, '.git', 'kanban-orchestrator', 'browser-runtime');
const store = new AsyncLocalStorage(), created = [], attempts = [];
const sourceSha256 = sha(fs.readFileSync(path.join(own, 'server.cjs')));
let activeBrowsers = 0, maximumActiveBrowsers = 0, launches = 0;
const save = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const event = value => fs.appendFileSync(path.join(output, 'native-chronology.raw.jsonl'), JSON.stringify({ atUtc: new Date().toISOString(), ...value }) + '\n');
function directoryIdentity(file) {
  const stat = fs.lstatSync(file, { bigint: true });
  assert.equal(stat.isDirectory() && !stat.isSymbolicLink(), true, 'OWN_EXCLUSIVE_DIRECTORY_NOT_AN_ALIAS');
  return { device: String(stat.dev), fileId: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) };
}
function observeExclusiveCreation() {
  const callback = fs.mkdtemp, promise = fs.promises.mkdtemp;
  const observe = (label, file) => {
    if (!label) return;
    const relative = path.relative(runtime, file);
    assert.equal(relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), true, 'OPAQUE_PROFILE_ACTUALLY_CREATED_INSIDE_OWN_PRIVATE_RUNTIME');
    const record = { label, path: file, identity: directoryIdentity(file), authority: 'successful exclusive mkdtemp in this exact bounded invocation' };
    created.push(record); event({ event: 'exclusive-directory-created', ...record });
  };
  fs.mkdtemp = function (...args) {
    const label = store.getStore(), done = args.at(-1);
    if (typeof done === 'function') args[args.length - 1] = function (error, file) { if (!error) observe(label, file); return done.apply(this, arguments); };
    return callback.apply(this, args);
  };
  fs.promises.mkdtemp = async function (...args) { const label = store.getStore(), file = await promise.apply(this, args); observe(label, file); return file; };
  return () => { fs.mkdtemp = callback; fs.promises.mkdtemp = promise; };
}
function nativeCommandLine(pid) {
  const code = `$ErrorActionPreference='Stop';Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' -Property ProcessId,CommandLine|Select-Object ProcessId,CommandLine|ConvertTo-Json -Compress`;
  const result = cp.spawnSync(path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')],
    { windowsHide: true, timeout: 60000, encoding: 'utf8' });
  assert.equal(result.error, undefined, 'EXPLICIT_CDP_ROOT_COMMAND_LINE_PROBE_COMPLETES');
  assert.equal(result.status, 0, 'EXPLICIT_CDP_ROOT_COMMAND_LINE_PROBE_SUCCEEDS');
  const row = JSON.parse(result.stdout); assert.equal(row.ProcessId, pid, 'COMMAND_LINE_BOUND_TO_CDP_ROOT_PID');
  return row.CommandLine;
}
function utc7(records) {
  const encoded = Buffer.from(JSON.stringify(records.map(row => ({ pid: row.pid, birthFileTime: row.createdAt }))), 'utf8').toString('base64');
  const code = `$ErrorActionPreference='Stop';$r=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')));@($r|ForEach-Object{[ordered]@{pid=$_.pid;birthFileTime=[string]$_.birthFileTime;birthUtc7=[DateTime]::FromFileTimeUtc([long]$_.birthFileTime).ToString('yyyy-MM-ddTHH:mm:ss.fffffffZ')}})|ConvertTo-Json -Compress`;
  const result = cp.spawnSync(path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')],
    { windowsHide: true, timeout: 60000, encoding: 'utf8' });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, 'FILETIME_FORMATTED_AS_STRING_WITHOUT_JS_NUMERIC_AUTHORITY');
  const rows = JSON.parse(result.stdout); return Array.isArray(rows) ? rows : [rows];
}
async function authenticate(session, label) {
  const cdp = await session.page.context().browser().newBrowserCDPSession();
  try {
    const roots = (await cdp.send('SystemInfo.getProcessInfo')).processInfo.filter(row => row.type === 'browser');
    assert.equal(roots.length, 1, 'ONE_CDP_AUTHENTICATED_BROWSER_ROOT_NOT_A_COMPATIBILITY_LAUNCHER');
    const root = birth(roots[0].id);
    assert.equal([31036, 35440, process.pid].includes(root.pid), false, 'PROTECTED_OR_CALLER_PID_NEVER_BROWSER_AUTHORITY');
    await session.owned.observe({ timeoutMs: 60000 });
    const recorded = session.owned.recorded();
    assert.equal(session.owned.sealed, true, 'ROOT_ADOPTION_WINDOW_FIXED_BEFORE_UI');
    assert.equal(recorded.some(row => row.pid === root.pid && row.createdAt === root.birthFileTime), true, 'ACCEPTED_OWNED_TREE_MATCHES_INDEPENDENT_CDP_NATIVE_BIRTH');
    for (const row of recorded) { assert.equal(typeof row.createdAt, 'string', 'EVERY_OBSERVED_OWNED_CREATION_AUTHORITY_IS_STRING'); assert.equal([31036, 35440].includes(row.pid), false, 'PROTECTED_PID_ABSENT_FROM_OWNED_TREE'); }
    const directories = created.filter(row => row.label === label), commandLine = nativeCommandLine(root.pid);
    const profiles = directories.filter(row => commandLine.includes('--user-data-dir=' + row.path + ' ') ||
      commandLine.endsWith('--user-data-dir=' + row.path) || commandLine.includes('--user-data-dir="' + row.path + '"'));
    assert.equal(profiles.length, 1, 'OPAQUE_EXCLUSIVELY_CREATED_PROFILE_BOUND_TO_AUTHENTICATED_NATIVE_ROOT');
    const second = birth(root.pid);
    assert.deepEqual(second, root, 'ROOT_PID_UTC7_FILETIME_CONFIRMED_BEFORE_UI');
    const authority = { label, root, recordedBeforeUi: utc7(recorded), profiles, directories, scratch: session.scratchPaths(), commandLineSha256: sha(commandLine) };
    event({ event: 'authenticated-before-candidate-campaign', authority }); return authority;
  } finally { await cdp.detach(); }
}
async function cleanup(session, authority, label) {
  const closing = session.close(); assert.equal(session.close(), closing, 'NATIVE_REPEATED_CLOSE_SAME_OWN_OPERATION');
  const outcome = await closing;
  assert.equal(outcome.clean, true, 'ACCEPTED_NATIVE_CLOSE_CONFIRMS_PROCESS_AND_SCRATCH');
  assert.equal(outcome.process.confirmed, true, 'OWN_PROCESS_REMOVAL_FRESHLY_CONFIRMED');
  assert.equal(outcome.scratch.clean, true, 'OWN_SCRATCH_REMOVAL_CONFIRMED');
  const recorded = [...new Map([
    ...(authority?.recordedBeforeUi || []).map(row => ({ pid: row.pid, createdAt: row.birthFileTime })),
    ...session.owned.recorded()
  ].map(row => [row.pid + ':' + row.createdAt, row])).values()], adapters = createOwnedAdapters();
  assert.equal(recorded.length > 0, true, 'OWN_NATIVE_CLEANUP_DOMAIN_IS_NONEMPTY');
  const after = await adapters.list({ timeoutMs: 60000 });
  assert.deepEqual(recorded.filter(item => after.some(row => row.pid === item.pid && row.createdAt === item.createdAt)), [], 'ONLY_EXACT_RECORDED_OWN_IDENTITIES_CONFIRMED_EXITED');
  const scratch = authority?.scratch || session.scratchPaths();
  for (const item of scratch) assert.equal(fs.existsSync(item), false, 'OWN_U007_SCRATCH_ABSENT');
  const directories = authority?.directories || created.filter(row => row.label === label);
  for (const item of directories) {
    if (fs.existsSync(item.path)) {
      assert.deepEqual(directoryIdentity(item.path), item.identity, 'NO_REPLACEMENT_OR_FOREIGN_PROFILE_REMOVAL_AUTHORITY');
      await fs.promises.rm(item.path, { recursive: true, force: false, maxRetries: 3, retryDelay: 100 });
    }
    assert.equal(fs.existsSync(item.path), false, 'OWN_EXCLUSIVE_PROFILE_OR_ARTIFACT_CONFIRMED_ABSENT');
  }
  assert.equal(await session.close(), outcome, 'REPEATED_CLOSE_DOES_NOT_ADOPT_NEXT_BROWSER');
  const result = { confirmed: true, process: outcome.process, scratch: outcome.scratch, root: authority?.root || null,
    observedOwnNativeIdentities: utc7(recorded), absentScratch: scratch, absentExclusiveDirectories: directories, globalCleanlinessClaimed: false };
  event({ event: 'exact-owned-cleanup-confirmed', label, result }); return result;
}
async function attempt(label, injectFailure) {
  const f = await fixture(), record = { label, injectedFailureRequested: injectFailure, observations: [], cleanup: null, primaryFailure: null };
  let session, authority;
  try {
    const member = await login(f), viewer = await login(f, 'ana'), admin = await login(f, 'ada'), birch = await login(f, 'ben', 'tenant-birch');
    launches++;
    session = await store.run(label, () => openLoopbackScratchSession('capability\\C047\\server.cjs', f.app.server, {
      deadlineMs: 120000, pollMs: 500, listMs: 30000, terminateMs: 30000, graceMs: 45000,
      gracefulMs: 15000, settleMs: 15000, exitSettleMs: 1000, scratchParent: runtime, scratchTimeoutMs: 30000, scratchMaxAttempts: 6
    }));
    activeBrowsers++; maximumActiveBrowsers = Math.max(maximumActiveBrowsers, activeBrowsers);
    authority = await authenticate(session, label);
    const page = session.page, context = page.context(), pageErrors = [], violations = [], network = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => { if (/content.security.policy|violates.*directive/i.test(message.text())) violations.push(message.text()); });
    page.on('request', request => network.push({ method: request.method(), path: new URL(request.url()).pathname, origin: new URL(request.url()).origin }));
    async function observe(row, token, status, extraHeaders = {}) {
      await context.setExtraHTTPHeaders({ ...(token ? { Authorization: 'Bearer ' + token } : {}), ...extraHeaders });
      const response = await page.goto(f.origin + row.path, { waitUntil: 'load', timeout: 30000 });
      assert.equal(response.status(), status, 'ACTUAL_NATIVE_BROWSER_CANDIDATE_STATUS:' + row.path);
      const json = await response.json(), text = await page.locator('body').innerText();
      assert.equal(await page.locator('body').isVisible(), true, 'ACTUAL_BROWSER_RESULT_VISIBLE');
      assert.equal(response.headers()['cache-control'], 'no-store', 'ACTUAL_NATIVE_RESPONSE_NO_STORE');
      if (status === 200) {
        assert.equal(json.outcome, 'ok', 'REAL_NATIVE_AUTHORIZED_RESULT');
        if (row.op === 'profile.list') assert.equal(json.profiles[0].profile.id, token === birch.token ? 'synthetic-002' : 'synthetic-001', 'REAL_NATIVE_SERVER_TENANT_CANDIDATE');
        else assert.equal(json.tenant, token === birch.token ? 'tenant-birch' : 'tenant-alder', 'REAL_NATIVE_SERVER_TENANT_MANIFEST');
        assert.match(text, /synthetic-00[12]|C022 project.create/, 'BROWSER_DISPLAYS_ACTUAL_RETURNED_CANDIDATE');
      } else {
        assert.equal(/synthetic-00[12]|displayName/.test(text), false, 'NATIVE_UNAUTHORIZED_DIRECT_PAGE_NO_CANDIDATE_DATA');
        assert.equal(typeof json.error?.code, 'string', 'NATIVE_TYPED_DIRECT_REFUSAL');
      }
      record.observations.push({ path: row.path, method: 'GET', status, outcome: json.outcome, responseSha256: sha(JSON.stringify(json)),
        bodyTextSha256: sha(text), currentAuthorityProvided: Boolean(token), callerTenantHeaderProvided: Object.keys(extraHeaders).length > 0 });
    }
    const candidates = subject.ROUTES.filter(row => row.candidate && row.method === 'GET');
    for (const row of injectFailure ? candidates.slice(0, 1) : candidates) await observe(row, member.token, 200);
    for (const row of injectFailure ? candidates.slice(0, 1) : candidates) await observe(row, null, 401);
    if (injectFailure) throw Object.assign(new Error('C047 intentional failure after actual allowed and denied browser observations'), { code: 'C047_INJECTED_POST_OPEN_FAILURE' });
    for (const row of candidates) await observe(row, viewer.token, 403);
    for (const row of candidates) await observe(row, birch.token, 200);
    const manifest = candidates.find(row => row.op === 'manifest');
    assert.equal((await request(f, '/v1/admin/role', { method: 'POST', token: admin.token, body: { user: 'alf', role: 'viewer' } })).status, 200);
    await observe(manifest, member.token, 403);
    assert.equal((await request(f, '/v1/admin/role', { method: 'POST', token: admin.token, body: { user: 'alf', role: 'member' } })).status, 200);
    await observe(manifest, member.token, 200);
    await observe(manifest, member.token, 400, { 'X-Tenant': 'tenant-birch' });
    assert.equal((await request(f, '/v1/admin/revoke', { method: 'POST', token: admin.token, body: { sid: member.session.sid } })).status, 200);
    await observe(manifest, member.token, 401);
    assert.equal((await context.cookies()).length, 0, 'NO_BROWSER_COOKIES_AFTER_AUTHORITY_LIFECYCLE');
    assert.equal(context.serviceWorkers().length, 0, 'NO_SERVICE_WORKER_CANDIDATE_BYPASS');
    assert.deepEqual(pageErrors, [], 'NO_NATIVE_PAGE_ERRORS');
    assert.deepEqual(violations, [], 'NO_NATIVE_CSP_VIOLATION');
    assert.equal(network.every(row => ['GET', 'HEAD'].includes(row.method) && row.origin === f.origin), true, 'ONLY_ACTUAL_OWN_READ_ONLY_LOOPBACK_BROWSER_REQUESTS');
    record.network = network; record.completedPositiveCampaign = true;
  } catch (error) {
    record.primaryFailure = { name: error.name, code: error.code, message: error.message, stack: error.stack };
    if (!injectFailure || error.code !== 'C047_INJECTED_POST_OPEN_FAILURE') throw error;
    record.expectedInjectedFailureObserved = true;
  } finally {
    try { if (session) record.cleanup = await cleanup(session, authority, label); }
    finally {
      if (session) activeBrowsers--;
      await f.app.close(); assert.equal(f.app.server.listening, false, 'OWN_NATIVE_CAMPAIGN_LISTENER_CLOSED');
      record.ownListenerClosed = true; attempts.push(record); save('native-' + label + '.json', record);
    }
  }
}
async function main() {
  const qualification = await qualifyEdge({ timeoutMs: 180000 });
  save('qualification.json', qualification);
  assert.equal(qualification.ok, true, 'ACCEPTED_ACTUAL_QUALIFIER_MUST_AUTHORIZE_NATIVE_PAIR');
  assert.equal(qualification.signature.publisher, 'Microsoft Corporation', 'ACTUAL_MICROSOFT_SIGNATURE');
  assert.equal(qualification.version, '157.0.4341.42', 'THIS_EXPLICITLY_ADMITTED_FINAL_SOURCE_CAMPAIGN_ONLY');
  assert.equal(qualification.sha256, 'd258e512aa24947cfbef0c0033d8c3cd56ecb40f7b2ad59802fa75c4e4f3324d', 'EXPLICITLY_ADMITTED_BINARY_BYTES_NO_158_OR_CACHE_FALLBACK');
  assert.equal(require(path.join(physical, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version, '1.56.1');
  const restore = observeExclusiveCreation();
  try { await attempt('success', false); await attempt('injected-failure', true); }
  finally { restore(); }
  assert.equal(sha(fs.readFileSync(path.join(own, 'server.cjs'))), sourceSha256, 'FINAL_PRODUCTION_SOURCE_UNCHANGED_DURING_ONE_NATIVE_CAMPAIGN');
  const report = { schema: 'C047-one-final-source-admitted-native-campaign/1', sourceSha256, qualification, playwrightVersion: '1.56.1',
    launches, maximumConcurrentOwnBrowsers: maximumActiveBrowsers, activeOwnBrowsersAfter: activeBrowsers, attempts,
    actualAllowedObservations: attempts.reduce((n, row) => n + row.observations.filter(o => o.status === 200).length, 0),
    actualDeniedObservations: attempts.reduce((n, row) => n + row.observations.filter(o => o.status !== 200).length, 0),
    successCleanupConfirmed: attempts.find(row => row.label === 'success')?.cleanup?.confirmed === true,
    injectedFailureCleanupConfirmed: attempts.find(row => row.label === 'injected-failure')?.cleanup?.confirmed === true,
    browserTransport: 'accepted Playwright guarded HTTP forwarding; not a claim of Chromium native TCP protocol qualification',
    newFrontendCreated: false, generatedUiAccessibilityClaimed: false, globalCleanlinessClaimed: false, fallbackOrCounterReset: false };
  save('browser.json', report); console.log(JSON.stringify({ launches, maximumActiveBrowsers, allowed: report.actualAllowedObservations, denied: report.actualDeniedObservations,
    successCleanupConfirmed: report.successCleanupConfirmed, injectedFailureCleanupConfirmed: report.injectedFailureCleanupConfirmed }));
  assert.equal(launches, 2, 'EXACT_TWO_SEQUENTIAL_SUCCESS_AND_FAILURE_SESSIONS_ONE_CAMPAIGN');
  assert.equal(maximumActiveBrowsers, 1, 'ONE_OWN_BROWSER_CONCURRENT');
  assert.equal(activeBrowsers, 0, 'ALL_OWN_NATIVE_BROWSERS_FINISHED');
  assert.equal(report.injectedFailureCleanupConfirmed, true, 'INJECTED_FAILURE_OWN_CLEANUP_CONFIRMED');
}
main().catch(error => { save('browser-failure.json', { name: error.name, code: error.code, message: error.message, stack: error.stack, attempts, launches, activeBrowsers }); console.error(error); process.exitCode = 1; });
