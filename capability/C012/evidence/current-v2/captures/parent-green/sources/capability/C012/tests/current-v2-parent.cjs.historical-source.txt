'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {remaining,environment}=require('./budget.cjs');
const {sha}=require('./integrity.cjs');
const expected=Number(process.argv[2]),output=process.env.C012_PARENT_OUTPUT;
assert.ok([0,1].includes(expected)&&output&&path.isAbsolute(output));
fs.mkdirSync(output,{recursive:false});
const repository=process.env.C012_GIT_REPOSITORY,run=process.env.C012_RUN;
const test=path.join(run,'recovery-20261109-r1424','c012-mutation-closure.test.cjs');
const before=fs.readFileSync(test);
const inv=process.env.C012_PARENT_INVENTORY,dec=process.env.C012_PARENT_DECISIONS;
assert.ok(inv&&dec&&path.isAbsolute(inv)&&path.isAbsolute(dec),'explicit actual complete inventory and decisions');
const inventory=JSON.parse(fs.readFileSync(inv));
assert.equal(inventory.definitions.length,457);assert.equal(inventory.definitions.filter(row=>!row.identity&&!row.syntax).length,435);
const result=spawnSync(process.execPath,['--test','--experimental-test-isolation=none','--test-concurrency=1','--test-timeout=120000',test],
  {cwd:repository,env:environment({C012_PARENT_INVENTORY:inv,C012_PARENT_DECISIONS:dec}),windowsHide:true,
    timeout:Math.min(remaining(60000),300000),maxBuffer:16*1024*1024});
for(const kind of ['stdout','stderr'])fs.writeFileSync(path.join(output,kind+'.raw'),result[kind]||'',{flag:'wx'});
fs.writeFileSync(path.join(output,'parent-test.unchanged-source.txt'),before,{flag:'wx'});
assert.deepEqual(fs.readFileSync(test),before,'parent test bytes unchanged');
const report={schema:'C012-parent-unchanged-full-domain-replay/2',expectedExit:expected,exit:result.status,
  error:result.error?.code||null,signal:result.signal,parentTestSha256:sha(before),inventorySha256:sha(fs.readFileSync(inv)),
  decisionsSha256:sha(fs.readFileSync(dec)),definitions:457,validChanged:435,
  stdoutSha256:sha(result.stdout||''),stderrSha256:sha(result.stderr||''),
  synchronousChild:{pid:result.pid,fullyReaped:result.status!==null,noBirthNoAdoptionOrKillAuthority:true}};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,expected);
console.log(JSON.stringify(report));
