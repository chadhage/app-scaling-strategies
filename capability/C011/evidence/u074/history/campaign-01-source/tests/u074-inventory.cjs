'use strict';
const vm=require('node:vm'),assert=require('node:assert/strict');
const parser=require('./u074-parser.cjs'),legacy=require('./u069-loader.cjs');
const PRODUCTION=['codes.cjs','config.cjs','contract.js','json.cjs','page.js','server.cjs','store.cjs'];
function analyzeFile(file,text){
  const tree=parser.parse(file,text),statements=[],conditions=new Map(),stack=[{node:tree,parent:null,parentKey:null}];
  const addCondition=(node,site)=>{
    const pending=[node];
    while(pending.length){
      const current=pending.pop();if(!current)continue;
      const key=file+':condition:'+current.start+':'+current.end;
      if(!conditions.has(key))conditions.set(key,{key,file,type:current.type,start:current.start,end:current.end,sites:[]});
      conditions.get(key).sites.push(site);
      if(current.type==='LogicalExpression')pending.push(current.right,current.left);
      if(current.type==='UnaryExpression'&&current.operator==='!')pending.push(current.argument);
    }
  };
  while(stack.length){
    const {node,parent,parentKey}=stack.pop();
    if(node.type.endsWith('Statement')||node.type.endsWith('Declaration'))statements.push({
      key:file+':statement:'+node.type+':'+node.start+':'+node.end,file,type:node.type,start:node.start,end:node.end,
      parentType:parent?.type,parentKey,line:node.loc.start.line,startByte:Buffer.byteLength(text.slice(0,node.start)),endByte:Buffer.byteLength(text.slice(0,node.end))});
    if(['IfStatement','WhileStatement','DoWhileStatement','ForStatement','ConditionalExpression','SwitchCase'].includes(node.type))addCondition(node.test,node.type);
    if(node.type==='LogicalExpression')addCondition(node.left,'short-circuit:'+node.operator);
    const children=[];
    for(const[key,value]of Object.entries(node)){
      if(Array.isArray(value))for(const child of value)if(child&&typeof child.type==='string')children.push({node:child,parent:node,parentKey:key});
    }
    // Array and non-array AST members are traversed separately so every grammar role is represented.
    for(const[key,value]of Object.entries(node))if(!Array.isArray(value)&&value&&typeof value.type==='string')children.push({node:value,parent:node,parentKey:key});
    for(let i=children.length-1;i>=0;i--)stack.push(children[i]);
  }
  return{statements,conditions:[...conditions.values()]};
}
function deletion(row){
  if(row.type==='BlockStatement')return'{}';
  if(row.type==='EmptyStatement')return'';
  if(row.type==='VariableDeclaration'&&['ForStatement','ForOfStatement','ForInStatement'].includes(row.parentType))return'';
  return';';
}
function definition(file,source,start,end,replacement,operator,inventoryKeys,label){
  const changed=source.slice(0,start)+replacement+source.slice(end);let compiled=true,syntax=null;
  try{new vm.Script(changed);}catch(error){compiled=false;syntax={name:error.name,message:error.message};}
  return{file,start,end,replacement,operator,inventoryKeys,label,sourceSha256:parser.sha(Buffer.from(source)),
    mutantSha256:parser.sha(Buffer.from(changed)),compiled,syntax,identity:source===changed,offsetUnit:'UTF16 source code units'};
}
function build(sources){
  assert.deepEqual(Object.keys(sources).sort(),[...PRODUCTION].sort(),'Exact seven-file production inventory');
  const domains=PRODUCTION.map(file=>analyzeFile(file,sources[file])),statements=domains.flatMap(row=>row.statements),conditions=domains.flatMap(row=>row.conditions),definitions=[];
  for(const row of statements)definitions.push({...definition(row.file,sources[row.file],row.start,row.end,deletion(row),'statement-delete',[row.key],
    'AST statement deletion '+row.type+' @'+row.line+':'+row.start),statementType:row.type,statementParentType:row.parentType});
  for(const row of conditions){
    const original=sources[row.file].slice(row.start,row.end);
    for(const[operator,replacement]of [['condition-true','true'],['condition-false','false'],['condition-negate','!('+original+')']])
      definitions.push(definition(row.file,sources[row.file],row.start,row.end,replacement,operator,[row.key],'AST '+operator+' '+row.type+' @'+row.start));
    if(row.sites.includes('short-circuit:??'))for(const[operator,replacement]of [['condition-nullish','null'],['condition-present','0']])
      definitions.push(definition(row.file,sources[row.file],row.start,row.end,replacement,operator,[row.key],'AST '+operator+' @'+row.start));
  }
  for(const entry of legacy.definitions())definitions.push(definition(entry.file,sources[entry.file],entry.start,entry.end,entry.replacement,'retained-lexical-extra',[],'Legacy additional operator: '+entry.label));
  definitions.forEach((entry,index)=>{entry.id=index+1;});
  return{schema:'U074-parser-inventory/1',parser:parser.identity,files:PRODUCTION,statements,conditions,definitions,
    policy:{astStatementsAndDeclarations:'All nodes, including block/function bodies and declarations in loop headers; grammar-invalid transformations remain explicit NON-kills',
      conditions:'Every if/loop/ternary/switch test, every short-circuit left operand, and recursively every logical/negated constituent. Nullish guards additionally force null and present.',
      noLexicalCompletenessClaim:true,legacyOperatorsAreAdditionalNotCoverageEvidence:true,noDeduplicationOrKillCreditForRepeatedPositions:true}};
}
function verify(report,sources){
  const issues=[],add=value=>issues.push(value),expected=PRODUCTION.map(file=>require('./u074-domain-oracle.cjs').enumerate(file,sources[file]));
  const statements=expected.flatMap(row=>row.statements),conditions=expected.flatMap(row=>row.conditions);
  const keys=rows=>rows.map(row=>row.key).sort().join('\n');
  if(keys(report.statements)!==keys(statements))add('STATEMENT_DOMAIN_DIFFERS');
  if(keys(report.conditions)!==keys(conditions))add('CONDITION_DOMAIN_DIFFERS');
  for(const row of statements)if(!report.definitions.some(d=>d.operator==='statement-delete'&&d.inventoryKeys.includes(row.key)&&d.file===row.file&&d.start===row.start&&d.end===row.end&&d.replacement===deletion(row)))add('STATEMENT_BINDING_MISSING:'+row.key);
  for(const row of conditions)for(const operator of ['condition-true','condition-false','condition-negate'])
    if(!report.definitions.some(d=>d.operator===operator&&d.inventoryKeys.includes(row.key)&&d.file===row.file&&d.start===row.start&&d.end===row.end))add('CONDITION_BINDING_MISSING:'+row.key+'/'+operator);
  for(const d of report.definitions){
    const source=sources[d.file];
    if(typeof source!=='string'||d.sourceSha256!==parser.sha(Buffer.from(source)))add('DEFINITION_SOURCE_DIFFERS:'+d.id);
    if(typeof source!=='string'||!Number.isInteger(d.start)||!Number.isInteger(d.end)||d.start<0||d.end>source.length||d.start>d.end){add('DEFINITION_TRANSFORM_DIFFERS:'+d.id);continue;}
    const changed=source.slice(0,d.start)+d.replacement+source.slice(d.end);let compiled=true;try{new vm.Script(changed);}catch{compiled=false;}
    if(d.mutantSha256!==parser.sha(Buffer.from(changed))||d.identity!==(changed===source)||d.compiled!==compiled)add('DEFINITION_TRANSFORM_DIFFERS:'+d.id);
  }
  return issues;
}
module.exports={analyzeFile,build,verify,deletion,PRODUCTION};
