'use strict';
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
function parser() {
  const raw = process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'];
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),'e10ec115cb48101e961e2bb8352fa3dd3cb6422375ebdaab7b64f5e9548d380d');
  const realm = {module:{exports:{}}};
  realm.exports = realm.module.exports;
  vm.runInNewContext(raw,realm);
  assert.equal(realm.module.exports.version,'8.16.0');
  return realm.module.exports;
}
function enumerate(file,text) {
  const root = parser().parse(text,{ecmaVersion:'latest',sourceType:'script',locations:true});
  const sites = new Map();
  const emit = (kind,node) => {
    const key = `${file}:${kind}:${node.type}:${node.start}:${node.end}`;
    if (!sites.has(key)) sites.set(key,{key,file,kind,type:node.type,start:node.start,end:node.end});
  };
  function truth(node) {
    if (!node) return;
    emit('condition',node);
    if (node.type === 'LogicalExpression') { truth(node.left); truth(node.right); }
    if (node.type === 'UnaryExpression' && node.operator === '!') truth(node.argument);
  }
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) { stack.push(...node); continue; }
    if (typeof node.type === 'string') {
      if (node.type.endsWith('Statement') || node.type.endsWith('Declaration')) emit('statement',node);
      if (['IfStatement','WhileStatement','DoWhileStatement','ForStatement','ConditionalExpression','SwitchCase'].includes(node.type)) truth(node.test);
      if (node.type === 'LogicalExpression') truth(node);
      if (node.type === 'UnaryExpression' && node.operator === '!' ||
          node.type === 'BinaryExpression' && ['<','<=','>','>=','==','!=','===','!==','in','instanceof'].includes(node.operator) ||
          node.type === 'Literal' && typeof node.value === 'boolean') truth(node);
      if (node.type === 'VariableDeclarator' && node.init) emit('initializer',node.init);
      if (node.type === 'AssignmentPattern') emit('initializer',node.right);
      if (node.type === 'PropertyDefinition' && node.value) emit('initializer',node.value);
      if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require') emit('module',node);
      if (node.type === 'ExpressionStatement' && node.directive) emit('module',node);
      if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' &&
          (node.left.object.type === 'Identifier' && ['module','exports'].includes(node.left.object.name) ||
           node.left.object.type === 'MemberExpression' && node.left.object.object.name === 'module' && node.left.object.property.name === 'exports')) emit('export',node);
    }
    for (const value of Object.values(node)) if (value && typeof value === 'object') stack.push(value);
  }
  return [...sites.values()].sort((a,b) => a.key.localeCompare(b.key));
}
module.exports = {enumerate,parser};
