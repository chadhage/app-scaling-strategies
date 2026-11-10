'use strict';

// Test tooling, not production code: builds a FRESH TREE of the namespace and its imports, the way a consumer's checkout would hold them (review M2, self-review line 2).
// The foreign namespaces (C041, C042 and the two lessons) come from `git archive` of a commit (default HEAD) and their text files are converted to LF or CRLF; capability\C059 is copied
// from the working tree as it is (it is stored with `-text`: its bytes are the committed bytes, never converted). The scratch folder must lie outside the repository and must not exist
// yet. Run the suites inside the tree with GIT_DIR pointing at the real repository (the pins read the accepted blobs with `git cat-file`, read only).
// Usage: node tests\fresh-tree.cjs <scratch folder> <lf|crlf> [--ref <commit>]
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repository = path.resolve(__dirname, '..', '..', '..');
const [target, mode] = process.argv.slice(2);
const refIndex = process.argv.indexOf('--ref');
const ref = refIndex < 0 ? 'HEAD' : process.argv[refIndex + 1];
const TEXT = new Set(['.js', '.cjs', '.mjs', '.json', '.md', '.html', '.css', '.txt', '.feature', '.yml', '.yaml', '.xml', '.svg']);

if (!target || !['lf', 'crlf'].includes(mode)) throw new Error('usage: node tests\\fresh-tree.cjs <scratch folder> <lf|crlf> [--ref <commit>]');
const resolved = path.resolve(target);
const relative = path.relative(repository, resolved);
const inside = relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
const owned = relative === 'fresh-work' || relative.startsWith(`fresh-work${path.sep}`);
if ((inside && !owned) || fs.existsSync(resolved)) throw new Error('the scratch folder must be new and outside the source tree or under the explicitly owned fresh-work folder');
fs.mkdirSync(resolved, { recursive: true });

const tar = path.join(resolved, 'foreign.tar');
execFileSync('git', ['-C', repository, 'archive', '--format=tar', '-o', tar, ref, 'capability/C041', 'capability/C042', 'learning/S001', 'learning/S003'], { windowsHide: true });
execFileSync('tar', ['-xf', tar, '-C', resolved], { windowsHide: true });
fs.rmSync(tar);
fs.cpSync(path.join(repository, 'capability', 'C059'), path.join(resolved, 'capability', 'C059'), { recursive: true, filter: (source) => !/[\\/](?:scratch|data)$/.test(source) });
const browser = path.join(repository, 'testing', 'browser');
if (fs.existsSync(browser)) fs.cpSync(browser, path.join(resolved, 'testing', 'browser'), {
  recursive: true, filter: (source) => !/[\\/](?:node_modules|evidence|fixtures|lifecycle)$/.test(source),
});

let seen = 0;
let rewritten = 0;
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (!TEXT.has(path.extname(entry.name).toLowerCase())) continue;
    const bytes = fs.readFileSync(full);
    if (bytes.includes(0)) continue;
    seen += 1;
    const lf = bytes.toString('latin1').replace(/\r\n/g, '\n');
    const out = Buffer.from(mode === 'crlf' ? lf.replace(/\n/g, '\r\n') : lf, 'latin1');
    if (!out.equals(bytes)) { fs.writeFileSync(full, out); rewritten += 1; }
  }
};
for (const relative of ['capability/C041', 'capability/C042', 'learning']) walk(path.join(resolved, ...relative.split('/')));
console.log(JSON.stringify({ tree: resolved, mode, ref, foreignTextFiles: seen, rewritten }));
