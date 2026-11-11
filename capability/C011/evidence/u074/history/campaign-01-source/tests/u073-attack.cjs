'use strict';
const {spawn}=require('node:child_process'),path=require('node:path');
function runAttack(port,sockets,limitMs,cohort,retention='retain'){
  const env={...process.env};delete env.NODE_TEST_CONTEXT;delete env.NODE_V8_COVERAGE;
  const child=spawn(process.execPath,['--max-old-space-size=64',path.join(__dirname,'attacker.cjs'),String(port),String(sockets),String(limitMs),cohort,retention],
    {env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const stdout=[],stderr=[];let watchdogHit=false;
  child.stdout.on('data',bytes=>stdout.push(bytes));child.stderr.on('data',bytes=>stderr.push(bytes));
  const watchdog=setTimeout(()=>{watchdogHit=true;child.kill();},limitMs+20000);
  return new Promise((resolve,reject)=>{
    child.once('error',error=>{clearTimeout(watchdog);reject(error);});
    child.once('close',(code,signal)=>{
      clearTimeout(watchdog);
      if(code!==0||signal||watchdogHit)return reject(new Error('Attacker nonpass: '+JSON.stringify({code,signal,watchdogHit,stderr:Buffer.concat(stderr).toString()})));
      try{resolve({...JSON.parse(Buffer.concat(stdout).toString()),attackerPid:child.pid});}
      catch(error){reject(new Error('The actual attacker printed no complete report: '+error.message));}
    });
  });
}
module.exports={runAttack};
