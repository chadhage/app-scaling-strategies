'use strict';
const REFUSALS=Object.freeze([
  ['GET','/v1/me',null,401,'AUTHENTICATION_REQUIRED'],
  ['POST','/v1/reservations','application/json',401,'AUTHENTICATION_REQUIRED'],
  ['PUT','/v1/reservations','application/json',405,'METHOD_NOT_ALLOWED'],
  ['GET','/nope',null,404,'NOT_FOUND'],
  ['GET','/'+'a'.repeat(2100),null,414,'URL_TOO_LONG'],
  ['GET','/v1/reservations?x=1',null,401,'AUTHENTICATION_REQUIRED'],
  ['POST','/v1/reservations/rsv-ffffffffffffffff/release',null,401,'AUTHENTICATION_REQUIRED'],
  ['GET','/','evil.example',421,'LOCAL_HOST_REQUIRED']
].map(Object.freeze));
function expected(slot){
  const [method,url,extra,status,code]=REFUSALS[slot%REFUSALS.length];
  return{slot,method,url,extra,status,code,precedingPublicGet:slot%2===1};
}
function counts(sockets){
  const statuses={};let requests=0;
  for(let slot=0;slot<sockets;slot++){
    const row=expected(slot);statuses[row.status]=(statuses[row.status]||0)+1;requests++;
    if(row.precedingPublicGet){statuses[200]=(statuses[200]||0)+1;requests++;}
  }
  return{sockets,requests,terminalRefusals:sockets,precedingPublicGets:Math.floor(sockets/2),statuses};
}
module.exports=Object.freeze({REFUSALS,expected,counts});
