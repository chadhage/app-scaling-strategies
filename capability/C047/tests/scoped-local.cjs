'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), http = require('node:http'), net = require('node:net'), inspector = require('node:inspector');
const { createRequire } = require('node:module');
const assert = require('node:assert/strict');
const { root } = require('./selection.cjs'), { sha } = require('./ast.cjs');
const output = process.env.C047_CAPTURE_DIR, base = process.env.C047_MUTATION_CAMPAIGN, previousDirectory = process.env.C047_SCOPED_BASE;
assert.ok(output && base && previousDirectory, 'EXPLICIT_OWN_SOURCE_BOUND_LOCAL_CONTRAST_INPUTS');
const inventory = JSON.parse(fs.readFileSync(path.join(base, 'inventory.json'))), campaign = JSON.parse(fs.readFileSync(path.join(base, 'campaign.json')));
const previous = JSON.parse(fs.readFileSync(path.join(previousDirectory, 'scoped.json')));
const previousLocal = process.env.C047_SCOPED_LOCAL_PREVIOUS ? JSON.parse(fs.readFileSync(path.join(process.env.C047_SCOPED_LOCAL_PREVIOUS, 'local.json'))) : null;
const source = fs.readFileSync(path.join(root, 'server.cjs'), 'utf8'), requireActual = createRequire(path.join(root, 'server.cjs'));
assert.equal(sha(source), inventory.sourceSha256, 'EXACT_CURRENT_SOURCE_DOMAIN_NOT_A_PARALLEL_MODEL');
assert.equal(previous.sourceSha256, inventory.sourceSha256, 'EXACT_PREVIOUS_LOCAL_WITNESSES');
const actual = requireActual('./server.cjs'), { createCore } = requireActual('../C022/server.cjs'), contract = requireActual('../C022/contract.js');
const io = requireActual('../C009/http-io.cjs'), { createQueue } = requireActual('../C009/queue.cjs'), { parseBearer } = requireActual('../C009/authz.cjs');
const parserBox = { module: { exports: {} } }; parserBox.exports = parserBox.module.exports;
vm.runInNewContext(process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'], parserBox);
const ast = parserBox.module.exports.parse(source, { ecmaVersion: 'latest', sourceType: 'script' }), nodes = [];
function walk(node, parent = null, key = null) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(child => walk(child, parent, key)); return; }
  if (!node.type) return; nodes.push({ node, parent, key });
  for (const [name, value] of Object.entries(node)) if (value && typeof value === 'object') walk(value, node, name);
}
walk(ast);
const routeNode = nodes.find(row => row.node.type === 'FunctionDeclaration' && row.node.id?.name === 'route').node;
const routeTry = routeNode.body.body.find(node => node.type === 'TryStatement');
const helpers = source.slice(routeNode.body.start + 1, routeTry.start);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const finalRows = [], closure = [], still = [], deadline = Date.parse(process.env.C047_WORKER_DEADLINE);
const save = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
function core() {
  let sequence = 0;
  const c = createCore({ now: () => 123456, randomBytes: size => Buffer.from(sha(Buffer.from('C047-local-pair-' + sequence++)), 'hex').subarray(0, size) });
  function sign(user, tenant) { return c.service.login(null, c.identity.issueTicket({ user, tenant })); }
  const member = sign('alf', 'tenant-alder'), viewer = sign('ana', 'tenant-alder'), admin = sign('ada', 'tenant-alder');
  return { ...c, member, viewer, admin };
}
function names(node) {
  if (!node) return [];
  if (node.type === 'Identifier') return [node.name];
  if (node.type === 'ObjectPattern') return node.properties.flatMap(property => names(property.value || property.argument));
  if (node.type === 'ArrayPattern') return node.elements.flatMap(names);
  if (node.type === 'AssignmentPattern') return names(node.left);
  return [];
}
function declarations(row) {
  const node = nodes.find(value => value.node.start === row.start && value.node.end === row.end)?.node;
  if (node?.type === 'VariableDeclaration') return node.declarations.flatMap(item => names(item.id));
  if (node?.type === 'FunctionDeclaration') return [node.id.name];
  return [];
}
function observe(value, seen = new Set()) {
  const type = typeof value;
  if (value === undefined) return { type: 'undefined' };
  if (value === null || type === 'string' || type === 'number' || type === 'boolean') return { type, value };
  if (type === 'function') return { type, callable: true };
  if (type === 'bigint') return { type, value: String(value) };
  if (seen.has(value)) return { type, circular: true };
  seen.add(value);
  if (value instanceof Promise) return { type: 'promise', then: typeof value.then };
  if (value instanceof http.Server) return { type: 'actual-owned-http-server', listening: value.listening, events: value.eventNames().filter(key => typeof key === 'string').sort() };
  if (value instanceof http.IncomingMessage) return { type: 'actual-owned-http-request', method: value.method, path: value.url };
  if (value instanceof http.ServerResponse) return { type: 'actual-owned-http-response', headersSent: value.headersSent, writableEnded: value.writableEnded };
  if (value instanceof net.Socket) return { type: 'actual-owned-socket', destroyed: value.destroyed };
  if (value instanceof Set || value instanceof Map) return { type, tag: Object.prototype.toString.call(value), size: value.size };
  if (Buffer.isBuffer(value)) return { type: 'buffer', bytes: value.length, sha256: sha(value) };
  if (value instanceof URL) return { type: 'actual-URL', origin: value.origin, pathname: value.pathname };
  if (Array.isArray(value)) return { type: 'array', length: value.length, items: value.map(item => observe(item, seen)) };
  const result = { type, keys: Object.keys(value).sort(), fields: {} };
  for (const key of result.keys) {
    if (['sid', 'key', 'expiresAtMs'].includes(key)) continue;
    if (key === 'token') {
      const item = value[key], valueType = item && typeof item === 'object' && typeof item.type === 'string' ? item.type : typeof item;
      result.fields[key] = { valueType, opaqueStringPresent: valueType === 'string', opaqueValueNotUsedAsDifference: true };
      continue;
    }
    result.fields[key] = observe(value[key], seen);
  }
  return result;
}
function bindingObservation(identifiers) {
  return '{' + identifiers.map(name => JSON.stringify(name) + ':observe(typeof ' + name + " === 'undefined' ? undefined : " + name + ')').join(',') + '}';
}
function instruction(row, text) {
  const declared = declarations(row);
  const writes = [75, 76, 94].includes(row.id) ? ['value'] : [47, 48, 49].includes(row.id) ? ['token'] : [];
  if (row.kind === 'statement') return { code: text + '\nreturn { scopeFallthrough:true, bindings:' + bindingObservation([...declared, ...writes]) + ' };',
    recipe: declared.length ? 'exact-statement-and-declared-public-binding-observation' : 'exact-statement-with-local-control-and-real-effect-observation', declared };
  return { code: 'return { exactExpression: observe((' + text + ')) };', recipe: 'exact-expression-with-real-sanctioned-values', declared };
}
function rowFor(id) {
  if ([75, 76, 79, 80, 81, 82, 83, 84, 85, 92, 93, 94, 463, 628, 629].includes(id)) return actual.ROUTES.find(row => row.path === '/candidate/projects');
  if ([100, 101, 102, 103, 104, 105, 106, 467, 564].includes(id)) return actual.ROUTES.find(row => row.path === '/candidate/manifest.json');
  if ([288, 111, 112, 570].includes(id)) return actual.ROUTES.find(row => row.op === 'session.login');
  if ([569].includes(id)) return actual.ROUTES.find(row => row.op === 'session.anonymous');
  return actual.ROUTES.find(row => row.path === '/candidate/profile.json');
}
async function lexical(row, text, label) {
  fs.writeFileSync(path.join(output, 'local-' + row.id + '-' + label + '.source.txt'), text, { flag: 'wx' });
  const connection = new inspector.Session(), contexts = new Map();
  connection.connect(); connection.on('Runtime.executionContextCreated', ({ params }) => contexts.set(params.context.name, params.context.id));
  const call = (method, args) => new Promise((resolve, reject) => connection.post(method, args, (error, value) => error ? reject(error) : resolve(value)));
  try {
    await call('Runtime.enable', {});
    const name = 'C047-exact-lexical-' + row.id + '-' + label;
    const context = vm.createContext({}, { name });
    vm.runInContext(text, context, { timeout: 1000 });
    const executionContextId = contexts.get(name);
    assert.equal(typeof executionContextId, 'number', 'ACTUAL_CREATED_VM_CONTEXT_ID');
    const result = await call('Runtime.globalLexicalScopeNames', { executionContextId });
    return { recipe: 'actual-engine-lexical-binding-census-for-exact-declaration', names: result.names.sort(), targetBinding: 'parsed', actualBindingPresent: result.names.includes('parsed') };
  } finally { connection.disconnect(); }
}
async function routeScope(row, text, label) {
  const c = core(), observations = { sourceRole: 'scoped exact production fragment, NOT a full-mutant kill or replacement route inventory' };
  const knownRow = rowFor(row.id), requestBody = [83, 84].includes(row.id) ? 'x'.repeat(4097) : JSON.stringify({ name: 'local-source-bound', units: 1 });
  let origin, resolveTask, rejectTask, responseBytes = '', clientSocket, serverSocket;
  const task = new Promise((resolve, reject) => { resolveTask = resolve; rejectTask = reject; });
  const contextRow = [40, 41].includes(row.id) ? null : knownRow;
  const useViewer = [535, 564, 103, 104].includes(row.id);
  const token = (useViewer ? c.viewer : c.member).body.token;
  const current = c.service.authorize(token, 'project.create'), decision = c.service.authorize(token, 'project.create');
  const checked = [92, 93].includes(row.id) ? contract.validateInput('project.create', { name: 'bad' }) :
    contract.validateInput('project.create', { name: 'local-source-bound', units: 1 });
  const info = Object.freeze({ path: knownRow.path, op: knownRow.op, candidate: knownRow.candidate }), hookEvents = [], queue = createQueue();
  const hooks = { afterAuthorize: async value => { hookEvents.push({ hook: 'afterAuthorize', info: value }); }, beforeBoundary: async value => { hookEvents.push({ hook: 'beforeBoundary', info: value }); } };
  const server = http.createServer({ requireHostHeader: false }, handle);
  server.on('checkContinue', handle);
  const marked = [334, 361, 379].includes(row.id), destroyed = [81, 82, 328, 331, 355, 358, 551].includes(row.id);
  const beforeWorld = { identity: c.identity.snapshot(), store: c.store.snapshot() };
  async function handle(request, response) {
    serverSocket = request.socket;
    const actualBody = [83, 84].includes(row.id) ? await io.readBody(request, c.limits.bodyBytes) : { tooLarge: false, buffer: Buffer.from(requestBody) };
    const ctx = {
      request, response, server, origin, url: new URL(request.url, origin), io, contract, http, createCore, createQueue, parseBearer,
      q: request, r: response, ROUTES: actual.ROUTES, SCOPE: actual.SCOPE,
      service: c.service, identity: c.identity, store: c.store, limits: c.limits, row: contextRow, token, current, decision, checked,
      info, hooks, queue, options: { now: () => 123456 }, broken: null, closing: null, sockets: new Set([serverSocket]),
      body: actualBody, value: null, parsed: null, code: 'AUTHENTICATION_REQUIRED',
      status: 401, message: contract.CODES.AUTHENTICATION_REQUIRED[1],
      local: row.id === 520 ? 'LOCAL_HOST_REQUIRED' : null,
      result: c.service.execute(c.member.body.token, 'profile.list', { value: null }),
      observe, Object, Buffer, URL, Promise, Set, Map
    };
    if ([42, 43].includes(row.id)) { ctx.row = actual.ROUTES.find(value => value.op === 'session.whoami'); request.method = 'POST'; }
    if ([47, 48, 49].includes(row.id)) ctx.token = null;
    if (row.id === 244) ctx.url = new URL('//127.0.0.1:1/candidate', origin);
    if (row.id === 288) ctx.row = actual.ROUTES.find(value => value.op === 'session.login');
    if (row.id === 399 || row.id === 402) ctx.row = actual.ROUTES.find(value => value.op === 'profile.list');
    if (row.id === 111 || row.id === 112 || row.id === 570) {
      ctx.value = { ticket: c.identity.issueTicket({ user: 'ben', tenant: 'tenant-birch' }) }; ctx.token = null;
    }
    if (row.id === 420) ctx.broken = null;
    const setup = instruction(row, text);
    for (const name of setup.declared) delete ctx[name];
    if (row.id === 94) delete ctx.parsed;
    const prefix = helpers;
    const program = prefix + '\nreturn await (async () => { ' + setup.code + '\n})();';
    const programFile = path.join(output, 'local-' + row.id + '-' + label + '.source.txt');
    fs.writeFileSync(programFile, program, { flag: 'wx' });
    try {
      if (marked) io.endConnection(request.socket);
      if (destroyed) request.socket.destroy();
      const names = Object.keys(ctx), fn = new AsyncFunction(...names, program);
      fn(...names.map(name => ctx[name])).then(value => {
        observations.completion = observe(value); observations.hookEvents = hookEvents; observations.responseBeforeFallback = {
          actuallyEnded: response.writableEnded, headersSent: response.headersSent, status: response.headersSent ? response.statusCode : null
        };
        observations.worldBefore = observe(beforeWorld);
        observations.worldAfter = observe({ identity: c.identity.snapshot(), store: c.store.snapshot() });
        observations.acceptedAnonymousAudit = c.store.anonymousLog().map(entry => ({ op: entry.op, outcome: entry.outcome, code: entry.code }));
        observations.realRequestSocket = { destroyed: request.socket.destroyed, stoppedByAcceptedHelper: io.isFinished(request.socket) };
        if (!response.writableEnded && !request.socket.destroyed && !io.isFinished(request.socket)) io.createResponder(response).json(299, { scoped: true });
        resolveTask();
      }, rejectTask);
    } catch (error) { rejectTask(error); }
  }
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = 'http://127.0.0.1:' + server.address().port;
  const method = knownRow.method, payload = method === 'POST' ? requestBody : '';
  let continues = 0, clientError = null;
  const client = http.request(origin + knownRow.path, { method, agent: false, headers: {
    Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), Connection: 'close',
    ...(row.id === 79 ? { Expect: '100-continue' } : {})
  } }, response => { response.on('data', chunk => { responseBytes += chunk; }); });
  client.on('socket', socket => { clientSocket = socket; });
  client.on('continue', () => { continues++; });
  client.on('error', error => { clientError = error.code; });
  client.end(payload);
  let timer;
  try {
    await Promise.race([task, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('LOCAL_SCOPE_TIMEOUT_NON_KILL'), { code: 'LOCAL_SCOPE_TIMEOUT_NON_KILL' })), 3000); })]);
    for (let n = 0; n < 3; n++) await new Promise(resolve => setImmediate(resolve));
    observations.actual100ContinueInvitations = continues; observations.actualResponseSha256 = responseBytes ? sha(responseBytes) : null;
    observations.clientTransportErrorNotUsedAsContrast = clientError;
    observations.actualProgramSha256 = sha(programBytes(row.id, label));
    return { recipe: instruction(row, text).recipe, observations };
  } finally {
    clearTimeout(timer);
    client.destroy(); if (clientSocket) clientSocket.destroy(); if (serverSocket) serverSocket.destroy();
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    assert.equal(server.listening, false, 'EXACT_OWN_SCOPED_LISTENER_CLOSED');
  }
}
function programBytes(id, label) { return fs.readFileSync(path.join(output, 'local-' + id + '-' + label + '.source.txt')); }
async function effectScope(row, text, label) {
  const c = core(), sockets = new Set(), server = http.createServer(), events = [];
  let resolveConnection;
  const connection = new Promise(resolve => { resolveConnection = resolve; });
  server.on('connection', socket => { sockets.add(socket); resolveConnection(socket); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = net.createConnection(server.address().port, '127.0.0.1');
  client.on('error', () => {});
  const socket = await connection;
  let resolveCalls = 0;
  const ctx = { http, contract, createCore, createQueue, io, parseBearer, server, socket,
    sockets: row.id === 144 ? new Set() : sockets, service: c.service, identity: c.identity, store: c.store, limits: c.limits, queue: createQueue(),
    options: { now: () => 123456 }, hooks: {}, closing: null, broken: null, observe,
    ROUTES: actual.ROUTES, SCOPE: actual.SCOPE, createApp: actual.createApp,
    module: { exports: {} }, require: requireActual, resolve: () => { resolveCalls++; }, failClosed: () => { events.push('failClosed'); },
    route: (_q, r) => io.createResponder(r).json(200, { scoped: true }), admit: io.createLanes({ depth: c.limits.pipelined }),
    close: () => { server.close(); server.closeAllConnections(); for (const item of sockets) item.destroy(); } };
  const setup = instruction(row, text);
  for (const name of setup.declared) delete ctx[name];
  const observeNames = setup.declared.length ? setup.declared : ['closing', 'module'];
  let program;
  if (row.kind === 'statement') program = text + '\nreturn {scopeFallthrough:true,bindings:' + bindingObservation(observeNames) + '};';
  else program = 'return {exactExpression: observe((' + text + '))};';
  fs.writeFileSync(path.join(output, 'local-' + row.id + '-' + label + '.source.txt'), program, { flag: 'wx' });
  const before = { listening: server.listening, eventCounts: Object.fromEntries(server.eventNames().filter(key => typeof key === 'string').sort().map(key => [key, server.listenerCount(key)])),
    trackedSocketCount: ctx.sockets?.size, socketDestroyed: socket.destroyed, socketCloseListeners: socket.listenerCount('close') };
  let produced;
  try {
    const keys = Object.keys(ctx), fn = new AsyncFunction(...keys, program);
    produced = await fn(...keys.map(key => ctx[key]));
    for (let n = 0; n < 3; n++) await new Promise(resolve => setImmediate(resolve));
    const result = { recipe: 'exact-source-fragment-with-real-owned-HTTP-handle-or-sanctioned-factory-effect',
      completion: observe(produced), before, after: { listening: server.listening,
        eventCounts: Object.fromEntries(server.eventNames().filter(key => typeof key === 'string').sort().map(key => [key, server.listenerCount(key)])),
        trackedSocketCount: ctx.sockets?.size, socketDestroyed: socket.destroyed, socketCloseListeners: socket.listenerCount('close'), resolveCalls, events },
      exports: observe(ctx.module.exports), actualProgramSha256: sha(programBytes(row.id, label)) };
    return result;
  } finally {
    if (produced?.server instanceof http.Server) { produced.server.close(); produced.server.closeAllConnections(); }
    client.destroy(); socket.destroy();
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    assert.equal(server.listening, false, 'EXACT_OWN_EFFECT_SCOPE_LISTENER_CLOSED');
  }
}
async function regexScope(row, text, label) {
  const target = row.operator === 'regex-no-start-anchor' ? 'xapplication/json' : 'application/jsonINVALID';
  const code = '(' + text + ').test(' + JSON.stringify(target) + ')';
  fs.writeFileSync(path.join(output, 'local-' + row.id + '-' + label + '.source.txt'), code + '\n', { flag: 'wx' });
  return { recipe: 'exact-source-media-type-regex-anchor-contrast', actualContentTypeHeader: target, accepted: vm.runInNewContext(code, {}, { timeout: 1000 }), actualProgramSha256: sha(programBytes(row.id, label)) };
}
async function execute(row, text, label) {
  if (row.id === 85) return lexical(row, text, label);
  if (row.kind === 'regex') return regexScope(row, text, label);
  if ([8, 9, 11, 12, 13, 116, 118, 119, 130, 136, 144, 145, 148, 149, 150, 151, 152, 153, 155, 157, 158,
    438, 439, 440, 442, 468, 477, 478, 485, 623].includes(row.id)) return effectScope(row, text, label);
  return routeScope(row, text, label);
}
function comparable(value) {
  if (Array.isArray(value)) return value.map(comparable);
  if (typeof value === 'string') return value.replace(/http:\/\/127\.0\.0\.1:\d+/g, '<actual-owned-loopback-origin>');
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['actualProgramSha256', 'clientTransportErrorNotUsedAsContrast'].includes(key)).map(([key, child]) => [key, comparable(child)]));
}
async function main() {
  const target = new Set((previousLocal || previous).stillSemanticUnresolved.map(row => row.id));
  for (const row of inventory.definitions.filter(row => target.has(row.id))) {
    if (Date.now() + 15000 >= deadline) { still.push({ id: row.id, reason: 'fixed-worker-deadline-no-new-scope-admission' }); continue; }
    const result = { id: row.id, sourceSha256: inventory.sourceSha256, fullMutantSourceSha256: row.mutantSha256,
      range: { start: row.start, end: row.end, line: row.line }, exactOriginal: row.original, exactReplacement: row.replacement,
      method: 'specific exact fragment at this source range, actual accepted C022 authority or real owned HTTP handle; NOT a whole-mutant kill or a global equivalence',
      actualRouteDomain: 'subject.ROUTES consumed from the actual dispatcher', inventedIdentityService: false, compiledFaultUsedAsDifference: false };
    try {
      result.original = await execute(row, row.original, 'original');
      result.negativeControl = await execute(row, row.original, 'unchanged-original-control');
      result.mutant = await execute(row, row.replacement, 'mutant');
      result.negativeControlIdentical = JSON.stringify(comparable(result.original)) === JSON.stringify(comparable(result.negativeControl));
      result.qualifiedLocalContrast = result.negativeControlIdentical && JSON.stringify(comparable(result.original)) !== JSON.stringify(comparable(result.mutant));
      if (result.qualifiedLocalContrast) closure.push(result);
      else still.push({ id: row.id, reason: result.negativeControlIdentical ? 'NO_LOCAL_VALUE_OR_EFFECT_DIFFERENCE' : 'NEGATIVE_CONTROL_DIFFERED_NONPASS' });
    } catch (error) {
      result.qualifiedLocalContrast = false; result.nonKillLocalFault = { name: error.name, code: error.code, message: error.message, stack: error.stack };
      still.push({ id: row.id, reason: 'SCOPED_FAULT_OR_TIMEOUT_NON_KILL' });
    }
    save('local-' + String(row.id).padStart(4, '0') + '.json', result);
    finalRows.push(result);
    fs.appendFileSync(path.join(output, 'local-chronology.raw.jsonl'), JSON.stringify({ id: row.id, qualified: result.qualifiedLocalContrast,
      negativeControlIdentical: result.negativeControlIdentical, resultSha256: sha(fs.readFileSync(path.join(output, 'local-' + String(row.id).padStart(4, '0') + '.json'))) }) + '\n');
  }
  assert.equal(sha(fs.readFileSync(path.join(root, 'server.cjs'))), inventory.sourceSha256, 'ACTUAL_PRODUCTION_SOURCE_BYTES_UNCHANGED_AFTER_SCOPED_CONTRASTS');
  const report = { schema: 'C047-additional-precise-runnable-source-bound-local-contrasts/1', sourceSha256: inventory.sourceSha256,
    previousActualNamedKills: campaign.namedKilled, previousQualifiedLocalContrasts: previous.locallyContrasted,
    previousAdditionalQualifiedLocalContrasts: previousLocal?.additionalQualifiedLocalContrasts || 0,
    additionalQualifiedLocalContrasts: closure.length, currentEligibleChangedCompiled: inventory.counts.eligibleChangedCompiled,
    locallyContrastedIds: closure.map(row => row.id), stillSemanticUnresolved: still, stillSemanticUnresolvedCount: still.length,
    wholeMutantRuntimeFaultsAndTimeoutsRemainNonKills: true, wholeMutantKillsClaimed: 0, globalEquivalencesClaimed: 0, blanketDefaultPairs: 0,
    actualLocalAttempts: finalRows.length, actualNegativeControls: finalRows.filter(row => row.negativeControl).length,
    exactOwnListenerCleanupRequiredInEveryScopeFinally: true };
  save('local.json', report); console.log(JSON.stringify(report));
}
main().catch(error => { save('local-failure.json', { name: error.name, code: error.code, message: error.message, stack: error.stack }); console.error(error); process.exitCode = 1; });
