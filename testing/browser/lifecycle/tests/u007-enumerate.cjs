'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const acorn = require('internal/deps/acorn/acorn/dist/acorn');
const { mutantsOf } = require('./mutate-lex.cjs');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function enumerate(lifecycle) {
  const sourceFiles = ['scratch.cjs', 'scratch-session.cjs'];
  const sourceHashes = Object.fromEntries(sourceFiles.map((file) => [file, sha(fs.readFileSync(path.join(lifecycle, file)))]));
  const campaign = [], enumeration = [];
  for (const file of sourceFiles) {
    const source = fs.readFileSync(path.join(lifecycle, file), 'utf8');
    const tree = acorn.parse(source, { ecmaVersion: 'latest', locations: true, sourceType: 'script' });
    const candidates = [], statements = [], conditions = [];
    const add = (start, end, replacement, op, node) => candidates.push({ start, end, replacement, op, line: node?.loc.start.line });
    const pending = [tree];
    while (pending.length) {
      const node = pending.pop();
      if (node.type.endsWith('Statement') || ['VariableDeclaration', 'FunctionDeclaration', 'ClassDeclaration'].includes(node.type)) {
        statements.push({ type: node.type, start: node.start, end: node.end, line: node.loc.start.line });
        if (node.type === 'BlockStatement') add(node.start, node.end, '{}', 'AST empty block', node);
        else add(node.start, node.end, node.type === 'VariableDeclaration' ? '' : ';', 'AST delete ' + node.type, node);
      }
      if (node.test) {
        conditions.push({ type: node.type, start: node.test.start, end: node.test.end, line: node.test.loc.start.line });
        for (const value of ['true', 'false']) add(node.test.start, node.test.end, value, 'AST condition ' + value, node.test);
      }
      if (node.type === 'LogicalExpression') for (const side of ['left', 'right']) for (const value of ['true', 'false']) {
        add(node[side].start, node[side].end, value, 'AST logical ' + side + ' ' + value, node[side]);
      }
      if (node.type === 'ForOfStatement' || node.type === 'ForInStatement') add(node.right.start, node.right.end, '[]', 'AST empty iteration source', node.right);
      if (node.type === 'CallExpression' || node.type === 'NewExpression') {
        for (const argument of node.arguments) if (argument.type !== 'SpreadElement') add(argument.start, argument.end, 'undefined', 'AST caller argument undefined', argument);
        if (node.arguments.length >= 2 && node.arguments[0].type !== 'SpreadElement' && node.arguments[1].type !== 'SpreadElement') {
          const a = node.arguments[0], b = node.arguments[1];
          add(a.start, b.end, source.slice(b.start, b.end) + ', ' + source.slice(a.start, a.end), 'AST swap first two caller arguments', node);
        }
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
          for (const child of value) if (child && typeof child.type === 'string') pending.push(child);
        } else if (value && typeof value.type === 'string') pending.push(value);
      }
    }
    for (const mutant of mutantsOf(source)) candidates.push(mutant);
    const seen = new Set();
    let invalid = 0, unchanged = 0;
    for (const mutant of candidates) {
      if (mutant.replacement === source.slice(mutant.start, mutant.end)) { unchanged += 1; continue; }
      const key = `${mutant.start}:${mutant.end}:${mutant.replacement}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const mutated = source.slice(0, mutant.start) + mutant.replacement + source.slice(mutant.end);
      try { new vm.Script(`(function(exports,require,module,__filename,__dirname){${mutated}\n})`); }
      catch { invalid += 1; continue; }
      campaign.push({ id: 'M' + String(campaign.length + 1).padStart(5, '0'), file, ...mutant });
    }
    enumeration.push({ file, sourceSha256: sourceHashes[file], statements, conditions,
      runnableMutants: campaign.filter((mutant) => mutant.file === file).length, invalidSyntaxNotKills: invalid, unchanged });
  }
  return { schema: 'U007-AST-mutation/1', parser: 'Node bundled Acorn ' + acorn.version, sourceHashes, enumeration,
    mutants: campaign.map(({ mutated, ...description }) => description) };
}
module.exports = { enumerate };
