'use strict';
const vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
function parser(){
  const source=process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'];
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'),'e10ec115cb48101e961e2bb8352fa3dd3cb6422375ebdaab7b64f5e9548d380d');
  const box={module:{exports:{}}};box.exports=box.module.exports;vm.runInNewContext(source,box);
  assert.equal(box.module.exports.version,'8.16.0');return box.module.exports;
}
function enumerate(file,source){
  const ast=parser().parse(source,{ecmaVersion:'latest',sourceType:'script',locations:true}),statements=[],conditions=new Map();
  function condition(node,site){
    if(!node)return;
    const key=file+':condition:'+node.start+':'+node.end;
    if(!conditions.has(key))conditions.set(key,{key,file,type:node.type,start:node.start,end:node.end,sites:[]});
    conditions.get(key).sites.push(site);
    if(node.type==='LogicalExpression'){condition(node.left,site);condition(node.right,site);}
    if(node.type==='UnaryExpression'&&node.operator==='!')condition(node.argument,site);
  }
  function walk(node,parent,key){
    if(!node||typeof node!=='object')return;
    if(Array.isArray(node)){for(const item of node)walk(item,parent,key);return;}
    if(typeof node.type==='string'){
      if(node.type.endsWith('Statement')||node.type.endsWith('Declaration'))statements.push({
        key:file+':statement:'+node.type+':'+node.start+':'+node.end,file,type:node.type,start:node.start,end:node.end,parentType:parent?.type,parentKey:key});
      if(['IfStatement','WhileStatement','DoWhileStatement','ForStatement','ConditionalExpression','SwitchCase'].includes(node.type))
        condition(node.test,node.type);
      if(node.type==='LogicalExpression'){
        condition(node,'boolean-expression:'+node.operator);condition(node.left,'short-circuit:'+node.operator);
      }
      if(node.type==='UnaryExpression'&&node.operator==='!'||node.type==='BinaryExpression'&&['<','<=','>','>=','==','!=','===','!==','in','instanceof'].includes(node.operator)
        ||node.type==='Literal'&&typeof node.value==='boolean')condition(node,'boolean-expression');
    }
    for(const [name,value]of Object.entries(node))if(value&&typeof value==='object')walk(value,node,name);
  }
  walk(ast);return{statements,conditions:[...conditions.values()]};
}
module.exports={enumerate,parser};
