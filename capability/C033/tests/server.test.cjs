'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const api = require(path.join(__dirname, '..', 'server.cjs'));
const contract = require(path.join(__dirname, '..', '..', 'C020', 'contract.js'));
const approved = require(path.join(__dirname, '..', '..', 'C001', 'approved-contract.js'));
const pins = require(path.join(__dirname, '..', 'imports.json'));
const dependency = {
  id: 'C020', state: 'Done', kano: 'S', acceptedAtUtc: '2026-11-03T14:57:22.8594393Z',
  accepted: true, focusedTestsPassed: true, browserObserved: true, remoteVerified: true,
  publication: pins.acceptedC020
};

function request(port, target, options = {}) {
  return new Promise((resolve, reject) => {
    const call = http.request({
      hostname: '127.0.0.1', port, path: target, method: options.method || 'GET',
      headers: { Connection: 'close', ...options.headers }
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const bytes = Buffer.concat(chunks);
        let value;
        try { value = JSON.parse(bytes.toString('utf8')); } catch { value = null; }
        resolve({ status: response.statusCode, headers: response.headers, bytes, value });
      });
    });
    call.setTimeout(3000, () => call.destroy(new Error('Owned read-only request timeout.')));
    call.on('connect', (response, socket) => {
      socket.destroy();
      resolve({ status: response.statusCode, headers: response.headers, bytes: Buffer.alloc(0), value: null });
    });
    call.on('error', reject);
    call.end(options.body);
  });
}

test('strict C001 approval and independently accepted exact C020 gate are required; no listener bypass export', { timeout: 15000 }, async () => {
  const current = await api.assertCurrentConsent();
  assert.equal(current.permission.allowed, true);
  assert.equal(current.dependency.publication.commit, pins.acceptedC020.commit);
  assert.equal(api.createLocalServer, undefined);
  for (const approval of [
    undefined, {}, { ...approved.approval, designAndLocalImplementationApproved: 'true' },
    { ...approved.approval, authorizedCloudSpend: 1 }
  ]) {
    await assert.rejects(api.authorizeRecord({ approval, dependency }), /current C001 local consent denied/);
  }
  for (const change of [{ state: 'In Progress' }, { accepted: 'true' }, { remoteVerified: false },
    { publication: { commit: '0'.repeat(40), tag: pins.acceptedC020.tag } }]) {
    await assert.rejects(api.authorizeRecord({ approval: approved.approval, dependency: { ...dependency, ...change } }), /entry gate denied/);
  }
  await assert.rejects(api.startLocal('localhost'), /no host, port/);
});

test('actual closed HTTP providers preserve both implementations, immutable profiles and CSP', { timeout: 20000 }, async (t) => {
  const server = await api.startLocal();
  t.after(() => api.closeOwned(server));
  assert.equal(server.address().address, '127.0.0.1');
  assert.equal(server.address().family, 'IPv4');
  const port = server.address().port;
  assert.ok(port > 0);
  for (const profile of contract.profiles) {
    const values = [];
    for (const implementation of ['v1', 'v2']) {
      const reply = await request(port, `/fixtures/${implementation}/getProfile?profileId=${profile.id}`);
      assert.equal(reply.status, 200);
      assert.deepEqual(reply.value.profile, profile);
      assert.deepEqual(reply.value.stamp, contract.stamps[implementation]);
      assert.equal(reply.headers['x-c020-implementation-version'], reply.value.stamp.implementationVersion);
      assert.equal(reply.headers['x-c020-deployment-stamp'], reply.value.stamp.deploymentStamp);
      assert.equal(reply.headers['content-security-policy'], api.CSP);
      assert.equal(reply.headers['access-control-allow-origin'], undefined);
      assert.equal(reply.headers.location, undefined);
      values.push(reply.value);
    }
    assert.deepEqual(values[0].profile, values[1].profile);
    assert.notEqual(values[0].stamp.implementationVersion, values[1].stamp.implementationVersion);
  }
  const original = await request(port, '/fixtures/v1/getProfile?profileId=synthetic-001');
  original.value.profile.preferences.theme = 'client-copy-only';
  assert.deepEqual((await request(port, '/fixtures/v2/getProfile?profileId=synthetic-001')).value.profile, contract.profiles[0]);
  const missing = await request(port, '/fixtures/v1/getProfile?profileId=synthetic-999');
  assert.equal(missing.status, 404);
  assert.equal(missing.value.error.code, 'UNKNOWN_PROFILE');
  for (const asset of ['/', '/journey.js', '/page.js', '/style.css']) {
    const value = await request(port, asset);
    assert.equal(value.status, 200);
    assert.equal(value.headers['x-c033-card'], 'C033');
    assert.equal(value.headers['cache-control'], 'no-store');
  }
  await api.closeOwned(server);
  await api.closeOwned(server);
  assert.equal(server.listening, false);
  assert.equal(api.observations(server).closed, true);
  await assert.rejects(request(port, '/'), /ECONNREFUSED/);
});

test('actual own HTTP rejects foreign hosts/origins, writes/bodies, query/path and header overrides without redirects', { timeout: 20000 }, async (t) => {
  const server = await api.startLocal();
  t.after(() => api.closeOwned(server));
  const port = server.address().port;
  const provider = '/fixtures/v1/getProfile?profileId=synthetic-001';
  const cases = [
    [provider, { headers: { Host: `localhost:${port}` } }, 421],
    [provider, { headers: { Host: `127.0.0.1:${port + 1}` } }, 421],
    [provider, { headers: { Origin: 'https://example.invalid' } }, 403],
    [provider, { headers: { Origin: 'null' } }, 403],
    ...['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT'].map((method) => [provider, { method }, 405]),
    [provider, { headers: { Connection: 'Upgrade', Upgrade: 'websocket' } }, 400],
    [provider, { headers: { 'Content-Length': '1' }, body: 'x' }, 400],
    [provider, { headers: { 'Transfer-Encoding': 'chunked' }, body: 'x' }, 400],
    ...['Authorization', 'Cookie', 'Forwarded', 'X-Forwarded-Host', 'X-C020-Implementation-Version', 'X-C020-Deployment-Stamp']
      .map((header) => [provider, { headers: { [header]: 'forged' } }, 400]),
    ['/fixtures/v1/getProfile', {}, 400],
    ['/fixtures/v1/getProfile?profileId=', {}, 400],
    ['/fixtures/v1/getProfile?profileId=real-user', {}, 400],
    [`${provider}&profileId=synthetic-002`, {}, 400],
    [`${provider}&stamp=production`, {}, 400],
    ['/fixtures/v1/getProfile?profileId=synthetic%2d001', {}, 400],
    ['/fixtures/v3/getProfile?profileId=synthetic-001', {}, 400],
    ['/fixtures/v1/getProfile?profileId=synthetic-001#fragment', {}, 400],
    ['/page.js?target=http://example.invalid', {}, 400],
    ['/../C020/profiles.cjs', {}, 404],
    ['/%2e%2e/C001/approved-contract.js', {}, 404],
    ['/fixtures/v1/../v2/getProfile', {}, 404],
    ['/scope.json', {}, 404],
    ['/proxy', {}, 404],
    [`http://127.0.0.1:${port}/`, {}, 400],
    ['//127.0.0.1/', {}, 400],
    [`/${'x'.repeat(257)}`, {}, 414]
  ];
  for (const [target, options, expected] of cases) {
    const value = await request(port, target, options);
    assert.equal(value.status, expected, `${options.method || 'GET'} ${target}`);
    assert.equal(value.headers.location, undefined);
    assert.equal(value.headers['access-control-allow-origin'], undefined);
  }
  assert.equal(api.observations(server).providerRequests.length, 0, 'Rejected requests must not call providers.');
});

test('actual CLI prints owned URL/PID, responds, and awaits its exact stop; unknown arguments fail visibly', { timeout: 20000 }, async (t) => {
  const repository = path.resolve(__dirname, '..', '..', '..');
  const script = path.join('capability', 'C033', 'server.cjs');
  const child = spawn(process.execPath, [script], { cwd: repository, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  let ready;
  const listening = new Promise((resolve, reject) => {
    ready = { resolve, reject };
  });
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    for (const line of stdout.split(/\r?\n/)) {
      try {
        const record = JSON.parse(line);
        if (record.event === 'C033-owned-listening') ready.resolve(record);
      } catch {}
    }
  });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', (error) => ready.reject(error));
  child.on('exit', (code) => { if (!stdout.includes('C033-owned-listening')) ready.reject(new Error(`CLI exit=${code}: ${stderr}`)); });
  const exited = once(child, 'exit');
  const boundedExit = async () => {
    let timeout;
    try {
      return await Promise.race([exited, new Promise((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`Owned CLI PID ${child.pid} did not exit after stop.`)), 5000);
      })]);
    } finally { clearTimeout(timeout); }
  };
  const startup = setTimeout(() => ready.reject(new Error('CLI startup timeout.')), 12000);
  t.after(async () => {
    clearTimeout(startup);
    if (child.exitCode === null) {
      child.stdin.end('stop\n');
      try { await boundedExit(); }
      catch (error) {
        execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `Stop-Process -Id ${child.pid} -ErrorAction Stop`], {
          windowsHide: true, timeout: 5000, stdio: 'pipe'
        });
        await exited;
        throw error;
      }
    }
  });
  const record = await listening;
  clearTimeout(startup);
  assert.equal(record.pid, child.pid);
  console.log(JSON.stringify({ event: 'C033-tested-CLI-start', pid: record.pid, url: record.url }));
  assert.match(record.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  const port = Number(new URL(record.url).port);
  assert.equal((await request(port, '/')).status, 200);
  child.stdin.end('stop\n');
  const [code] = await boundedExit();
  assert.equal(code, 0, stderr);
  assert.match(stdout, /"event":"C033-owned-closed"/);
  console.log(JSON.stringify({ event: 'C033-tested-CLI-graceful-stop', pid: record.pid, exitCode: code }));
  await assert.rejects(request(port, '/'), /ECONNREFUSED/);
  const rejected = spawn(process.execPath, [script, '--host', 'example.invalid'], { cwd: repository, windowsHide: true });
  let rejection = '';
  rejected.stderr.on('data', (chunk) => { rejection += chunk; });
  const [invalidCode] = await once(rejected, 'exit');
  assert.equal(invalidCode, 1);
  assert.match(rejection, /accepts no arguments.*no listener was started/);
});

module.exports = Object.freeze({ request });
