'use strict';

const { readFresh } = require('./process-reader.cjs');
const { startInspection } = require('./server.cjs');

(async () => {
  const [action, namespace, runId, ...extra] = process.argv.slice(2);
  if (extra.length) throw new Error('No extra arguments, paths, permissions or listener overrides are supported.');
  if (action === 'read' && process.argv.length === 5) {
    process.stdout.write(`${JSON.stringify(await readFresh(namespace, runId), null, 2)}\n`);
    return;
  }
  if (action === 'serve' && process.argv.length === 4) {
    const host = await startInspection(namespace);
    const shutdown = () => host.close().catch((error) => { console.error(error.message); process.exitCode = 1; });
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    host.server.once('close', () => {
      process.removeListener('SIGINT', shutdown);
      process.removeListener('SIGTERM', shutdown);
    });
    process.stdout.write(`${JSON.stringify({
      banner: 'Training rehearsal - synthetic data - not a live Azure result',
      url: host.url, namespace, maximumLifetimeMs: host.maximumLifetimeMs,
      readOnly: true, currentC001LocalProbe: host.probe,
    }, null, 2)}\n`);
    return;
  }
  throw new Error('Use read NAMESPACE RUN_ID or serve NAMESPACE. No create, advance, finish, cancel, reset, cloud or default-run action.');
})().catch((error) => {
  process.stderr.write(`${JSON.stringify({ restored: false, code: error.code || 'INVALID_ARGUMENTS',
    message: error.message, details: error.details || [], pid: error.pid || process.pid })}\n`);
  process.exitCode = 1;
});
