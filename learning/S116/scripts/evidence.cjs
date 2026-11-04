'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const relative = (target) => path.relative(root, target).split(path.sep).join('/');
const write = (name, bytes) => {
  const target = path.join(root, 'evidence', name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
};
const json = (name, data) => write(name, `${JSON.stringify(data, null, 2)}\n`);
const run = (args) => spawnSync(process.execPath, args, {
  cwd: repo, encoding: null, timeout: 120000, windowsHide: true,
});
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: repo, encoding: null, windowsHide: true });
  if (result.status !== 0) throw Error(`Git read failed: ${result.stderr}`);
  return result.stdout;
};
const stamp = () => new Date().toISOString();
const stage = process.argv[2];

if (stage === 'source') {
  const baseline = git('rev-parse', 'HEAD').toString().trim();
  const sources = [
    ['README.md', '| S116 | **Active-active regions:** Preserve declared consistency and conflict-resolution semantics while either region serves a user. |'],
    [path.join('.docs', 'wiki', 'backlog.md'), '| D-S116 | P2 | Add active-active application regions with the approved writer/consistency/conflict model. | Both regions serve users under the declared data contract; actual writer topology is shown and multi-writer capability is not invented. | P006, D-S069 |'],
    [path.join('.docs', 'wiki', 'kanban.md'), '| A-S116 | D-S116 | S | Serve both regions; identify the real writer/consistency model instead of assuming multi-writer support. | SOURCE |'],
  ];
  const records = sources.map(([name, row], index) => {
    const raw = fs.readFileSync(path.join(repo, name));
    const rawLine = raw.toString('utf8').split(/(?<=\n)/).find((line) => line.replace(/\r?\n$/, '') === row);
    if (!rawLine) throw Error(`Exact source row missing: ${name}`);
    const rawExcerpt = Buffer.from(rawLine);
    const gitName = name.split(path.sep).join('/');
    const tree = git('ls-tree', baseline, '--', name).toString().trim();
    const blob = tree.split(/\s+/)[2];
    if (!blob) throw Error(`Canonical source blob missing: ${name}`);
    const canonical = git('cat-file', 'blob', blob);
    const canonicalLine = canonical.toString('utf8').split(/(?<=\n)/)
      .find((line) => line.replace(/\r?\n$/, '') === row);
    if (!canonicalLine) throw Error(`Pinned canonical row differs: ${name}`);
    write(`raw/source-${index + 1}-working.txt`, rawExcerpt);
    write(`raw/source-${index + 1}-git.txt`, Buffer.from(canonicalLine));
    return {
      path: gitName, row, rawFileSha256: hash(raw), canonicalGitBlob: blob,
      canonicalFileSha256: hash(canonical),
      workingExcerpt: `evidence/raw/source-${index + 1}-working.txt`,
      workingExcerptSha256: hash(rawExcerpt), workingLineEnding: rawLine.endsWith('\r\n') ? 'CRLF' : 'LF',
      canonicalExcerpt: `evidence/raw/source-${index + 1}-git.txt`,
      canonicalExcerptSha256: hash(Buffer.from(canonicalLine)),
      canonicalLineEnding: canonicalLine.endsWith('\r\n') ? 'CRLF' : 'LF',
    };
  });
  const inventory = JSON.parse(fs.readFileSync(path.join(repo, '.git', 'kanban-orchestrator', 'inventory.json')));
  const pair = inventory.cards.filter((card) => card.packet === 'SC-S116');
  const ledger = JSON.parse(fs.readFileSync(path.join(repo, '.docs', 'wiki', 'flow-state.json')));
  const claim = ledger.cards.find((card) => card.id === 'A-S116');
  if (claim.owner !== 'worker-A-S116' || claim.state !== 'In Progress') throw Error('Claim not owned');
  json('source-contract.json', {
    cardId: 'A-S116', workerId: 'worker-A-S116', readBeforeBehaviorDesign: true,
    recordedAtUtc: stamp(), baseline, records, pair, claimedAtUtc: claim.claimedAtUtc,
    sourceGate: inventory.gateAliases.SOURCE,
    portableContract: 'Standalone browser-openable action/trace/assertion lesson; exact synthetic banner; keyboard; no management calls or credentials.',
    packetRule: 'SC-S116 is the source-pair namespace, not a delighter allocation; no LP packet lists A-S116.',
    nativeRemainder: 'B-S116 and D-S116 retain CORE/DATA/REGION and P006/D-S069; this lesson cannot certify the source parent.',
    kano: 'S', kanoUnit: 'A-S116', maximumCredit: 1, acceptanceOwner: 'Parent controller only',
  });
} else if (stage === 'red') {
  for (const name of ['model.js', 'app.js', 'index.html', 'active-active.feature', path.join('tests', 'model.test.cjs')]) {
    write(`red/${path.basename(name)}.snapshot`, fs.readFileSync(path.join(root, name)));
  }
  const loaded = require(path.join(root, 'model.js'));
  if (loaded.evaluate({ scenarioId: 'supported', actionId: 'verify-contract' }).overall !== 'unknown') {
    throw Error('Expected loadable wrong-behavior stub');
  }
  const result = run(['--test', '--test-name-pattern=^both serving regions', path.join(root, 'tests', 'model.test.cjs')]);
  write('red/runner.tap', result.stdout || Buffer.alloc(0));
  write('red/runner.stderr.txt', result.stderr || Buffer.alloc(0));
  if (result.status !== 1 || !result.stdout.toString().includes('ERR_ASSERTION')
      || !result.stdout.toString().includes("'positive'")) throw Error('Not a genuine behavioral assertion RED');
  json('red.json', {
    cardId: 'A-S116', recordedAtUtc: stamp(), stubLoadable: true, actualExitCode: result.status,
    command: 'node --test --test-name-pattern=^both serving regions learning\\S116\\tests\\model.test.cjs',
    failure: "Actual unknown !== expected positive; supported two-region writer/consistency behavior is missing",
    stdout: 'evidence/red/runner.tap', stderr: 'evidence/red/runner.stderr.txt',
    snapshots: fs.readdirSync(path.join(root, 'evidence', 'red'))
      .filter((name) => name.endsWith('.snapshot')).map((name) => ({
        path: `evidence/red/${name}`, sha256: hash(fs.readFileSync(path.join(root, 'evidence', 'red', name))),
      })),
    discoveredByNormalTests: false, notImportOrToolingFailure: true,
  });
  process.stdout.write(result.stdout);
} else if (stage === 'iac') {
  if (!fs.existsSync(path.join(root, 'evidence', 'red.json'))) throw Error('Behavioral RED must precede IaC');
  json('iac-decision.json', {
    cardId: 'A-S116', recordedAtUtc: stamp(), decision: 'N/A',
    reason: 'Resource-free standalone fictional browser lesson; no network, resource, data or configuration operations.',
    follows: 'evidence/red.json', nativeParentValidated: false, cloudOperations: 0,
  });
} else if (stage === 'tooling') {
  const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
  const helperSha256 = hash(fs.readFileSync(helper));
  if (helperSha256 !== '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055') {
    throw Error('Published browser helper raw hash differs; no fallback');
  }
  const edge = path.join(process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe');
  const command = `$s=Get-AuthenticodeSignature -LiteralPath '${edge.replace(/'/g, "''")}'; $v=(Get-Item -LiteralPath '${edge.replace(/'/g, "''")}').VersionInfo.ProductVersion; @{status=$s.Status.ToString();subject=$s.SignerCertificate.Subject;version=$v} | ConvertTo-Json -Compress`;
  const signature = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    cwd: repo, encoding: null, windowsHide: true, timeout: 30000,
  });
  write('raw/tooling-signature.stdout.txt', signature.stdout || Buffer.alloc(0));
  write('raw/tooling-signature.stderr.txt', signature.stderr || Buffer.alloc(0));
  if (signature.status !== 0) throw Error(`Cannot verify existing Edge signature: ${signature.stderr}`);
  const signed = JSON.parse(signature.stdout.toString().replace(/^\uFEFF/, ''));
  if (signed.status !== 'Valid' || !signed.subject.includes('Microsoft Corporation') || !signed.version.startsWith('156.')) {
    throw Error('Existing signed Edge 156 prerequisite not met; no download or unsafe fallback');
  }
  const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
  if (playwrightVersion !== '1.56.1' || !process.version.startsWith('v22.')) throw Error('Approved offline Node/Playwright pair differs');
  json('tooling-preflight.json', {
    cardId: 'A-S116', recordedAtUtc: stamp(), node: process.version, playwright: playwrightVersion,
    edge: signed, signatureShell: 'pwsh.exe (PowerShell 7)', helperCommit: '53c0c0d', helperSha256, helperAPI: 'openIsolatedLesson',
    sandboxDisabled: false, cspBypassed: false, downloads: 0, installs: 0,
    foregroundLease: false, inactiveLifecyclePrototypeQualified: false,
    productionNode24Validated: false, nativeAzureValidated: false, sourceParentValidated: false,
    lifecycleLimit: 'Published helper only; context creation/close has a known recovery-deadline limitation. This successful finite run does not qualify the inactive prototype.',
  });
} else if (stage === 'index') {
  const selected = [];
  const stableEvidence = new Set(['source-contract.json', 'red.json', 'iac-decision.json', 'refinement.json', 'attempt-limits.json']);
  const walk = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const target = path.join(folder, entry.name);
      const name = relative(target);
      if (entry.isDirectory()) walk(target);
      else if (!name.startsWith('evidence/') || name.startsWith('evidence/raw/')
          || name.startsWith('evidence/red/') || stableEvidence.has(entry.name)) {
        const content = fs.readFileSync(target);
        selected.push({ path: name, bytes: content.length, sha256: hash(content) });
      }
    }
  };
  walk(root);
  json('content-index.json', {
    cardId: 'A-S116', algorithm: 'SHA256 raw bytes',
    excludes: 'Index itself and mutable producer capture bookkeeping; no circular hash claims',
    files: selected.sort((left, right) => left.path.localeCompare(right.path)),
  });
} else if (stage === 'green' || stage === 'syntax' || stage === 'browser') {
  if (stage === 'browser' && process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
    throw Error('Deliberate browser capture requires exact CAPTURE_BROWSER_EVIDENCE=1');
  }
  const startedAtUtc = stamp();
  const commands = stage === 'syntax'
    ? ['model.js', 'app.js', 'scripts/evidence.cjs', 'tests/model.test.cjs', 'tests/bundle.test.cjs', 'tests/browser.test.cjs', 'tests/csp-probe.js']
      .map((name) => ['--check', path.join(root, name)])
    : [stage === 'green'
      ? ['--test', path.join(root, 'tests', 'model.test.cjs'), path.join(root, 'tests', 'bundle.test.cjs')]
      : ['--test', path.join(root, 'tests', 'browser.test.cjs')]];
  const results = commands.map((args) => {
    const result = run(args);
    return {
      command: ['node', ...args.map((arg) => arg.startsWith(repo) ? path.relative(repo, arg) : arg)].join(' '),
      status: result.status, error: result.error ? result.error.message : null,
      stdout: result.stdout || Buffer.alloc(0), stderr: result.stderr || Buffer.alloc(0),
    };
  });
  const runId = startedAtUtc.replace(/[:.]/g, '-');
  const stdoutPath = `runs/${stage}-${runId}.tap`;
  const stderrPath = `runs/${stage}-${runId}.stderr.txt`;
  write(stdoutPath, Buffer.concat(results.map((entry) => entry.stdout)));
  write(stderrPath, Buffer.concat(results.map((entry) => entry.stderr)));
  const passed = results.every((entry) => entry.status === 0 && entry.error === null);
  const summary = {
    cardId: 'A-S116', startedAtUtc, completedAtUtc: stamp(), stage, passed,
    actualExitCodes: results.map((entry) => entry.status),
    commands: results.map((entry) => ({ command: entry.command, error: entry.error })),
    stdout: `evidence/${stdoutPath}`, stderr: `evidence/${stderrPath}`,
    deliberateProducerCapture: true, normalVerificationWritesEvidence: false,
    nativeAzureValidated: false, sourceParentValidated: false, productionNode24Validated: false,
  };
  json(stage === 'green' ? 'focused-green.json' : stage === 'syntax' ? 'syntax-green.json' : 'browser-run.json', summary);
  process.stdout.write(Buffer.concat(results.map((entry) => entry.stdout)));
  if (!passed) {
    json(`failed-${stage}-${runId}.json`, summary);
    process.stderr.write(Buffer.concat(results.map((entry) => entry.stderr)));
    process.exitCode = 1;
  }
} else {
  throw Error(`Unknown deliberate producer stage: ${stage}`);
}
