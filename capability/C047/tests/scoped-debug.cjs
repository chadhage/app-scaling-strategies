'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), inspector = require('node:inspector');
const { AsyncLocalStorage } = require('node:async_hooks');
const { createRequire } = require('node:module');
const assert = require('node:assert/strict');
const { root } = require('./selection.cjs'), { sha } = require('./ast.cjs');
const output = process.env.C047_CAPTURE_DIR, campaignDirectory = process.env.C047_MUTATION_CAMPAIGN;
assert.ok(output && campaignDirectory, 'EXPLICIT_OWN_SCOPED_CAPTURE_AND_ACTUAL_CAMPAIGN');
const campaign = JSON.parse(fs.readFileSync(path.join(campaignDirectory, 'campaign.json')));
const domain = JSON.parse(fs.readFileSync(path.join(campaignDirectory, 'inventory.json')));
const serverPath = path.join(root, 'server.cjs'), source = fs.readFileSync(serverPath, 'utf8');
assert.equal(sha(source), campaign.sourceSha256, 'CURRENT_EXACT_SOURCE_EQUALS_ACTUAL_MUTATION_CAMPAIGN');
assert.equal(domain.sourceSha256, campaign.sourceSha256, 'EXACT_DOMAIN_SOURCE');
const unresolved = new Set(campaign.semanticUnresolved.map(row => row.id));
const definitions = domain.definitions.filter(row => unresolved.has(row.id));
const box = { module: { exports: {} } }; box.exports = box.module.exports;
vm.runInNewContext(process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'], box);
const ast = box.module.exports.parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
const nodeBySpan = new Map(), parents = new Map();
function visit(node, parent = null, key = null) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const child of node) visit(child, parent, key); return; }
  if (!node.type) return;
  nodeBySpan.set(node.start + ':' + node.end, node); parents.set(node, { parent, key });
  for (const [name, value] of Object.entries(node)) if (value && typeof value === 'object') visit(value, node, name);
}
visit(ast);
const context = new AsyncLocalStorage(), testApi = require('node:test'), actualTest = testApi.test;
testApi.test = function (...args) {
  const index = args.findLastIndex(value => typeof value === 'function'), callback = args[index], name = typeof args[0] === 'string' ? args[0] : callback?.name || 'unnamed actual test';
  if (index >= 0) args[index] = function (...values) { return context.run(name, () => callback.apply(this, values)); };
  return actualTest.apply(this, args);
};
const witnesses = new Map(), attempts = [], pointRows = new Map(), scriptUrls = new Map();
const fixedDeadline = Date.parse(process.env.C047_WORKER_DEADLINE);
const session = new inspector.Session();
let ownScriptId, finalized = false;
fs.writeFileSync(path.join(output, 'actual-current-subject.source.txt'), source, { flag: 'wx' });
function bindingNames(node) {
  if (!node) return [];
  if (node.type === 'Identifier') return [node.name];
  if (node.type === 'ObjectPattern') return node.properties.flatMap(property => bindingNames(property.value || property.argument));
  if (node.type === 'ArrayPattern') return node.elements.flatMap(bindingNames);
  if (node.type === 'AssignmentPattern') return bindingNames(node.left);
  if (node.type === 'RestElement') return bindingNames(node.argument);
  return [];
}
function declared(node) {
  if (node.type === 'VariableDeclaration') return node.declarations.flatMap(item => bindingNames(item.id));
  if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') return node.id ? [node.id.name] : [];
  return [];
}
function freeNames(node) {
  const found = new Set(), local = new Set(declared(node));
  const builtins = new Set(['Object', 'Array', 'Number', 'String', 'Boolean', 'JSON', 'Math', 'Buffer', 'Promise', 'Set', 'Map', 'URL', 'undefined', 'Infinity', 'NaN', 'globalThis']);
  function walk(current, parent, key) {
    if (!current || typeof current !== 'object') return;
    if (Array.isArray(current)) { for (const child of current) walk(child, parent, key); return; }
    if (!current.type) return;
    if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(current.type)) return;
    if (current.type === 'VariableDeclarator') { bindingNames(current.id).forEach(name => local.add(name)); walk(current.init, current, 'init'); return; }
    if (current.type === 'Identifier') {
      if ((parent?.type === 'MemberExpression' && key === 'property' && !parent.computed) ||
        (parent?.type === 'Property' && key === 'key' && !parent.computed)) return;
      if (!builtins.has(current.name)) found.add(current.name);
      return;
    }
    for (const [name, value] of Object.entries(current)) if (value && typeof value === 'object') walk(value, current, name);
  }
  walk(node, null, null);
  return [...found].filter(name => !local.has(name)).sort();
}
function observeExpression(name) {
  return `(typeof ${name} === 'undefined' ? {type:'undefined'} : ${name} === null ? {type:'object',subtype:'null',value:null} : typeof ${name} === 'object' ? {type:'object',tag:Object.prototype.toString.call(${name})} : typeof ${name} === 'function' ? {type:'function'} : {type:typeof ${name},value:${name}})`;
}
function program(row, replacement) {
  const text = replacement ? row.replacement : row.original, node = nodeBySpan.get(row.start + ':' + row.end);
  if (['condition', 'initializer', 'call-argument', 'iterable', 'regex', 'module'].includes(row.kind)) {
    if (/module\.exports/.test(text)) return null;
    return { code: '(' + text + ')', recipe: 'actual-lexical-expression-value', node };
  }
  if (row.kind === 'statement' && node) {
    if (node.type === 'ExpressionStatement' && node.directive === 'use strict') {
      return { code: `(function(){ ${text}\nreturn this === undefined; }).call(undefined)`, recipe: 'exact-strict-directive-lexical-this-binding-contrast', node };
    }
    const names = declared(node), free = freeNames(node);
    if (names.length) {
      const observed = '{' + names.map(name => JSON.stringify(name) + ':' + observeExpression(name)).join(',') + '}';
      const code = `((${names.join(',')}) => ((${free.join(',')}) => { ${text}\nreturn ${observed}; })(${free.join(',')}))(${names.map(() => 'undefined').join(',')})`;
      return { code, recipe: 'exact-statement-isolated-binding-presence-with-actual-live-free-values', node };
    }
    if (/\bawait\b/.test(text)) return null;
    return { code: `((${free.join(',')}) => { ${text}\nreturn 'C047_SCOPED_FALLTHROUGH_AFTER_EXACT_STATEMENT'; })(${free.join(',')})`,
      recipe: 'exact-statement-local-control-completion', node };
  }
  return null;
}
const originalPrograms = new Map(), mutantPrograms = new Map();
for (const row of definitions) {
  const original = program(row, false), mutant = program(row, true);
  if (!original || !mutant) continue;
  try { new vm.Script(original.code); new vm.Script(mutant.code); } catch { continue; }
  originalPrograms.set(row.id, original); mutantPrograms.set(row.id, mutant);
  const point = row.line - 1 + ':' + (row.start - source.lastIndexOf('\n', row.start - 1) - 1);
  if (!pointRows.has(point)) pointRows.set(point, []);
  pointRows.get(point).push(row);
  for (const [label, value] of [['original', original], ['mutant', mutant]]) fs.writeFileSync(path.join(output, 'scoped-' + row.id + '-' + label + '.source.txt'), value.code + '\n', { flag: 'wx' });
}
const breakpointRows = new Map();
function normalize(result) {
  if (!result) return null;
  if (result.exceptionDetails) return { exception: result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'evaluation refused' };
  const value = result.result;
  if (!value) return null;
  const answer = { type: value.type };
  for (const key of ['subtype', 'className', 'value', 'unserializableValue']) if (Object.hasOwn(value, key)) answer[key] = value[key];
  return answer;
}
function evaluate(frame, code, done) {
  session.post('Debugger.evaluateOnCallFrame', { callFrameId: frame.callFrameId, expression: code, returnByValue: true, throwOnSideEffect: true }, (error, value) => {
    if (error || value?.exceptionDetails) {
      session.post('Debugger.evaluateOnCallFrame', { callFrameId: frame.callFrameId, expression: code, returnByValue: false, throwOnSideEffect: true }, (secondError, second) =>
        done({ primary: error ? { protocolError: error.message } : normalize(value), observation: secondError ? { protocolError: secondError.message } : normalize(second), fallback: 'typed value only; no object identity or description used' }));
    } else done({ observation: normalize(value), fallback: null });
  });
}
function appendAttempt(record) {
  attempts.push(record);
  fs.appendFileSync(path.join(output, 'scoped-attempts.raw.jsonl'), JSON.stringify(record) + '\n');
}
session.connect();
session.on('Debugger.scriptParsed', ({ params }) => {
  scriptUrls.set(params.scriptId, params.url);
  const normalized = params.url.replaceAll('\\', '/').toLowerCase();
  if (!normalized.endsWith(serverPath.replaceAll('\\', '/').toLowerCase())) return;
  ownScriptId = params.scriptId;
  for (const [point, rows] of pointRows) {
    const [lineNumber, columnNumber] = point.split(':').map(Number);
    session.post('Debugger.setBreakpoint', { location: { scriptId: ownScriptId, lineNumber, columnNumber } }, (error, result) => {
      if (!error) breakpointRows.set(result.breakpointId, { rows, requested: { lineNumber, columnNumber }, actual: result.actualLocation });
      else appendAttempt({ stage: 'breakpoint-admission', ids: rows.map(row => row.id), error: error.message, noSemanticClosure: true });
    });
  }
});
session.on('Debugger.paused', ({ params }) => {
  const frame = params.callFrames.find(frame => frame.location.scriptId === ownScriptId);
  const points = (params.hitBreakpoints || []).map(id => breakpointRows.get(id)).filter(Boolean);
  const rows = [...new Map(points.flatMap(point => point.rows).map(row => [row.id, row])).values()].filter(row => !witnesses.has(row.id));
  if (!frame || !rows.length || Date.now() >= fixedDeadline) { session.post('Debugger.resume'); return; }
  let next = 0;
  function step() {
    if (next >= rows.length || Date.now() >= fixedDeadline) { session.post('Debugger.resume'); return; }
    const row = rows[next++], original = originalPrograms.get(row.id), mutant = mutantPrograms.get(row.id);
    evaluate(frame, original.code, before => evaluate(frame, mutant.code, after => {
      const a = before.observation, b = after.observation;
      const qualified = a && b && !a.exception && !b.exception && !a.protocolError && !b.protocolError && JSON.stringify(a) !== JSON.stringify(b);
      const attempt = { id: row.id, sourceSha256: domain.sourceSha256, fullMutantSourceSha256: row.mutantSha256,
        actualBddScenario: context.getStore() || 'actual C047 module initialization through tests/kit.cjs',
        sourceRange: { start: row.start, end: row.end, line: row.line }, actualPausedFunction: frame.functionName,
        actualRuntimeLocation: { url: scriptUrls.get(frame.location.scriptId), line: frame.location.lineNumber + 1, column: frame.location.columnNumber + 1 },
        recipe: original.recipe, exactOriginalProgramSha256: sha(original.code + '\n'), exactMutantProgramSha256: sha(mutant.code + '\n'),
        before, after, qualifiedLocalContrast: qualified, wholeMutantKillClaimed: false, globalEquivalenceClaimed: false,
        objectIdentityUsedAsDifference: false, originalSourceRewrittenOrReadAdapted: false, evaluationSideEffectsAllowed: false };
      appendAttempt(attempt);
      if (qualified) witnesses.set(row.id, attempt);
      step();
    }));
  }
  step();
});
session.post('Debugger.enable');
function manualImports() {
  const requireActual = createRequire(serverPath);
  const specs = {
    http: { path: 'node:http', symbol: 'http', observe: value => ({ createServer: typeof value?.createServer }) },
    contract: { path: '../C022/contract.js', symbol: 'contract', observe: value => ({ memberAdminPolicy: value?.ops?.['project.create']?.roles || null, tenants: value?.tenants || null }) },
    createCore: { path: '../C022/server.cjs', symbol: 'createCore', pick: 'createCore', observe: value => ({ acceptedCoreFactory: typeof value }) },
    parseBearer: { path: '../C009/authz.cjs', symbol: 'parseBearer', pick: 'parseBearer', observe: value => ({ sanctionedBearerParser: typeof value }) },
    createQueue: { path: '../C009/queue.cjs', symbol: 'createQueue', pick: 'createQueue', observe: value => ({ sanctionedLinearizingQueueFactory: typeof value }) },
    io: { path: '../C009/http-io.cjs', symbol: 'io', observe: value => ({ responder: typeof value?.createResponder, lanes: typeof value?.createLanes, finishedGuard: typeof value?.isFinished, localGuard: typeof value?.localGuard }) }
  };
  const declarations = ast.body.filter(node => node.type === 'VariableDeclaration' && node.declarations.length === 1 &&
    node.declarations[0].init?.type === 'CallExpression' && node.declarations[0].init.callee.name === 'require');
  for (const row of definitions.filter(row => !witnesses.has(row.id))) {
    const declaration = declarations.find(node => node.start <= row.start && node.end >= row.end);
    if (!declaration) continue;
    const name = bindingNames(declaration.declarations[0].id)[0], spec = specs[name];
    if (!spec) continue;
    let beforeCode, afterCode, observe = spec.observe, recipe;
    if (row.kind === 'statement' && row.start === declaration.start && row.end === declaration.end) {
      const suffix = `\nreturn typeof ${spec.symbol} === 'undefined' ? undefined : ${spec.symbol};`;
      beforeCode = '(function(){' + row.original + suffix + '})()';
      afterCode = '(function(){' + row.replacement + suffix + '})()';
      recipe = 'exact-sanctioned-import-declaration-binding-and-required-public-API';
    } else if (['initializer', 'module'].includes(row.kind)) {
      beforeCode = '(' + row.original + ')'; afterCode = '(' + row.replacement + ')';
      const observing = observe;
      observe = value => observing(spec.pick ? value?.[spec.pick] : value);
      recipe = 'exact-sanctioned-module-value-required-public-API';
    } else if (row.kind === 'call-argument' && row.callee === 'require') {
      beforeCode = '(' + row.original + ')'; afterCode = '(' + row.replacement + ')';
      observe = value => ({ exactPublishedModuleSpecifier: value, actualSanctionedApi: spec.observe(spec.pick ? requireActual(spec.path)[spec.pick] : requireActual(spec.path)) });
      recipe = 'exact-published-module-specifier-with-actual-required-API';
    } else continue;
    for (const [label, code] of [['original', beforeCode], ['mutant', afterCode]]) {
      const file = path.join(output, 'manual-' + row.id + '-' + label + '.source.txt'); if (!fs.existsSync(file)) fs.writeFileSync(file, code + '\n', { flag: 'wx' });
    }
    const attempt = { id: row.id, recipe, sourceSha256: domain.sourceSha256, fullMutantSourceSha256: row.mutantSha256,
      sourceRange: { start: row.start, end: row.end, line: row.line }, actualBddScenario: 'sanctioned import public API required by actual C047 server',
      exactOriginalProgramSha256: sha(beforeCode + '\n'), exactMutantProgramSha256: sha(afterCode + '\n'),
      importedProducerBytes: 'actual read-only require resolved relative to current C047 server and imports.json; no fake module',
      wholeMutantKillClaimed: false, globalEquivalenceClaimed: false, objectIdentityUsedAsDifference: false };
    try {
      const before = observe(vm.runInNewContext(beforeCode, { require: requireActual }, { timeout: 1000 }));
      const after = observe(vm.runInNewContext(afterCode, { require: requireActual }, { timeout: 1000 }));
      attempt.before = before; attempt.after = after; attempt.qualifiedLocalContrast = JSON.stringify(before) !== JSON.stringify(after);
      if (attempt.qualifiedLocalContrast) witnesses.set(row.id, attempt);
    } catch (error) { attempt.qualifiedLocalContrast = false; attempt.nonKillScopedFault = { name: error.name, message: error.message }; }
    appendAttempt(attempt);
  }
}
process.once('beforeExit', () => {
  if (finalized) return; finalized = true;
  session.disconnect();
  if (Date.now() < fixedDeadline) manualImports();
  assert.equal(sha(fs.readFileSync(serverPath)), domain.sourceSha256, 'ACTUAL_PRODUCTION_BYTES_UNCHANGED_BY_SCOPED_OBSERVATION');
  const remaining = campaign.semanticUnresolved.filter(row => !witnesses.has(row.id));
  const report = { schema: 'C047-actual-source-bound-runnable-local-contrasts/1', sourceSha256: domain.sourceSha256,
    actualWholeMutantFaultTimeoutStatusesRetained: true, newWholeMutantKillsClaimed: 0, globalEquivalencesClaimed: 0, cannedDefaultPairs: 0,
    actualNamedBddSourcesUnchanged: true, actualProductionSourceBytesUnchanged: true, locallyContrasted: witnesses.size,
    actualScopedAttempts: attempts.length, witnesses: [...witnesses.values()].sort((a, b) => a.id - b.id),
    actualNamedWholeKills: campaign.namedKilled, currentEligibleChangedCompiled: campaign.fullDomain.eligibleChangedCompiled,
    stillSemanticUnresolved: remaining, stillSemanticUnresolvedCount: remaining.length + campaign.unexecuted.length,
    wholeCampaignUnexecuted: campaign.unexecuted, originalRawCampaignNotRewritten: true };
  fs.writeFileSync(path.join(output, 'scoped.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ scopedLocalContrasts: witnesses.size, actualScopedAttempts: attempts.length, stillSemanticUnresolved: report.stillSemanticUnresolvedCount,
    wholeRuntimeFaultsNeverCountedAsKills: true, originalProductionAndBddSourceBytesUnchanged: true }));
});
