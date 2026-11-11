'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const {fs,path,published,namespace,qualify,append,fixtureAdapters,workspace} = require('./support.cjs');

test('U045 bounds: the actual adapter factory records preserved 400 and clamped 1500 without an OS spawn', async () => {
  const calls = [];
  const adapterFactory = options => { calls.push(options.shell.timeoutMs); return fixtureAdapters(); };
  for (const [timeoutMs, shellTimeoutMs] of [[3000,400],[2000,60000]]) {
    const report = await qualify().qualifyEdge({
      timeoutMs, shell:{timeoutMs:shellTimeoutMs}, adapterFactory, adapters:fixtureAdapters(),
    });
    assert.equal(report.ok, true, report.reasons.join(' | '));
  }
  assert.deepEqual(calls, [400,1500], 'actual adapter construction must receive the resolved shell bounds');
});

test('U045 structural sources: the current timeout and outer-bound tests depend on virtual counters, never child startup', () => {
  const files = published
    ? ['tests\\timeouts.test.cjs','tests\\outer-timeout.test.cjs'].map(file => path.join(namespace,file))
    : ['bounds.test.cjs','outer-timeout.test.cjs'].map(file => path.join(namespace,'u045','tests',file));
  for (const file of files) {
    const source = fs.readFileSync(file,'utf8');
    assert.doesNotMatch(source, /\b(?:execFile|spawn|fakeShell|HARD_LIMIT_MS|Date\.now|performance\.now)\b/,
      `${path.basename(file)} must not decide its verdict by OS startup or elapsed time`);
    assert.match(source, /(?:adapterFactory|mock\.timers)/, 'the structural mechanism is explicit');
  }
});

test('U045 documentation: current help and source state the clock exception and README disclaims authenticity', () => {
  const cli = published ? require('../../cli.cjs') : qualify();
  const readme = fs.readFileSync(path.join(namespace, published ? 'README.md' : 'u045\\README.md'),'utf8');
  const source = fs.readFileSync(path.join(namespace, published ? 'qualify.cjs' : 'u045\\current.cjs'),'utf8');
  assert.match(cli.USAGE, /clock.*(?:exception|except|may).*checkedAtUtc.*null/i);
  assert.match(source, /\/\/.*clock.*exception.*checkedAtUtc.*null/i);
  assert.match(readme, /consistency/i);
  assert.match(readme, /agreement with the installed Edge/i);
  assert.match(readme, /(?:not|no|does not prove) authenticity/i);
  assert.match(readme, /common.*2(?:\.\.|–| to )6.*bounds/i);
  assert.doesNotMatch(readme, /A failed or forged report.*refused/);
});

test('U045 append: an actual injected EPERM then EBUSY retries the same append and succeeds on the third rename', async t => {
  const files = workspace(t);
  const before = fs.readFileSync(files.qualifiedFile);
  let attempts = 0;
  const payloads = [];
  const fsApi = {...fs, renameSync(from,to) {
    attempts += 1;
    payloads.push(fs.readFileSync(from,'utf8'));
    if (attempts <= 2) throw Object.assign(new Error('transient file sharing'),{code:attempts === 1 ? 'EPERM' : 'EBUSY'});
    return fs.renameSync(from,to);
  }};
  const result = await append().appendFromReport({...files,fsApi});
  assert.equal(result.ok,true,result.error);
  assert.equal(attempts,3);
  assert.equal(new Set(payloads).size,1,'no new timestamp, line, or predecessor is invented during a retry');
  assert.deepEqual(fs.readFileSync(files.qualifiedFile),before,'the sealed file is never modified');
  const checked = require('../../addendum.cjs').verifyFiles(files);
  assert.deepEqual(checked.majors,[156,157]);
  assert.deepEqual(fs.readdirSync(files.dir).sort(),['qualified.addendum.jsonl','qualified.json','report.json']);
});

test('U045 append: exhausted transient renames have a fixed attempt bound and a typed refusal', async t => {
  const files = workspace(t);
  let attempts = 0;
  const result = await append().appendFromReport({...files,fsApi:{...fs,renameSync() {
    attempts += 1;
    throw Object.assign(new Error('still busy'),{code:'EBUSY'});
  }}});
  assert.equal(result.ok,false);
  assert.equal(attempts,3,'at most three actual rename attempts, not unbounded retries');
  assert.equal(result.code,'U045_APPEND_RETRY_EXHAUSTED');
  assert.equal(result.causeCode,'EBUSY');
  assert.equal(result.attempts,3);
  assert.equal(fs.existsSync(files.addendumFile),false);
  assert.deepEqual(fs.readdirSync(files.dir).sort(),['qualified.json','report.json']);
});
