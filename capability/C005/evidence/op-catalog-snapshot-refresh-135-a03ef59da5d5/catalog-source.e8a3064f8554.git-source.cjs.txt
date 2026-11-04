'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..', '..');
const PINNED_COMMIT = 'e8a3064f8554906216a9e0c3cf1344a3a6acf019';
const SOURCE_PATHS = Object.freeze({
  readme: 'README.md',
  backlog: '.docs\\wiki\\backlog.md',
  ledger: '.docs\\wiki\\flow-state.json'
});
const NATIVE_REASON = 'No accepted target-specific native proof is supplied by this catalog. Native execution and qualification remain false; separate target, safety and execution approvals are required. Documentation or a portable lesson is not native evidence.';
const SUPPORT_REASON = 'Unknown for this entry: no concrete target configuration is selected or qualified. Consult the C003 documented-only matrix for configuration-specific unsupported/unknown reasons; a source objective is not a universal platform-support claim.';
const RISK_REASON = 'The canonical source gives priority, prerequisites and operating limits, not a per-entry risk classification. Risk is unclassified; priority is not risk, permission or a cost estimate.';
const PARENT_REASON = 'Planned source parent, not completed in the committed snapshot. Accepted portable learning does not satisfy native proof or the original parent acceptance gates.';

function git(args) {
  return execFileSync('git', ['--no-pager', ...args], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024
  });
}
function sha(text) {
  return createHash('sha256').update(text).digest('hex');
}
function plain(text) {
  return text.replace(/\*\*/g, '').replace(/`([^`]+)`/g, '$1').trim();
}
function anchor(text) {
  return plain(text).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');
}
function lines(text) {
  return text.replace(/\r\n/g, '\n').split('\n');
}
function reference(document, line, heading) {
  return { document, path: SOURCE_PATHS[document], line, anchor: anchor(heading) };
}
function unique(items, key) {
  assert.equal(new Set(items.map(item => item[key])).size, items.length, `duplicate ${key}`);
}
function sourceRows(text, expression, document) {
  let heading = '';
  return lines(text).flatMap((line, index) => {
    if (/^#{2,3} /.test(line)) heading = line.replace(/^#{2,3} /, '');
    if (!expression.test(line)) return [];
    assert.ok(!line.includes('\\|'), 'escaped table delimiters need an extractor update');
    return [{ cells: line.split('|').slice(1, -1).map(cell => cell.trim()),
      ref: reference(document, index + 1, heading), heading }];
  });
}
function section(text, heading, document) {
  const all = lines(text);
  const start = all.findIndex(line => line === heading);
  assert.notEqual(start, -1, `missing source section ${heading}`);
  const end = all.findIndex((line, index) => index > start && /^#{1,2} /.test(line));
  const last = end === -1 ? all.length : end;
  return {
    text: all.slice(start + 1, last).join('\n').trim(),
    reference: reference(document, start + 1, heading.replace(/^#+ /, ''))
  };
}
function acceptedLesson(card) {
  return card?.state === 'Done' && card.result?.outcome === 'published'
    && card.review?.accepted === true && card.review.focusedTestsPassed === true
    && card.review.browserObserved === true && card.review.remoteVerified === true
    && /^[a-f0-9]{40}$/.test(card.publication?.commit || '')
    && card.result.commit === card.publication.commit
    && card.review.commit === card.publication.commit
    && card.result.tag === card.publication.tag && card.review.tag === card.publication.tag
    && card.publication.tag === `kanban/${card.id}/${card.publication.commit.slice(0, 12)}`
    && typeof card.acceptedAtUtc === 'string' && Number.isFinite(Date.parse(card.acceptedAtUtc));
}
function learningFor(id, ledger) {
  if (id.startsWith('W')) {
    return { status: 'unavailable', available: false, cardId: null, href: null, evidence: null,
      reason: 'No portable A-card lesson is defined for this integrated workflow. Its planned walkthrough and native execution are not delivered by the source catalog.' };
  }
  const cardId = `A-${id}`;
  const card = ledger.cards.find(item => item.id === cardId);
  if (!acceptedLesson(card)) {
    return { status: 'unavailable', available: false, cardId, href: null, evidence: null,
      reason: 'No accepted Done review with matching publication is present in the pinned committed ledger. A lesson file or a published-but-unaccepted card is not availability evidence; this is not a live check.' };
  }
  return { status: 'accepted-snapshot', available: true, cardId,
    href: `../../learning/${id}/index.html`,
    evidence: { commit: card.publication.commit, tag: card.publication.tag, acceptedAtUtc: card.acceptedAtUtc },
    reason: 'Accepted portable lesson in the pinned committed snapshot only. Training rehearsal — synthetic data — not a live Azure result, native qualification or completed source parent.' };
}

function extractCatalog({ readme, backlog, ledgerText, commitTimeUtc }) {
  const ledger = JSON.parse(ledgerText);
  assert.equal(ledger.schemaVersion, 1, 'unsupported ledger version');
  assert.ok(Array.isArray(ledger.cards) && Array.isArray(ledger.completedParents));
  unique(ledger.cards, 'id');
  const scenarios = sourceRows(readme, /^\| S\d{3} \|/, 'readme');
  const demos = sourceRows(backlog, /^\| D-S\d{3} \|/, 'backlog');
  const workflows = sourceRows(backlog, /^\| W\d{3} \|/, 'backlog');
  assert.equal(scenarios.length, 150);
  assert.equal(demos.length, 150);
  assert.equal(workflows.length, 2);
  const demoById = new Map(demos.map(row => [row.cells[0].slice(2), row]));
  const entries = scenarios.map((row, index) => {
    const [id, description] = row.cells;
    assert.equal(id, `S${String(index + 1).padStart(3, '0')}`);
    const match = /^\*\*(.+?):\*\* (.+)$/.exec(description);
    assert.ok(match, `${id} must retain an explicit source title and required behavior`);
    const demo = demoById.get(id);
    assert.ok(demo, `missing ${id} demo`);
    assert.equal(demo.cells.length, 5);
    return {
      id, kind: 'scenario', parentId: demo.cells[0],
      category: { id: row.heading.slice(0, 1), title: row.heading.slice(3) },
      title: plain(match[1]), objective: plain(match[2]), priority: demo.cells[1],
      implementation: plain(demo.cells[2]), acceptance: plain(demo.cells[3]),
      prerequisites: { additional: demo.cells[4], inheritsBase: true },
      sourceReferences: [row.ref, demo.ref]
    };
  });
  workflows.forEach((row, index) => {
    const [id, priority, implementation, acceptance, dependencies] = row.cells;
    assert.equal(id, `W00${index + 1}`);
    const title = /\*\*(.+?)\*\*/.exec(implementation);
    assert.ok(title, `missing workflow title ${id}`);
    entries.push({
      id, kind: 'workflow', parentId: id,
      category: { id: 'W', title: 'Integrated guided demonstrations' },
      title: plain(title[1]), objective: plain(implementation), priority,
      implementation: plain(implementation), acceptance: plain(acceptance),
      prerequisites: { additional: dependencies, inheritsBase: false },
      sourceReferences: [row.ref]
    });
  });
  unique(entries, 'id');
  for (const entry of entries) {
    assert.ok(!ledger.completedParents.includes(entry.parentId), 'v1 does not certify completed source parents');
    Object.assign(entry, {
      risk: 'unclassified',
      learning: learningFor(entry.id, ledger),
      native: { status: 'unverified', runnable: false, qualified: false, evidence: [], reason: NATIVE_REASON },
      support: { status: 'unknown', reason: SUPPORT_REASON },
      parent: { completed: false, status: 'planned', reason: PARENT_REASON }
    });
  }
  return {
    schemaVersion: '1.0.0', kind: 'source-scenario-catalog', cardId: 'C005',
    scope: 'local-source-derived-snapshot',
    source: {
      commit: PINNED_COMMIT, commitTimeUtc,
      readme: { path: SOURCE_PATHS.readme, sha256: sha(readme) },
      backlog: { path: SOURCE_PATHS.backlog, sha256: sha(backlog) }
    },
    acceptanceSnapshot: {
      commit: PINNED_COMMIT, commitTimeUtc, ledgerPath: SOURCE_PATHS.ledger,
      ledgerSha256: sha(ledgerText), ledgerUpdatedAtUtc: ledger.updatedAtUtc, live: false
    },
    capabilityMatrix: {
      cardId: 'C003', schemaVersion: '1.0.0', sourceCommit: PINNED_COMMIT,
      dataPath: 'capability\\C003\\matrix-data.js',
      contractPath: 'capability\\C003\\matrix-contract.js', href: '../C003/index.html'
    },
    common: {
      riskReason: RISK_REASON,
      dependencyRules: section(backlog, '## Priorities and dependencies', 'backlog'),
      sharedDefinitionOfDone: section(backlog, '## Shared definition of done', 'backlog'),
      operatingLimits: section(readme, '## Lifecycle and safety gates', 'readme'),
      acceptanceAndEvidence: section(readme, '## Acceptance and evidence', 'readme'),
      workflowScope: 'Integrated workflows compose source scenarios; they are not two additional source strategies.'
    },
    entries
  };
}
function readPinnedSources() {
  const show = document => git(['show', `${PINNED_COMMIT}:${SOURCE_PATHS[document].replaceAll('\\', '/')}`]);
  return {
    readme: show('readme'), backlog: show('backlog'), ledgerText: show('ledger'),
    commitTimeUtc: new Date(git(['show', '-s', '--format=%cI', PINNED_COMMIT]).trim()).toISOString()
  };
}
function buildCatalog() {
  return extractCatalog(readPinnedSources());
}
function serialize(catalog) {
  return `(function (root, factory) {\n  'use strict';\n  if (typeof module === 'object' && module.exports) module.exports = factory();\n  else Object.defineProperty(root, 'C005Catalog', { value: factory() });\n}(globalThis, function () {\n  'use strict';\n  function freeze(value) {\n    if (value && typeof value === 'object') {\n      Object.values(value).forEach(freeze);\n      Object.freeze(value);\n    }\n    return value;\n  }\n  // Generated by catalog-source.cjs from pinned committed sources; do not hand-edit.\n  return freeze(${JSON.stringify(catalog, null, 2)});\n}));\n`;
}
function verifyLearningTargets(catalog) {
  for (const entry of catalog.entries.filter(item => item.learning.available)) {
    const target = `learning/${entry.id}/index.html`;
    git(['cat-file', '-e', `${entry.learning.evidence.commit}:${target}`]);
    git(['cat-file', '-e', `${PINNED_COMMIT}:${target}`]);
    assert.ok(fs.statSync(path.join(ROOT, 'learning', entry.id, 'index.html')).isFile());
    git(['merge-base', '--is-ancestor', entry.learning.evidence.commit, PINNED_COMMIT]);
  }
}
function checkCurrentCanonical(sources) {
  for (const document of ['readme', 'backlog']) {
    assert.equal(fs.readFileSync(path.join(ROOT, SOURCE_PATHS[document]), 'utf8').replace(/\r\n/g, '\n'),
      sources[document].replace(/\r\n/g, '\n'), `${document} changed; explicitly review and refresh the pin`);
  }
}
if (require.main === module) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 1 && ['--check', '--write'].includes(args[0]), 'use --check or --write');
  const sources = readPinnedSources();
  const catalog = extractCatalog(sources);
  checkCurrentCanonical(sources);
  verifyLearningTargets(catalog);
  const target = path.join(__dirname, 'catalog-data.js');
  const expected = serialize(catalog);
  if (args[0] === '--write') fs.writeFileSync(target, expected);
  else assert.equal(fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n'), expected, 'catalog-data.js differs from pinned canonical extraction');
  console.log(`C005 ${args[0]}: 150 scenarios + 2 workflows; ${catalog.entries.filter(entry => entry.learning.available).length} accepted snapshot lessons; 0 native runnable; pin ${PINNED_COMMIT}`);
}
module.exports = {
  PINNED_COMMIT, SOURCE_PATHS, NATIVE_REASON, SUPPORT_REASON, RISK_REASON, PARENT_REASON,
  extractCatalog, readPinnedSources, buildCatalog, serialize, acceptedLesson, verifyLearningTargets
};
