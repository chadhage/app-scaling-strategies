'use strict';

const path = require('node:path');
const { verifyDependencies } = require('./source-integrity.cjs');
verifyDependencies();
const { openIsolatedLoopback } = require(path.join(__dirname, '..', '..', 'testing', 'browser', 'isolated.cjs'));
const { startPair, optionsLifetime, limits } = require('./server.cjs');
const { recheckConsent } = require('./consent.cjs');

async function openClients(options) {
  if (arguments.length > 1) throw new TypeError('Only a bounded lifetime option is supported; browser/target overrides are forbidden.');
  optionsLifetime(options);
  verifyDependencies();
  const pair = await startPair(options);
  const sessions = {};
  let deadline;
  let closing;
  const close = () => {
    if (!closing) closing = (async () => {
      clearTimeout(deadline);
      let errors = [];
      try {
        const outcomes = await Promise.allSettled(Object.values(sessions).map(session => session.close()));
        errors = outcomes.filter(outcome => outcome.status === 'rejected').map(outcome => outcome.reason);
      } finally { await pair.close(); }
      if (errors.length) throw new AggregateError(errors, 'Exact isolated browser cleanup failed.');
    })();
    return closing;
  };
  try {
    for (const lane of ['ga', 'preview']) {
      sessions[lane] = await openIsolatedLoopback(path.join('capability', 'C045', 'index.html'), pair.clients[lane].server);
      await sessions[lane].page.waitForFunction(() => document.documentElement.dataset.scope === 'local-ready', undefined, { timeout: 10000 });
    }
    if (sessions.ga.page === sessions.preview.page || sessions.ga.page.context() === sessions.preview.page.context()
      || new URL(sessions.ga.page.url()).origin === new URL(sessions.preview.page.url()).origin) {
      throw new Error('Actual independently isolated pages, contexts and owned destinations were not obtained.');
    }
    const clients = Object.fromEntries(['ga', 'preview'].map(lane => [lane, Object.freeze({
      ...pair.clients[lane], page: sessions[lane].page, browserVersion: sessions[lane].browserVersion
    })]));
    deadline = setTimeout(() => { close().catch(() => { process.exitCode = 1; }); }, optionsLifetime(options));
    deadline.unref();
    return Object.freeze({ clients: Object.freeze(clients), close });
  } catch (error) {
    await close();
    throw error;
  }
}

async function cli() {
  await recheckConsent();
  if (process.argv.length !== 2) throw new Error('C045 clients accept no browser, identity, host, port, provider, target or stamp arguments.');
  const opened = await openClients();
  let timer;
  let stop;
  try {
    console.log(JSON.stringify({ event: 'C045-actual-isolated-client-pages-open', pid: process.pid,
      mode: 'two actual separate headless Edge browsers/contexts/pages through the unchanged published helper',
      browserPid: 'not exposed by the verified public helper; no invented PIDs or window IDs',
      independentPages: opened.clients.ga.page !== opened.clients.preview.page,
      independentContexts: opened.clients.ga.page.context() !== opened.clients.preview.page.context(),
      clients: Object.fromEntries(Object.entries(opened.clients).map(([lane, client]) => [lane, {
        actualURL: client.page.url(), serverURL: client.url, listenerPid: process.pid, browserVersion: client.browserVersion
      }])), ttlMs: limits.ttlMs }));
    await new Promise(resolve => {
      stop = () => resolve();
      timer = setTimeout(stop, limits.ttlMs);
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    });
  } finally {
    clearTimeout(timer);
    if (stop) { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
    await opened.close();
    console.log(JSON.stringify({ event: 'C045-exact-clients-closed', pid: process.pid,
      pagesClosed: Object.values(opened.clients).every(client => client.page.isClosed()),
      listenersClosed: Object.values(opened.clients).every(client => !client.server.listening) }));
  }
}

module.exports = Object.freeze({ openClients });
if (require.main === module) cli().catch(error => { console.error(error.message); process.exitCode = 1; });
