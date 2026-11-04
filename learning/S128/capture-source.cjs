'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('Intentional source capture requires exact CAPTURE_BROWSER_EVIDENCE=1.');
const root = path.resolve(__dirname, '..', '..');
const raw = path.join(__dirname, 'evidence', 'raw');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', ['--no-pager', ...args], { cwd: root });
fs.mkdirSync(raw, { recursive: true });
const baseline = git('rev-parse', 'HEAD').toString().trim();
const sources = [
  ['readme', 'README.md'],
  ['backlog', '.docs/wiki/backlog.md'],
  ['kanban', '.docs/wiki/kanban.md'],
  ['isolated-helper', 'testing/browser/isolated.cjs'],
];
const records = sources.map(([name, gitPath]) => {
  const working = fs.readFileSync(path.join(root, ...gitPath.split('/')));
  const canonical = git('show', `${baseline}:${gitPath}`);
  const workingArchive = `${name}.working.raw.gz`;
  const canonicalArchive = `${name}.canonical.raw.gz`;
  fs.writeFileSync(path.join(raw, workingArchive), zlib.gzipSync(working, { level: 9 }), { flag: 'wx' });
  fs.writeFileSync(path.join(raw, canonicalArchive), zlib.gzipSync(canonical, { level: 9 }), { flag: 'wx' });
  return {
    gitPath, workingArchive, canonicalArchive,
    workingBytes: working.length, workingSha256: sha(working),
    canonicalBytes: canonical.length, canonicalSha256: sha(canonical),
    canonicalGitBlob: git('rev-parse', `${baseline}:${gitPath}`).toString().trim(),
    crlfSeparatedFromCanonicalGit: true,
  };
});
const evidence = {
  capturedAtUtc: new Date().toISOString(), baseline, sources: records,
  sourceContract: {
    readme: '| S128 | **AKS, blue-green/canary:** Use capable ingress, gateway, or service-mesh routing; Deployment objects alone do not supply weighted user routing. |',
    backlog: '| D-S128 | P1 | Add AKS version-specific backend routing and ring/canary promotion. | Separate Deployments/Services and gateway routes preserve cohorts; no accidental selector mixes GA and preview; user outcomes are verified. | P003, D-S008 |',
    card: '| A-S128 | D-S128 | S | Route GA/preview to separate AKS versions; identify a selector that accidentally mixes audiences. | SOURCE |',
    sibling: '| B-S128 | D-S128 | S | Conduct one AKS cohort preset; verify version-specific services, gateway routing, and user evidence. | CORE, DATA, AKS, C074 |',
    packet: 'SC-S128',
  },
  documentedConstraints: [
    {
      url: 'https://kubernetes.io/docs/concepts/services-networking/service/',
      summary: 'Service endpoints are usually chosen by pod-label selectors, not by software/API compatibility or preview authorization.',
    },
    {
      url: 'https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/',
      summary: 'Service selectors are equality maps; multiple requirements combine with AND. App-only equality can match multiple builds.',
    },
    {
      url: 'https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-traffic-splitting-gateway-api',
      summary: 'A capable Gateway implementation can weight different Service backends. Separate Deployments alone do not implement weighted user routing. No example resources or configuration are generated here.',
    },
    {
      url: 'https://learn.microsoft.com/en-us/azure/aks/best-practices-app-cluster-reliability',
      summary: 'AKS deployment reliability also needs workload-specific readiness, capacity and lifecycle settings. Route selection is not a proof of those settings or complete user continuity.',
    },
  ],
  nativeProofComplete: false, sourceParentComplete: false,
};
for (const record of records.slice(0, 3)) {
  const text = zlib.gunzipSync(fs.readFileSync(path.join(raw, record.workingArchive))).toString();
  const required = record.gitPath === 'README.md' ? evidence.sourceContract.readme
    : record.gitPath.endsWith('backlog.md') ? evidence.sourceContract.backlog : evidence.sourceContract.card;
  if (!text.includes(required)) throw new Error(`Exact source contract mismatch: ${record.gitPath}`);
}
fs.writeFileSync(path.join(raw, 'source-inputs.json'), `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ baseline, sources: records.length, exactSourceContract: true }));
