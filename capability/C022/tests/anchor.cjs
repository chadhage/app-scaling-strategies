'use strict';

// Test tooling, not production code: recomputes every import pin against GIT at the accepted commit (L-0116), not against the file next
// to the pin. It calls git, so it is a verification command (its archived run is evidence), not part of the hermetic suite, which must
// also pass in a tree built by git archive where no .git exists:
//   node capability\C022\tests\anchor.cjs
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const path = require('node:path');
const imports = require('../imports.json');

const repo = path.resolve(__dirname, '..', '..', '..');
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
const git = (args, encoding = 'utf8') => execFileSync('git', args, { cwd: repo, encoding, maxBuffer: 1 << 26 });

const problems = [];
for (const dep of imports.dependencies) {
  const resolved = git(['rev-parse', `${dep.tag}^{commit}`]).trim();
  if (resolved !== dep.commit) problems.push(`${dep.tag} resolves to ${resolved}, not ${dep.commit}`);
  const blob = sha(git(['show', `${dep.commit}:${dep.path}`], 'buffer'));
  if (blob !== dep.git) problems.push(`${dep.path}: blob at ${dep.commit} is ${blob}, pinned ${dep.git}`);
  const later = git(['log', '--format=%H', `${dep.commit}..HEAD`, '--', dep.path]).trim();
  if (later !== '') problems.push(`${dep.path}: changed after the accepted commit by ${later.split('\n').join(', ')}`);
}
console.log(JSON.stringify({ checked: imports.dependencies.length, problems }, null, 2));
process.exit(problems.length ? 1 : 0);
