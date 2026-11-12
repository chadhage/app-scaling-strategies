'use strict';
const vm = require('node:vm'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const bundled = process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(bundled), 'e10ec115cb48101e961e2bb8352fa3dd3cb6422375ebdaab7b64f5e9548d380d', 'EXACT_EXISTING_BUNDLED_PARSER_NOT_AN_INSTALL');
const box = { module: { exports: {} } }; box.exports = box.module.exports;
vm.runInNewContext(bundled, box);
const parser = box.module.exports;
assert.equal(parser.version, '8.16.0', 'ACTUAL_BUNDLED_ACORN');
const identity = { module: 'internal/deps/acorn/acorn/dist/acorn', version: parser.version, sourceSha256: sha(bundled), runtime: process.version };
function inventory(source) {
  const tree = parser.parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
  const nodes = [], recursive = [];
  function walk(node, parent, key) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const child of node) walk(child, parent, key); return; }
    if (typeof node.type !== 'string') return;
    nodes.push({ node, parent, key });
    for (const [name, child] of Object.entries(node)) if (child && typeof child === 'object') walk(child, node, name);
  }
  walk(tree, null, null);
  const stack = [tree];
  while (stack.length) {
    const node = stack.pop(); recursive.push(`${node.type}:${node.start}:${node.end}`);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) { for (const child of value) if (child?.type) stack.push(child); }
      else if (value?.type) stack.push(value);
    }
  }
  assert.deepEqual(nodes.map(({ node }) => `${node.type}:${node.start}:${node.end}`).sort(), recursive.sort(), 'INDEPENDENT_STACK_AND_RECURSIVE_COMPLETE_AST_CENSUS');
  const domains = { statements: [], conditions: new Map(), initializers: [], modules: [], callArguments: [], iterables: [], regexes: [] };
  const row = (node, kind) => ({ kind, type: node.type, start: node.start, end: node.end, startByte: Buffer.byteLength(source.slice(0, node.start)),
    endByte: Buffer.byteLength(source.slice(0, node.end)), line: node.loc.start.line, original: source.slice(node.start, node.end) });
  function condition(node, reason) {
    if (!node) return;
    const key = `${node.start}:${node.end}`;
    if (!domains.conditions.has(key)) domains.conditions.set(key, { ...row(node, 'condition'), sites: [] });
    domains.conditions.get(key).sites.push(reason);
    if (node.type === 'LogicalExpression') { condition(node.left, reason); condition(node.right, reason); }
    if (node.type === 'UnaryExpression' && node.operator === '!') condition(node.argument, reason);
  }
  for (const { node, parent, key } of nodes) {
    if (/Statement$|Declaration$/.test(node.type)) domains.statements.push({ ...row(node, 'statement'), parentType: parent?.type, parentKey: key });
    if (['IfStatement', 'WhileStatement', 'DoWhileStatement', 'ForStatement', 'ConditionalExpression', 'SwitchCase'].includes(node.type)) condition(node.test, node.type);
    if (node.type === 'LogicalExpression') condition(node, 'short-circuit');
    if (node.type === 'UnaryExpression' && node.operator === '!' ||
      node.type === 'BinaryExpression' && ['<', '<=', '>', '>=', '==', '!=', '===', '!==', 'in', 'instanceof'].includes(node.operator) ||
      node.type === 'Literal' && typeof node.value === 'boolean') condition(node, 'boolean');
    if (node.type === 'VariableDeclarator' && node.init) domains.initializers.push({ ...row(node.init, 'initializer'), binding: source.slice(node.id.start, node.id.end) });
    if (node.type === 'AssignmentExpression') domains.initializers.push({ ...row(node.right, 'initializer'), binding: source.slice(node.left.start, node.left.end) });
    if (node.type === 'CallExpression' && node.callee.name === 'require' ||
      node.type === 'AssignmentExpression' && source.slice(node.left.start, node.left.end) === 'module.exports') domains.modules.push(row(node, 'module'));
    if (node.type === 'CallExpression' || node.type === 'NewExpression') for (const argument of node.arguments) domains.callArguments.push({ ...row(argument, 'call-argument'), callee: source.slice(node.callee.start, node.callee.end) });
    if (node.type === 'ForOfStatement' || node.type === 'ForInStatement') domains.iterables.push(row(node.right, 'iterable'));
    if (node.type === 'Literal' && node.regex) domains.regexes.push({ ...row(node, 'regex'), regex: node.regex });
  }
  domains.conditions = [...domains.conditions.values()];
  const definitions = [];
  function add(row, operator, replacement) {
    const changed = source.slice(0, row.start) + replacement + source.slice(row.end);
    let compileError = null;
    try { new vm.Script(changed); } catch (error) { compileError = { name: error.name, message: error.message }; }
    definitions.push({ id: definitions.length + 1, ...row, operator, replacement, sourceSha256: sha(source),
      mutantSha256: sha(changed), identity: changed === source, compiled: compileError === null, compileError });
  }
  for (const row of domains.statements) add(row, 'statement-delete', row.type === 'BlockStatement' ? '{}' : ';');
  for (const row of domains.conditions) {
    add(row, 'condition-true', 'true'); add(row, 'condition-false', 'false'); add(row, 'condition-negate', '!(' + row.original + ')');
  }
  for (const row of domains.initializers) add(row, 'initializer-replace', row.type === 'ArrayExpression' ? '[]' : row.type === 'ObjectExpression' ? '({})' : 'undefined');
  for (const row of domains.modules) add(row, 'module-replace', row.type === 'AssignmentExpression' ? '(module.exports = {})' : '({})');
  for (const row of domains.callArguments) add(row, 'call-argument-replace', row.type === 'ObjectExpression' ? '({})' : row.type === 'ArrayExpression' ? '[]' : 'null');
  for (const row of domains.iterables) add(row, 'iteration-source-empty', '[]');
  for (const row of domains.regexes) {
    add(row, 'regex-no-start-anchor', '/' + row.regex.pattern.replace(/^\^/, '') + '/' + row.regex.flags);
    add(row, 'regex-no-end-anchor', '/' + row.regex.pattern.replace(/\$$/, '') + '/' + row.regex.flags);
  }
  const census = nodes.map(({ node, parent, key }) => ({ type: node.type, start: node.start, end: node.end, parentType: parent?.type || null, parentKey: key,
    roles: Object.entries(domains).filter(([, values]) => values.some(row => row.start === node.start && row.end === node.end)).map(([kind]) => kind) }));
  return { schema: 'C047-complete-independent-AST-domain/1', parser: identity, production: ['server.cjs'], sourceSha256: sha(source), astNodes: census,
    domains, definitions, counts: { astNodes: census.length, variants: definitions.length, eligibleChangedCompiled: definitions.filter(d => d.compiled && !d.identity).length,
      invalidNotKills: definitions.filter(d => !d.compiled).length, identityNotKills: definitions.filter(d => d.identity).length } };
}
module.exports = { inventory, identity, sha };
