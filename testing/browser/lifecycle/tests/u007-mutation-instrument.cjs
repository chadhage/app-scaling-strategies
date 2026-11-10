'use strict';
const acorn=require('internal/deps/acorn/acorn/dist/acorn');
function instrumentLoops(source,limit=100000){
  const tree=acorn.parse(source,{ecmaVersion:'latest',sourceType:'script'});
  const pending=[tree],edits=[];
  let id=0;
  while(pending.length){
    const node=pending.pop();
    if(['ForStatement','ForOfStatement','ForInStatement','WhileStatement','DoWhileStatement'].includes(node.type)){
      const name='__u007MeasuredLoop'+id++;
      const guard=`if (++${name} > ${limit}) throw Object.assign(new Error('U007_MUTATION_ITERATION_BOUND: actual loop iterations'), {code:'U007_MUTATION_ITERATION_BOUND'});`;
      edits.push({at:node.start,text:`{ let ${name}=0; `},{at:node.end,text:' }'});
      if(node.body.type==='BlockStatement')edits.push({at:node.body.start+1,text:guard});
      else edits.push({at:node.body.start,text:'{ '+guard},{at:node.body.end,text:' }'});
    }
    for(const value of Object.values(node)){
      if(Array.isArray(value)){for(const child of value)if(child&&typeof child.type==='string')pending.push(child);}
      else if(value&&typeof value.type==='string')pending.push(value);
    }
  }
  edits.sort((a,b)=>b.at-a.at);
  let result=source;
  for(const edit of edits)result=result.slice(0,edit.at)+edit.text+result.slice(edit.at);
  acorn.parse(result,{ecmaVersion:'latest',sourceType:'script'});
  return {source:result,loops:id,limit};
}
module.exports={instrumentLoops};
