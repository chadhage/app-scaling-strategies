'use strict';

// F1 (L-0137): the small-heap child test failed about 15 percent of runs under load with "the child heap sampler wrote nothing". The child
// rewrote its sample file with truncate-then-write and the parent read it once, without retry. Two defects, two proofs:
// the READER survives a half-written file (it waits until the sample parses, with a deadline), and the WRITER never exposes one.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const s = require('./support.cjs');
const { readMem } = require('./child.cjs');

const preloads = path.join(__dirname, 'fixtures');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('the sample reader waits for a half-written file instead of reporting that nothing was written', async (t) => {
  const made = s.scratch('sm');
  t.after(() => made.remove());
  const file = path.join(made.dir, 'mem.json');
  fs.writeFileSync(file, '{"heapUsed":12345,"rs');
  const finish = setTimeout(() => fs.writeFileSync(file, JSON.stringify({ heapUsed: 12345, rss: 67890 })), 150);
  t.after(() => clearTimeout(finish));
  const sample = await readMem(file);
  assert.deepEqual(sample, { heapUsed: 12345, rss: 67890 });
});

test('the sample reader gives up with a clear error when no parseable sample ever appears', async (t) => {
  const made = s.scratch('sm');
  t.after(() => made.remove());
  const file = path.join(made.dir, 'mem.json');
  await assert.rejects(Promise.resolve(readMem(path.join(made.dir, 'absent.json'), { ms: 200 })), /never produced a parseable heap sample/);
  fs.writeFileSync(file, '{"heapUsed":1,');
  await assert.rejects(Promise.resolve(readMem(file, { ms: 200 })), /never produced a parseable heap sample/);
});

test('the child never exposes a half-written sample, even when each write takes 150 ms (atomic publication)', { timeout: 30000 }, async (t) => {
  const made = s.scratch('sw');
  t.after(() => made.remove());
  const file = path.join(made.dir, 'mem.json');
  const env = { ...process.env, C017_MEM_FILE: file };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  const child = spawn(process.execPath, ['--require', path.join(preloads, 'slow-write-preload.cjs'), '--require', path.join(preloads, 'child-preload.cjs'), '-e', 'setTimeout(() => {}, 20000)'],
    { env, stdio: 'ignore', windowsHide: true });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const seen = new Set();
  const problems = [];
  // The child may need seconds to start on a loaded machine: observe for 2 s AFTER its first sample (or give up after 15 s).
  let until = Date.now() + 15000;
  let published = false;
  while (Date.now() < until) {
    let text = null;
    try { text = fs.readFileSync(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'EBUSY' && error.code !== 'EPERM') problems.push(`read failed: ${error.code}`); }
    if (text !== null) {
      try {
        const sample = JSON.parse(text);
        if (!Number.isFinite(sample.heapUsed) || !Number.isFinite(sample.rss)) problems.push(`not a sample: ${text}`);
        seen.add(text);
        if (!published) { published = true; until = Date.now() + 2000; }
      } catch { problems.push(`half-written sample observed: ${JSON.stringify(text)}`); }
    }
    await sleep(5);
  }
  child.kill();
  await s.withTimeout(exited, 'the child did not exit', 10000);
  assert.deepEqual([...new Set(problems)].slice(0, 3), []);
  assert.ok(seen.size >= 1, 'the child never published a sample');
});
