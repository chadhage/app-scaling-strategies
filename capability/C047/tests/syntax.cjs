'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const { root, verifySelection } = require('./selection.cjs'), { list, sha } = require('./privacy.cjs');
const selected = verifySelection(), rows = [];
for (const relative of list(root).filter(name => /\.(cjs|js)$/.test(name))) {
  const bytes = fs.readFileSync(path.join(root, relative));
  new vm.Script(bytes.toString('utf8'), { filename: relative });
  rows.push({ path: relative.replaceAll('\\', '/'), sha256: sha(bytes), completeProgramCompiled: true,
    role: selected.production.includes(relative) ? 'production' : 'own-test-or-verification-tooling' });
}
assert.equal(rows.filter(row => row.role === 'production').length, 1, 'EVERY_PRODUCTION_EXECUTABLE_POSITIVELY_COMPILED');
const result = { schema: 'C047-all-actual-new-JavaScript-complete-program-compilation/1', rows, production: 1, omittedExecutableFiles: 0 };
if (process.env.C047_CAPTURE_DIR) fs.writeFileSync(path.join(process.env.C047_CAPTURE_DIR, 'syntax.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ completeProgramsCompiled: rows.length, production: 1, omittedExecutableFiles: 0 }));
