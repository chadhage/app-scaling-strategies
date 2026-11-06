'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { openLog, headerFor, recordFor, FORMAT_VERSION, KIND, maxLineBytes } = require('../store.cjs');
const { canonical } = require('../../C015/contract.cjs');
const { fixtureContext, scratchDirectory, root } = require('./support.cjs');

const context = fixtureContext();
const spec = (seq, extra = {}) => ({ seq, event: seq === 1 ? 'run-started' : 'step-completed', data: { runId: context.runId, epoch: context.epoch, seq, ...extra } });
const epochDir = (dir, ctx = context) => path.join(dir, ctx.runId, `epoch-${String(ctx.epoch).padStart(3, '0')}`);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function withScratch(body) {
  const scratch = scratchDirectory();
  try {
    return body(scratch.directory);
  } finally {
    scratch.remove();
  }
}

function seed(dir, count, ctx = context) {
  const log = openLog(dir, ctx);
  for (let seq = 1; seq <= count; seq++) log.append(spec(seq));
  log.close();
}

function expectCode(action, code) {
  assert.throws(action, (error) => error.code === code, `expected ${code}`);
}

test('a new epoch is created with a versioned header anchored to the C015 state digest and an empty log', () => {
  withScratch((dir) => {
    const log = openLog(dir, context);
    assert.deepEqual(log.restored, { events: [], created: true, tornTailBytesDiscarded: 0, knownEpochs: [] });
    log.close();
    const header = JSON.parse(fs.readFileSync(path.join(epochDir(dir), 'header.json'), 'utf8'));
    assert.deepEqual(header, headerFor(context));
    assert.deepEqual([header.formatVersion, header.kind, header.runId, header.epoch, header.stateSha256], [FORMAT_VERSION, KIND, context.runId, 3, context.stateSha256]);
    assert.equal(fs.readFileSync(path.join(epochDir(dir), 'events.jsonl')).length, 0);
    assert.deepEqual(fs.readdirSync(path.join(dir, context.runId)), ['epoch-003'], 'no pending directory is left behind');
  });
});

test('appended events are canonical, hash-chained from the header, flushed and restored identically', () => {
  withScratch((dir) => {
    const log = openLog(dir, context);
    const records = [1, 2, 3].map((seq) => log.append(spec(seq)));
    log.close();
    const lines = fs.readFileSync(path.join(epochDir(dir), 'events.jsonl'), 'utf8').split('\n');
    assert.equal(lines.pop(), '', 'every record is newline terminated');
    assert.deepEqual(lines, records.map((record) => canonical(record)));
    assert.equal(records[0].prevSha256, headerFor(context).sha256);
    assert.equal(records[1].prevSha256, records[0].sha256);
    assert.deepEqual(records[2], recordFor(records[1].sha256, spec(3)));
    const again = openLog(dir, context);
    assert.deepEqual(again.restored.events, [1, 2, 3].map(spec));
    assert.equal(again.restored.created, false);
    assert.equal(again.append(spec(4)).prevSha256, records[2].sha256, 'the chain continues across a restart');
    again.close();
    again.close();
    assert.equal(openLog(dir, context).restored.events.length, 4);
  });
});

test('an unterminated final record was never acknowledged: it is discarded and reported, acknowledged events stay', () => {
  withScratch((dir) => {
    seed(dir, 5);
    const file = path.join(epochDir(dir), 'events.jsonl');
    const good = fs.readFileSync(file);
    const torn = '{"seq":6,"event":"step-comp';
    fs.appendFileSync(file, torn);
    const log = openLog(dir, context);
    assert.equal(log.restored.events.length, 5);
    assert.equal(log.restored.tornTailBytesDiscarded, Buffer.byteLength(torn));
    assert.deepEqual(fs.readFileSync(file), good, 'the file is truncated back to the last acknowledged record');
    assert.equal(log.append(spec(6)).seq, 6);
    log.close();
    assert.equal(openLog(dir, context).restored.events.length, 6);
  });
});

test('earlier epochs stay immutable and are reported; the history never goes backwards', () => {
  withScratch((dir) => {
    const epoch2 = fixtureContext(context.runId, 2);
    seed(dir, 4, epoch2);
    const before = sha(fs.readFileSync(path.join(epochDir(dir, epoch2), 'events.jsonl')));
    const log = openLog(dir, context);
    assert.deepEqual(log.restored.knownEpochs, [2]);
    assert.equal(log.restored.created, true);
    log.append(spec(1));
    log.close();
    assert.equal(sha(fs.readFileSync(path.join(epochDir(dir, epoch2), 'events.jsonl'))), before);
    expectCode(() => openLog(dir, epoch2), 'STALE_EPOCH');
  });
});

test('every kind of corruption fails closed with a typed code and never falls back to a smaller log', () => {
  const cases = {
    CORRUPT_JSON: (file) => fs.appendFileSync(file, 'not json at all\n'),
    HISTORY_GAP: (file, lines) => fs.writeFileSync(file, `${[lines[0], lines[2]].join('\n')}\n`),
    HISTORY_CHAIN: (file, lines) => {
      const record = JSON.parse(lines[1]);
      record.prevSha256 = '0'.repeat(64);
      fs.writeFileSync(file, `${[lines[0], canonical(record)].join('\n')}\n`);
    },
    STATE_DIGEST: (file, lines) => {
      const record = JSON.parse(lines[0]);
      record.data.note = 'tampered';
      fs.writeFileSync(file, `${[canonical(record), lines[1]].join('\n')}\n`);
    },
    EPOCH_IDENTITY: (file) => {
      const header = JSON.parse(fs.readFileSync(path.join(path.dirname(file), 'header.json'), 'utf8'));
      const body = { seq: 1, event: 'run-started', data: { runId: context.runId, epoch: 9, seq: 1 }, prevSha256: header.sha256 };
      fs.writeFileSync(file, `${canonical({ ...body, sha256: recordFor(header.sha256, body).sha256 })}\n`);
    },
    INVALID_UTF8: (file) => fs.writeFileSync(file, Buffer.from([0xff, 0xfe, 0x0a])),
    CLOSED_SCHEMA: (file, lines) => fs.writeFileSync(file, `${canonical({ ...JSON.parse(lines[0]), extra: 1 })}\n`),
    STATE_OVERSIZE: (file) => fs.writeFileSync(file, `${'x'.repeat(maxLineBytes + 1)}\n`),
  };
  for (const [code, corrupt] of Object.entries(cases)) {
    withScratch((dir) => {
      seed(dir, 3);
      const file = path.join(epochDir(dir), 'events.jsonl');
      corrupt(file, fs.readFileSync(file, 'utf8').split('\n'));
      expectCode(() => openLog(dir, context), code);
    });
  }
});

test('a log file beyond the safety ceiling and a missing log or header are typed failures', () => {
  withScratch((dir) => {
    seed(dir, 1);
    const file = path.join(epochDir(dir), 'events.jsonl');
    fs.writeFileSync(file, Buffer.alloc(8 * 1024 * 1024 + 1, 0x20));
    expectCode(() => openLog(dir, context), 'STATE_OVERSIZE');
    fs.rmSync(file);
    expectCode(() => openLog(dir, context), 'STATE_MISSING');
    fs.rmSync(path.join(epochDir(dir), 'header.json'));
    expectCode(() => openLog(dir, context), 'STATE_MISSING');
  });
});

test('a header that disagrees with the restored C015 state, version or identity is refused', () => {
  const rewrite = (dir, change) => {
    const file = path.join(epochDir(dir), 'header.json');
    const header = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, `${canonical(change(header))}\n`);
  };
  const cases = {
    STATE_DIGEST: (header) => ({ ...header, stateSha256: 'f'.repeat(64) }),
    FILE_VERSION: (header) => ({ ...header, formatVersion: 2 }),
    EPOCH_IDENTITY: (header) => ({ ...header, epoch: 2 }),
    CLOSED_SCHEMA: (header) => ({ ...header, extra: true }),
  };
  for (const [code, change] of Object.entries(cases)) {
    withScratch((dir) => {
      seed(dir, 1);
      rewrite(dir, change);
      expectCode(() => openLog(dir, context), code);
    });
  }
  withScratch((dir) => {
    seed(dir, 1);
    expectCode(() => openLog(dir, { ...context, stateSha256: 'f'.repeat(64) }), 'STATE_DIGEST');
  });
});

test('unexpected entries and unpublished epoch directories are never reclaimed automatically', () => {
  withScratch((dir) => {
    seed(dir, 1);
    fs.writeFileSync(path.join(epochDir(dir), 'notes.txt'), 'x');
    expectCode(() => openLog(dir, context), 'UNEXPECTED_FILE');
  });
  withScratch((dir) => {
    seed(dir, 1);
    fs.writeFileSync(path.join(dir, context.runId, 'stray.txt'), 'x');
    expectCode(() => openLog(dir, context), 'UNEXPECTED_FILE');
  });
  withScratch((dir) => {
    seed(dir, 1);
    fs.mkdirSync(path.join(dir, context.runId, 'epoch-003.pending-abc'));
    expectCode(() => openLog(dir, context), 'HOLD_UNOBSERVED');
    assert.ok(fs.existsSync(path.join(dir, context.runId, 'epoch-003.pending-abc')), 'the held directory is left for operator review');
  });
});

test('append refuses a gap, an oversized record and a closed handle without touching the log', () => {
  withScratch((dir) => {
    const log = openLog(dir, context);
    log.append(spec(1));
    const file = path.join(epochDir(dir), 'events.jsonl');
    const before = fs.readFileSync(file);
    expectCode(() => log.append(spec(3)), 'HISTORY_GAP');
    expectCode(() => log.append(spec(1)), 'HISTORY_GAP');
    expectCode(() => log.append(null), 'HISTORY_GAP');
    expectCode(() => log.append(spec(2, { note: 'x'.repeat(maxLineBytes) })), 'STATE_OVERSIZE');
    expectCode(() => log.append(spec(2, { bad: undefined, nested: { value: Number.NaN } })), 'INVALID_JSON_DATA');
    assert.deepEqual(fs.readFileSync(file), before);
    log.close();
    expectCode(() => log.append(spec(2)), 'STORAGE_ERROR');
  });
});

test('a failing file write is a typed STORAGE_ERROR and acknowledges nothing', (t) => {
  withScratch((dir) => {
    const log = openLog(dir, context);
    t.mock.method(fs, 'writeSync', () => { throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }); }, { times: 1 });
    expectCode(() => log.append(spec(1)), 'STORAGE_ERROR');
    log.close();
    assert.equal(openLog(dir, context).restored.events.length, 0);
  });
});

test('writes continue after a partial write result and the context is validated before any file is touched', (t) => {
  withScratch((dir) => {
    const log = openLog(dir, context);
    const original = fs.writeSync;
    let calls = 0;
    t.mock.method(fs, 'writeSync', (fd, bytes, offset, length) => {
      calls += 1;
      return original(fd, bytes, offset, calls === 1 ? Math.min(7, length) : length);
    });
    log.append(spec(1));
    assert.ok(calls >= 2, 'a short write is completed, not truncated');
    log.close();
    assert.equal(openLog(dir, context).restored.events.length, 1);
  });
  for (const bad of [null, {}, { ...context, runId: 'real-run' }, { ...context, epoch: 0 }, { ...context, epoch: 1000 }, { ...context, stateSha256: 'xyz' }, { ...context, stateSha256: 1 }]) {
    withScratch((dir) => {
      expectCode(() => openLog(dir, bad), 'CLOSED_SCHEMA');
      assert.deepEqual(fs.readdirSync(dir), []);
    });
  }
});

test('state paths are confined to the owned namespace and refuse links', () => {
  expectCode(() => openLog(path.join(root, '..', 'C020'), context), 'PATH_SCOPE');
  expectCode(() => openLog(root, context), 'PATH_SCOPE');
  expectCode(() => openLog(path.join(root, '..', '..'), context), 'PATH_SCOPE');
  withScratch((dir) => {
    const target = path.join(dir, 'target');
    fs.mkdirSync(target);
    const link = path.join(dir, 'link');
    fs.symlinkSync(target, link, 'junction');
    expectCode(() => openLog(link, context), 'UNSAFE_PATH');
    fs.writeFileSync(path.join(dir, 'file'), 'x');
    expectCode(() => openLog(path.join(dir, 'file'), context), 'UNSAFE_PATH');
    expectCode(() => openLog(path.join(dir, 'file', 'below'), context), 'UNSAFE_PATH');
  });
});

test('a hard-linked or non-regular persisted file is refused', () => {
  withScratch((dir) => {
    seed(dir, 1);
    const file = path.join(epochDir(dir), 'events.jsonl');
    fs.linkSync(file, path.join(dir, 'hardlink'));
    expectCode(() => openLog(dir, context), 'UNSAFE_FILE');
  });
  withScratch((dir) => {
    seed(dir, 1);
    const file = path.join(epochDir(dir), 'events.jsonl');
    fs.rmSync(file);
    fs.mkdirSync(file);
    expectCode(() => openLog(dir, context), 'UNSAFE_FILE');
  });
});
