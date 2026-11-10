'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const REPOSITORY = path.resolve(ROOT, '..', '..');
const COMMIT = 'cb27bebe434029bdd8fa1eeeb3d08ccd5030eb24';
const TAG = 'kanban/U007/cb27bebe4340';
const LIFECYCLE = ['tree.cjs', 'windows.cjs', 'owned.cjs', 'startup.cjs', 'close.cjs', 'session.cjs', 'scratch.cjs', 'scratch-session.cjs'];
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = (bytes) => hash(Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1'));

function prepare(anchor) {
  const qualifier = path.join(anchor, 'testing', 'browser', 'qualify');
  const files = ['testing/browser/isolated.cjs', ...LIFECYCLE.map((name) => `testing/browser/lifecycle/${name}`),
    ...fs.readdirSync(qualifier, { withFileTypes: true }).filter((entry) => entry.isFile() && /\.(?:cjs|json|jsonl)$/.test(entry.name)).map((entry) => `testing/browser/qualify/${entry.name}`)];
  const imports = {};
  for (const relative of files) {
    const bytes = fs.readFileSync(path.join(anchor, relative));
    const blob = execFileSync('git', ['--no-pager', 'show', `${COMMIT}:${relative}`], { cwd: anchor, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    if (canonical(bytes) !== canonical(blob)) throw new Error(`owning API differs from the accepted matching tag: ${relative}`);
    const target = path.join(REPOSITORY, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes, { flag: 'wx' });
    imports[relative] = { rawSha256: hash(bytes), canonicalLfSha256: canonical(bytes), gitBlobSha256: hash(blob) };
  }
  const document = { schema: 'C014-browser-imports/1', status: 'Read-only existing owning API and qualifier; no qualification or producer pin was changed.',
    accepted: { commit: COMMIT, tag: TAG }, lifecycleApiFiles: LIFECYCLE.map((name) => `testing/browser/lifecycle/${name}`), imports };
  fs.writeFileSync(path.join(ROOT, 'imports.final.json'), JSON.stringify(document, null, 2) + '\n', { flag: 'wx' });
  return document;
}
function verify(root = REPOSITORY) {
  const document = JSON.parse(fs.readFileSync(path.join(ROOT, 'imports.final.json')));
  const problems = [];
  if (document.accepted.commit !== COMMIT || document.accepted.tag !== TAG || document.lifecycleApiFiles.length !== 8) problems.push('owning API anchor differs');
  for (const [relative, pin] of Object.entries(document.imports)) {
    const file = path.join(root, relative);
    if (!fs.existsSync(file)) problems.push(`owning import missing: ${relative}`);
    else {
      const bytes = fs.readFileSync(file);
      if (canonical(bytes) !== pin.canonicalLfSha256 || /\.(json|jsonl)$/.test(relative) && hash(bytes) !== pin.rawSha256) problems.push(`owning import changed: ${relative}`);
    }
  }
  return problems;
}
function verifyGit(anchor = process.env.C014_GIT_ANCHOR || REPOSITORY) {
  const document = JSON.parse(fs.readFileSync(path.join(ROOT, 'imports.final.json')));
  const names = [`${TAG}^{commit}`, ...Object.keys(document.imports).map((name) => `${COMMIT}:${name}`)];
  const bytes = execFileSync('git', ['--no-pager', 'cat-file', '--batch'], { cwd: anchor, input: names.join('\n') + '\n', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  let at = 0;
  const problems = [];
  names.forEach((name, index) => {
    const end = bytes.indexOf(10, at);
    const [oid, type, size] = bytes.toString('latin1', at, end).split(' ');
    at = end + 1;
    if (size === undefined) { problems.push(`owning Git object missing: ${name}`); return; }
    const object = bytes.subarray(at, at + Number(size));
    at += Number(size) + 1;
    if (index === 0) { if (type !== 'commit' || oid !== COMMIT) problems.push('owning tag does not peel to its accepted commit'); }
    else if (type !== 'blob' || hash(object) !== document.imports[Object.keys(document.imports)[index - 1]].gitBlobSha256) problems.push(`owning Git blob differs: ${name}`);
  });
  return problems;
}
if (require.main === module) {
  if (process.argv[2] === '--verify') {
    const problems = [...verify(), ...verifyGit()];
    console.log(JSON.stringify({ ok: problems.length === 0, problems }));
    if (problems.length) process.exitCode = 1;
  } else console.log(`Copied ${Object.keys(prepare(process.env.C014_GIT_ANCHOR || REPOSITORY).imports).length} immutable owning/qualifier fixture files.`);
}
module.exports = { COMMIT, TAG, LIFECYCLE, prepare, verify, verifyGit };
