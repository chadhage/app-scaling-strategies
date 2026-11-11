'use strict';
const legacy=require('./u069-loader.cjs');
function analyzeFile(){return{statements:[],conditions:[]};}
function build(sources){
  return{schema:'U074-parser-inventory/1',parser:null,files:Object.keys(sources),statements:[],conditions:[],
    definitions:legacy.definitions(),naiveBaseline:'Actual legacy1839 lexical generator, explicitly NOT parser completeness'};
}
function verify(){return[];}
module.exports={analyzeFile,build,verify};
