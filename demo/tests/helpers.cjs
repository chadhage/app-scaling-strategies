'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../app.cjs');
const { fail } = require('../lib/contract.cjs');

class MemoryStore {
  constructor() { this.records = new Map(); this.version = 0; this.available = true; }
  async ready() { if (!this.available) throw fail('storage-unavailable', 'Injected storage failure.', 503); }
  async get(key) {
    await this.ready();
    return this.records.has(key) ? structuredClone(this.records.get(key)) : null;
  }
  async put(key, value, etag = null) {
    await this.ready();
    const previous = this.records.get(key);
    if (previous ? previous.etag !== etag : etag !== null) throw fail('state-conflict', 'ETag conflict.', 409);
    const next = `etag-${++this.version}`;
    this.records.set(key, { value: structuredClone(value), etag: next });
    return next;
  }
}

async function fixture(t) {
  const store = new MemoryStore();
  const credentials = { demoToken: 'd'.repeat(64), controlToken: 'c'.repeat(64) };
  const releases = {};
  const errors = [];
  const start = async (version, origins) => {
    releases[version] = { version, epoch: '123.1', commit: 'a'.repeat(40) };
    const app = createApp({ store, ...credentials, origins, release: releases[version], instanceId: `${version}-worker`, logger: value => errors.push(value) });
    const server = await new Promise(resolve => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    t.after(async () => {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    });
    return `http://127.0.0.1:${server.address().port}`;
  };
  const blueUrl = await start('blue');
  const greenUrl = await start('green');
  const routerUrl = await start('router', { blue: blueUrl, green: greenUrl });
  const context = {
    blueUrl, greenUrl, routerUrl, epoch: '123.1', commit: 'a'.repeat(40), users: 4,
    requestBudgetMs: 200, journeyBudgetMs: 30000, readinessTimeoutMs: 5000,
    monitorTimeoutMs: 60000, observationSeconds: 0, journeysPerSecond: 1
  };
  const request = async (endpoint, body, { base = routerUrl, control = false, token } = {}) => {
    const response = await fetch(new URL(endpoint, base), {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${token ?? (control ? credentials.controlToken : credentials.demoToken)}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  };
  const route = async (greenPercent, revision = -1) => {
    const result = await request('/control/route', { epoch: context.epoch, greenPercent, expectedRevision: revision }, { control: true });
    assert.equal(result.status, 200);
    return result.body.revision;
  };
  return { store, releases, credentials, context, request, route, errors };
}

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'app-scaling-demo-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

module.exports = { MemoryStore, fixture, temporaryDirectory };
