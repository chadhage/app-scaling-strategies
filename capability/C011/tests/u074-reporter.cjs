'use strict';
const {createHash}=require('node:crypto');
const sha=text=>createHash('sha256').update(text).digest('hex');
module.exports=async function*(events){
  let number=0;
  for await(const event of events){
    const data=event.data;
    if(event.type==='test:pass'||event.type==='test:fail'){
      const name=String(data.name).replaceAll('\\','\\\\').replaceAll('\r','\\r').replaceAll('\n','\\n');
      yield'# Subtest: '+name+'\n';
      yield(event.type==='test:pass'?'ok ':'not ok ')+(++number)+' - '+name+'\n';
      if(event.type==='test:fail'){
        const outer=data.details?.error,cause=outer?.cause||outer,code=cause?.code||outer?.code||'NON_ASSERTION_FAILURE';
        const stack=String(cause?.stack||cause?.message||'');
        yield'  ---\n  code: '+code+'\n  failureType: '+String(outer?.failureType||outer?.code||'test-failure')+
          '\n  message: '+JSON.stringify(String(cause?.message||outer?.message||'').slice(0,768))+
          '\n  completeErrorStackSha256: '+sha(stack)+'\n  ...\n';
      }
    }else if(event.type==='test:diagnostic')yield'# '+String(data.message).replaceAll('\n','\n# ')+'\n';
    else if(event.type==='test:summary'&&data.counts){
      const counts=data.counts;
      for(const[key,value]of Object.entries({tests:counts.tests,pass:counts.passed,fail:counts.failed,cancelled:counts.cancelled,skipped:counts.skipped,todo:counts.todo}))
        yield'# '+key+' '+value+'\n';
    }
  }
};
