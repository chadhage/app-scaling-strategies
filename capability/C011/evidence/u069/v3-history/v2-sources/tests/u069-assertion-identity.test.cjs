'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
test('U069 actual assertion observations never overwrite or collide with a retained report from the same reused PID',()=>{
  const base=path.resolve(__dirname,'..','..','..','private');
  fs.mkdirSync(base,{recursive:true});
  const directory=fs.mkdtempSync(path.join(base,'assertion-identity-'));
  const env={...process.env,C011_ASSERTION_DIR:directory};
  for(const name of ['NODE_TEST_CONTEXT','NODE_V8_COVERAGE'])delete env[name];
  const program=`
    const fs=require('node:fs'),path=require('node:path');
    fs.writeFileSync(path.join(process.env.C011_ASSERTION_DIR,'assertions-'+process.pid+'.json'),
      JSON.stringify({schema:'retained-prior-process-report',sentinel:'immutable original'}),{flag:'wx'});
    require(process.argv[1]);
    require('node:test')('one observed child assertion',()=>require('node:assert/strict').equal(1,1));
  `;
  try{
    const child=spawnSync(process.execPath,['-e',program,path.join(__dirname,'assertions-preload.cjs')],
      {cwd:base,env,windowsHide:true,timeout:60000,maxBuffer:1024*1024});
    assert.equal(child.error,undefined);
    assert.equal(child.status,0,'a valid observed run survives actual PID reuse without replacing its predecessor: '+String(child.stderr));
    const reports=fs.readdirSync(directory).map(name=>JSON.parse(fs.readFileSync(path.join(directory,name))));
    assert.deepEqual(reports.find(report=>report.schema==='retained-prior-process-report'),
      {schema:'retained-prior-process-report',sentinel:'immutable original'});
    const current=reports.filter(report=>report.schema==='C011-assertions/1');
    assert.equal(current.length,1);assert.equal(current[0].tests,1);assert.ok(current[0].assertions>=1);
    assert.deepEqual(current[0].zeroAssertionTests,[]);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
