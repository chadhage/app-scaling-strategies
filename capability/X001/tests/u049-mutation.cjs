'use strict';

const { createHash } = require('node:crypto');
const acorn = require('internal/deps/acorn/acorn/dist/acorn');
const walk = require('internal/deps/acorn/acorn-walk/dist/walk');
const prior = require('.\\mutant-gen.cjs');

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const idFor = (file, source, mutant) => {
  const context = `${source.slice(Math.max(0, mutant.start - 30), mutant.start)}<<${source.slice(mutant.start, mutant.end)}>>${mutant.replacement}||${source.slice(mutant.end, mutant.end + 30)}`;
  return `${file}:${mutant.op}:${createHash('sha1').update(context.replace(/\s+/g, ' ')).digest('hex').slice(0, 10)}`;
};

function inventory(file, source, named = []) {
  const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
  const found = new Map(prior.generate(file, source).map((item) => [`${item.start}:${item.end}:${item.replacement}`, item]));
  const statements = [];
  const conditions = [];
  const add = (op, node, replacement) => {
    if (source.slice(node.start, node.end) === replacement) return;
    const key = `${node.start}:${node.end}:${replacement}`;
    if (!found.has(key)) found.set(key, { file, op, start: node.start, end: node.end, replacement, line: node.loc.start.line, original: source.slice(node.start, node.end) });
  };
  walk.full(ast, (node) => {
    if ((/Statement$/.test(node.type) && !['BlockStatement', 'EmptyStatement'].includes(node.type) && !node.directive)
        || ['FunctionDeclaration', 'VariableDeclaration'].includes(node.type)) {
      statements.push({ type: node.type, line: node.loc.start.line, start: node.start, end: node.end });
      add('statement-removed', node, ';');
    }
    if (['IfStatement', 'ConditionalExpression', 'WhileStatement', 'DoWhileStatement', 'ForStatement'].includes(node.type) && node.test) {
      conditions.push({ type: node.type, line: node.test.loc.start.line, start: node.test.start, end: node.test.end });
      for (const [suffix, replacement] of [['true', 'true'], ['false', 'false'], ['negated', `!(${source.slice(node.test.start, node.test.end)})`]]) {
        add(`${node.type === 'WhileStatement' ? 'while' : node.type === 'DoWhileStatement' ? 'do-while' : node.type === 'ForStatement' ? 'for' : node.type === 'IfStatement' ? 'if' : 'ternary'}-${suffix}`, node.test, replacement);
      }
    }
    if (node.type === 'LogicalExpression') {
      for (const operand of [node.left, node.right]) conditions.push({ type: 'LogicalOperand', line: operand.loc.start.line, start: operand.start, end: operand.end });
    }
    if (['ForOfStatement', 'ForInStatement'].includes(node.type)) add('iterable-emptied', node.right, '[]');
  });
  for (const item of named.filter((entry) => entry.file === file)) {
    const at = source.indexOf(item.find);
    if (at < 0 || source.indexOf(item.find, at + 1) >= 0) throw new Error(`Named mutation anchor is not unique: ${item.name}`);
    const mutant = { file, op: `named-${item.name}`, start: at, end: at + item.find.length, replacement: item.replace, line: source.slice(0, at).split('\n').length, original: item.find };
    found.set(`named:${item.name}`, mutant);
  }
  const counts = new Map();
  const mutants = [...found.values()].sort((a, b) => a.start - b.start || a.end - b.end || a.op.localeCompare(b.op)).map((mutant) => {
    const base = idFor(file, source, mutant);
    const count = (counts.get(base) || 0) + 1;
    counts.set(base, count);
    return { ...mutant, original: source.slice(mutant.start, mutant.end), id: count === 1 ? base : `${base}~${count}` };
  });
  for (const statement of statements) {
    if (!mutants.some((item) => item.start === statement.start && item.end === statement.end && item.replacement === ';')) {
      throw new Error(`Statement was not inventoried: ${file}:${statement.line}`);
    }
  }
  return { file, rawSha256: sha(Buffer.from(source)), statements, conditions, mutants };
}

function bounded(source) {
  const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
  const edits = [];
  let index = 0;
  walk.full(ast, (node) => {
    if (!['ForStatement', 'ForOfStatement', 'ForInStatement', 'WhileStatement', 'DoWhileStatement'].includes(node.type)) return;
    const name = `__u049Iteration${index++}`;
    const hook = `globalThis.__X001_U049_MUTATION_TICK(${JSON.stringify(`${node.type}:${node.loc.start.line}`)},++${name});`;
    edits.push({ at: node.start, text: `{let ${name}=0;` }, { at: node.end, text: '}' });
    if (node.body.type === 'BlockStatement') edits.push({ at: node.body.start + 1, text: hook });
    else edits.push({ at: node.body.start, text: `{${hook}` }, { at: node.body.end, text: '}' });
  });
  edits.sort((a, b) => b.at - a.at);
  for (const edit of edits) source = source.slice(0, edit.at) + edit.text + source.slice(edit.at);
  return source;
}

module.exports = Object.freeze({ sha, inventory, bounded, apply: prior.apply, parses: prior.parses });
