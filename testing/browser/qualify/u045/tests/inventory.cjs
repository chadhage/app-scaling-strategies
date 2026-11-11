'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {parse,sha,identity} = require('./parser.cjs');
const oracle = require('./domain-oracle.cjs');
const production = Object.freeze(['current.cjs']);
function enumerate(file,text) {
  const result = new Map();
  function add(kind,node,parent,property) {
    const key = `${file}:${kind}:${node.type}:${node.start}:${node.end}`;
    if (!result.has(key)) result.set(key,{
      key,file,kind,type:node.type,start:node.start,end:node.end,
      line:node.loc.start.line,parentType:parent?.type,parentProperty:property,node,
    });
  }
  function condition(node,parent,property) {
    if (!node) return;
    add('condition',node,parent,property);
    if (node.type === 'LogicalExpression') {
      condition(node.left,node,'left');
      condition(node.right,node,'right');
    } else if (node.type === 'UnaryExpression' && node.operator === '!') condition(node.argument,node,'argument');
  }
  function visit(node,parent,property) {
    if (Array.isArray(node)) { for (const item of node) visit(item,parent,property); return; }
    if (!node || typeof node !== 'object' || typeof node.type !== 'string') return;
    if (/(?:Statement|Declaration)$/.test(node.type)) add('statement',node,parent,property);
    switch (node.type) {
      case 'IfStatement': case 'WhileStatement': case 'DoWhileStatement': case 'ForStatement':
      case 'ConditionalExpression': case 'SwitchCase': condition(node.test,node,'test'); break;
      case 'LogicalExpression': condition(node,node,'self'); break;
      case 'UnaryExpression': if (node.operator === '!') condition(node,node,'self'); break;
      case 'BinaryExpression':
        if (new Set(['<','<=','>','>=','==','!=','===','!==','in','instanceof']).has(node.operator)) condition(node,node,'self');
        break;
      case 'Literal': if (typeof node.value === 'boolean') condition(node,node,'self'); break;
      case 'VariableDeclarator': if (node.init) add('initializer',node.init,node,'init'); break;
      case 'AssignmentPattern': add('initializer',node.right,node,'right'); break;
      case 'PropertyDefinition': if (node.value) add('initializer',node.value,node,'value'); break;
      case 'CallExpression':
        if (node.callee.type === 'Identifier' && node.callee.name === 'require') add('module',node,parent,property);
        break;
      case 'ExpressionStatement': if (node.directive) add('module',node,parent,property); break;
      case 'AssignmentExpression': {
        const left = node.left;
        const direct = left.type === 'MemberExpression' && left.object.type === 'Identifier' && ['module','exports'].includes(left.object.name);
        const nested = left.type === 'MemberExpression' && left.object.type === 'MemberExpression' && left.object.object.name === 'module' && left.object.property.name === 'exports';
        if (direct || nested) add('export',node,parent,property);
        break;
      }
    }
    for (const [key,value] of Object.entries(node)) if (value && typeof value === 'object') visit(value,node,key);
  }
  visit(parse(text));
  const sites = [...result.values()].sort((a,b) => a.key.localeCompare(b.key));
  assert.deepEqual(sites.map(site => site.key),oracle.enumerate(file,text).map(site => site.key),'Independent parser-grounded domain agreement');
  return sites;
}
function replacement(site,text) {
  const node = site.node;
  const original = text.slice(node.start,node.end);
  if (site.kind === 'condition') return `!(${original})`;
  if (site.kind === 'initializer' || site.kind === 'module' && node.type === 'CallExpression') return 'undefined';
  if (site.kind === 'export') return 'module.exports = {}';
  if (node.type === 'ExpressionStatement') return node.directive ? "'not strict';" : 'void 0;';
  if (node.type === 'BlockStatement') return '{}';
  if (node.type === 'ReturnStatement') return node.argument ? 'return undefined;' : 'return null;';
  if (node.type === 'ThrowStatement') return 'void 0;';
  if (node.type === 'VariableDeclaration') {
    const first = node.declarations.find(declaration => declaration.init);
    if (first) return text.slice(node.start,first.init.start)+'undefined'+text.slice(first.init.end,node.end);
    return original.replace(/\b(?:let|var|const)\b/,'var');
  }
  if (['FunctionDeclaration','ClassDeclaration'].includes(node.type)) return text.slice(node.start,node.body.start)+'{}'+text.slice(node.body.end,node.end);
  if (node.type === 'IfStatement') return text.slice(node.start,node.test.start)+'false'+text.slice(node.test.end,node.end);
  if (node.type === 'ForStatement') return text.slice(node.start,node.test.start)+'false'+text.slice(node.test.end,node.end);
  if (['ForOfStatement','ForInStatement'].includes(node.type)) return text.slice(node.start,node.right.start)+(node.type === 'ForOfStatement' ? '[]' : '{}')+text.slice(node.right.end,node.end);
  return ';';
}
function inventory(root = path.resolve(__dirname,'..')) {
  const all = [];
  for (const file of production) {
    const text = fs.readFileSync(path.join(root,file),'utf8');
    for (const site of enumerate(file,text)) {
      const changed = replacement(site,text);
      const mutant = text.slice(0,site.start)+changed+text.slice(site.end);
      let compiled = true;
      let syntaxError = null;
      try { new vm.Script(mutant,{filename:file}); } catch (error) { compiled=false; syntaxError=error.message; }
      const {node,...record} = site;
      all.push({...record,id:`U045-${all.length+1}`,original:text.slice(site.start,site.end),replacement:changed,
        sourceSha256:sha(text),mutantSha256:sha(mutant),compiled,syntaxError,identity:sha(text) === sha(mutant)});
    }
  }
  return {schema:'U045-independent-exhaustive-domain/1',production,parser:identity,sites:all};
}
module.exports = {production,enumerate,replacement,inventory};
