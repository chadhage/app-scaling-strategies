'use strict';

// Test tooling, not production code: recompute every import pin against GIT at the accepted commit (L-0116), not against the
// file next to the pin. It calls git, so it is a verification command, not part of the hermetic suite:
//   node capability\C017\tests\anchor.cjs
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const path = require('node:path');
const imports = require('../imports.json');

const repo = path.resolve(__dirname, '..', '..', '..');
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
const git = (args, encoding = 'utf8') => execFileSync('git', args, { cwd: repo, encoding, maxBuffer: 1 << 26 });

const problems = [];
const pins = [...imports.dependencies, { ...imports.browserHelper, card: 'flow-browser' }, ...imports.qualifyHelper.files.map((file) => ({ ...file, card: 'U018' }))];
for (const dep of pins) {
  const posix = dep.path.replaceAll('\\', '/');
  const resolved = git(['rev-parse', `${dep.tag}^{commit}`]).trim();
  if (resolved !== dep.commit) problems.push(`${dep.tag} resolves to ${resolved}, not ${dep.commit}`);
  const blob = sha(git(['show', `${dep.commit}:${posix}`], 'buffer'));
  if (blob !== dep.git) problems.push(`${dep.path}: blob at ${dep.commit} is ${blob}, pinned ${dep.git}`);
  const last = git(['log', '-1', '--format=%H', '--', posix]).trim();
  if (last !== dep.commit) problems.push(`${dep.path}: last changed in ${last}, pinned ${dep.commit}`);
}
console.log(JSON.stringify({ checked: pins.length, problems }, null, 2));
process.exit(problems.length ? 1 : 0);
