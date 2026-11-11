'use strict';
function decide(entry){
  if(!entry.compiled)return'nonkill-syntax';
  if(entry.identity)return'nonkill-identity';
  if(!entry.executed)return'unexecuted';
  if(!entry.dependenciesVerified)return'nonkill-environment';
  if(!entry.pristinePassed)return'nonkill-pristine';
  if(entry.readSha256!==entry.mutantSha256||!entry.executedSourceVerified)return'nonkill-binding';
  if(entry.fault)return'nonkill-fault';
  if(entry.observation?.code==='ERR_ASSERTION'&&typeof entry.observation.name==='string'&&entry.observation.name.length>0)
    return entry.causallyReached?'killed':'nonkill-unreached';
  const proof=entry.pairedProof;
  if(proof&&typeof proof.domain==='string'&&proof.domain.length>20&&proof.cases>0&&proof.assertedPairs===proof.cases
    &&/^[0-9a-f]{64}$/.test(proof.pristineSourceSha256)&&proof.counterfactualSha256===entry.mutantSha256)return'equivalent';
  return entry.causallyReached?'survived':'nonkill-unreached';
}
module.exports={decide};
