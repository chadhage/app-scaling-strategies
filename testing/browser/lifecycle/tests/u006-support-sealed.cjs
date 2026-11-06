'use strict';

// U006 test tooling: a fake of the SEALED session close over the fake world of U005 (read-only import of u005-support-world.cjs).
// It has the same try/finally chain as testing\browser\isolated.cjs: context.close(), then browser.close(), then the scratch removal,
// one shared promise. A stuck call settles only when the browser dies (Playwright then rejects pending calls), unless its mode is 'never'.

const { World, FakeOpener, recorded } = require('./u005-support-world.cjs');
const { loadImplementation } = require('./u006-support-impl.cjs');

class FakeSealed {
  constructor(world, opener, modes = {}) {
    this.world = world;
    this.opener = opener;
    this.modes = { context: 'ok', browser: 'ok', rm: 'ok', ...modes };
    this.calls = { close: 0, context: 0, browser: 0, rm: 0 };
    this.pending = [];
    this.closing = null;
    world.afterKill.push(() => this.react());
  }

  dead() { return !this.world.has(this.opener.root); }

  react() {
    if (!this.dead()) return;
    for (const reject of this.pending.splice(0)) reject(new Error('Target closed'));
  }

  step(mode, effect) {
    if (mode === 'ok') return effect();
    if (mode === 'fail') throw new Error('close failed');
    if (mode === 'dead') throw new Error('Target closed');
    if (mode === 'never') return new Promise(() => {});
    return new Promise((resolve, reject) => { this.pending.push(reject); if (this.dead()) this.react(); });
  }

  async contextClose() { this.calls.context += 1; return this.step(this.modes.context, () => {}); }

  async browserClose() {
    this.calls.browser += 1;
    return this.step(this.modes.browser, () => {
      for (const process of this.opener.processes) {
        if (!(this.modes.keep === 'crashpad' && process === this.opener.crashpad)) this.world.os.exit(process.pid);
      }
    });
  }

  async removeScratch() {
    this.calls.rm += 1;
    if (this.modes.rm === 'never') return new Promise(() => {});
    if (this.modes.rm === 'fail') throw Object.assign(new Error('EBUSY: resource busy or locked, rmdir'), { code: 'EBUSY', syscall: 'rmdir' });
    if (this.modes.rm === 'fail-syscall') throw Object.assign(new Error('operation failed'), { syscall: 'unlink' });
    if (this.modes.rm === 'fail-code') throw Object.assign(new Error('operation failed'), { code: 'EPERM' });
    return undefined;
  }

  close() {
    if (!this.closing) {
      this.calls.close += 1;
      this.closing = (async () => {
        try {
          try { await this.contextClose(); } finally { await this.browserClose(); }
        } finally {
          await this.removeScratch();
        }
      })();
      this.closing.catch(() => {});
    }
    return this.closing;
  }

  session() { return { page: {}, browserVersion: '156.0.0.0', close: () => this.close() }; }
}

// A recorded fake browser tree plus a fake sealed session that carries it; wrapOptions are the options of wrapSession.
async function makeSession(world, modes = {}, phase = 'navigation') {
  const { adapters, opener, owned } = await recorded(world, phase);
  const sealed = new FakeSealed(world, opener, modes);
  return { adapters, opener, sealed, owned, session: { ...sealed.session(), owned } };
}

function wrap(world, made, options = {}) {
  const { wrapSession } = loadImplementation().close;
  return wrapSession(made.session, { gracefulMs: 1000, terminateMs: 20000, listMs: 5000, settleMs: 3000, killByName: world.inner.killByName, ...options });
}

module.exports = { FakeSealed, makeSession, wrap, World, FakeOpener };
