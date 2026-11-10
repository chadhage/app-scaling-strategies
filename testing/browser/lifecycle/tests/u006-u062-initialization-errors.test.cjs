'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const subject = process.env.U062_INITIALIZATION_SUBJECT ??
  path.join(__dirname, 'u006-owned-lookalike.cjs');
const { openLookAlike } = require(subject);

function diagnostics(error) {
  const nested = [error.cause, ...(error.errors || []), ...(error.cleanupErrors || [])].filter(Boolean);
  return [error.message, error.code, ...nested.map(diagnostics)].join('\n');
}

for (const closeFails of [false, true]) {
  test(`U062 parent: initialization refusal preserves detach failure and closes the sealed session (closeFails=${closeFails})`, async () => {
    let detachCalls = 0;
    let closeCalls = 0;
    const protocol = {
      send: async () => ({ processInfo: [] }),
      detach: async () => { detachCalls += 1; throw new Error('owned protocol detach cleanup failed'); }
    };
    const browser = { isConnected: () => true, newBrowserCDPSession: async () => protocol };
    const session = {
      page: { context: () => ({ browser: () => browser }) },
      close: async () => {
        closeCalls += 1;
        if (closeFails) throw new Error('owned sealed close cleanup failed');
      }
    };
    await assert.rejects(openLookAlike('fixture.html', {
      opener: async () => session,
      adapters: { selfPid: 12345, list: async () => [{ pid: 12345, createdAt: '1' }] },
      closeMs: 1000, listMs: 1000, terminateMs: 1000
    }), (error) => {
      assert.equal(detachCalls, 1);
      assert.equal(closeCalls, 1);
      const observed = diagnostics(error);
      assert.match(observed, /ERR_LOOKALIKE_PROTOCOL_ROOT|exactly one browser process/);
      assert.match(observed, /owned protocol detach cleanup failed/);
      if (closeFails) assert.match(observed, /owned sealed close cleanup failed/);
      return true;
    });
  });
}
