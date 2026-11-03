'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..', '..');
const lesson = path.resolve(__dirname, '..');
const evidence = path.join(lesson, 'evidence');
const expectedHelper = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (file) => fs.readFileSync(file);
const relative = (file) => path.relative(lesson, file);
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
function write(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes, { flag: 'wx' });
}
function json(file, value) {
  write(file, `${JSON.stringify(value, null, 2)}\n`);
}
function git(args) {
  const result = spawnSync('git', ['--no-pager', ...args], {
    cwd: root, encoding: null, windowsHide: true, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Read-only Git query failed: ${result.stderr}`);
  return result.stdout;
}
function rawRecord(file, bytes) {
  write(file, bytes);
  return { path: relative(file), bytes: bytes.length, sha256: sha(bytes) };
}
function nextLabel(stage) {
  if (!fs.existsSync(path.join(evidence, `${stage}.json`))) return stage;
  for (let n = 2; n < 1000; n += 1) {
    const label = `${stage}-${String(n).padStart(3, '0')}`;
    if (!fs.existsSync(path.join(evidence, `${label}.json`))) return label;
  }
  throw new Error('Bounded capture labels exhausted.');
}
function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.NODE_TEST_CONTEXT;
  delete env.S095_MODEL;
  return env;
}
function latestIndex() {
  const names = fs.readdirSync(evidence).filter((name) => /^content-index(?:-\d{3})?\.json$/.test(name));
  names.sort((a, b) => Number(a.match(/(?:-(\d{3}))?\.json$/)[1] || 1) - Number(b.match(/(?:-(\d{3}))?\.json$/)[1] || 1));
  if (!names.length) throw new Error('Capture a versioned content index before its integrity verification.');
  return JSON.parse(read(path.join(evidence, names.at(-1))));
}

const stage = process.argv[2];
if (stage === 'source') {
  const sourceHead = git(['rev-parse', 'HEAD']).toString('utf8').trim();
  const required = [
    ['readme', 'README.md', [
      '| S095 | **Candidate dependency partition:** Remove it from new admission and retain a usable compatible destination. |',
      '| S022 | **Dependency-aware readiness:** Validate required database, cache, messaging, and service connectivity before admitting users. |',
      'Users remaining entirely on the old deployment do not establish successful migration merely because their requests succeeded. Conversely, failed or uncertain started transitions must not be removed from the denominator.',
    ]],
    ['backlog', '.docs\\wiki\\backlog.md', [
      '| D-S095 | P0 | Add required-dependency isolation on the candidate only. | Candidate admission is gated/removed through supported mechanisms; a healthy compatible destination and recovery evidence are preserved. | D-S022 |',
      '| D-S022 | P0 | Add required dependency switches and effective readiness checks for data, cache, queue, and services. | A missing required dependency blocks promotion; optional dependencies are not blindly allowed to eject all healthy capacity. | none |',
    ]],
    ['kanban', '.docs\\wiki\\kanban.md', [
      '| A-S095 | D-S095 | S | Partition a required candidate dependency; identify safe versus unsafe admission decisions. | SOURCE |',
      '| B-S095 | D-S095 | S | Isolate one required candidate path; verify preserved healthy routing and explicit affected outcomes. | CORE, DATA, HOST, C090 |',
      '### Portable A-card lesson contract',
      'Each bundle declares source ID, objective, preconditions, actions, synthetic input/trace, expected assertions, and limits. It prominently says **Training rehearsal - synthetic data - not a live Azure result**, makes no management calls, contains no credentials, and supports keyboard operation.',
      'Packet membership is fixed before admission. This register overrides default membership for its named cards; every other A/B card belongs to SC-Snnn, and every other capability card belongs to its first listed source parent. A card has one packet, not duplicate packet credits.',
    ]],
  ];
  const sources = required.map(([name, repoPath, exactText]) => {
    const gitPath = repoPath.replaceAll('\\', '/');
    const formats = { git: git(['show', `${sourceHead}:${gitPath}`]), working: read(path.join(root, repoPath)) };
    const snapshots = {};
    for (const [format, bytes] of Object.entries(formats)) {
      for (const text of exactText) {
        if (!bytes.toString('utf8').split(/\r?\n/).includes(text)) throw new Error(`Exact ${name}/${format} contract absent: ${text}`);
      }
      const compressed = zlib.gzipSync(bytes);
      const target = path.join(evidence, 'raw', 'source', `${name}.${format}.raw.gz`);
      snapshots[format] = {
        ...rawRecord(target, compressed), rawBytes: bytes.length, rawSha256: sha(bytes),
        encoding: format === 'git' ? 'canonical Git LF bytes' : 'unaltered capture-time working bytes, including CRLF',
      };
    }
    return { repoPath, exactText, snapshots };
  });
  const ledger = JSON.parse(read(path.join(root, '.docs', 'wiki', 'flow-state.json')));
  const card = ledger.cards.find((item) => item.id === 'A-S095');
  if (!card || card.owner !== 'worker-A-S095' || card.state !== 'In Progress'
      || card.kano !== 'S' || card.packet !== 'SC-S095' || card.authorization !== 'local-synthetic-only') {
    throw new Error('Exact registered ownership/frozen scope is absent.');
  }
  json(path.join(evidence, 'source-contract.json'), {
    schemaVersion: 1, cardId: 'A-S095', parentId: 'D-S095', sourceId: 'S095',
    workerId: 'worker-A-S095', kano: 'S', kanoUnit: 'A-S095', packet: 'SC-S095',
    technicalEntryGate: 'SOURCE', sourceHead, capturedAtUtc: new Date().toISOString(),
    objective: 'Partition a required candidate dependency; identify safe versus unsafe admission decisions.',
    sourceAcceptance: 'Remove it from new admission and retain a usable compatible destination.',
    backlogAcceptance: 'Candidate admission is gated/removed through supported mechanisms; a healthy compatible destination and recovery evidence are preserved.',
    originalDependency: 'D-S022', registeredCardProjection: card,
    projectionLimit: 'The card is an explicitly derived JSON projection, not claimed to be raw ledger bytes.',
    portableContract: 'Standalone browser-openable exercise, fixed synthetic trace, declared inputs/assertions/limits, exact banner, keyboard operation, no management calls or credentials.',
    packetContract: 'Default SC-S095 A/B source pair; not a designated delighter packet and not duplicate credit.',
    sources,
  });
  console.log('Exact source/card/packet provenance captured.');
} else if (stage === 'preflight') {
  if (!fs.existsSync(path.join(evidence, 'source-contract.json'))) throw new Error('Exact source capture must precede preflight.');
  const helper = read(path.join(root, 'testing', 'browser', 'isolated.cjs'));
  if (sha(helper) !== expectedHelper || !/^22\./.test(process.versions.node)) throw new Error('Unqualified helper/runtime.');
  const playwrightVersion = require(path.join(root, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
  if (playwrightVersion !== '1.56.1') throw new Error('Unqualified offline Playwright version.');
  const command = "$ErrorActionPreference='Stop'; $p='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'; $s=Get-AuthenticodeSignature -LiteralPath $p; @{version=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion;status=[string]$s.Status;signer=$s.SignerCertificate.Subject}|ConvertTo-Json -Compress";
  const signature = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    cwd: root, encoding: null, windowsHide: true, timeout: 30000,
  });
  if (signature.status !== 0) throw new Error(`Edge signature preflight failed: ${signature.stderr}`);
  const edge = JSON.parse(signature.stdout.toString('utf8').replace(/^\uFEFF/, ''));
  if (!/^156\./.test(edge.version) || edge.status !== 'Valid' || !edge.signer.includes('Microsoft Corporation')) {
    throw new Error('Installed signed Edge156 precondition failed.');
  }
  json(path.join(evidence, 'preflight.json'), {
    cardId: 'A-S095', observedAtUtc: new Date().toISOString(), node: process.version, playwright: playwrightVersion, edge,
    signatureCommand: ['pwsh.exe', '-NoProfile', '-NonInteractive', '-Command', command],
    signatureExitCode: signature.status,
    stdout: rawRecord(path.join(evidence, 'raw', 'preflight', 'stdout.snapshot'), signature.stdout),
    stderr: rawRecord(path.join(evidence, 'raw', 'preflight', 'stderr.snapshot'), signature.stderr),
    helperPath: 'testing\\browser\\isolated.cjs', helperSha256: sha(helper),
    publishedHelperCommit: '53c0c0d82cc1db6780a87ac2b1085734af6d5c60',
    qualification: 'Existing Node22 / offline Playwright1.56.1 / signed installed Edge156 only; documented helper lifecycle limitation remains. No downloads, new packages, unsafe flags or foreground lease.',
  });
  json(path.join(evidence, 'refinement.json'), {
    cardId: 'A-S095', kano: 'S', kanoUnit: 'A-S095', packet: 'SC-S095', recordedAtUtc: new Date().toISOString(),
    ownScope: 'learning\\S095\\**', readiness: true, blocker: null,
    refinedBound: 'One required candidate path, one retained survivor, three fixed fixtures, three admission instructions, four arrivals, two recovery validation probes, six retained attempts.',
    pruned: ['Real dependency/network partition commands', 'Azure adapters and native admission certification', 'Cloud/IaC/scaffold/identity/credentials/deployment/spend', 'Packages/framework/root/shared edits', 'Extra test/plumbing/refinement Kano credit'],
    remainder: {
      cardId: 'B-S095', readiness: false,
      blocker: 'Native CORE, DATA, HOST and C090 gates plus approved isolated dependency/admission mechanism and empirical healthy routing/recovery evidence are not authorized or certified here. D-S022 remains a source-parent prerequisite, not completed by this A-card.',
    },
    credit: 'Single frozen S unit. Parent alone empirically accepts A-S095; no source-parent or native completion claimed.',
  });
  console.log('Installed signed offline tooling and bounded refinement captured.');
} else if (stage === 'bdd') {
  if (!fs.existsSync(path.join(evidence, 'source-contract.json'))) throw new Error('Source read/capture must precede BDD.');
  const bytes = read(path.join(lesson, 'partition.feature'));
  json(path.join(evidence, 'bdd.json'), {
    cardId: 'A-S095', stage: 'BDD before loadable-stub behavioral RED', recordedAtUtc: new Date().toISOString(),
    sourceContract: 'evidence\\source-contract.json', feature: 'partition.feature',
    rawFeature: rawRecord(path.join(evidence, 'raw', 'bdd', 'partition.feature.snapshot'), bytes),
    canonicalSha256: sha(canonical(bytes)),
  });
  console.log('BDD captured before behavioral RED.');
} else if (stage === 'iac') {
  const red = JSON.parse(read(path.join(evidence, 'red.json')));
  if (!red.verified || red.runs[0].exitCode !== 1) throw new Error('Genuine assertion RED must precede IaC N/A.');
  json(path.join(evidence, 'iac-decision.json'), {
    cardId: 'A-S095', stage: 'IaC after genuine behavioral RED', decidedAtUtc: new Date().toISOString(),
    decision: 'N/A', redReference: 'evidence\\red.json',
    reason: 'Resource-free local HTML/JavaScript lesson. Dependency partitions, gates, admission, routing, repair and recovery probes are fixed teaching data only, never operational commands.',
    resourcesCreated: 0, managementCalls: 0, packagesAdded: 0, cloudSpend: 0,
    excluded: ['Cloud', 'IaC generation', 'Scaffold', 'Identity', 'Credentials', 'Deployment', 'Actual dependency/network/admission certification', 'Production Node24/native/source-parent completion'],
  });
  console.log('IaC N/A recorded after actual assertion RED.');
} else if (stage === 'index') {
  const indexLabel = nextLabel('content-index');
  const selfVerificationRun = indexLabel.replace('content-index', 'integrity');
  const exclusions = [`evidence\\${indexLabel}.json`, `evidence\\${selfVerificationRun}.json`, `evidence\\raw\\runs\\${selfVerificationRun}`];
  const excluded = (file) => exclusions.some((item) => file === item || file.startsWith(`${item}${path.sep}`));
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      const rel = relative(full);
      if (excluded(rel)) continue;
      if (entry.isDirectory()) walk(full);
      else {
        const bytes = read(full);
        const raw = rel.startsWith(`evidence${path.sep}raw${path.sep}`);
        files.push({ path: rel, encoding: raw ? 'raw bytes (-text)' : 'canonical Git LF', sha256: sha(raw ? bytes : canonical(bytes)) });
      }
    }
  }
  walk(lesson);
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  json(path.join(evidence, `${indexLabel}.json`), {
    schemaVersion: 1, cardId: 'A-S095', label: indexLabel, selfVerificationRun,
    recordedAtUtc: new Date().toISOString(), exclusions, files,
    boundary: 'Raw historical CRLF is byte-preserved. Other text integrity uses canonical Git LF, not working-byte equivalence. Index and its single self-verification record/transcripts are excluded only to avoid self-reference.',
  });
  console.log(`Indexed ${files.length} owned files with raw/canonical Git-source integrity.`);
} else if (['red', 'focused', 'browser', 'syntax', 'integrity'].includes(stage)) {
  if (stage === 'red' && fs.existsSync(path.join(evidence, 'red.json'))) throw new Error('Historical RED cannot be overwritten.');
  if (stage === 'red' && !fs.existsSync(path.join(evidence, 'bdd.json'))) throw new Error('BDD must precede RED.');
  if (stage === 'browser' && process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('Browser capture requires deliberate CAPTURE_BROWSER_EVIDENCE=1.');
  const label = stage === 'integrity' ? (latestIndex().selfVerificationRun || 'integrity') : nextLabel(stage);
  const directory = path.join(evidence, 'raw', 'runs', label);
  const snapshots = [];
  const originals = stage === 'red'
    ? ['model.js', 'tests\\behavior.test.cjs', 'partition.feature', '.gitattributes', 'tests\\capture.cjs']
    : stage === 'browser' ? ['model.js', 'app.js', 'index.html', 'styles.css', 'tests\\browser.test.cjs'] : [];
  for (const file of originals) {
    const target = stage === 'red'
      ? path.join(evidence, 'raw', 'red', `${path.basename(file)}.snapshot`)
      : path.join(directory, `${path.basename(file)}.snapshot`);
    snapshots.push({ original: file, ...rawRecord(target, read(path.join(lesson, file))) });
  }
  const tests = (names) => ['--test', '--test-reporter=tap', ...names.map((name) => path.join('learning', 'S095', 'tests', `${name}.test.cjs`))];
  const commands = {
    red: [tests(['behavior'])],
    focused: [tests(['behavior', 'surface', 'provenance'])],
    browser: [tests(['browser'])],
    integrity: [tests(['integrity'])],
    syntax: ['model.js', 'app.js', ...fs.readdirSync(__dirname).filter((file) => file.endsWith('.cjs')).map((file) => path.join('tests', file))]
      .map((file) => ['--check', path.join('learning', 'S095', file)]),
  }[stage];
  const startedAtUtc = new Date().toISOString();
  const runs = commands.map((args, index) => {
    const start = new Date().toISOString();
    const result = spawnSync(process.execPath, args, {
      cwd: root, encoding: null, windowsHide: true, maxBuffer: 16 * 1024 * 1024,
      env: childEnv(stage === 'browser' ? { S095_CAPTURE_RUN: label } : { CAPTURE_BROWSER_EVIDENCE: '' }),
    });
    const record = {
      executable: process.execPath, args, cwd: root, startedAtUtc: start, endedAtUtc: new Date().toISOString(),
      exitCode: result.status, signal: result.signal, error: result.error ? String(result.error) : null,
      stdout: rawRecord(path.join(directory, `${index + 1}.stdout.snapshot`), result.stdout || Buffer.alloc(0)),
      stderr: rawRecord(path.join(directory, `${index + 1}.stderr.snapshot`), result.stderr || Buffer.alloc(0)),
    };
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    return record;
  });
  const output = runs.map((run) => read(path.join(lesson, run.stdout.path)).toString('utf8')).join('\n');
  const verified = stage === 'red'
    ? runs.length === 1 && runs[0].exitCode === 1 && /not ok 1/.test(output) && /ERR_ASSERTION/.test(output)
      && /Observed removal and retained compatible service/.test(output) && !/MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError/.test(output)
    : runs.every((run) => run.exitCode === 0 && !run.error && !run.signal);
  json(path.join(evidence, `${label}.json`), {
    schemaVersion: 1, cardId: 'A-S095', workerId: 'worker-A-S095', kano: 'S', packet: 'SC-S095',
    stage, label, startedAtUtc, endedAtUtc: new Date().toISOString(), node: process.version, verified,
    snapshots, runs, captureBrowserEvidence: stage === 'browser' ? true : false,
    redLimit: stage === 'red' ? 'Actual success-versus-unknown assertion failure against a loadable stub; not missing code, tools, dependencies or syntax.' : undefined,
    evidenceWrites: 'Explicit author capture only. Ordinary test commands neither capture nor rewrite historical evidence.',
  });
  if (!verified) process.exitCode = 1;
} else {
  throw new Error('Use source, preflight, bdd, red, iac, focused, browser, syntax, index or integrity; no implicit capture.');
}
