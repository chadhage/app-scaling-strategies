'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createLoader, definitions, originals, PRODUCTION, ModuleFault, sha, root } = require('./u069-loader.cjs');
const { pureCases, pageCases } = require('./u069-probes.cjs');
const { serverCases } = require('./u069-server-probes.cjs');
const equivalence = require('./u069-equivalence.cjs');
const initialization=require('./u069-initialization-contract.cjs');
const reportFile = process.env.U069_CAMPAIGN_OUTPUT;
assert.ok(reportFile && path.isAbsolute(reportFile), 'an explicit new owned campaign output is required');
assert.equal(fs.existsSync(reportFile), false);
const progress = reportFile + '.jsonl';
const liveTap = reportFile + '.stdout.original';
const liveErrors = reportFile + '.stderr.original';
fs.writeFileSync(liveTap, Buffer.alloc(0), { flag: 'wx' });
fs.writeFileSync(liveErrors, Buffer.alloc(0), { flag: 'wx' });
for (const [stream, file] of [[process.stdout, liveTap], [process.stderr, liveErrors]]) {
  const write = stream.write.bind(stream);
  stream.write = function (bytes, ...args) {
    fs.appendFileSync(file, Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, typeof args[0] === 'string' ? args[0] : 'utf8'));
    return write(bytes, ...args);
  };
}
const all = definitions();
const limit = process.env.U069_LIMIT ? Number(process.env.U069_LIMIT) : all.length;
const selected = all.slice(0, limit);
const entries = [];
const sourceInputs = [...PRODUCTION.map((file) => ({ path: file, sha256: sha(Buffer.from(originals.get(file))) })),
  ...fs.readdirSync(__dirname).filter((file) => file.endsWith('.cjs')).map((file) => ({
    path: 'tests/' + file, sha256: sha(fs.readFileSync(path.join(__dirname, file)))
  }))];
const moduleFault = (error) => {
  const seen = new Set();
  for (let current = error; current && typeof current === 'object' && !seen.has(current); current = current.cause) {
    if (current instanceof ModuleFault) return current;
    seen.add(current);
  }
  return null;
};
async function specification(name, loader, operation) {
  let observed = null;
  await test(name, { timeout: 60000 }, async () => {
    loader.resetWork();
    try {
      await operation();
      assert.equal(loader.bounded(), true, 'actual loop work exceeds the finite-input probe bound');
    } catch (error) {
      observed = error;
      if (moduleFault(error) || /ERR_TEST_TIMEOUT|ETIMEDOUT|testTimeoutFailure|cancelledByParent/.test(String(error?.code || error?.message))) throw error;
      if (error?.code === 'ERR_ASSERTION') throw error;
      assert.fail('A declared valid specification operation unexpectedly rejected: ' + String(error?.message || error));
    }
  });
  return observed;
}
function finish() {
  const count = (predicate) => entries.filter(predicate).length;
  const report = {
    schema: 'U069-current-mutation/1', createdAtUtc: new Date().toISOString(),
    generated: all.length, executed: entries.length,
    killed: count((entry) => entry.decision === 'killed'), equivalent: count((entry) => entry.decision === 'equivalent'),
    invalidSpecimens: count((entry) => entry.decision === 'invalid-module' || entry.decision === 'invalid-syntax'),
    survived: count((entry) => entry.decision === 'survived'), undecided: count((entry) => entry.decision === 'undecided'),
    notExecuted: all.length - entries.length, sourceInputs,
    definitions: all, entries,
    policy: {
      naturalNamedAssertionsOnly: true, syntaxModuleTimeoutKillCredit: false, defaultEquivalence: false,
      invalidSpecimensAreNotBehavioralKills: true,
      validInitializationContract:'V3: eligible compiled, hash-pinned changed production must satisfy a named initialization/export assertion with a passing identical-environment pristine control; environmental and syntax failures remain NON-kill',
      instrumentation: 'Original systematic generator loop instrumentation, with explicit observable actual-iteration counter instead of a swallowed sentinel',
      scope: 'Exact current source; original named specification callbacks plus explicit page/server facts; real HTTP/browser/load remain separate required final gates'
    }
  };
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log('U069_CAMPAIGN ' + JSON.stringify({
    generated: report.generated, executed: report.executed, killed: report.killed, equivalent: report.equivalent,
    invalidSpecimens: report.invalidSpecimens, survived: report.survived, undecided: report.undecided, notExecuted: report.notExecuted
  }));
}
(async () => {
  try {
    for (const definition of selected) {
      const loader = createLoader(definition);
      const prefix = `U069 ${definition.id} ${definition.file} ${definition.label}`;
      const entry = { ...definition, decision: null, namedFailures: [], probesExecuted: [], moduleFault: null };
      try {
        let probes;
        if(initialization.selected(definition)){
          const contract=initialization.prepare(definition);
          entry.initializationContract=contract.proof;
          probes=[
            {name:'pristine identical-environment configuration initialization/export contract',run:()=>contract.pristine()},
            {name:'required configuration module initializes and exports its closed validated contract',run:()=>contract.run(loader)}
          ];
        }else{
          if (definition.file !== 'page.js') loader.load(definition.file);
          probes = definition.file === 'page.js' ? pageCases(loader, createLoader)
            : definition.file === 'server.cjs' ? serverCases(loader, createLoader) : pureCases(definition.file, loader);
        }
        for (const probe of probes) {
          const title = prefix + ' :: ' + probe.name;
          let assertion = null;
          await test(title, { timeout: 60000 }, async () => {
            loader.resetWork();
            try {
              await probe.run();
              assert.equal(loader.bounded(), true, 'actual iterations violate the finite-input work budget');
            } catch (error) {
              assertion = error;
              if(error?.code==='U069_NON_KILL_ELIGIBILITY')throw error;
              if (moduleFault(error) || /ERR_TEST_TIMEOUT|ETIMEDOUT|testTimeoutFailure|cancelledByParent/.test(String(error?.code || error?.message))) throw error;
              if (error?.code === 'ERR_ASSERTION') throw error;
              const converted = new assert.AssertionError({
                message: 'A valid specification operation unexpectedly rejected: ' + String(error?.message || error),
                actual: error?.code || error?.name, expected: 'normal typed result', operator: 'doesNotReject'
              });
              assertion = converted;
              throw converted;
            }
          });
          entry.probesExecuted.push({ name: title, actualIterationMaximum: loader.maximumSteps() });
          if (assertion) {
            const fault = moduleFault(assertion);
            if (fault) {
              entry.decision = fault.phase === 'syntax' ? 'invalid-syntax' : 'invalid-module';
              entry.moduleFault = { phase: fault.phase, file: path.relative(root, fault.file), message: fault.message };
            } else if (assertion.code === 'ERR_ASSERTION') {
              entry.decision = 'killed';
              entry.namedFailures.push(title);
            } else {
              entry.decision = 'undecided';
              entry.reason = String(assertion.code || assertion.message);
            }
            break;
          }
        }
        if (!entry.decision) {
          const fact=equivalence.identify(definition);
          if(fact){
            const title=prefix+' :: explicit paired current-source proof '+fact;
            let failure,witness;
            await test(title,{timeout:60000},async()=>{
              try{
                witness=await equivalence.prove(fact,definition,loader);
                assert.ok(witness.cases>0,'the paired witness actually exercises its declared scope');
              }catch(error){failure=error;throw error;}
            });
            if(failure){
              if(failure.code==='ERR_ASSERTION'){entry.decision='killed';entry.namedFailures.push(title);}
              else{entry.decision='undecided';entry.reason=String(failure.message);}
            }else{
              entry.decision='equivalent';
              entry.equivalence={fact,...witness,test:title,originalSourceSha256:definition.sourceSha256,counterfactualSha256:definition.mutantSha256};
            }
          }else entry.decision='survived';
        }
      } catch (error) {
        const fault = moduleFault(error);
        entry.decision = fault ? fault.phase === 'syntax' ? 'invalid-syntax' : 'invalid-module' : 'undecided';
        entry.moduleFault = fault ? { phase: fault.phase, file: path.relative(root, fault.file), message: fault.message } : null;
        entry.reason = String(error.message);
        await test(prefix + ' :: initialization outcome retained with ZERO behavioral kill credit', () => {
          assert.ok(fault instanceof ModuleFault, 'an unexplained orchestration error is not an invalid specimen');
          assert.notEqual(entry.decision, 'killed');
        });
      }
      entry.executedSourceHashes = Object.fromEntries([...loader.executed].map(([file, value]) => [path.relative(root, file).replaceAll('\\', '/'), value]));
      entry.executedFiles=[...loader.executed].map(([file,sha256])=>({path:path.relative(root,file).replaceAll('\\','/'),sha256}));
      entry.readFiles=[...loader.reads].map(([file,sha256])=>({path:path.relative(root,file).replaceAll('\\','/'),sha256}));
      entries.push(entry);
      fs.appendFileSync(progress, JSON.stringify(entry) + '\n');
    }
  } finally { finish(); }
})().catch((error) => { console.error(error); process.exitCode = 3; });
