'use strict';

// Test tooling, not production code: the ATTACKER, run as a separate process so that it cannot share an event loop with the server under test.
// It opens many connections; each sends one refusal-bound request (a status the server answers before it reads a body), every second one
// queued behind a legitimate GET in the same write, followed by an endless chunked body, and keeps sending until the server closes the socket.
// Usage: node attacker.cjs <port> <connections> <hardLimitMs>. Prints one JSON line when every socket is gone or the limit hits.
const net = require('node:net');
const {REFUSALS}=require('./u073-flood-workload.cjs');

const [port, count, limitMs] = process.argv.slice(2,5).map(Number);
const cohort=process.argv[5]||'',retention=process.argv[6]||'retain';
if(cohort&&!/^[A-Za-z0-9_-]{1,128}$/.test(cohort))throw new Error('FIXTURE_COHORT_INVALID');
if(!['retain','discard'].includes(retention))throw new Error('FIXTURE_RECEIPT_MODE_INVALID');
const burst = '1\r\nx\r\n'.repeat(400);
let closed = 0;
let answered = 0;
let burstsAfterAnswer = 0;
const sockets = [];
const reports=[];let finishing=false,submitted=0;

function finish(timedOut) {
  if(finishing)return;finishing=true;
  console.log(JSON.stringify({ connections: count, closed, answered, timedOut, burstsAfterAnswer,cohort,retention,
    submitted,sockets:reports }));
  for (const socket of sockets) socket.destroy();
  process.exit(0);
}

for (let index = 0; index < count; index += 1) {
  const [method, target, extra] = REFUSALS[index % REFUSALS.length];
  const host = extra && !extra.includes('/') ? extra : `127.0.0.1:${port}`;
  const type = extra && extra.includes('/') ? `Content-Type: ${extra}\r\n` : '';
  const socket = net.connect({ host: '127.0.0.1', port });
  let seen = 0,retained='',counted=false,recordedSubmission=false;
  const report={slot:index,retainedStatuses:[],receivedBytes:0,serverClosed:false,initialSubmitted:false};reports.push(report);
  const submit=()=>{
    if(recordedSubmission)return;recordedSubmission=true;submitted++;
    if(submitted===count&&process.send)process.send({type:'initial-cohort-submitted',cohort,submitted});
  };
  sockets.push(socket);
  socket.on('error', () => {});
  socket.on('data', (chunk) => {
    report.receivedBytes+=chunk.length;
    if(retention==='discard')return;
    retained+=chunk.toString('latin1');
    if(retained.length>16384)throw new Error('FIXTURE_RESPONSE_BOUND');
    report.retainedStatuses=[...retained.matchAll(/HTTP\/1\.1 (\d{3}) /g)].map(match=>Number(match[1]));
    seen=report.retainedStatuses.length;
    if(!counted&&seen===1+(index%2)){answered++;counted=true;}
  });
  socket.once('close', () => { report.serverClosed=true;submit();closed += 1; if (closed === count) finish(false); });
  const ticker = setInterval(() => { if (!socket.destroyed) { if (seen > 0) burstsAfterAnswer += 1; socket.write(burst); } }, 20);
  socket.once('close', () => clearInterval(ticker));
  const tags=cohort?`X-C011-Flood-Cohort: ${cohort}\r\nX-C011-Flood-Slot: ${index}\r\n`:'';
  const first = index % 2 === 1 ? `GET /scope.json HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n${tags}\r\n` : '';
  socket.write(`${first}${method} ${target} HTTP/1.1\r\nHost: ${host}\r\n${tags}${type}Transfer-Encoding: chunked\r\n\r\n${burst}`,error=>{
    report.initialSubmitted=!error;submit();
  });
}
setTimeout(() => finish(true), limitMs).unref();
