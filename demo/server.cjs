'use strict';

const { createApp } = require('./app.cjs');
const { BlobStore } = require('./lib/store.cjs');
const { integer } = require('./lib/contract.cjs');
const release = require('./release.json');

if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('The native demonstration requires Node.js 24.');
const app = createApp({
  store: new BlobStore(process.env.DEMO_STORAGE_URL, 'demo'),
  release,
  demoToken: process.env.DEMO_TOKEN,
  controlToken: process.env.CONTROL_TOKEN,
  origins: { blue: process.env.BLUE_ORIGIN, green: process.env.GREEN_ORIGIN },
  instanceId: process.env.WEBSITE_INSTANCE_ID
});
const server = app.listen(integer(process.env.PORT || '8080', 'PORT', 1, 65535));
server.requestTimeout = 15000;
server.headersTimeout = 10000;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(error => process.exit(error ? 1 : 0));
    server.closeIdleConnections();
    setTimeout(() => { console.error('Graceful shutdown deadline exceeded.'); process.exit(1); }, 10000).unref();
  });
}
