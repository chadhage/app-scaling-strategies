'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const test = require('node:test');
const current = require('../current.cjs');
const addendum = require('../../addendum.cjs');
const {workspace,fixtureAdapters} = require('./support.cjs');
const {fixture} = require('./build-head.cjs');
const sink = () => ({text:'',write(value) {this.text+=value;}});
const io = extra => ({stdout:sink(),stderr:sink(),...extra});

test('U045 public exports are a closed strict initialized contract', () => {
  assert.deepEqual(Object.keys(current).sort(),[
    'APPEND_ATTEMPTS','HEAD_FILE','PARENT_BASELINE_SHA256','USAGE','appendFromReport','main','qualifyEdge','verifyHead',
  ].sort());
  assert.equal(current.APPEND_ATTEMPTS,3);
  for (const key of ['qualifyEdge','appendFromReport','verifyHead','main']) {
    assert.equal(typeof current[key],'function');
    assert.throws(() => current[key].caller,TypeError);
  }
});

test('U045 public current help runs as the actual OS entry with no qualification or browser', () => {
  const result = cp.spawnSync(process.execPath,[path.join(__dirname,'..','current.cjs'),'--help'],{encoding:'utf8',timeout:30000,windowsHide:true});
  assert.equal(result.error,undefined);
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout,current.USAGE);
  assert.equal(result.stderr,'');
});

test('U045 entry usage errors and --help print current, not legacy, wording', async () => {
  for (const args of [['--unknown'],['--timeout-ms','0'],['--check-head'],['--check-head','a','b']]) {
    const output = io();
    assert.equal(await current.main(args,output),2);
    assert.ok(output.stderr.text.includes(current.USAGE));
    assert.equal(output.stdout.text,'');
  }
  const output = io();
  assert.equal(await current.main(['--help'],output),0);
  assert.equal(output.stdout.text,current.USAGE);
});

test('U045 entry forwards --timeout-ms to its actual current qualifier and preserves normal JSON and verdict behavior', async () => {
  const seen = [];
  const output = io({qualifyOptions:{adapterFactory:options => {
    seen.push(options.shell.timeoutMs);
    return fixtureAdapters();
  }}});
  assert.equal(await current.main(['--timeout-ms','8000'],output),0);
  assert.deepEqual(seen,[6000]);
  const report = JSON.parse(output.stdout.text);
  assert.equal(report.ok,true);
  assert.match(output.stderr.text,/^PASS Edge /);
});

test('U045 entry keeps explicit test I/O injection and the existing --requalify policy boundary visible', async () => {
  const report = await current.qualifyEdge({adapterFactory:() => fixtureAdapters()});
  const seen = [];
  const output = io({requalify:async options => {seen.push(options.qualifyOptions);return report;}});
  assert.equal(await current.main(['--requalify','--timeout-ms','9000'],output),0);
  assert.deepEqual(seen,[{timeoutMs:9000}]);
  const legacyRequalify = require('../../requalify.cjs');
  const original = legacyRequalify.requalifyEdge;
  try {
    legacyRequalify.requalifyEdge = async options => {
      assert.equal(options.qualify,current.qualifyEdge);
      return options.qualify({adapterFactory:() => fixtureAdapters()});
    };
    assert.equal(await current.main(['--requalify'],io()),0);
  } finally {legacyRequalify.requalifyEdge=original;}
});

test('U045 entry checks the real current head through the public bootstrap and refuses an untrusted digest', async t => {
  const space = fixture(t);
  const output = io({headOptions:{root:space.root}});
  assert.equal(await current.main(['--check-head',space.sha256],output),0);
  assert.equal(JSON.parse(output.stdout.text).predecessors,272);
  const refused = io({headOptions:{root:space.root}});
  assert.equal(await current.main(['--check-head','0'.repeat(64)],refused),1);
  assert.equal(JSON.parse(refused.stdout.text).code,'U045_HEAD_DIGEST');
});

test('U045 entry delegated unexpected failures retain the existing explicit nonzero refusal', async () => {
  const output = io({qualify:async () => {throw new Error('injected public boundary failure');}});
  assert.equal(await current.main([],output),1);
  assert.match(output.stderr.text,/FAIL closed: the check itself failed: injected public boundary failure/);
});

test('U045 entry own output failure is an explicit current nonzero refusal', async () => {
  const output = io({stdout:{write() {throw new Error('injected current output failure');}}});
  assert.equal(await current.main(['--help'],output),1);
  assert.match(output.stderr.text,/U045_CURRENT_ENTRY: injected current output failure/);
});

test('U045 append protects the accepted addendum even when reached with no options or case variation', async () => {
  assert.equal((await current.appendFromReport()).code,'U045_PINNED_FILE_READ_ONLY');
  assert.equal((await current.appendFromReport({addendumFile:addendum.ADDENDUM_FILE.toUpperCase()})).code,'U045_PINNED_FILE_READ_ONLY');
});

test('U045 append: dry run retains all checks and performs zero rename attempts', async t => {
  const files = workspace(t);
  const result = await current.appendFromReport({...files,dryRun:true});
  assert.equal(result.ok,true,result.error);
  assert.equal(result.attempts,0);
  assert.equal(fs.existsSync(files.addendumFile),false);
  assert.equal((await current.appendFromReport({...files,verify:async () => ({ok:false})})).code,'U045_APPEND_REFUSED');
});

test('U045 append: nontransient errors are not retried and EBUSY and EPERM each independently recover', async t => {
  for (const code of ['EACCES','EPERM','EBUSY']) {
    const files = workspace(t);
    let attempts = 0;
    const fsApi = {...fs,renameSync(from,to) {
      attempts+=1;
      if (attempts === 1) throw Object.assign(new Error('injected sharing error'),{code});
      return fs.renameSync(from,to);
    }};
    const result = await current.appendFromReport({...files,fsApi});
    assert.equal(attempts,code === 'EACCES' ? 1 : 2);
    assert.equal(result.ok,code !== 'EACCES');
    if (code === 'EACCES') {
      assert.equal(result.code,'U045_APPEND_REFUSED');
      assert.equal(result.causeCode,code);
    }
  }
});

test('U045 append: invalid report, duplicate, corrupt chain, and neighbour lock remain refused without retry', async t => {
  const files = workspace(t);
  fs.writeFileSync(files.reportPath,'{}');
  assert.equal((await current.appendFromReport(files)).attempts,0);
  const next = workspace(t);
  assert.equal((await current.appendFromReport(next)).ok,true);
  assert.equal((await current.appendFromReport(next)).attempts,0);
  fs.appendFileSync(next.addendumFile,'junk\n');
  assert.equal((await current.appendFromReport(next)).code,'U045_APPEND_REFUSED');
  const locked = workspace(t);
  fs.writeFileSync(`${locked.addendumFile}.lock`,'neighbour');
  assert.equal((await current.appendFromReport(locked)).attempts,0);
  assert.equal(fs.readFileSync(`${locked.addendumFile}.lock`,'utf8'),'neighbour');
});
