'use strict';

// Systematic mutant generator (L-0172): EVERY statement and EVERY single condition of a production file, read from the AST of the acorn that ships inside
// the Node binary (needs `node --expose-internals`; tests\mutants.cjs starts itself that way). A mutant is one source-range replacement, never a text
// search, so it cannot be ambiguous. Operators: conditions (true, false, negated; every operand of && and ||), operators (relational, equality, arithmetic,
// logical, update, assignment), literals (booleans, numbers, strings, template text and every ${expression}, regular-expression anchors and quantifiers),
// statements (an expression statement removed, a return value, an arrow body or a declaration initializer replaced by undefined) and freezing removed.
// Not mutated: directives ('use strict'), the argument of require(), and nothing else.
const acorn = require('internal/deps/acorn/acorn/dist/acorn');
const walk = require('internal/deps/acorn/acorn-walk/dist/walk');

const SWAPS = {
  '===': ['!=='], '!==': ['==='], '==': ['!='], '!=': ['=='], '<': ['<=', '>='], '<=': ['<', '>'], '>': ['>=', '<='], '>=': ['>', '<'],
  '+': ['-'], '-': ['+'], '*': ['/'], '/': ['*'], '%': ['*'],
};

function generate(file, source) {
  const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
  const found = new Map();
  const text = (node) => source.slice(node.start, node.end);
  const add = (op, node, replacement, from = node.start, to = node.end) => {
    if (source.slice(from, to) === replacement) return;
    const key = `${from}:${to}:${replacement}`;
    if (!found.has(key)) found.set(key, { file, op, start: from, end: to, replacement, line: node.loc.start.line, original: source.slice(from, to).slice(0, 80) });
  };
  const condition = (op, node) => {
    add(`${op}-true`, node, 'true');
    add(`${op}-false`, node, 'false');
    add(`${op}-negated`, node, `!(${text(node)})`);
  };
  const operator = (node, replacements) => {
    const at = source.indexOf(node.operator, node.left.end);
    for (const replacement of replacements) add(`operator-${node.operator}`, node, replacement, at, at + node.operator.length);
  };

  walk.fullAncestor(ast, (node, _state, ancestors) => {
    const parent = ancestors[ancestors.length - 2];
    switch (node.type) {
      case 'IfStatement': condition('if', node.test); break;
      case 'ConditionalExpression': condition('ternary', node.test); break;
      case 'ForStatement': if (node.test) add('for-false', node.test, 'false'); break;
      case 'LogicalExpression':
        operator(node, node.operator === '&&' ? ['||'] : node.operator === '||' ? ['&&'] : ['||']);
        for (const side of [node.left, node.right]) { add(`operand-${node.operator}-true`, side, 'true'); add(`operand-${node.operator}-false`, side, 'false'); }
        break;
      case 'BinaryExpression': if (SWAPS[node.operator]) operator(node, SWAPS[node.operator]); break;
      case 'UnaryExpression': if (node.operator === '!') add('not-removed', node, `(${text(node.argument)})`); break;
      case 'UpdateExpression': add('update-swapped', node, node.operator === '++' ? text(node).replace('++', '--') : text(node).replace('--', '++')); break;
      case 'AssignmentExpression': if (node.operator === '+=') operator({ ...node, left: node.left, operator: '+=' }, ['-=']); break;
      case 'ExpressionStatement': if (!node.directive) add('statement-removed', node, ';'); break;
      case 'ReturnStatement': if (node.argument) add('return-undefined', node.argument, 'undefined'); break;
      case 'ArrowFunctionExpression': if (node.expression) add('arrow-body-undefined', node.body, 'undefined'); break;
      case 'VariableDeclarator':
        if (node.init && !/Function|Class/.test(node.init.type) && !(parent && parent.kind === 'var')) add('initializer-undefined', node.init, 'undefined');
        break;
      case 'CallExpression': {
        const callee = text(node.callee);
        if (callee === 'require' || node.arguments.length !== 1) break;
        if (callee === 'Object.freeze' || callee === 'deepFreeze') add('freeze-removed', node, `(${text(node.arguments[0])})`);
        break;
      }
      case 'TemplateLiteral':
        for (const expression of node.expressions) add('template-expression-emptied', expression, "''");
        for (const quasi of node.quasis) add('template-text-changed', quasi, '~', quasi.start, quasi.start);
        break;
      case 'Literal': {
        const inRequire = parent && parent.type === 'CallExpression' && text(parent.callee) === 'require';
        if (node.regex) {
          const { pattern, flags } = node.regex;
          const variants = [pattern.replace('^', ''), pattern.replace(/\$$/, ''), ...[...pattern.matchAll(/\{(\d+),(\d+)\}/g)].flatMap((match) => [`{${match[1]},${Number(match[2]) + 1}}`, `{${match[1]},${Math.max(0, Number(match[2]) - 1)}}`].map((quantifier) => pattern.replace(match[0], quantifier)))];
          for (const variant of new Set(variants)) if (variant !== pattern) add('regex-changed', node, `/${variant}/${flags}`);
        } else if (typeof node.value === 'boolean') add('boolean-flipped', node, String(!node.value));
        else if (typeof node.value === 'number' && !(parent && parent.type === 'Property' && parent.key === node)) add('number-changed', node, `(${node.value + 1})`);
        else if (typeof node.value === 'string' && !inRequire && !(parent && parent.type === 'ExpressionStatement' && parent.directive)) add('string-changed', node, `${node.raw.slice(0, -1)}~${node.raw.slice(-1)}`);
        break;
      }
      default: break;
    }
  });
  return [...found.values()].sort((a, b) => a.start - b.start || a.end - b.end || a.op.localeCompare(b.op));
}

const apply = (source, mutant) => source.slice(0, mutant.start) + mutant.replacement + source.slice(mutant.end);

module.exports = Object.freeze({ generate, apply, parses: (source) => { acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script' }); return true; } });
