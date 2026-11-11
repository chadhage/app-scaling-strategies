'use strict';
const path=require('node:path'),v8=require('node:v8');
const file=process.argv[2];
if(!path.isAbsolute(file)||!process.send)throw new Error('Explicit public leaf and owned IPC start gate required');
process.send({type:'owned-leaf-ready',pid:process.pid,heapLimit:v8.getHeapStatistics().heap_size_limit,file});
process.once('message',message=>{
  if(message?.type!=='start-required-eight-way')throw new Error('Wrong private start gate');
  process.disconnect();
  require(file);
});
