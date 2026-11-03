'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync, execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const write = (file, value) => {
  const target = path.join(root, 'evidence', file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, typeof value === 'string' || Buffer.isBuffer(value)
    ? value : `${JSON.stringify(value, null, 2)}\n`);
};
const git = (...args) => execFileSync('git', ['--no-pager', ...args], { cwd: repo });
const mode = process.argv[2];

if (mode === 'source' || mode === 'tooling') {
  if (mode === 'source') {
  assert.ok(!fs.existsSync(path.join(root, 'evidence', 'source-contract.json')), 'Source capture is append-only.');
  const baseline = git('rev-parse', 'HEAD').toString().trim();
  const entries = [];
  const excerpt = (file, start, end, snapshot, row = false) => {
    const select = (buffer) => {
      const text = buffer.toString('utf8');
      const from = text.indexOf(start);
      assert.ok(from >= 0, `${file}: ${start}`);
      const to = row ? text.indexOf('\n', from) + 1 : text.indexOf(end, from + start.length);
      assert.ok(to > from, `${file}: excerpt end`);
      return Buffer.from(text.slice(from, to));
    };
    const raw = fs.readFileSync(path.join(repo, file));
    const committed = git('show', `${baseline}:${file.replace(/\\/g, '/')}`);
    const selected = select(raw);
    const gitSelected = select(committed);
    assert.deepEqual(canonical(selected), canonical(gitSelected), `Exact canonical Git-source excerpt: ${file}`);
    write(snapshot, selected);
    entries.push({
      file, start, end: row ? 'end of exact source row' : end, snapshot,
      rawFileSha256: sha(raw), gitFileSha256: sha(committed),
      rawExcerptSha256: sha(selected), canonicalGitExcerptSha256: sha(canonical(gitSelected)),
      rawCRLFCount: (selected.toString().match(/\r\n/g) || []).length,
    });
    return selected.toString().trim();
  };
  const source = excerpt('README.md', '### F. N-tier and version compatibility', '### G. Database and persistent-data scaling',
    'source-s054.snapshot');
  excerpt('README.md', '## Acceptance and evidence', '### Five-nines transition metric', 'source-outcomes.snapshot');
  const backlog = excerpt('.docs\\wiki\\backlog.md', '| D-S054 |', '', 'source-backlog.snapshot', true);
  const card = excerpt('.docs\\wiki\\kanban.md', '| A-S054 |', '', 'source-card.snapshot', true);
  const nativeSibling = excerpt('.docs\\wiki\\kanban.md', '| B-S054 |', '', 'source-native-sibling.snapshot', true);
  excerpt('.docs\\wiki\\kanban.md', '## Atomic card contract', '## Concurrent pull and one-piece flow',
    'source-portable-contract.snapshot');
  const packetRule = excerpt('.docs\\wiki\\kanban.md', 'Packet membership is fixed before admission.',
    '', 'source-packet-rule.snapshot', true);
  const ledger = JSON.parse(fs.readFileSync(path.join(repo, '.docs', 'wiki', 'flow-state.json')));
  const claim = ledger.cards.find((entry) => entry.id === 'A-S054');
  assert.equal(claim.owner, 'worker-A-S054');
  assert.equal(claim.packet, 'SC-S054');
  assert.equal(claim.kano, 'S');
  assert.equal(claim.state, 'In Progress');
  write('source-contract.json', {
    schemaVersion: 1, cardId: 'A-S054', sourceId: 'S054', parentId: 'D-S054',
    workerId: 'worker-A-S054', kano: 'S', kanoUnit: 'A-S054', packet: 'SC-S054',
    ownedScope: 'learning\\S054\\**', baselineCommit: baseline, capturedAtUtc: new Date().toISOString(),
    sourceRow: source.split(/\r?\n/).find((line) => line.startsWith('| S054 |')),
    backlogRow: backlog, cardRow: card, nativeSibling, packetRule, claim, entries,
    refinement: 'One bounded fixed-data expand/migrate/contract rehearsal. No extra unit, native migration, ' +
      'source-parent completion, plumbing or refinement credit. No additional To Do work is admitted.',
  });
  }
  assert.ok(!fs.existsSync(path.join(root, 'evidence', 'tooling.json')), 'Tooling capture is append-only.');
  const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
  const helperHash = sha(fs.readFileSync(helper));
  assert.equal(helperHash, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  const signatureCommand = "$p='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'; " +
    '$s=Get-AuthenticodeSignature $p; ' +
    '[ordered]@{path=$p;version=(Get-Item $p).VersionInfo.ProductVersion;' +
    'signatureStatus=[string]$s.Status;signer=$s.SignerCertificate.Subject}|ConvertTo-Json -Compress';
  const signatureRaw = execFileSync('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive',
    '-Command', signatureCommand], { cwd: repo });
  const edge = JSON.parse(signatureRaw.toString());
  assert.equal(edge.signatureStatus, 'Valid');
  assert.match(edge.signer, /Microsoft Corporation/);
  assert.match(edge.version, /^156\./);
  write('tooling-signature.raw.gz', zlib.gzipSync(signatureRaw));
  write('tooling.json', {
    capturedAtUtc: new Date().toISOString(), node: process.version,
    playwright: require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version,
    edge, signatureCommand, signatureRawSha256: sha(signatureRaw), helperSha256: helperHash,
    helperPublication: git('log', '-1', '--format=%H', '--', 'testing/browser/isolated.cjs').toString().trim(),
    installedOrDownloaded: false, unsafeFlags: false, productionNode24Certified: false,
    nativeOrSourceParentCertified: false, unattendedLifecycleCertified: false,
  });
  console.log('Exact source/backlog/card/portable contract, packet and approved offline tooling captured.');
} else if (mode === 'source-integrity') {
  const file = 'source-integrity.json';
  assert.ok(!fs.existsSync(path.join(root, 'evidence', file)), 'Canonical source capture is append-only.');
  const sources = ['.gitattributes', 'README.md', 'manifest.json', 'expand-migrate-contract.feature',
    'fixtures.js', 'model.js', 'lesson.js', 'index.html', 'styles.css',
    ...fs.readdirSync(__dirname).filter((name) => name.endsWith('.cjs')).map((name) => `tests\\${name}`)];
  const entries = sources.map((source) => {
    const bytes = fs.readFileSync(path.join(root, source));
    const gitPath = `learning/S054/${source.replace(/\\/g, '/')}`;
    const gitBlobOid = execFileSync('git', ['hash-object', `--path=${gitPath}`, '--stdin'],
      { cwd: repo, input: bytes }).toString().trim();
    return {
      source, rawWorkingSha256: sha(bytes), canonicalSha256: sha(canonical(bytes)),
      gitBlobOid, mode: 'LF-canonical Git-source; raw evidence snapshots are separate binary files',
    };
  });
  const loadJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, 'evidence', relative)));
  write(file, {
    cardId: 'A-S054', capturedAtUtc: new Date().toISOString(), entries,
    stageOrder: {
      sourceCapturedAtUtc: loadJson('source-contract.json').capturedAtUtc,
      bddCreatedAtUtc: fs.statSync(path.join(root, 'expand-migrate-contract.feature')).birthtime.toISOString(),
      qualifiedRedStartedAtUtc: loadJson(path.join('red-002', 'run.json')).startedAtUtc,
      qualifiedRedCompletedAtUtc: loadJson(path.join('red-002', 'run.json')).completedAtUtc,
      iacDecisionCreatedAtUtc: fs.statSync(path.join(root, 'evidence', 'iac-decision.json')).birthtime.toISOString(),
      modelImplementationWrittenAtUtc: fs.statSync(path.join(root, 'model.js')).mtime.toISOString(),
      focusedGreenStartedAtUtc: loadJson(path.join('verification', 'green-001', 'run.json')).startedAtUtc,
      browserStartedAtUtc: loadJson('browser-001.json').startedAtUtc,
      note: 'Original local filesystem observations captured once; do not infer stage order from checkout timestamps.',
    },
  });
  console.log(`Captured canonical Git-source integrity for ${entries.length} active source files.`);
} else if (['red', 'green', 'integrity', 'syntax', 'browser'].includes(mode)) {
  const directory = mode === 'red' ? (process.argv[3] || 'red') : path.join('verification', process.argv[3] || mode);
  assert.ok(!fs.existsSync(path.join(root, 'evidence', directory, 'run.json')), 'Run capture is append-only.');
  let snapshots = [];
  if (mode === 'red') {
    snapshots = ['expand-migrate-contract.feature', 'fixtures.js', 'model.js', path.join('tests', 'model.test.cjs')]
      .map((source) => {
        const bytes = fs.readFileSync(path.join(root, source));
        const snapshot = `${path.basename(source)}.snapshot`;
        write(path.join(directory, snapshot), bytes);
        return { source, snapshot, sha256: sha(bytes) };
      });
  }
  if (mode === 'browser') assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1', 'Browser capture must be explicitly enabled.');
  const files = mode === 'green' ? ['tests\\model.test.cjs', 'tests\\surface.test.cjs']
    : mode === 'integrity' ? ['tests\\integrity.test.cjs']
      : mode === 'browser' ? ['tests\\browser.test.cjs'] : ['tests\\model.test.cjs'];
  const commands = mode === 'syntax'
    ? ['fixtures.js', 'model.js', 'lesson.js', 'tests\\model.test.cjs', 'tests\\surface.test.cjs',
      'tests\\browser.test.cjs', 'tests\\integrity.test.cjs', 'tests\\capture.cjs']
      .map((file) => ['--check', file])
    : [['--test', ...files]];
  const startedAtUtc = new Date().toISOString();
  const results = commands.map((args) => {
    const child = spawnSync(process.execPath, args, { cwd: root, encoding: null, maxBuffer: 8 * 1024 * 1024 });
    return { args, ...child };
  });
  const stdout = Buffer.concat(results.map((result) => result.stdout || Buffer.alloc(0)));
  const stderr = Buffer.concat(results.map((result) => result.stderr || Buffer.alloc(0)));
  const text = stdout.toString();
  const count = (name) => Number(text.match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1] || 0);
  const exitCode = results.some((result) => result.status !== 0) ? 1 : 0;
  const report = {
    cardId: 'A-S054', workerId: 'worker-A-S054', mode, cwd: root,
    commands: commands.map((args) => [process.execPath, ...args]), startedAtUtc,
    completedAtUtc: new Date().toISOString(), node: process.version, exitCode,
    tests: count('tests'), passed: count('pass'), failed: count('fail'),
    assertionFailures: (text.match(/code: 'ERR_ASSERTION'/g) || []).length,
    missingCodeOrTools: /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError/.test(text + stderr),
    spawnErrors: results.map((result) => result.error?.message || null),
    signals: results.map((result) => result.signal),
    rawStdoutSha256: sha(stdout), rawStderrSha256: sha(stderr), snapshots,
  };
  write(path.join(directory, 'stdout.raw.gz'), zlib.gzipSync(stdout));
  write(path.join(directory, 'stderr.raw.gz'), zlib.gzipSync(stderr));
  write(path.join(directory, 'output.tap'), (stdout.toString() + stderr.toString())
    .replace(/[ \t]+$/gm, '').replace(/\r\n/g, '\n'));
  write(path.join(directory, 'run.json'), report);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  if (mode === 'red') {
    assert.equal(exitCode, 1, 'RED must fail real behavior assertions.');
    assert.ok(report.failed > 0);
    assert.equal(report.assertionFailures, report.failed);
    assert.equal(report.missingCodeOrTools, false);
    assert.ok(report.spawnErrors.every((error) => error === null));
    assert.ok(report.signals.every((signal) => signal === null));
    console.log(`Genuine behavioral RED captured: ${report.failed} assertion failures; loadable code/tools.`);
  } else {
    process.exitCode = exitCode;
  }
} else {
  throw new Error('Deliberate capture only: source | tooling | source-integrity | red [label] | green [label] | browser [label] | integrity [label] | syntax [label]');
}
