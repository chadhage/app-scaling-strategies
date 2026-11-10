'use strict';

// Test tooling, not production code: the targeted OWNERSHIP-GUARD mutants of the independent review of the first publication (rev-C010 probe set:
// 67 mutants, one per guard: the store's owner compare, expiry, list filters, locate and reference scope, batch all-or-nothing, commit keep and
// discard, quota scope, id collision, the first decision of a single target and of a batch, the role gate at the first decision and per route,
// the commit-time token check and connection check, the queue, the uniform refusal codes, the anonymous refusal, the operator gate, the query
// vocabulary, the claim and server fields, the body schemas). Each mutant is applied alone in a private copy OUTSIDE the repository and must be
// killed by a NAMED failing test file of the behavior suites. A timeout is UNDECIDED, never a kill. The unmutated copy runs first (the control).
// Usage: node tests\guard-mutants.cjs --scratch <dir outside the repository> --out <report.json> [--workers N] [--only <regex>] [--list]
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { pinInputs } = require('./evidence-pins.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const argument = (name) => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
const scratch = argument('--scratch');
const out = argument('--out');
const filter = argument('--only') ? new RegExp(argument('--only')) : null;
const workers = Number(argument('--workers') ?? 2);
const FILE_TIMEOUT_MS = 300000;
const TESTS = ['idor', 'batch', 'commit', 'store', 'server-units', 'uniform', 'lists', 'operator', 'quota', 'anonymous', 'hostile-paths', 'hostile-fields', 'contract', 'property', 'oracle'];

const S = 'store.cjs';
const V = 'server.cjs';
const C = 'contract.js';
const ROLE_MAP = ".map((name) => [name, ['conductor']])";
const roleMutant = (id, name, roles) => [C, id, ROLE_MAP, `.map((name) => [name, name === '${name}' ? ${roles} : ['conductor']])`];
const MUTANTS = [
  [S, 'owner-compare-dropped', 'lease !== null && lease.owner === subject && live(lease) ? lease : null', 'lease !== null && live(lease) ? lease : null'],
  [S, 'owner-compare-inverted', 'lease !== null && lease.owner === subject && live(lease) ? lease : null', 'lease !== null && lease.owner !== subject && live(lease) ? lease : null'],
  [S, 'expiry-check-dropped', 'lease !== null && lease.owner === subject && live(lease) ? lease : null', 'lease !== null && lease.owner === subject ? lease : null'],
  [S, 'list-owner-filter-dropped', 'state.leases.filter((lease) => lease.owner === subject && live(lease))', 'state.leases.filter((lease) => live(lease))'],
  [S, 'list-expiry-filter-dropped', 'state.leases.filter((lease) => lease.owner === subject && live(lease))', 'state.leases.filter((lease) => lease.owner === subject)'],
  [S, 'operator-list-includes-expired', 'operatorLeases: (query) => ok(page(state.leases.filter(live), query, operatorView))', 'operatorLeases: (query) => ok(page(state.leases, query, operatorView))'],
  [S, 'locate-searches-all-leases', 'const resource = lease === null ? null : pick(lease[KIND_FOLDERS[kind]], (entry) => entry.id === id);', 'const resource = lease === null ? null : pick(data.leases.flatMap((other) => other[KIND_FOLDERS[kind]]), (entry) => entry.id === id);'],
  [S, 'export-reference-any-lease', "const run = kind === 'export' ? pick(lease.runs, (entry) => entry.id === input.runId) : null;", "const run = kind === 'export' ? pick(draft.leases.flatMap((other) => other.runs), (entry) => entry.id === input.runId) : null;"],
  [S, 'export-reference-check-dropped', "if (kind === 'export' && run === null) return MISSING;", ''],
  [S, 'batch-continue-on-failure', 'if (!outcome.ok) return outcome;', 'if (!outcome.ok) continue;'],
  [S, 'commit-keeps-failed-draft', 'if (outcome.ok) state = draft;', 'state = draft;'],
  [S, 'commit-no-reaping', 'draft.leases = draft.leases.filter(live);', ''],
  [S, 'quota-counts-all-owners', 'data.leases.filter((lease) => lease.owner === subject)', 'data.leases.filter((lease) => true)'],
  [S, 'has-always-true-for-resources', '(kind === undefined ? owned(state, subject, lease) !== null : locate(state, subject, lease, kind, id) !== null)', '(kind === undefined ? owned(state, subject, lease) !== null : true)'],
  [S, 'has-always-true-for-leases', '(kind === undefined ? owned(state, subject, lease) !== null : locate(state, subject, lease, kind, id) !== null)', '(kind === undefined ? true : locate(state, subject, lease, kind, id) !== null)'],
  [S, 'pick-early-exit', 'if (test(item)) found = item;', 'if (test(item)) { found = item; break; }'],
  [S, 'id-collision-check-dropped', 'if (!contract.isId(kind, id) || taken(draft, id))', 'if (!contract.isId(kind, id))'],
  [S, 'lease-created-for-someone-else', "const lease = { id: mint(draft, 'lease'), owner: subject,", "const lease = { id: mint(draft, 'lease'), owner: 'conductor-a',"],
  [S, 'delete-no-cascade-owner-scope', "if (kind === 'run') found.lease.exports = found.lease.exports.filter((item) => item.runId !== id);", "if (kind === 'run') draft.leases.forEach((other) => { other.exports = other.exports.filter((item) => item.runId !== id); }); if (kind === 'run') found.lease.exports = [];"],
  [S, 'update-ignores-run-state', "if (kind === 'run' && found.resource.state !== 'running') return CONFLICT;", ''],
  [V, 'first-decision-dropped', "if (targets.some((target) => !store.has(identity.subject, target))) return refuse('TARGET_NOT_FOUND');", ''],
  [V, 'batch-first-decision-dropped', "if (matched.name === 'batch' && context.body.ops.some((operation) => !store.has(identity.subject, operation))) return refuse('TARGET_NOT_FOUND');", ''],
  [V, 'role-decision-dropped', 'if (!decision.allowed) return refuse(decision.code);', ''],
  [V, 'commit-token-not-reverified', 'registry.verify(token);\n          const result = WRITES[matched.name](context);', 'const result = WRITES[matched.name](context);'],
  [V, 'cancelled-after-body-dropped', 'if (cancelled()) return undefined;\n        if (read.tooLarge)', 'if (read.tooLarge)'],
  [V, 'cancelled-at-commit-dropped', "await hooks.beforeCommit?.({ route: matched.name, subject: identity.subject });\n          if (cancelled()) return undefined;", "await hooks.beforeCommit?.({ route: matched.name, subject: identity.subject });"],
  [V, 'cancelled-ignores-destroyed-socket', 'const cancelled = () => isFinished(request.socket) || request.socket.destroyed;', 'const cancelled = () => isFinished(request.socket);'],
  [V, 'cancelled-ignores-marked-socket', 'const cancelled = () => isFinished(request.socket) || request.socket.destroyed;', 'const cancelled = () => request.socket.destroyed;'],
  [V, 'read-refusal-code-differs', "return result.ok ? answer(() => result.value, 'read') : refuse(result.code);", "return result.ok ? answer(() => result.value, 'read') : refuse(result.code === 'TARGET_NOT_FOUND' ? 'NOT_FOUND' : result.code);"],
  [V, 'malformed-lease-path-code-swapped', "refuse(pathname.startsWith('/v1/leases/') ? 'TARGET_NOT_FOUND' : 'NOT_FOUND')", "refuse(pathname.startsWith('/v1/leases/') ? 'NOT_FOUND' : 'TARGET_NOT_FOUND')"],
  [V, 'anonymous-not-refused', "if (identity === null) throw new AuthError('AUTHENTICATION_REQUIRED');", "if (identity === null) return refuse('NOT_FOUND');"],
  [V, 'public-route-ignores-bad-token', 'const identity = token === null ? null : registry.verify(token);', 'const identity = token === null || matched.public ? null : registry.verify(token);'],
  [V, 'foreign-first-decision-after-body', "const targets = Object.hasOwn(URL_TARGETS, matched.name) ? URL_TARGETS[matched.name](found.params, matched) : [];", 'const targets = [];'],
  [V, 'queue-bypassed-for-effects', 'return await queue.run(effect);', 'return await effect();'],
  [V, 'read-uses-first-subject-claim', "'lease.read': ({ store, subject, params }) => store.readLease(subject, params.lease),", "'lease.read': ({ store, subject, params }) => store.readLease(subject, params.lease) && store.readLease('conductor-a', params.lease).ok ? store.readLease('conductor-a', params.lease) : store.readLease(subject, params.lease),"],
  [C, 'operator-leases-open-to-conductors', "['operator.leases', ['operator']]", "['operator.leases', ['operator', 'conductor']]"],
  [C, 'operator-audit-open-to-conductors', "['operator.audit', ['operator']]", "['operator.audit', ['operator', 'conductor']]"],
  [C, 'resource-routes-open-to-visitors', "'run.cancel', 'batch'].map((name) => [name, ['conductor']])", "'run.cancel', 'batch'].map((name) => [name, ['conductor', 'visitor']])"],
  [C, 'resource-routes-open-to-operator', "'run.cancel', 'batch'].map((name) => [name, ['conductor']])", "'run.cancel', 'batch'].map((name) => [name, ['conductor', 'operator']])"],
  [C, 'query-vocabulary-open', 'if (!route.query.includes(key) || seen.has(key)) return REJECTED;', 'if (seen.has(key)) return REJECTED;'],
  [C, 'claim-field-not-refused-by-name', "if (CLAIM_FIELDS.includes(field)) return failure('IDENTITY_CLAIM_REJECTED', field);", ''],
  [C, 'server-field-not-refused', "return SERVER_FIELDS.includes(field) ? failure('SERVER_FIELD_REJECTED', field) : failure('INPUT_UNKNOWN_FIELD');", "return failure('INPUT_UNKNOWN_FIELD');"],
  [C, 'export-runid-unchecked', "export: { name: isName, runId: (value) => isId('run', value) }", "export: { name: isName, runId: (value) => typeof value === 'string' }"],
  [C, 'batch-op-lease-unchecked', "if (!isId('lease', operation.lease)) return failure('INPUT_INVALID', 'lease');", ''],
  [C, 'batch-limit-raised', 'batchOps: 10,', 'batchOps: 1000,'],
  roleMutant('lease.create-open-to-visitor', 'lease.create', "['conductor', 'visitor']"),
  roleMutant('lease.create-open-to-operator', 'lease.create', "['conductor', 'operator']"),
  roleMutant('lease.read-open-to-visitor', 'lease.read', "['conductor', 'visitor']"),
  roleMutant('lease.end-open-to-operator', 'lease.end', "['conductor', 'operator']"),
  roleMutant('resource.read-open-to-operator', 'resource.read', "['conductor', 'operator']"),
  roleMutant('resource.delete-open-to-visitor', 'resource.delete', "['conductor', 'visitor']"),
  roleMutant('resource.update-open-to-operator', 'resource.update', "['conductor', 'operator']"),
  roleMutant('run.cancel-open-to-operator', 'run.cancel', "['conductor', 'operator']"),
  roleMutant('batch-open-to-visitor', 'batch', "['conductor', 'visitor']"),
  roleMutant('lease.list-open-to-operator', 'lease.list', "['conductor', 'operator']"),
  [V, 'role-always-conductor', 'const decision = decide(roleTable, matched.name, identity.role);', "const decision = decide(roleTable, matched.name, 'conductor');"],
  [S, 'batch-applies-first-op-only', 'for (const operation of ops) {', 'for (const operation of ops.slice(0, 1)) {'],
  [S, 'delete-run-no-cascade', "if (kind === 'run') found.lease.exports = found.lease.exports.filter((item) => item.runId !== id);", ''],
  [S, 'delete-run-cascade-all-exports', 'found.lease.exports = found.lease.exports.filter((item) => item.runId !== id);', 'found.lease.exports = [];'],
  [S, 'cancel-ignores-state', "if (found.resource.state !== 'running') return CONFLICT;\n      found.resource.state = 'cancelled';", "found.resource.state = 'cancelled';"],
  [S, 'update-applies-patch-to-lease', 'Object.assign(found.resource, patch);', 'Object.assign(found.resource, patch); Object.assign(found.lease, patch);'],
  [S, 'create-resource-ignores-own-lease-check', 'const lease = owned(draft, subject, leaseId);\n      if (lease === null) return MISSING;\n      // The reference', 'const lease = draft.leases.find((entry) => entry.id === leaseId);\n      if (lease === undefined) return MISSING;\n      // The reference'],
  [S, 'end-lease-ignores-owner', 'const lease = owned(draft, subject, leaseId);\n      if (lease === null) return MISSING;\n      draft.leases.splice', 'const lease = draft.leases.find((entry) => entry.id === leaseId) || null;\n      if (lease === null) return MISSING;\n      draft.leases.splice'],
  [S, 'list-resources-ignores-owner', 'const lease = owned(state, subject, leaseId);\n      return lease === null ? MISSING : ok(page(lease[KIND_FOLDERS[kind]], query, VIEWS[kind]));', 'const lease = state.leases.find((entry) => entry.id === leaseId) || null;\n      return lease === null ? MISSING : ok(page(lease[KIND_FOLDERS[kind]], query, VIEWS[kind]));'],
  [S, 'read-lease-ignores-owner', 'readLease: (subject, leaseId) => { const lease = owned(state, subject, leaseId);', 'readLease: (subject, leaseId) => { const lease = state.leases.find((entry) => entry.id === leaseId) || null;'],
  [C, 'parse-query-lets-q-through-unbounded', 'q: (text) => (/^[a-z0-9-]{1,32}$/.test(text) ? text : undefined)', 'q: (text) => (/^[a-z0-9-]{1,32}$/.test(text) || true ? text : undefined)']
];
const SELECTED = MUTANTS.filter((mutant) => !filter || filter.test(mutant[1]));
if (process.argv.includes('--list') || process.argv.includes('--check')) {
  // --check: every pattern must occur exactly once in the production file it names (a pattern that drifted would be a silent no-op).
  const bad = process.argv.includes('--check') ? MUTANTS.filter(([file, , find]) => {
    const original = fs.readFileSync(path.join(root, file), 'utf8');
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    const needle = find.replace(/\n/g, eol);
    const at = original.indexOf(needle);
    return at === -1 || original.indexOf(needle, at + 1) !== -1;
  }).map((mutant) => mutant[1]) : [];
  console.log(JSON.stringify({ total: MUTANTS.length, badPatterns: bad, ids: MUTANTS.map((mutant) => mutant[1]) }));
  process.exit(bad.length === 0 ? 0 : 1);
}
if (!scratch || !out || path.resolve(scratch).toLowerCase().startsWith(repository.toLowerCase())) throw new Error('--scratch must be outside the repository and --out a report file');

function copyTree(from, to, skip) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (skip(entry.name, entry.isDirectory())) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target, skip); else fs.copyFileSync(source, target);
  }
}

function prepare(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  copyTree(root, path.join(dir, 'capability', 'C010'), (name, isDirectory) => isDirectory && name === 'evidence');
  fs.mkdirSync(path.join(dir, 'capability', 'C009'), { recursive: true });
  for (const name of ['authz.cjs', 'codes.cjs', 'contract.js', 'http-io.cjs', 'queue.cjs']) fs.copyFileSync(path.join(root, '..', 'C009', name), path.join(dir, 'capability', 'C009', name));
}

function runFile(dir, name) {
  return new Promise((resolve) => {
    const env = { ...process.env, C010_SETTLE_MS: '1500' };
    for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'C010_SUBJECT_DIR', 'CAPTURE_BROWSER_EVIDENCE']) delete env[key];
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=250000', path.join('capability', 'C010', 'tests', `${name}.test.cjs`)], { cwd: dir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    child.stdout.on('data', (chunk) => { text += chunk; });
    child.stderr.on('data', (chunk) => { text += chunk; });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true }); }, FILE_TIMEOUT_MS);
    child.on('close', (code) => {
      clearTimeout(timer);
      const failed = [...new Set([...text.matchAll(/^\s*not ok \d+ - (?!(?:[A-Za-z]:)?[\\/\w.-]*capability[\\/])(.+)$/gm)].map((match) => match[1].trim()))].slice(0, 3);
      resolve({ name, code, timedOut, failed });
    });
  });
}

async function evaluate(dir, mutant) {
  const [file, id, rawFind, rawReplace] = mutant;
  const target = path.join(dir, 'capability', 'C010', file);
  const original = fs.readFileSync(path.join(root, file), 'utf8');
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const find = rawFind.replace(/\n/g, eol);
  const first = original.indexOf(find);
  if (first === -1 || original.indexOf(find, first + 1) !== -1) return { id, file, status: 'BAD-PATTERN', detail: first === -1 ? 'not found' : 'more than once' };
  fs.writeFileSync(target, original.slice(0, first) + rawReplace.replace(/\n/g, eol) + original.slice(first + find.length));
  let undecided = null;
  const result = { id, file, status: 'SURVIVED', ran: [] };
  try {
    for (const name of TESTS) {
      const run = await runFile(dir, name);
      result.ran.push(`${name}:${run.code}${run.timedOut ? 'T' : ''}`);
      if (run.timedOut) { undecided = name; continue; }
      if (run.code !== 0) { result.status = 'KILLED'; result.killedBy = name; result.failed = run.failed; break; }
    }
    if (result.status === 'SURVIVED' && undecided) result.status = 'UNDECIDED';
  } finally {
    fs.writeFileSync(target, original);
  }
  return result;
}

(async () => {
  const inputs = pinInputs(root);
  const dirs = Array.from({ length: workers }, (_, index) => path.join(scratch, `guard-${index}`));
  for (const dir of dirs) prepare(dir);
  const control = [];
  for (const name of TESTS) { const run = await runFile(dirs[0], name); control.push({ file: name, exitCode: run.code, timedOut: run.timedOut }); }
  console.log('CONTROL', control.map((entry) => `${entry.file}:${entry.exitCode}`).join(' '));
  const green = control.every((entry) => entry.exitCode === 0 && !entry.timedOut);
  const results = [];
  if (green) {
    const queue = [...SELECTED];
    await Promise.all(dirs.map(async (dir) => {
      while (queue.length) {
        const result = await evaluate(dir, queue.shift());
        results.push(result);
        console.log(JSON.stringify(result));
      }
    }));
  }
  const count = (status) => results.filter((result) => result.status === status).length;
  const report = { schema: 'C010-guard-mutants/1', node: process.version, inputs, tests: TESTS, control, total: SELECTED.length, killed: count('KILLED'), survived: count('SURVIVED'), undecided: count('UNDECIDED'), badPattern: count('BAD-PATTERN'),
    results: results.sort((first, second) => first.id.localeCompare(second.id)) };
  fs.writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`, { flag: 'wx' });
  console.log(`GUARD MUTANTS ${report.killed} killed, ${report.survived} survived, ${report.undecided} undecided, ${report.badPattern} bad patterns of ${report.total}; control ${green ? 'green' : 'RED'}`);
  process.exitCode = green && report.killed === report.total ? 0 : 1;
})();
