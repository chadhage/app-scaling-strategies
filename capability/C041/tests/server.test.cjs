'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const { test } = require('node:test');
const catalog = require('../accepted-catalog.js');
const { startHost, hostCsp, lessonCsp } = require('../serve.cjs');

test('real loopback HTTP exposes only the exact host and pinned lesson allowlist', async t => {
  const host = await startHost({ ttlMs: 30000 });
  t.after(() => host.close());
  const { port, address } = host.server.address();
  assert.equal(address, '127.0.0.1');
  function request(target, options = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1', port, path: target, method: options.method || 'GET',
        headers: options.headers || {}
      }, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve({
          status: response.statusCode, headers: response.headers, bytes: Buffer.concat(chunks)
        }));
      });
      req.on('error', reject);
      req.end();
    });
  }
  const page = await request('/');
  assert.equal(page.status, 200);
  assert.equal(page.headers['content-security-policy'], hostCsp);
  assert.match(page.bytes.toString(), /Training rehearsal — synthetic data — not a live Azure result/);
  assert.match(page.bytes.toString(), /No management access/);
  assert.equal(page.headers['x-frame-options'], 'DENY');
  assert.equal(page.headers['access-control-allow-origin'], undefined);

  await t.test('approved child bytes are unchanged and response sandbox is independent of the iframe', async () => {
    for (const lesson of catalog.lessons) {
      for (const asset of lesson.assets) {
        const response = await request(`/c041-lessons/${lesson.id}/${asset.file}`);
        assert.equal(response.status, 200);
        const rawSha256 = crypto.createHash('sha256').update(response.bytes).digest('hex');
        const canonical = Buffer.from(response.bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
        const canonicalSha256 = crypto.createHash('sha256').update(canonical).digest('hex');
        assert.ok(rawSha256 === asset.rawSha256 || canonicalSha256 === asset.crlfToLfSha256, asset.path);
        assert.equal(response.headers['content-security-policy'], lessonCsp);
        assert.match(response.headers['content-security-policy'], /sandbox allow-scripts(?:;|$)/);
        assert.doesNotMatch(response.headers['content-security-policy'], /allow-same-origin|unsafe-inline|unsafe-eval/);
        assert.match(response.headers['content-security-policy'], /connect-src 'none'/);
      }
    }
  });
  await t.test('HEAD serves metadata without a body', async () => {
    const response = await request('/host-policy.js', { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(response.bytes.length, 0);
    assert.ok(Number(response.headers['content-length']) > 0);
  });
  await t.test('repository, existing but unselected lessons, evidence, and management endpoints are absent', async () => {
    for (const target of [
      '/.git/config', '/.git/', '/.docs/wiki/flow-state.json', '/README.md', '/capability/C001/index.html',
      '/learning/S001/index.html', '/learning/S005/index.html', '/c041-lessons/A-S005/index.html',
      '/c041-lessons/A-S009/index.html', '/c041-lessons/A-S001/', '/c041-lessons/', '/evidence.json',
      '/serve.cjs', '/.gitattributes', '/tests/server.test.cjs', '/api/manage', '/api/run', '/management', '/signup'
    ]) {
      const response = await request(target);
      assert.equal(response.status, 404, target);
      assert.equal(response.bytes.toString(), 'Not available.\n');
    }
  });
  await t.test('raw traversal, encoded paths, backslashes, and query selection are rejected before normalization', async () => {
    for (const target of [
      '/../index.html', '/c041-lessons/A-S001/../../index.html', '/%2e%2e/.git/config',
      '/c041-lessons%2fA-S001/index.html', '/%5c.git%5cconfig', '/c041-lessons\\A-S001\\index.html',
      '//index.html', '/./index.html', '/?lesson=A-S001', '/index.html#A-S001'
    ]) assert.equal((await request(target)).status, 400, target);
  });
  await t.test('non-read methods cannot dispatch management actions', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const response = await request('/api/manage', { method });
      assert.equal(response.status, 405, method);
      assert.equal(response.headers.allow, 'GET, HEAD');
    }
  });
  await t.test('non-loopback authority and DNS-rebinding Host headers are refused', async () => {
    for (const authority of ['example.invalid', `localhost:${port}`, `127.0.0.1:${port + 1}`]) {
      assert.equal((await request('/', { headers: { Host: authority } })).status, 421);
    }
  });
  await t.test('explicit foreign and opaque Origin headers receive no local asset grant', async () => {
    assert.equal((await request('/', { headers: { Origin: `http://127.0.0.1:${port}` } })).status, 200);
    for (const origin of ['null', 'https://example.invalid', `http://127.0.0.1:${port + 1}`]) {
      assert.equal((await request('/', { headers: { Origin: origin } })).status, 403, origin);
    }
  });
  await host.close();
  assert.equal(host.server.listening, false);
});

test('helper rejects invalid ports and unbounded lifetimes', async () => {
  for (const options of [{ port: -1 }, { port: '80' }, { port: 65536 }, { ttlMs: 0 }, { ttlMs: 900001 }]) {
    await assert.rejects(startHost(options), RangeError);
  }
});
