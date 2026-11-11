'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const parser = require('../../C011/tests/u074-parser.cjs');
const oracle = require('../../C011/tests/u074-domain-oracle.cjs');
const root = path.resolve(__dirname, '..');
const FILES = ['fixtures.js', 'model.js', 'page.js', 'index.html#theme'];
function sources() {
  return Object.fromEntries(FILES.map(file => {
    const bytes = fs.readFileSync(path.join(root, file.split('#')[0]), 'utf8');
    return [file, file.includes('#') ? /<script>([\s\S]*?)<\/script>/.exec(bytes)[1] : bytes];
  }));
}
function enumerate(file, source) {
  const tree = parser.parse(file, source), statements = [], conditions = new Map(), initializers = [], modules = [];
  const stack = [{ node: tree, parent: null, key: null }];
  const condition = (node, site) => {
    const pending = [node];
    while (pending.length) {
      const current = pending.pop();
      if (!current) continue;
      const key = `${file}:condition:${current.start}:${current.end}`;
      if (!conditions.has(key)) conditions.set(key, { key, file, type: current.type, start: current.start, end: current.end, sites: [] });
      conditions.get(key).sites.push(site);
      if (current.type === 'LogicalExpression') pending.push(current.left, current.right);
      if (current.type === 'UnaryExpression' && current.operator === '!') pending.push(current.argument);
    }
  };
  while (stack.length) {
    const { node, parent, key } = stack.pop();
    const row = { file, type: node.type, start: node.start, end: node.end, parentType: parent?.type, parentKey: key,
      line: node.loc.start.line, startByte: Buffer.byteLength(source.slice(0, node.start)), endByte: Buffer.byteLength(source.slice(0, node.end)) };
    if (/Statement$|Declaration$/.test(node.type)) statements.push({ ...row, key: `${file}:statement:${node.type}:${node.start}:${node.end}` });
    if (['IfStatement', 'WhileStatement', 'DoWhileStatement', 'ForStatement', 'ConditionalExpression', 'SwitchCase'].includes(node.type)) condition(node.test, node.type);
    if (node.type === 'LogicalExpression') { condition(node, 'boolean-expression:' + node.operator); condition(node.left, 'short-circuit:' + node.operator); }
    if (node.type === 'UnaryExpression' && node.operator === '!' || node.type === 'BinaryExpression' && ['<', '<=', '>', '>=', '==', '!=', '===', '!==', 'in', 'instanceof'].includes(node.operator) ||
        node.type === 'Literal' && typeof node.value === 'boolean') condition(node, 'boolean-expression');
    if (node.type === 'VariableDeclarator' && node.init || node.type === 'AssignmentExpression') {
      const init = node.type === 'VariableDeclarator' ? node.init : node.right;
      initializers.push({ ...row, key: `${file}:initializer:${init.start}:${init.end}`, start: init.start, end: init.end, initType: init.type,
        startByte: Buffer.byteLength(source.slice(0, init.start)), endByte: Buffer.byteLength(source.slice(0, init.end)),
        declarationKind: parent?.kind ?? null, binding: node.id?.name || source.slice(node.left?.start, node.left?.end) });
    }
    if (node.type === 'CallExpression' && (node.callee.name === 'require' || source.slice(node.callee.start, node.callee.end) === 'Object.defineProperty') ||
        node.type === 'AssignmentExpression' && source.slice(node.left.start, node.left.end) === 'module.exports') {
      modules.push({ ...row, key: `${file}:module:${node.start}:${node.end}`, spelling: source.slice(node.start, node.end) });
    }
    for (const [name, value] of Object.entries(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child.type === 'string') stack.push({ node: child, parent: node, key: name });
      } else if (value && typeof value.type === 'string') stack.push({ node: value, parent: node, key: name });
    }
  }
  return { statements, conditions: [...conditions.values()], initializers, modules };
}
function extraOracle(file, source) {
  const tree = oracle.parser().parse(source, { ecmaVersion: 'latest', sourceType: 'script' }), initializers = [], modules = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.type === 'VariableDeclarator' && node.init) initializers.push(`${file}:initializer:${node.init.start}:${node.init.end}`);
    if (node.type === 'AssignmentExpression') initializers.push(`${file}:initializer:${node.right.start}:${node.right.end}`);
    if (node.type === 'CallExpression') {
      const name = source.substring(node.callee.start, node.callee.end);
      if (name === 'require' || name === 'Object.defineProperty') modules.push(`${file}:module:${node.start}:${node.end}`);
    }
    if (node.type === 'AssignmentExpression' && source.substring(node.left.start, node.left.end) === 'module.exports') modules.push(`${file}:module:${node.start}:${node.end}`);
    for (const value of Object.values(node)) if (value && typeof value === 'object') walk(value);
  }
  walk(tree); return { initializers, modules };
}
function inventory(input = sources()) {
  const domains = FILES.map(file => {
    const own = enumerate(file, input[file]), independent = oracle.enumerate(file, input[file]), extra = extraOracle(file, input[file]);
    for (const kind of ['statements', 'conditions']) assert.deepEqual(own[kind].map(row => row.key).sort(), independent[kind].map(row => row.key).sort(), 'INDEPENDENT_AST_' + kind + ':' + file);
    for (const kind of ['initializers', 'modules']) assert.deepEqual(own[kind].map(row => row.key).sort(), extra[kind].sort(), 'INDEPENDENT_AST_' + kind + ':' + file);
    return { file, sourceSha256: parser.sha(input[file]), ...own };
  });
  const definitions = [];
  function add(row, replacement, operator) {
    const original = input[row.file], changed = original.slice(0, row.start) + replacement + original.slice(row.end);
    let syntax = null;
    try { new vm.Script(changed); } catch (error) { syntax = { name: error.name, message: error.message }; }
    definitions.push({ id: definitions.length + 1, file: row.file, key: row.key, start: row.start, end: row.end,
      operator, replacement, sourceSha256: parser.sha(original), mutantSha256: parser.sha(changed), identity: original === changed, syntax });
  }
  for (const domain of domains) {
    for (const row of domain.statements) {
      const replacement = row.type === 'BlockStatement' ? '{}' : row.type === 'EmptyStatement' ? '' :
        row.type === 'VariableDeclaration' && ['ForStatement', 'ForOfStatement', 'ForInStatement'].includes(row.parentType) ? '' : ';';
      add(row, replacement, 'statement-delete');
    }
    for (const row of domain.conditions) for (const [operator, replacement] of [['condition-true', 'true'], ['condition-false', 'false'], ['condition-negate', '!(' + input[row.file].slice(row.start, row.end) + ')']]) add(row, replacement, operator);
    for (const row of domain.initializers) {
      const text = input[row.file].slice(row.start, row.end);
      add(row, row.initType === 'ArrayExpression' ? '[]' : row.initType === 'ObjectExpression' ? '({})' :
        row.initType === 'Literal' ? (/^\d+$/.test(text) ? String(Number(text) + 1) : "'C012-altered'") :
        /^Object\.freeze\(/.test(text) ? text.replace(/^Object\.freeze/, 'Object.seal') : 'undefined', 'initializer-replace');
    }
    for (const row of domain.modules) add(row, row.type === 'AssignmentExpression' ? '(module.exports = {})' : 'undefined', 'module-export-replace');
  }
  return { schema: 'C012-independent-complete-AST/1', parser: parser.identity, files: FILES, domains, definitions };
}
module.exports = { FILES, sources, enumerate, extraOracle, inventory };
