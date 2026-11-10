'use strict';
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('./u069-loader.cjs');
const nativeClose = require('node:http').Server.prototype.close;
const nativeCloseAll = require('node:http').Server.prototype.closeAllConnections;
const closeErrors = new WeakMap();
class Socket extends EventEmitter {
  constructor() {
    super(); this.remoteAddress = '127.0.0.1'; this.destroyed = false; this.writable = true;
    this.raw = []; this.stops = 0; this._handle = { readStop: () => { this.stops += 1; } };
  }
  destroy() { if (!this.destroyed) { this.destroyed = true; this.emit('close'); } }
  end(bytes) { if (bytes) this.raw.push(Buffer.from(bytes)); this.emit('finish'); this.destroy(); }
}
async function turns() { for (let n = 0; n < 64; n += 1) await Promise.resolve(); await new Promise((resolve) => setImmediate(resolve)); }
async function closeOwned(app) {
  let settled = false, refusal;
  Promise.resolve().then(() => app.close()).then(() => { settled = true; }, (error) => { settled = true; refusal = error; });
  try {
    await turns();
    assert.equal(app.server.listening, false, 'close ends its owned listener structurally, not after a timed wait');
    assert.equal(settled, true, 'the documented close promise settles after the listener close callback');
    assert.equal(refusal, undefined, 'normal owned close does not reject');
    assert.deepEqual(closeErrors.get(app) || [], [], 'the owned close callback does not throw');
  } finally {
    await new Promise((resolve) => {
      nativeClose.call(app.server, resolve);
      nativeCloseAll.call(app.server);
    });
  }
}
function request(app, tokens, who, method, url, body, extra = {}, event = 'request', ownedSocket = null) {
  const socket = ownedSocket || new Socket(), request = new EventEmitter(), response = new EventEmitter();
  const host = `127.0.0.1:${app.server.address().port}`;
  const bytes = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const headers = { host, ...(tokens[who] ? { authorization: 'Bearer ' + tokens[who] } : {}),
    ...(bytes ? { 'content-type': 'application/json', 'content-length': String(bytes.length) } : {}), ...extra };
  Object.assign(request, { method, url, headers, rawHeaders: Object.entries(headers).flat(), socket, httpVersion: '1.1', complete: !bytes });
  request.destroy = () => socket.destroy();
  Object.assign(response, {
    req: request, socket, headersSent: false, ended: false, statusCode: null, headers: {}, bytes: Buffer.alloc(0),
    writeHead(status, values) { this.headersSent = true; this.statusCode = status; this.headers = values; },
    writeContinue() { this.continued = true; },
    end(value) {
      this.ended = true; this.bytes = Buffer.from(value || '');
      queueMicrotask(() => { this.emit('finish'); if (this.headers.Connection === 'close') socket.destroy(); });
    },
    destroy() { socket.destroy(); this.emit('close'); }
  });
  app.server.emit(event, request, response);
  if (bytes) queueMicrotask(() => { request.emit('data', bytes); request.complete = true; request.emit('end'); });
  return { request, response, socket };
}
function view(result) {
  const { response, socket } = result;
  return { status: response.statusCode, headers: response.headers, text: response.bytes.toString('utf8'),
    ended: response.ended, destroyed: socket.destroyed, stopped: socket.stops > 0, continued: Boolean(response.continued) };
}
async function open(loader, options = {}) {
  const api = loader.load('server.cjs');
  let number = 0, time = 1000000;
  const cfg = {
    pool: { units: 10, spend: 60 }, caps: { 'conductor-a': { units: 6, spend: 40 }, 'conductor-b': { units: 6, spend: 40 } },
    entries: 3, maxActive: 2, keyEntries: 4, ttlMs: 1000
  };
  const app = api.createApp({ config: cfg, now: () => time, newId: () => `rsv-${(++number).toString(16).padStart(8, '0')}`, ...options });
  const originalClose = app.server.close;
  const errors = [];
  closeErrors.set(app, errors);
  app.server.close = function (callback) {
    return originalClose.call(this, (...args) => { try { callback?.(...args); } catch (error) { errors.push(String(error.message)); } });
  };
  try {
    await assert.doesNotReject(() => new Promise((resolve, reject) => {
      app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve);
    }), 'the supported Node service starts with its valid closed configuration');
    const tokens = Object.fromEntries(['visitor','conductor-a','conductor-b','operator'].map((who) => [who, app.issueToken(who, { ttlMs: 900000 })]));
    return { app, tokens, advance: (delta) => { time += delta; } };
  } catch (error) { await closeOwned(app); throw error; }
}
async function flow(loader) {
  const { app, tokens, advance } = await open(loader);
  const output = [];
  const ask = async (...args) => { const result = request(app, tokens, ...args); await turns(); output.push(view(result)); return result; };
  const reserve = (who,key,units=1,tier='standard',fields={}) => ask(who,'POST','/v1/reservations',{key,tier,units,...fields});
  try {
    for (const who of ['visitor','conductor-a','conductor-b','operator','anonymous']) await ask(who,'GET','/v1/me');
    for (const route of ['/','/page.js','/style.css','/scope.json']) await ask('anonymous','GET',route);
    await ask('anonymous','GET','/?query=1');
    await ask('anonymous','GET','/',{unexpected:true});
    await ask('conductor-a','GET','/v1/me',{unexpected:true});
    await ask('conductor-a','GET','http://remote.invalid/v1/me');
    await ask('conductor-a','GET','//remote.invalid/v1/me');
    await ask('conductor-a','GET','/v1/me',undefined,{accept:'x-lease','x-note':'x-price'});
    await ask('conductor-a','GET','/v1/me',undefined,{'x-lease':'claimed-other','x-price':'0'});
    for (const who of ['visitor','operator','anonymous']) await reserve(who,'role-probe-key');
    await reserve('conductor-a','flow-origin-key',3);
    await reserve('conductor-b','flow-origin-key',2,'burst');
    await reserve('conductor-a','flow-origin-key',3);
    await reserve('conductor-a','flow-origin-key',2);
    for (const who of ['conductor-a','conductor-b','visitor','operator','anonymous']) {
      for (const route of ['/v1/allowance','/v1/reservations?limit=50','/v1/reservations/rsv-00000001','/v1/operator/pool','/v1/audit','/v1/operator/audit']) await ask(who,'GET',route);
    }
    for (const [body, headers] of [
      ['{bad',{}], ['[]',{}], [{},{}], [{key:'bad',tier:'standard',units:1},{}],
      [{key:'field-claim-key',tier:'standard',units:1,owner:'conductor-b'},{}],
      [{key:'server-claim-key',tier:'standard',units:1,keyEntries:999},{}],
      [{key:'unknown-field-key',tier:'standard',units:1,bogus:1},{}],
      [{key:'media-type-key',tier:'standard',units:1},{'content-type':'text/plain'}]
      ,[{key:'media-suffix-key',tier:'standard',units:1},{'content-type':'application/jsonjunk'}]
      ,[{key:'media-prefix-key',tier:'standard',units:1},{'content-type':'xapplication/json'}]
      ,[{key:'media-empty-parameter-key',tier:'standard',units:1},{'content-type':'application/json;'}]
      ,[{key:'media-charset-key',tier:'standard',units:1},{'content-type':'application/json; charset=utf-8'}]
      ,[{key:'oversized-body-key',tier:'standard',units:1,pad:'x'.repeat(5000)},{}]
    ]) await ask('conductor-a','POST','/v1/reservations',body,headers);
    for (const [method,route,body,headers,event] of [
      ['GET','/unknown',undefined,{},'request'],['PUT','/v1/reservations',undefined,{},'request'],
      ['PATCH','/v1/reservations',undefined,{},'request'],['DELETE','/v1/reservations',undefined,{},'request'],
      ['TRACE','/v1/reservations',undefined,{},'request'],
      ['GET','/v1/reservations/rsv-invalid',undefined,{},'request'],
      ['GET','/v1/me?',undefined,{},'request'],
      ['GET','/v1/me?owner=x',undefined,{},'request'],['GET','/v1/me#bad',undefined,{},'request'],
      ['GET','/'+ 'x'.repeat(2046),undefined,{},'request'],['GET','/'+ 'x'.repeat(2047),undefined,{},'request'],
      ['GET','/'+ 'x'.repeat(2048),undefined,{},'request'],['GET','/v1/me',undefined,{host:'evil.example'},'request'],
      ['GET','/v1/me',undefined,{origin:'http://evil.example'},'request'],
      ['GET','/v1/me',undefined,{expect:'nonsense'},'checkExpectation'],
      ['POST','/v1/reservations',{key:'continue-body-key',tier:'standard',units:1},{expect:'100-continue'},'checkContinue']
    ]) await ask('conductor-a',method,route,body,headers,event);
    await reserve('conductor-a','capacity-over-key',4);
    await ask('conductor-a','POST','/v1/reservations/rsv-00000001/release');
    await reserve('conductor-a','flow-key-second');
    await ask('conductor-a','POST','/v1/reservations/rsv-00000004/release');
    await reserve('conductor-a','flow-key-third');
    await ask('conductor-a','POST','/v1/reservations/rsv-00000005/release');
    await reserve('conductor-a','flow-origin-key',3);
    await reserve('conductor-a','flow-key-fourth');
    advance(1000);
    await ask('operator','GET','/v1/operator/pool');
    await reserve('conductor-a','flow-origin-key',3);
    await ask('operator','GET','/v1/operator/audit');
    await ask('operator','GET','/v1/operator/audit?offset=1&limit=2');
    await ask('conductor-a','GET','/v1/audit?offset=1&limit=2');
    output.push({ snapshot: app.snapshot(), audit: app.auditLog(), health: app.health(), queued: app.queued() });
    return output;
  } finally { await closeOwned(app); }
}
function serverCases(loader, reference) {
  return [
    { name: 'actual server timeout, connection, listener and linearization wiring is the closed contract',
      async run() {
        const { app } = await open(loader);
        try {
          assert.deepEqual({ header:app.server.headersTimeout,request:app.server.requestTimeout,idle:app.server.timeout,
            check:app.server.connectionsCheckingInterval,cap:app.server.maxConnections,keepAlive:app.server.keepAliveTimeout },
          { header:5000,request:5000,idle:8000,check:1000,cap:256,keepAlive:1000 });
          for (const event of ['request','checkContinue','checkExpectation','clientError','connect','listening','connection']) {
            if (event !== 'listening') assert.ok(app.server.listenerCount(event) >= 1, 'listener '+event);
          }
          assert.equal(app.server.listenerCount('connection'),2,'the application admission guard accompanies the native HTTP listener');
          assert.equal(app.health().ok,true);
        } finally { await closeOwned(app); }
      } },
    { name: 'all roles, routes, typed refusals, effects, replay bounds, audit and expiry match the real store facts',
      async run() { assert.deepEqual(await flow(loader), await flow(reference())); } },
    { name: 'request-socket cancellation precedes expired-token revalidation at the commit',
      async run() {
        let current, armed=false;
        const { app,tokens,advance } = await open(loader,{hooks:{beforeCommit:()=>{if(armed){require('../../C009/http-io.cjs').endConnection(current.socket);advance(900001);}}}});
        try {
          const before=app.snapshot(),audit=app.auditLog().length;armed=true;
          current=request(app,tokens,'conductor-a','POST','/v1/reservations',{key:'marked-expiry-key',tier:'standard',units:1});
          await turns();
          assert.equal(app.queued(),0);
          assert.deepEqual(app.snapshot(),before);
          assert.equal(app.auditLog().length,audit,'a cancelled expired request has no audit decision');
          assert.equal(current.response.headersSent,false,'a cancelled request has no answer');
        } finally { await closeOwned(app); }
      } },
    { name: 'unparsed Node-owned errors close, stop reading, and produce the typed packet without allocation',
      async run() {
        const {app}=await open(loader);
        try {
          for(const [event,code,status] of [['clientError','HPE_INVALID_CHUNK_SIZE',400],['clientError','HPE_HEADER_OVERFLOW',431],['clientError','ERR_HTTP_REQUEST_TIMEOUT',408],['connect',null,405]]){
            const socket=new Socket(),before=app.snapshot();
            if(event==='clientError')app.server.emit(event,{code},socket);else app.server.emit(event,{method:'CONNECT'},socket);
            await turns();
            assert.ok(socket.raw.length>0,'Node-owned refusal is actually written');
            assert.match(Buffer.concat(socket.raw).toString('utf8'),new RegExp('^HTTP/1.1 '+status));
            assert.equal(socket.destroyed,true);assert.ok(socket.stops>0);assert.deepEqual(app.snapshot(),before);
            assert.equal(app.auditLog().at(-1).method,'OTHER','an unparsed native refusal has the fixed no-request method');
          }
        } finally {await closeOwned(app);}
      } },
    { name: 'live expired-token decision is repeated after the asynchronous commit hook',
      async run() {
        let advanceClock;
        const context=await open(loader,{hooks:{beforeCommit:()=>advanceClock(900001)}});
        advanceClock=context.advance;
        try {
          const before=context.app.snapshot();
          const result=request(context.app,context.tokens,'conductor-a','POST','/v1/reservations',{key:'live-expiry-key',tier:'standard',units:1});
          await turns();
          assert.equal(result.response.statusCode,401);
          assert.equal(JSON.parse(result.response.bytes).error.code,'TOKEN_EXPIRED');
          assert.deepEqual(context.app.snapshot(),before);
        } finally {await closeOwned(context.app);}
      } },
    { name: 'cancelled non-auth hook failures have no new audit or response',
      async run() {
        let current;
        const {app,tokens}=await open(loader,{hooks:{beforeCommit:()=>{current.socket.destroy();throw new Error('owned synthetic failure');}}});
        try {
          const before=app.snapshot(),audit=app.auditLog().length;
          current=request(app,tokens,'conductor-a','POST','/v1/reservations',{key:'cancelled-error-key',tier:'standard',units:1});
          await turns();
          assert.equal(app.queued(),0);
          assert.deepEqual(app.snapshot(),before);
          assert.equal(app.auditLog().length,audit);
          assert.equal(current.response.headersSent,false);
        } finally {await closeOwned(app);}
      } },
    { name: 'a real authentication error thrown after socket cancellation retains typed auth precedence',
      async run() {
        let current;
        const {AuthError}=require('../../C009/authz.cjs');
        const {app,tokens}=await open(loader,{hooks:{beforeCommit:()=>{current.socket.destroy();throw new AuthError('TOKEN_EXPIRED');}}});
        try {
          const before=app.snapshot(),audit=app.auditLog().length;
          current=request(app,tokens,'conductor-a','POST','/v1/reservations',{key:'auth-precedence-key',tier:'standard',units:1});await turns();
          assert.equal(current.response.statusCode,401);
          assert.equal(JSON.parse(current.response.bytes).error.code,'TOKEN_EXPIRED');
          assert.equal(app.auditLog().length,audit+1);
          assert.equal(app.auditLog().at(-1).code,'TOKEN_EXPIRED');
          assert.deepEqual(app.snapshot(),before);
        } finally {await closeOwned(app);}
      } },
    { name: 'unsupported socket read-stop capability fails closed, emits notification, and serves nothing',
      async run() {
        const {app}=await open(loader),warnings=[],originalWarning=process.emitWarning;
        process.emitWarning=(message,options)=>warnings.push({message,code:options?.code});
        try {
          assert.equal(app.server.listenerCount('connection'),2);
          const socket=new Socket();socket._handle={};
          app.server.listeners('connection').at(-1)(socket);
          assert.deepEqual(app.health(),{ok:false,reason:'READ_STOP_UNAVAILABLE'});
          assert.equal(socket.destroyed,true);
          assert.deepEqual(warnings,[{message:'C011 cannot stop reading a refused connection and serves nothing.',code:'C011_READ_STOP_UNAVAILABLE'}]);
          const second=new Socket();app.server.listeners('connection').at(-1)(second);
          assert.equal(second.destroyed,true);
          assert.equal(warnings.length,1,'failure notification is not spammed');
        } finally {process.emitWarning=originalWarning;await closeOwned(app);}
      } },
    { name: 'the owned close removes each tracked socket and does not retain ended neighbours',
      async run() {
        const {app}=await open(loader);
        const first=new Socket(),second=new Socket();
        let firstCalls=0,secondCalls=0;
        const firstDestroy=first.destroy.bind(first),secondDestroy=second.destroy.bind(second);
        first.destroy=()=>{firstCalls++;firstDestroy();};second.destroy=()=>{secondCalls++;secondDestroy();};
        try {
          assert.equal(app.server.listenerCount('connection'),2);
          app.server.listeners('connection').at(-1)(first);
          app.server.listeners('connection').at(-1)(second);
          first.destroy();
          await closeOwned(app);
          assert.equal(firstCalls,1,'ended socket was removed from the owned registry');
          assert.equal(secondCalls,1,'standing owned socket is destroyed on close');
          assert.equal(second.destroyed,true);
        } finally {firstDestroy();secondDestroy();await closeOwned(app);}
      } },
    { name: 'every batch target is checked before the commit queue and valid batches still commit',
      async run() {
        let arrivals=0,armed=false;
        const {app,tokens}=await open(loader,{hooks:{beforeCommit:()=>{if(armed)arrivals++;}}});
        const ask=async(...args)=>{const result=request(app,tokens,...args);await turns();return result;};
        try {
          const a=await ask('conductor-a','POST','/v1/reservations',{key:'batch-first-key',tier:'standard',units:1});
          const b=await ask('conductor-b','POST','/v1/reservations',{key:'batch-other-key',tier:'standard',units:1});
          assert.equal(a.response.statusCode,200);assert.equal(b.response.statusCode,200);
          const before=app.snapshot();armed=true;
          const foreign=await ask('conductor-b','POST','/v1/batch',{ops:[
            {op:'reserve',key:'batch-attempt-key',tier:'standard',units:1},
            {op:'release',id:JSON.parse(a.response.bytes).reservation.id}
          ]});
          assert.equal(foreign.response.statusCode,404);
          assert.equal(JSON.parse(foreign.response.bytes).opIndex,1);
          assert.equal(arrivals,0,'foreign batch never enters the effect queue');
          assert.deepEqual(app.snapshot(),before);
          const own=await ask('conductor-b','POST','/v1/batch',{ops:[
            {op:'release',id:JSON.parse(b.response.bytes).reservation.id},
            {op:'reserve',key:'batch-attempt-key',tier:'standard',units:1}
          ]});
          assert.equal(own.response.statusCode,200);assert.equal(arrivals,1);
        } finally {await closeOwned(app);}
      } },
    { name: 'individual foreign and absent releases are refused before the queue hook with no other-lease effects',
      async run() {
        let arrivals=0,armed=false;
        const {app,tokens}=await open(loader,{hooks:{beforeCommit:()=>{if(armed)arrivals++;}}});
        try {
          const own=request(app,tokens,'conductor-a','POST','/v1/reservations',{key:'release-owner-key',tier:'standard',units:1});
          await turns();assert.equal(own.response.statusCode,200);armed=true;
          const before=app.snapshot();
          for(const who of ['conductor-a','conductor-b']){
            const id=who==='conductor-a'?'rsv-99999999':JSON.parse(own.response.bytes).reservation.id;
            const result=request(app,tokens,who,'POST','/v1/reservations/'+id+'/release');await turns();
            assert.equal(result.response.statusCode,404);
            assert.equal(JSON.parse(result.response.bytes).error.code,'RESERVATION_NOT_FOUND');
            assert.equal(arrivals,0,'ownership is denied before body/queue/hook');
            assert.deepEqual(app.snapshot(),before);
          }
        } finally {await closeOwned(app);}
      } },
    { name: 'a live non-auth hook failure uses the existing typed internal refusal and records no allocation',
      async run() {
        const {app,tokens}=await open(loader,{hooks:{beforeCommit:()=>{throw new Error('owned synthetic commit failure');}}});
        try {
          const before=app.snapshot(),audit=app.auditLog().length;
          const result=request(app,tokens,'conductor-a','POST','/v1/reservations',{key:'internal-live-key',tier:'standard',units:1});await turns();
          assert.equal(result.response.statusCode,500);
          assert.equal(JSON.parse(result.response.bytes).error.code,'INTERNAL_ERROR');
          assert.equal(result.socket.destroyed,true);assert.ok(result.socket.stops>0);
          assert.deepEqual(app.snapshot(),before);
          assert.equal(app.auditLog().length,audit+1);
          assert.equal(app.auditLog().at(-1).code,'INTERNAL_ERROR');
        } finally {await closeOwned(app);}
      } },
    { name: 'a failed atomic batch retains the exact failing operation index and every preexisting lease byte',
      async run() {
        const {app,tokens}=await open(loader);
        try {
          const first=request(app,tokens,'conductor-a','POST','/v1/reservations',{key:'batch-index-one',tier:'standard',units:1});await turns();
          assert.equal(first.response.statusCode,200);const before=app.snapshot();
          const result=request(app,tokens,'conductor-a','POST','/v1/batch',{ops:[
            {op:'reserve',key:'batch-index-two',tier:'standard',units:1},
            {op:'reserve',key:'batch-index-three',tier:'standard',units:1}
          ]});await turns();
          assert.equal(result.response.statusCode,409);
          assert.equal(JSON.parse(result.response.bytes).opIndex,1);
          assert.deepEqual(app.snapshot(),before);
        } finally {await closeOwned(app);}
      } },
    { name: 'startup without read-stop emits the notification and explicit error and remains closed',
      async run() {
        const app=loader.load('server.cjs').createApp(),warnings=[],errors=[];
        const emitWarning=process.emitWarning;process.emitWarning=(message,options)=>warnings.push({message,code:options?.code});
        try {
          app.server.on('error',error=>errors.push(error.message));
          assert.equal(app.server._handle,null,'unstarted owned server has no read-stop capability');
          for(const listener of app.server.listeners('listening'))listener.call(app.server);
          assert.deepEqual(app.health(),{ok:false,reason:'READ_STOP_UNAVAILABLE'});
          assert.deepEqual(errors,['READ_STOP_UNAVAILABLE: this Node cannot stop reading a refused connection']);
          assert.deepEqual(warnings,[{message:'C011 cannot stop reading a refused connection and serves nothing.',code:'C011_READ_STOP_UNAVAILABLE'}]);
          const socket=new Socket();socket._handle={};
          app.server.listeners('connection').at(-1)(socket);
          assert.equal(warnings.length,1);assert.equal(socket.destroyed,true);
        } finally {process.emitWarning=emitWarning;await closeOwned(app);}
      } },
    { name: 'the exported local startup preserves explicit options, native loopback-port callback and token TTL',
      async run() {
        const http=require('node:http'),create=http.createServer,owned=[],calls=[];
        let now=1000000,settled=false,value,failure,promise;
        http.createServer=function(...args){
          const server=create.apply(this,args);owned.push(server);
          const listen=server.listen,once=server.once;
          server.once=function(event,listener){if(event==='error')assert.equal(typeof listener,'function','startup error callback is callable');return once.call(this,event,listener);};
          server.listen=function(port,host,callback){
            calls.push({port,host,callback:typeof callback});
            assert.equal(port,0,'only a native ephemeral port is authorized');
            assert.equal(host,'127.0.0.1','the native bind authority is loopback only');
            assert.equal(typeof callback,'function','startup resolution belongs to the actual listening callback');
            return listen.call(this,port,host,callback);
          };
          return server;
        };
        try {
          promise=loader.load('server.cjs').startLocal({now:()=>now,config:{keyEntries:13},tokenMs:12345});
          promise.then(result=>{value=result;settled=true;},error=>{failure=error;settled=true;});
        } finally {http.createServer=create;}
        try {
          await turns();
          assert.equal(owned.length,1);assert.equal(calls.length,1,'startup actually invokes its native listener');
          assert.equal(failure,undefined,'valid explicit local startup does not reject');
          assert.equal(settled,true,'the actual native listening callback resolves local startup');
          assert.equal(value.app.config.keyEntries,13);
          assert.equal(value.port,owned[0].address().port);
          assert.equal(value.origin,'http://127.0.0.1:'+value.port);
          assert.equal(owned[0].listenerCount('error'),1,'startup retains its explicit error boundary');
          assert.deepEqual(Object.keys(value.tokens).sort(),['conductor-a','conductor-b','operator','visitor']);
          for(const who of Object.keys(value.tokens)){
            assert.equal(typeof value.tokens[who],'string');assert.ok(value.tokens[who].length>0);
            const result=request(value.app,value.tokens,who,'GET','/v1/me');await turns();
            assert.equal(result.response.statusCode,200);assert.equal(JSON.parse(result.response.bytes).subject,who);
          }
          now+=12345;
          const expired=request(value.app,value.tokens,'conductor-a','GET','/v1/me');await turns();
          assert.equal(expired.response.statusCode,401);assert.equal(JSON.parse(expired.response.bytes).error.code,'TOKEN_EXPIRED');
        } finally {
          for(const server of owned)await new Promise(resolve=>{nativeClose.call(server,resolve);nativeCloseAll.call(server);});
        }
      } },
    { name: 'read refusals retain drained expiry events and Node-owned refusals remain in the audit',
      async run() {
        const {app,tokens,advance}=await open(loader);
        try {
          const admitted=request(app,tokens,'conductor-a','POST','/v1/reservations',{key:'refusal-expiry-key',tier:'standard',units:1});await turns();
          assert.equal(admitted.response.statusCode,200);advance(1000);
          const refused=request(app,tokens,'conductor-b','GET','/v1/reservations/rsv-99999999');await turns();
          assert.equal(refused.response.statusCode,404);
          assert.equal(app.auditLog().filter(row=>row.route==='expire').length,1,'a typed read refusal retains its drained expiry decision');
          const count=app.auditLog().length,socket=new Socket();
          app.server.emit('clientError',{code:'HPE_INVALID_CHUNK_SIZE'},socket);await turns();
          assert.equal(app.auditLog().length,count+1);
          assert.equal(app.auditLog().at(-1).outcome,'refused');
        } finally {await closeOwned(app);}
      } },
    { name: 'body-read cancellation drops the request before any effect hook or audit',
      async run() {
        let arrivals=0;
        const {app,tokens}=await open(loader,{hooks:{beforeCommit:()=>arrivals++}});
        try {
          const before=app.snapshot(),audit=app.auditLog().length;
          const current=request(app,tokens,'conductor-a','POST','/v1/reservations',{key:'first-cancel-key',tier:'standard',units:1});
          require('../../C009/http-io.cjs').endConnection(current.socket);
          await turns();
          assert.equal(arrivals,0);assert.equal(app.queued(),0);
          assert.deepEqual(app.snapshot(),before);assert.equal(app.auditLog().length,audit);
          assert.equal(current.response.headersSent,false);
        } finally {await closeOwned(app);}
      } },
    { name: 'the single global effect queue preserves held-before-later mutation order without a wall-clock hold',
      async run() {
        let release,first=true;const arrivals=[];
        const gate=new Promise(resolve=>{release=resolve;});
        const {app,tokens}=await open(loader,{hooks:{beforeCommit:async(info)=>{arrivals.push(info.subject);if(first){first=false;await gate;}}}});
        try {
          const one=request(app,tokens,'conductor-a','POST','/v1/reservations',{key:'queue-first-key',tier:'standard',units:1});
          await turns();
          const two=request(app,tokens,'conductor-b','POST','/v1/reservations',{key:'queue-second-key',tier:'standard',units:1});
          await turns();
          assert.equal(app.queued(),2,'running and waiting mutations occupy the same FIFO');
          assert.deepEqual(arrivals,['conductor-a']);
          assert.equal(one.response.headersSent,false);assert.equal(two.response.headersSent,false);
          release();await turns();
          assert.deepEqual(arrivals,['conductor-a','conductor-b']);
          assert.equal(one.response.statusCode,200);assert.equal(two.response.statusCode,200);
        } finally {release();await turns();await closeOwned(app);}
      } },
    { name: 'the configured per-socket lane depth cuts a complete mutation before any queued effect',
      async run() {
        let arrivals=0;
        const {app,tokens}=await open(loader,{hooks:{beforeCommit:()=>arrivals++}});
        try {
          const socket=new Socket(),before=app.snapshot(),audit=app.auditLog().length;
          const first=request(app,tokens,'conductor-a','POST','/v1/reservations',{key:'lane-depth-key',tier:'standard',units:1},{},'request',socket);
          for(let n=0;n<4;n++)request(app,tokens,'conductor-a','GET','/v1/me',undefined,{},'request',socket);
          await turns();
          assert.equal(socket.destroyed,true,'excess pending requests cut the owned connection');
          assert.equal(arrivals,0);assert.equal(app.queued(),0);
          assert.equal(first.response.headersSent,false);
          assert.equal(app.auditLog().length,audit);
          assert.deepEqual(app.snapshot(),before);
        } finally {await closeOwned(app);}
      } }
  ];
}
module.exports={serverCases,flow,request,turns,open,Socket,closeOwned};
