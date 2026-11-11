'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const {inventory,enumerate,production} = require('./inventory.cjs');
const oracle = require('./domain-oracle.cjs');

test('U045 AST domain independently includes all actual production statements, declarations, conditions, initializers, modules, and exports', () => {
  const actual = inventory();
  assert.deepEqual(production,['current.cjs']);
  const text = fs.readFileSync(path.join(__dirname,'..','current.cjs'),'utf8');
  assert.deepEqual(actual.sites.map(site => site.key).sort(),oracle.enumerate('current.cjs',text).map(site => site.key).sort());
  for (const kind of ['statement','condition','initializer','module','export']) assert.ok(actual.sites.some(site => site.kind === kind),kind);
  assert.ok(actual.sites.some(site => site.type === 'VariableDeclaration'));
  assert.ok(actual.sites.some(site => site.type === 'FunctionDeclaration'));
  assert.equal(new Set(actual.sites.map(site => site.key)).size,actual.sites.length);
  assert.ok(actual.sites.every(site => typeof site.sourceSha256 === 'string' && typeof site.mutantSha256 === 'string'));
});

test('U045 AST oracle covers initializer defaults, nested logical terms, exported member controls, and loop and switch tests', () => {
  const source = "'use strict'; const x=true; function f(a=2){for(let i=0;i<2;i++){if(x && !a || a===2)continue;}while(x){break;}do{}while(false);switch(a){case 2:break;}return x?1:0;} module.exports.x=f;";
  const domain = enumerate('probe.cjs',source);
  assert.deepEqual(domain.map(site => site.key),oracle.enumerate('probe.cjs',source).map(site => site.key));
  assert.ok(domain.some(site => site.kind === 'initializer' && site.parentType === 'AssignmentPattern'));
  assert.ok(domain.some(site => site.kind === 'export'));
  assert.throws(() => enumerate('bad.cjs','const ='),error => error.name === 'SyntaxError');
});
