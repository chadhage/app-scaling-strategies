'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { execFileSync } = require('node:child_process');
const { call, manualClock, seededBytes, MEMBERS, raw } = require('./helpers.cjs');
const { sha, lf } = require('./evidence-verify.cjs');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const gitRepo = process.env.C022_GIT_REPO || repo;
const published = 'd7ebef55c2b3265ca843851cbc2ed7ba68658621';
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) =>
  value.startsWith('--') ? [...pairs, [value.slice(2), all[i + 1]]] : pairs, []));
const scratch = path.resolve(args.scratch);
const production = ['server.cjs', 'identity.cjs', 'store.cjs', 'service.cjs', 'contract.js', 'page.js', 'index.html', 'style.css'];
const imports = require('../imports.json').dependencies.filter((entry) => entry.path.startsWith('capability/'));
const source = Object.fromEntries(production.map((file) => {
  const blob = execFileSync('git', ['show', `${published}:capability/C022/${file}`], { cwd: gitRepo });
  assert.equal(sha(lf(fs.readFileSync(path.join(root, file)))), sha(lf(blob)), `${file} is the frozen published source`);
  return [file, blob.toString('utf8')];
}));
const recipes = [
  { id: 'server-115', file: 'server.cjs', from: 'if (hit.found[1] !== undefined)', to: 'if (true)' },
  { id: 'server-217', file: 'server.cjs', from: 'server.closeAllConnections();', to: ';' },
  { id: 'E01', file: 'identity.cjs', from: 'const TICKET_SHAPE = /^t022_[A-Za-z0-9_-]{43}$/;',
    to: 'const TICKET_SHAPE = /^t022_[A-Za-z0-9_-]{43}/;' }
];

function materialize(name, recipe) {
  const tree = path.join(scratch, name);
  const own = path.join(tree, 'capability', 'C022');
  fs.mkdirSync(own, { recursive: true });
  for (const [file, text] of Object.entries(source)) {
    if (recipe?.file === file) assert.equal(text.split(recipe.from).length - 1, 1, `${recipe.id} applies exactly once`);
    fs.writeFileSync(path.join(own, file), recipe?.file === file ? text.replace(recipe.from, recipe.to) : text);
  }
  for (const entry of imports) {
    const blob = execFileSync('git', ['show', `${entry.commit}:${entry.path}`], { cwd: gitRepo });
    assert.equal(sha(lf(blob)), entry.git, `${entry.path} is its accepted blob`);
    const destination = path.join(tree, entry.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, blob);
  }
  return own;
}

async function appAt(own, hooks = {}) {
  const clock = manualClock();
  const app = require(path.join(own, 'server.cjs')).createApp({
    now: clock.now, randomBytes: seededBytes('equivalent'), hooks,
    limits: { sessionsPerTenant: 64, recordsPerTenant: 128 }
  });
  app.server.prependListener('request', (_request, response) => { response.sendDate = false; });
  await new Promise((resolve, reject) => {
    app.server.once('error', reject);
    app.server.listen(0, '127.0.0.1', resolve);
  });
  return { app, port: app.server.address().port };
}
const answer = (value) => ({ status: value.status, headers: value.headers, text: value.text, json: value.json });

async function routes(own) {
  const ctx = await appAt(own);
  try {
    const principals = [];
    for (const [tenant, team] of Object.entries(MEMBERS)) for (const user of Object.keys(team)) {
      const login = await call(ctx.port, 'POST', '/v1/session/login', { body: { ticket: ctx.app.issueTicket({ user, tenant }) } });
      assert.equal(login.status, 201);
      principals.push({ user, tenant, token: login.json.token });
    }
    const anonymous = await call(ctx.port, 'POST', '/v1/session/anonymous');
    assert.equal(anonymous.status, 201);
    principals.push({ user: 'anonymous', token: anonymous.json.token }, { user: 'none' });
    assert.equal(principals.length, 12);
    const targets = ['/', '/scope.json', '/v1/session', '/v1/projects', '/v1/projects/proj-0001',
      '/v1/projects/absent', '/v1/profiles', '/v1/profiles/synthetic-001', '/v1/profiles/synthetic-002',
      '/v1/admin/sessions', '/v1/admin/audit', '/v1/projects?limit=1', '/v1/projects?q=alder',
      '/v1/projects?q=birch', '/v1/projects?tenant=tenant-birch', '/v1/session?x=1',
      '/v1/projects/%ff', '/v1/projects/proj-9999', '/v1/unknown', '/v1/session/switch',
      '/v1/admin/role', '/v1/admin/revoke', '/v1/session/login', '/v1/session/logout',
      '/v1/session/anonymous', '/v1/projects?limit=11', '/v1/projects?cursor=foreign',
      '/v1/projects?limit=0', '/v1/profiles/absent', '/v1/projects?limit=2&q=r'];
    const outcomes = [];
    for (const principal of principals) for (const method of ['GET', 'HEAD', 'POST']) for (const target of targets) {
      if (outcomes.length === 1078) break;
      const options = { token: principal.token, ...(method === 'POST' ? { body: {} } : {}) };
      outcomes.push({ request: { principal: principal.user, tenant: principal.tenant || null, method, target },
        response: answer(await call(ctx.port, method, target, options)) });
    }
    assert.equal(outcomes.length, 1078);
    return { principals: principals.length, outcomes, final: ctx.app.snapshot() };
  } finally { await ctx.app.close(); }
}

function socketAt(port, bytes = '') {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    const chunks = [];
    const closed = new Promise((done) => socket.once('close', done));
    socket.on('error', () => {});
    socket.on('data', (data) => chunks.push(data));
    socket.once('connect', () => { if (bytes) socket.write(bytes); resolve({ socket, chunks, closed }); });
    socket.once('error', reject);
  });
}

async function closing(own) {
  let release;
  let entered;
  const held = new Promise((resolve) => { entered = resolve; });
  const barrier = new Promise((resolve) => { release = resolve; });
  const ctx = await appAt(own, { beforeCommit: async (info) => { if (info.op === 'project.create') { entered(); await barrier; } } });
  const sockets = [];
  try {
    const login = await call(ctx.port, 'POST', '/v1/session/login', {
      body: { ticket: ctx.app.issueTicket({ user: 'alf', tenant: 'tenant-alder' }) }
    });
    assert.equal(login.status, 201);
    const host = `Host: 127.0.0.1:${ctx.port}\r\n`;
    const auth = `Authorization: Bearer ${login.json.token}\r\n`;
    const body = JSON.stringify({ name: 'held', units: 1 });
    const shapes = [
      `GET /v1/session HTTP/1.1\r\n${host}${auth}\r\n`, '',
      `GET /v1/session HTTP/1.1\r\n${host}`,
      `POST /v1/projects HTTP/1.1\r\n${host}${auth}Content-Type: application/json\r\nContent-Length: 100\r\n\r\n{`,
      `POST /v1/projects HTTP/1.1\r\n${host}${auth}Content-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
    ];
    for (const [index, bytes] of shapes.entries()) {
      sockets.push(await socketAt(ctx.port, bytes));
      if (index === 0) {
        await new Promise((resolve) => {
          const entry = sockets[0];
          const check = () => {
            if (raw.parseAnswers(Buffer.concat(entry.chunks)).length) {
              entry.socket.off('data', check);
              resolve();
            }
          };
          entry.socket.on('data', check);
          check();
        });
        assert.equal(raw.parseAnswers(Buffer.concat(sockets[0].chunks))[0].status, 200, 'the idle keep-alive shape first completed its GET');
      }
    }
    await held;
    await ctx.app.close();
    release();
    await Promise.all(sockets.map((entry) => entry.closed));
    await new Promise((resolve) => setImmediate(resolve));
    const count = await new Promise((resolve, reject) => ctx.app.server.getConnections((error, n) => error ? reject(error) : resolve(n)));
    assert.equal(count, 0);
    return { shapes: ['idle keep-alive', 'never sends', 'half headers', 'mid-body', 'held commit'],
      sockets: sockets.map((entry) => ({ destroyed: entry.socket.destroyed, bytes: Buffer.concat(entry.chunks).toString('utf8') })),
      connections: count, listening: ctx.app.server.listening, final: ctx.app.snapshot() };
  } finally {
    release();
    for (const entry of sockets) entry.socket.destroy();
    await ctx.app.close();
  }
}

function tickets(own) {
  const create = require(path.join(own, 'identity.cjs')).createIdentity;
  const variants = [null, undefined, '', 1, {}, [], 'x', 't022_', 't022_' + 'a'.repeat(43), 'prefix', '\0', '\n'];
  const suffixes = Array.from({ length: 240 }, (_, i) => String.fromCodePoint(i + 1));
  const outcomes = [];
  for (let i = 0; i < variants.length + suffixes.length; i += 1) {
    const identity = create({ now: () => 1000000, randomBytes: seededBytes('ticket-equivalent') });
    const ticket = identity.issueTicket({ user: 'dana', tenant: 'tenant-alder' });
    const input = i < variants.length ? variants[i] : ticket + suffixes[i - variants.length];
    const rejected = identity.login(input, null);
    const valid = identity.login(ticket, null);
    const replay = identity.login(ticket, null);
    outcomes.push({ index: i, input: input === undefined ? { undefined: true } : input, rejected, valid, replay, final: identity.snapshot() });
  }
  return { variants: variants.length, suffixCases: suffixes.length, outcomes };
}

async function main() {
  fs.mkdirSync(scratch, { recursive: false });
  const results = [];
  try {
    const real = materialize('real');
    for (const recipe of recipes) {
      const mutant = materialize(recipe.id, recipe);
      const scenario = recipe.id === 'server-115' ? routes : recipe.id === 'server-217' ? closing : tickets;
      const before = await scenario(real);
      const after = await scenario(mutant);
      assert.deepEqual(after, before, `${recipe.id}: complete outcomes agree`);
      results.push({ ...recipe, equal: true, outcomeSha256: sha(JSON.stringify(before)), real: before, mutant: after });
      console.log(`EQUIVALENT ${recipe.id}: complete outcomes equal`);
    }
    const document = { schema: 'C022-equivalence/1', published, volatileFields: ['HTTP Date disabled in both fixtures; ephemeral Host ports are request transport only'],
      sourceLf: Object.fromEntries(Object.entries(source).map(([name, text]) => [name, sha(lf(Buffer.from(text)))])), results };
    fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(document, null, 2)}\n`, { flag: 'wx' });
    console.log(JSON.stringify({ equivalent: results.length, requests: 1078, principals: 12, closeShapes: 5, ticketVariants: 12, suffixCases: 240 }));
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
