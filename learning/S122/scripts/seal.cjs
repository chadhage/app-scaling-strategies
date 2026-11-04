'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
  console.error('READ_ONLY: deliberate sealing requires exact CAPTURE_BROWSER_EVIDENCE=1.');
  process.exitCode = 2;
} else {
  const root = path.resolve(__dirname, '..');
  const repo = path.resolve(root, '..', '..');
  const evidence = path.join(root, 'evidence');
  const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const load = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  const rawNames = fs.readdirSync(path.join(evidence, 'raw')).filter((name) => /\.json$/.test(name)).sort();
  const latest = (stage) => {
    const candidates = rawNames.filter((name) => name.startsWith(`${stage}-`));
    const name = candidates.at(-1);
    return name ? { path: `evidence\\raw\\${name}`, record: load(`evidence\\raw\\${name}`) } : null;
  };
  const final = latest('final');
  if (final && final.record.exitCode === 0 && !fs.existsSync(path.join(evidence, 'verification.json'))) {
    const browserNames = fs.readdirSync(path.join(evidence, 'browser')).filter((name) => /^capture-\d{3}\.json$/.test(name)).sort();
    const browser = browserNames.map((name) => ({ path: `evidence\\browser\\${name}`, record: load(`evidence\\browser\\${name}`) }))
      .filter(({ record }) => record.verifierPassed).at(-1);
    const syntax = latest('syntax');
    const focused = latest('focused');
    if (!browser || !syntax || syntax.record.exitCode !== 0 || !focused || focused.record.exitCode !== 0) {
      throw new Error('Actual successful focused, syntax and browser proof must precede the final summary.');
    }
    const verification = {
      schemaVersion: 1, cardId: 'A-S122', workerId: 'worker-A-S122', packet: 'SC-S122', kano: 'S', kanoUnit: 'A-S122',
      outcome: 'local lesson verified; publication and controller acceptance separate',
      recordedAtUtc: new Date().toISOString(),
      workflow: {
        bdd: 'linux-promotion.feature',
        modelRed: 'evidence\\raw\\model-red-001.json',
        browserRed: 'evidence\\raw\\browser-red-001.json',
        iac: 'evidence\\iac-na.json',
        firstFocusedGreen: focused.path,
        syntax: syntax.path,
        browser: browser.path,
        readOnlyFinalFocused: final.path,
      },
      checks: {
        modelLeaves: focused.record.testSummary.tests,
        finalFocusedLeaves: final.record.testSummary.tests,
        finalFocusedPass: final.record.testSummary.pass,
        finalFocusedFailures: final.record.testSummary.fail,
        finalFocusedSkips: final.record.testSummary.skipped,
        finalFocusedChildCaptureSwitch: final.record.childCaptureSwitch,
        syntaxFiles: syntax.record.commands.length,
        actualBrowserFeatureLeaves: browser.record.checksPassed,
        actualBrowserParentGroups: 1,
        actualBrowserPassed: browser.record.verifierPassed,
        browserSourceAndHistoricalProofUnchanged: browser.record.bytePreservation,
        pageErrors: browser.record.pageErrors.length,
        networkRequests: browser.record.networkRequests.length,
        cleanup: browser.record.cleanup,
      },
      tooling: {
        node: browser.record.nodeVersion, playwright: browser.record.playwrightVersion,
        edge: browser.record.browserVersion, helperSha256: browser.record.helperSha256,
        helperPublication: browser.record.helperPublication,
        lifecycleRecoveryQualified: false, archivedPrototypeUsed: false,
      },
      originalUnitsRequested: 1, extraCredits: 0, controllerAccepted: false,
      nativeAzureValidated: false, productionNode24Validated: false, sourceParentComplete: false,
      blockedRemainder: {
        cardId: 'B-S122', parentId: 'D-S122', readiness: false,
        reason: 'Native effects and continuity remain unobserved. Exact native target/lease and CORE, DATA, C062, C064 plus explicit cloud/configuration/deployment/identity/IaC/spend permission remain required.',
      },
    };
    fs.writeFileSync(path.join(evidence, 'verification.json'), `${JSON.stringify(verification, null, 2)}\n`, { flag: 'wx' });
  }

  function files(directory = root, prefix = '') {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const relative = prefix ? `${prefix}\\${entry.name}` : entry.name;
      if (relative === 'result.json' || relative === 'evidence\\integrity.json' || relative === 'evidence\\seals') return [];
      return entry.isDirectory() ? files(path.join(directory, entry.name), relative) : [relative];
    }).sort();
  }
  function gitHash(bytes, relative, noFilters = false) {
    // --path names a Git index entry, not a Windows filesystem pathname.
    const indexPath = path.posix.join('learning', 'S122', ...relative.split('\\'));
    const args = ['hash-object', '--stdin', ...(noFilters ? ['--no-filters'] : ['--path', indexPath])];
    const run = spawnSync('git', args, { cwd: repo, input: bytes, maxBuffer: 1024 * 1024 });
    if (run.status !== 0) throw new Error(`Read-only Git hash failed for ${relative}: ${run.stderr}`);
    return run.stdout.toString('utf8').trim();
  }
  const entries = files().map((relative) => {
    const bytes = fs.readFileSync(path.join(root, relative));
    return {
      path: relative, kind: relative.startsWith('evidence\\') ? 'proof' : 'source',
      bytes: bytes.length, rawSha256: sha(bytes),
      rawGitBlobSha1: gitHash(bytes, relative, true),
      canonicalGitBlobSha1: gitHash(bytes, relative),
    };
  });
  const seals = path.join(evidence, 'seals');
  fs.mkdirSync(seals, { recursive: true });
  const index = fs.readdirSync(seals).filter((name) => /^seal-\d{3}\.json$/.test(name)).length + 1;
  const name = `seal-${String(index).padStart(3, '0')}.json`;
  const seal = {
    schemaVersion: 1, cardId: 'A-S122', workerId: 'worker-A-S122',
    sealedAtUtc: new Date().toISOString(), seal: `evidence\\seals\\${name}`,
    byteIdentity: 'raw byte length and SHA-256; independent of canonical Git blob identity',
    canonicalIdentity: 'git hash-object --stdin --path <Git index path>; Git index separators, no object write; filesystem access remains Windows-style',
    excluded: ['result.json', 'evidence\\integrity.json', 'evidence\\seals\\**'],
    exclusionReason: 'Post-publication private handoff and self-referential seal records; all executable sources and behavioral proof are inventoried.',
    sourceFiles: entries.filter((entry) => entry.kind === 'source').length,
    proofFiles: entries.filter((entry) => entry.kind === 'proof').length,
    entries,
  };
  const bytes = Buffer.from(`${JSON.stringify(seal, null, 2)}\n`);
  fs.writeFileSync(path.join(seals, name), bytes, { flag: 'wx' });
  const pointer = {
    schemaVersion: 1, cardId: 'A-S122', activeSeal: seal.seal, bytes: bytes.length,
    sha256: sha(bytes), sourceFiles: seal.sourceFiles, proofFiles: seal.proofFiles,
    normalVerificationReadOnly: true,
  };
  fs.writeFileSync(path.join(evidence, 'integrity.json'), `${JSON.stringify(pointer, null, 2)}\n`);
  console.log(`Sealed ${name}: ${seal.sourceFiles} source files, ${seal.proofFiles} proof files; raw and canonical identities recorded separately.`);
}
