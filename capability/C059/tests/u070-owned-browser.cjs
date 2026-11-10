'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
async function beforeOpen(repository) {
  const tree = require(path.join(repository, 'testing', 'browser', 'lifecycle', 'tree.cjs'));
  const { createOwnedAdapters, bounded, systemClock } = require(path.join(repository, 'testing', 'browser', 'lifecycle', 'owned.cjs'));
  const adapters = createOwnedAdapters();
  const table = () => adapters.list({ timeoutMs: 60000 });
  const same = (left, right) => left.pid === right.pid && left.createdAt === right.createdAt;
  const before = await table();
  const records = [];
  async function track(page) {
    const browser = page.context().browser();
    assert.ok(browser?.isConnected());
    const protocol = await browser.newBrowserCDPSession();
    try {
      const root = async () => {
        const reply = await protocol.send('SystemInfo.getProcessInfo');
        const roots = reply.processInfo.filter(row => row.type === 'browser');
        assert.equal(roots.length, 1);
        assert.ok(Number.isSafeInteger(roots[0].id) && roots[0].id > 0 && roots[0].id !== process.pid);
        return roots[0].id;
      };
      const pid = await root();
      const first = (await table()).find(row => row.pid === pid);
      assert.match(first?.createdAt || '', /^\d+$/);
      assert.equal(before.some(row => same(row, first)), false, 'authenticated browser did not predate this launch');
      assert.equal(await root(), pid);
      const confirmed = await table();
      assert.ok(confirmed.some(row => same(row, first)));
      const snapshot = await tree.snapshotTree(pid, { ...adapters, list: async () => confirmed }, { timeoutMs: 60000 });
      assert.ok(snapshot.entries.length && same(snapshot.entries[0], first));
      records.push({ browser, page, snapshot });
      console.log(JSON.stringify({ event: 'authenticated-owned-browser', identity: { pid, createdAt: first.createdAt },
        entries: snapshot.entries.length, helper: 'unchanged sealed isolated.cjs', creationIdentityConfirmedTwice: true }));
    } finally { await protocol.detach(); }
  }
  async function close(sealedClose) {
    for (const record of records) record.snapshot = await tree.refreshTree(record.snapshot, adapters, { timeoutMs: 60000 });
    let failure;
    try { await bounded(systemClock, 60000, 'sealed consumer browser close', sealedClose); }
    catch (error) { failure = error; }
    const terminations = [];
    for (const record of records) {
      const current = await table();
      const live = record.snapshot.entries.filter(entry => current.some(row => same(row, entry)));
      if (live.length) {
        const ended = await tree.terminateOwned({ ...record.snapshot, entries: live }, { timeoutMs: 120000, adapters });
        terminations.push(ended);
        assert.deepEqual(ended.survivors, []);
        assert.deepEqual(ended.errors, []);
        assert.deepEqual(ended.refused, []);
      }
    }
    const after = await table();
    for (const record of records) {
      assert.equal(record.page.isClosed(), true);
      assert.equal(record.browser.isConnected(), false);
      assert.deepEqual(record.snapshot.entries.filter(entry => after.some(row => same(row, entry))), []);
    }
    console.log(JSON.stringify({ event: 'exact-owned-native-cleanup', clean: !failure, browsers: records.length,
      identities: records.map(record => ({ pid: record.snapshot.entries[0].pid, createdAt: record.snapshot.entries[0].createdAt })),
      survivors: [], terminations, scope: 'Only these authenticated browser trees, never a global cleanup claim' }));
    if (failure) throw failure;
    return { clean: true, browsers: records.length, survivors: [] };
  }
  return { track, close };
}
module.exports = { beforeOpen };
