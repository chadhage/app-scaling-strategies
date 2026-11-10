'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { test } = require('node:test');

const repository = process.env.U054_SUBJECT_ROOT
  ? path.resolve(process.env.U054_SUBJECT_ROOT) : path.resolve(__dirname, '..', '..', '..');
const catalog = require(path.join(repository, 'capability', 'C041', 'accepted-catalog.js'));
const host = require(path.join(repository, 'capability', 'C041', 'serve.cjs'));
const consumer = require(path.join(repository, 'capability', 'C059', 'server.cjs'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = bytes => Buffer.from([...bytes].filter((byte, index) => byte !== 13 || bytes[index + 1] !== 10));
const crlf = bytes => Buffer.from([...lf(bytes)].flatMap(byte => byte === 10 ? [13, 10] : [byte]));
const wrong = '0'.repeat(64);
const assets = catalog.lessons.flatMap(lesson => lesson.assets);

function request(server, target) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: server.address().port, path: target }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, bytes: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
  });
}

for (const asset of assets) {
  const original = fs.readFileSync(path.join(repository, ...asset.path.split('\\')));
  const raw = crlf(original);
  const canonical = lf(original);
  test(`${asset.path}: catalog records BOTH immutable byte forms`, () => {
    assert.equal(asset.sha256, sha(raw), 'legacy raw pin is retained');
    assert.equal(asset.rawSha256, sha(raw), 'explicit raw pin');
    assert.equal(asset.crlfToLfSha256, sha(canonical), 'explicit canonical pin');
    assert.notEqual(asset.rawSha256, asset.crlfToLfSha256, 'the branches use distinct byte forms');
  });
  test(`${asset.path}: RAW branch accepts CRLF with a wrong canonical pin`, () => {
    assert.equal(host.verifyAsset({ ...asset, crlfToLfSha256: wrong }, raw), raw);
  });
  test(`${asset.path}: CANONICAL branch accepts LF with wrong raw pins`, () => {
    assert.doesNotThrow(() => assert.equal(host.verifyAsset({
      ...asset, sha256: wrong, rawSha256: wrong, crlfToLfSha256: sha(canonical)
    }, canonical), canonical), `LF accepted asset ${asset.path} must not report an integrity mismatch`);
  });
  for (const [form, bytes] of [['CRLF', raw], ['LF', canonical]]) {
    test(`${asset.path}: ${form} changed byte is refused BY NAME`, () => {
      const changed = Buffer.from(bytes);
      changed[changed.length >> 1] ^= 1;
      assert.throws(() => host.verifyAsset(asset, changed), error => {
        assert.match(error.message, /Pinned lesson asset integrity mismatch/);
        assert.ok(error.message.includes(asset.path), `mismatch names ${asset.path}`);
        return true;
      });
    });
  }
}

test('C041 actual service starts with LF assets and serves exact original buffers', async () => {
  let fixture;
  try {
    await assert.doesNotReject(async () => { fixture = await host.startHost(); },
      'C041 LF startup must not fail with Pinned lesson asset integrity mismatch');
    assert.equal(fixture.server.address().address, '127.0.0.1');
    for (const lesson of catalog.lessons) {
      for (const asset of lesson.assets) {
        const answer = await request(fixture.server, `/c041-lessons/${lesson.id}/${asset.file}`);
        assert.equal(answer.status, 200);
        assert.deepEqual(answer.bytes, fs.readFileSync(path.join(repository, ...asset.path.split('\\'))));
      }
    }
  } finally {
    if (fixture) await fixture.close();
  }
});

test('current accepted C059 actual service starts with LF assets without replacing its source', async () => {
  let server;
  try {
    await assert.doesNotReject(async () => { server = await consumer.startLocal(); },
      'C059 LF startup must not fail with Pinned lesson asset integrity mismatch');
    assert.equal(server.address().address, '127.0.0.1');
    const answer = await request(server, '/');
    assert.equal(answer.status, 200);
    assert.match(answer.bytes.toString('utf8'), /C059/);
  } finally {
    if (server) await consumer.closeServer(server);
  }
});

test('raw-only legacy callers retain byte-exact UTF-8 and binary Buffer semantics', () => {
  for (const bytes of [Buffer.from('é\r\n雪\0\r'), Buffer.from([255, 254, 0, 13, 10, 128, 13])]) {
    assert.equal(host.verifyAsset({ sha256: sha(bytes) }, bytes), bytes);
    const changed = Buffer.from(bytes); changed[0] ^= 1;
    assert.throws(() => host.verifyAsset({ path: 'binary-control', sha256: sha(bytes) }, changed), /integrity mismatch/);
  }
});

test('canonical hashing changes CRLF pairs only, never UTF-8, invalid bytes or bare CR', () => {
  for (const bytes of [Buffer.from('é\r\n雪\0\r'), Buffer.from([255, 254, 0, 13, 10, 128, 13])]) {
    assert.doesNotThrow(() => assert.equal(host.verifyAsset({ path: 'canonical-control', sha256: wrong,
      rawSha256: wrong, crlfToLfSha256: sha(lf(bytes)) }, bytes), bytes));
    const changed = Buffer.from(bytes); changed[changed.length - 1] ^= 1;
    assert.throws(() => host.verifyAsset({ path: 'canonical-control', sha256: wrong,
      crlfToLfSha256: sha(lf(bytes)) }, changed), /integrity mismatch/);
  }
});
