'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { originals, root } = require('./u069-loader.cjs');
const baselineCodes = JSON.parse(JSON.stringify(require('../codes.cjs').CODES));
const baselineContract = require('../contract.js');
const baselineJson = require('../json.cjs');
const opaqueView = (value) => {
  if (typeof value === 'symbol') return { moduleLocalSentinel: value.description };
  if (Array.isArray(value)) return value.map(opaqueView);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, opaqueView(item)]));
  return value;
};

async function originalCase(callback) {
  const context = {
    diagnostic() {},
    async test(name, options, fn) {
      const body = typeof options === 'function' ? options : fn;
      assert.equal(typeof body, 'function', 'the original nested specification has a body');
      await body(context);
    }
  };
  await callback(context);
}
function collected(loader, names) {
  const start = loader.tests.length;
  for (const name of names) loader.load(path.join('tests', name + '.test.cjs'));
  return loader.tests.slice(start).map((entry) => ({ name: entry.name, run: () => originalCase(entry.run) }));
}
function pureCases(file, loader) {
  if (file === 'codes.cjs') return [{
    name: 'every fixed typed refusal status and message is the declared server contract',
    run() { assert.deepEqual(loader.load(file).CODES, baselineCodes); }
  }];
  const files = {
    'config.cjs': ['guard-bounds-final', 'config-final', 'config'],
    'contract.js': ['contract'],
    'json.cjs': ['json'],
    'store.cjs': ['u068-ledger-store', 'store', 'store-more']
  };
  const cases = collected(loader, files[file]);
  if (file === 'config.cjs') cases.push({
    name: 'snapshot depth and own-property inspection perform exactly the current declared reads',
    run() {
      for (let depth = 0; depth < 7; depth += 1) {
        function input(counter) {
          let value = Object.defineProperty({}, 'leaf', { enumerable: true, get() { counter.reads += 1; return 7; } });
          for (let n = 0; n < depth; n += 1) value = { unknown: value };
          return value;
        }
        const expected = { reads: 0 }, observed = { reads: 0 };
        assert.throws(() => require('../config.cjs').resolveConfig(input(expected)), { code: 'CONFIG_INVALID' });
        assert.throws(() => loader.load(file).resolveConfig(input(observed)), { code: 'CONFIG_INVALID' });
        assert.equal(observed.reads, expected.reads, `snapshot depth ${depth}`);
      }
    }
  });
  if (file === 'config.cjs') cases.push({
    name: 'every malformed supplied leaf preserves the exact closed diagnostic, including null and arrays',
    run() {
      const current = loader.load(file), reference = require('../config.cjs');
      const capture = (module, given) => { try { return { value: module.resolveConfig(given) }; } catch (error) { return { code:error.code,message:error.message,field:error.field,type:error.constructor.name }; } };
      for (const [name] of reference.NUMBERS) for (const value of [null,[],[1],{},false,'1',NaN,Infinity,-1,0.5]) {
        const given = name.split('.').reduceRight((inner,key)=>({[key]:inner}),value);
        assert.deepEqual(capture(current,given),capture(reference,given),name+':'+String(value));
      }
    }
  });
  if (file === 'contract.js') cases.push({
    name: 'all closed route anchors, identity/key alphabets and independent exact numeric endpoints',
    run() {
      const candidate = loader.load(file);
      assert.deepEqual(candidate.fixed, { urlChars: 2048, batchOps: 5, pageDefault: 20, pageMax: 50, offsetMax: 1000, unitsMax: 50, depth: 6 });
      for (const char of '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-./ \u200b') {
        for (const length of [0, 1, 7, 8, 9, 31, 32, 33, 63, 64, 65]) {
          const value = char.repeat(length);
          assert.equal(candidate.isKey(value), baselineContract.isKey(value), `key ${char.charCodeAt(0)}:${length}`);
          assert.equal(candidate.isId('rsv-' + value), baselineContract.isId('rsv-' + value), `id ${char.charCodeAt(0)}:${length}`);
        }
      }
      for (const units of [-1, -0, 0, 1, 2, 49, 50, 51, 52, Number.MAX_SAFE_INTEGER]) {
        const body = { key: 'independent-key', tier: 'standard', units };
        assert.deepEqual(candidate.validateBody('reserve', body), baselineContract.validateBody('reserve', body), String(units));
      }
      for (const pathname of ['/', '/page.js', '/style.css', '/scope.json', '/v1/me', '/v1/reservations',
        '/v1/reservations/rsv-1234abcd', '/v1/reservations/rsv-1234abcd/release', '/v1/allowance',
        '/v1/audit', '/v1/batch', '/v1/operator/pool', '/v1/operator/audit']) {
        for (const value of [pathname, 'x' + pathname, pathname + 'x', pathname + '/', pathname + '\n', pathname.toUpperCase()]) {
          const view = (module) => { const result = module.resolve(value); return { names: result.routes.map((row) => row.name), params: result.params }; };
          assert.deepEqual(view(candidate), view(baselineContract), JSON.stringify(value));
        }
      }
      for (const char of '0123456789abcdef') for (const length of [7,8,9,30,31,32,33]) for (const ending of ['', '/release']) {
        const value='/v1/reservations/rsv-'+char.repeat(length)+ending;
        const select=module=>{const found=module.resolve(value);return{names:found.routes.map(r=>r.name),params:found.params};};
        assert.deepEqual(select(candidate),select(baselineContract),value);
      }
      for (const operation of [null,true,1,[],['reserve'],['release'],{},'RESERVE','reserve','release']) {
        const body={ops:[{op:operation,key:'operation-key',tier:'standard',units:1,id:'rsv-00000001'}]};
        assert.deepEqual(candidate.validateBody('batch',body),baselineContract.validateBody('batch',body));
      }
      for (const route of candidate.routes) for (const text of ['', 'limit=0', 'limit=1', 'limit=50', 'limit=51', 'offset=1000', 'offset=1001',
        'limit=9','limit=19','limit=49','limit=001','limit=050','limit=','limit=1+',
        'offset=9','offset=99','offset=999','offset=01000','offset=00000','offset=','offset=1+',
        'state=reserved', 'state=released', 'state=expired', 'state=unknown', 'owner=x', 'limit=1&limit=2', '%6cimit=2']) {
        const reference = baselineContract.routes.find((entry) => entry.name === route.name);
        assert.deepEqual(candidate.parseQuery(route, text), baselineContract.parseQuery(reference, text), route.name + ':' + text);
      }
    }
  });
  if (file === 'json.cjs') cases.push({
    name: 'JSON lexical boundaries and bounded real iterations for every ASCII input boundary',
    run() {
      const parser = loader.load(file).parseStrict;
      const inputs = ['', ' ', '\t\r\n', 'null', 'true', 'false', '[]', '{}', '{"x":1}', '{"x":1,"x":2}', '"', '"\\', '"abc',
        '-0', '0', '-1', '1e0', '1.0', '01', '9007199254740991', '9007199254740992', '1'.repeat(400), '['.repeat(10) + '0' + ']'.repeat(10)];
      inputs.push('1.9','1e9','1E-9','1.99','"\\u0009"','"\\u000f"','"\\u000F"','"\\u123"','"\\u12"','"\\uFFFF"');
      for (let code = 0; code < 128; code += 1) {
        const char = String.fromCharCode(code);
        inputs.push(char + '{"x":1}', '{"x":1}' + char, '"' + char + '"', '{"x":' + char + '1}',
          '{"x"'+char+'1}','{"x":1'+char+'"y":2}','[1'+char+'2]');
      }
      for(let depth=0;depth<10;depth++){
        const text='['.repeat(depth)+'0'+']'.repeat(depth);
        assert.deepEqual(opaqueView(parser(text)),opaqueView(baselineJson.parseStrict(text)),'default depth '+depth);
      }
      for (const text of inputs) {
        loader.resetWork();
        let actual;
        assert.doesNotThrow(() => { actual = parser(text, { depth: 6 }); }, 'a bounded lexical input has a typed result');
        assert.deepEqual(opaqueView(actual), opaqueView(baselineJson.parseStrict(text, { depth: 6 })), JSON.stringify(text.slice(0, 80)));
        assert.equal(loader.bounded(), true, 'actual parser iterations exceed the declared finite-input work budget');
      }
    }
  });
  if (file === 'store.cjs') cases.push({
    name: 'every mutation returns complete own/global before-after figures and drains its exact expiry event',
    run() {
      const module=loader.load(file),contract=loader.load('contract.js'),helpers=loader.load('tests/helpers.cjs');
      const clock=helpers.fakeClock(),store=module.createStore({config:contract.resolveConfig(helpers.SMALL),now:clock.now,newId:helpers.sequentialIds()});
      assert.deepEqual(store.stats(),{visited:0});
      const made=store.reserve('conductor-a',{key:'figures-first-key',tier:'standard',units:2});
      assert.deepEqual(made.figures,{before:{units:0,spend:0,poolUnits:0,poolSpend:0},after:{units:2,spend:8,poolUnits:2,poolSpend:8}});
      clock.advance(made.value.reservation.deadlineMs-clock.now());
      const released=store.release('conductor-a',made.value.reservation.id);
      assert.equal(released.expired.length,1);
      assert.equal(released.expired[0].reservation,made.value.reservation.id);
      assert.deepEqual(released.figures,{before:{units:0,spend:0,poolUnits:0,poolSpend:0},after:{units:0,spend:0,poolUnits:0,poolSpend:0}});
      assert.deepEqual(store.allowance('conductor-a').expired,[]);
      const batch=store.batch('conductor-b',[{op:'reserve',key:'figures-batch-key',tier:'standard',units:1}]);
      assert.deepEqual(batch.figures,{before:{units:0,spend:0,poolUnits:0,poolSpend:0},after:{units:1,spend:4,poolUnits:1,poolSpend:4}});
    }
  },{
    name: 'visible history removes exactly one oldest ended row at every individual insertion',
    run() {
      const module=loader.load(file),contract=loader.load('contract.js'),helpers=loader.load('tests/helpers.cjs');
      const store=module.createStore({config:contract.resolveConfig({...helpers.SMALL,maxActive:1,entries:2,keyEntries:10}),now:helpers.fakeClock().now,newId:helpers.sequentialIds()});
      const ids=[];
      for(let n=0;n<7;n++){
        const result=store.reserve('conductor-a',{key:'every-trim-key-'+n,tier:'standard',units:1});
        assert.equal(result.ok,true);ids.push(result.value.reservation.id);
        assert.equal(store.release('conductor-a',result.value.reservation.id).ok,true);
        assert.deepEqual(store.snapshot().leases['conductor-a'].records.map(r=>r.id),ids.slice(-2));
      }
    }
  });
  return cases;
}

const identities = ['visitor', 'conductor-a', 'conductor-b', 'operator'];
const conductors = ['conductor-a', 'conductor-b'];
const records = {
  'conductor-a': { id: 'rsv-00000001', tier: 'standard', units: 3, spend: 12, state: 'reserved', createdAtMs: 1000000, deadlineMs: 1300000 },
  'conductor-b': { id: 'rsv-00000002', tier: 'burst', units: 2, spend: 16, state: 'reserved', createdAtMs: 1000000, deadlineMs: 1300000 }
};
function answer(who, route) {
  const ok = (fields) => ({ status: 200, body: { outcome: 'ok', ...fields, ignoredClaims: [] } });
  const no = (status, code) => ({ status, body: { outcome: code, error: { code, message: 'UNTRUSTED SERVER PROSE' }, ignoredClaims: [] } });
  if (who === 'anonymous') return no(401, 'AUTHENTICATION_REQUIRED');
  if (route === '/v1/me') return ok({ subject: who, role: who.startsWith('conductor') ? 'conductor' : who });
  if (route.startsWith('/v1/operator/')) {
    if (who !== 'operator') return no(403, 'ROLE_FORBIDDEN');
    if (route === '/v1/operator/audit') return ok({ total: 0, items: [] });
    return ok({ pool: { units: 10, spend: 60, reservedUnits: 5, reservedSpend: 28, freeUnits: 5, freeSpend: 32 },
      leases: [{ subject: 'conductor-a', capUnits: 6, capSpend: 40, heldUnits: 3, heldSpend: 12, active: 1 },
        { subject: 'conductor-b', capUnits: 6, capSpend: 40, heldUnits: 2, heldSpend: 16, active: 1 }] });
  }
  if (!conductors.includes(who)) return no(403, 'ROLE_FORBIDDEN');
  if (route === '/v1/allowance') {
    const record = records[who];
    return ok({ allowance: { pool: { units: 10, spend: 60 },
      lease: { capUnits: 6, capSpend: 40, heldUnits: record.units, heldSpend: record.spend,
        remainingUnits: 6 - record.units, remainingSpend: 40 - record.spend, active: 1, maxActive: 3,
        replayKeys: 1, maxReplayKeys: 1000, remainingReplayKeys: 999 },
      prices: { version: 'p1', standard: 4, burst: 8 }, ttlMs: 300000 } });
  }
  if (route.startsWith('/v1/reservations?')) return ok({ total: 1, items: [records[who]] });
  if (route === '/v1/reservations/' + records[who].id) return ok({ reservation: records[who] });
  return no(404, 'RESERVATION_NOT_FOUND');
}
async function pageView(loader, rewrite, repetitions=1) {
  const { createDocument, runPage } = loader.load('tests/dom-stub.cjs');
  const document = createDocument();
  const requests = [], calls = new Map();
  const fetch = async (route, init = {}) => {
    const token = (init.headers?.Authorization || '').slice(7);
    const who = identities.includes(token) ? token : 'anonymous';
    const result = structuredClone(answer(who, route));
    const key=who+':'+route, ordinal=(calls.get(key)||0)+1;
    calls.set(key,ordinal);
    requests.push({route,headers:{...init.headers}});
    if (rewrite) rewrite(result, who, route, ordinal);
    if (result.networkFailure) throw new Error('synthetic unreachable response');
    return { status: result.status, text: async () => JSON.stringify(result.body) };
  };
  await runPage({ fetch, document });
  for (const identity of identities) document.getElementById('token-' + identity).value = identity;
  for(let n=0;n<repetitions;n++)await assert.doesNotReject(() => document.getElementById('run').click(), 'every supplied response shape produces a visible, typed page outcome');
  return {
    status: document.getElementById('status').textContent,
    rows: document.getElementById('rows').children.map((row) => row.children.map((cell) => [cell.textContent, cell.attributes])),
    books: [...document.elements].filter(([name]) => name.startsWith('books-')).map(([name, element]) => [name, element.textContent, element.attributes]),
    requests
  };
}
function pageCases(loader, reference) {
  const cases = [{ name: 'every rendered nominal identity, status, code, figure and replay limit matches independent facts',
    run: async () => assert.deepEqual(await pageView(loader), await pageView(reference())) }];
  const corruptions = [
    ['operator pool absent', (r,w,p) => { if (p === '/v1/operator/pool' && w === 'operator') r.body.pool = null; }],
    ['operator leases null', (r,w,p) => { if (p === '/v1/operator/pool' && w === 'operator') r.body.leases = null; }],
    ['operator leases object', (r,w,p) => { if (p === '/v1/operator/pool' && w === 'operator') r.body.leases = {}; }],
    ['operator lease count', (r,w,p) => { if (p === '/v1/operator/pool' && w === 'operator') r.body.leases = []; }],
    ['operator extra lease', (r,w,p) => { if (p === '/v1/operator/pool' && w === 'operator') r.body.leases.push({...r.body.leases[0],subject:'foreign'}); }],
    ['operator null lease element', (r,w,p) => { if (p === '/v1/operator/pool' && w === 'operator') r.body.leases[0]=null; }],
    ['wrong pool conservation', (r,w,p) => { if (p === '/v1/operator/pool' && w === 'operator') r.body.pool.freeUnits += 1; }],
    ['wrong spend conservation', (r,w,p) => { if (p === '/v1/operator/pool' && w === 'operator') r.body.pool.freeSpend += 1; }],
    ['reserved capacity differs from the sum of valid own shares', (r,w,p) => { if(p==='/v1/operator/pool'&&w==='operator'){r.body.pool.reservedUnits++;r.body.pool.freeUnits--;} }],
    ['reserved spend differs from the sum of valid own shares', (r,w,p) => { if(p==='/v1/operator/pool'&&w==='operator'){r.body.pool.reservedSpend++;r.body.pool.freeSpend--;} }],
    ['balanced negative capacity', (r,w,p) => { if (p === '/v1/operator/pool' && w === 'operator') {r.body.pool.units=4;r.body.pool.freeUnits=-1;} }],
    ['balanced negative spend', (r,w,p) => { if (p === '/v1/operator/pool' && w === 'operator') {r.body.pool.spend=20;r.body.pool.freeSpend=-8;} }],
    ['balanced fractional capacity', (r,w,p) => { if (p === '/v1/operator/pool' && w === 'operator') {r.body.pool.units=10.5;r.body.pool.freeUnits=5.5;} }],
    ['wrong lease subject', (r,w,p) => { if (p === '/v1/operator/pool' && w === 'operator') r.body.leases[0].subject = 'conductor-b'; }],
    ['wrong held share', (r,w,p) => { if (p === '/v1/operator/pool' && w === 'operator') r.body.leases[0].heldSpend += 1; }],
    ['balanced wrong capacity share', (r,w,p) => { if (p === '/v1/operator/pool' && w === 'operator') {r.body.leases[0].heldUnits=4;r.body.pool.reservedUnits=6;r.body.pool.freeUnits=4;} }],
    ['balanced wrong spend share', (r,w,p) => { if (p === '/v1/operator/pool' && w === 'operator') {r.body.leases[0].heldSpend=13;r.body.pool.reservedSpend=29;r.body.pool.freeSpend=31;} }],
    ['operator capacity below holding', (r,w,p) => { if (p === '/v1/operator/pool' && w === 'operator') r.body.leases[0].capUnits=2; }],
    ['operator spend below holding', (r,w,p) => { if (p === '/v1/operator/pool' && w === 'operator') r.body.leases[0].capSpend=11; }],
    ['operator capacity exactly at holding', (r,w,p) => { if(p==='/v1/operator/pool'&&w==='operator')r.body.leases[0].capUnits=3; }],
    ['operator spend exactly at holding', (r,w,p) => { if(p==='/v1/operator/pool'&&w==='operator')r.body.leases[0].capSpend=12; }],
    ['unknown failure code', (r,w,p) => { if (p.includes('ffffffff')) r.body.error.code = 'SPOOF'; }],
    ['failed who binding', (r,w,p) => { if (p === '/v1/me') r.body.subject = 'operator'; }],
    ['foreign bytes leak', (r,w,p) => { if (p.includes('rsv-00000002') && w === 'conductor-a') r.body.leaked = 'other'; }],
    ['no answer on an allowed row', (r,w,p) => { if(p==='/v1/me'&&w==='visitor')r.networkFailure=true;}],
    ['allowance unavailable', (r,w,p) => {if(p==='/v1/allowance')r.networkFailure=true;}],
    ['only one conductor unavailable', (r,w,p) => {if(p==='/v1/allowance'&&w==='conductor-a')r.networkFailure=true;}],
    ['role refusal has the wrong HTTP status', (r,w,p) => {if(p==='/v1/allowance'&&w==='visitor')r.status=200;}],
    ['role refusal has a mismatched typed code', (r,w,p) => {if(p==='/v1/allowance'&&w==='visitor'){r.body.error.code='TOKEN_EXPIRED';r.body.outcome='TOKEN_EXPIRED';}}],
    ['absent control has the wrong status with the same bytes', (r,w,p) => {if(p.includes('ffffffff'))r.status=200;}],
    ['own read id differs from the learned own identity', (r,w,p) => {if(r.body.reservation&&p==='/v1/reservations/'+records[w]?.id)r.body.reservation.id='rsv-99999999';}],
    ['own read reservation shape is null', (r,w,p) => {if(r.body.reservation&&p==='/v1/reservations/'+records[w]?.id)r.body.reservation=null;}],
    ['own read state is invalid after sound discovery', (r,w,p) => {if(r.body.reservation&&p==='/v1/reservations/'+records[w]?.id)r.body.reservation.state='invented';}],
    ['own read spend disagrees with the server price after sound discovery', (r,w,p) => {if(r.body.reservation&&p==='/v1/reservations/'+records[w]?.id)r.body.reservation.spend++;}],
    ['allowance wrong status with plausible facts', (r,w,p) => {if(p==='/v1/allowance')r.status=400;}],
    ['allowance null body', (r,w,p) => {if(p==='/v1/allowance')r.body=null;}],
    ['empty list', (r,w,p) => {if(p.startsWith('/v1/reservations?')){r.body.items=[];r.body.total=0;}}],
    ['list invalid reservation', (r,w,p) => {if(p.startsWith('/v1/reservations?'))r.body.items[0].spend=999;}],
    ['list unavailable', (r,w,p) => {if(p.startsWith('/v1/reservations?'))r.networkFailure=true;}],
    ['list plausible body with refused status', (r,w,p) => {if(p.startsWith('/v1/reservations?'))r.status=400;}],
    ['list null body', (r,w,p) => {if(p.startsWith('/v1/reservations?'))r.body=null;}],
    ['list non-array items', (r,w,p) => {if(p.startsWith('/v1/reservations?'))r.body.items={};}],
    ['list duplicate identities', (r,w,p) => {if(p.startsWith('/v1/reservations?')){r.body.items.push({...r.body.items[0]});r.body.total=2;}}],
    ['list history exceeds replay ledger', (r,w,p) => {if(p.startsWith('/v1/reservations?'))r.body.total=2;}],
    ['list total below visible rows', (r,w,p) => {if(p.startsWith('/v1/reservations?'))r.body.total=0;}],
    ['list total not a count', (r,w,p) => {if(p.startsWith('/v1/reservations?'))r.body.total='1';}],
    ['operator pool network failure', (r,w,p) => {if(p==='/v1/operator/pool'&&w==='operator')r.networkFailure=true;}],
    ['operator pool wrong status', (r,w,p) => {if(p==='/v1/operator/pool'&&w==='operator')r.status=403;}],
    ['operator pool null body', (r,w,p) => {if(p==='/v1/operator/pool'&&w==='operator')r.body=null;}],
    ['operator pool negative displayed figure', (r,w,p) => {if(p==='/v1/operator/pool'&&w==='operator')r.body.pool.freeUnits=-1;}],
    ['operator pool zero displayed figure', (r,w,p) => {if(p==='/v1/operator/pool'&&w==='operator'){r.body.pool.freeUnits=0;r.body.pool.units=5;}}]
  ];
  for (const [name, rewrite] of corruptions) cases.push({ name,
    run: async () => assert.deepEqual(await pageView(loader, rewrite), await pageView(reference(), rewrite)) });
  cases.push({name:'a later missing identity clears the earlier complete result instead of leaving stale allowed rows',run:async()=>{
    const rewrite=(r,w,p,ordinal)=>{if(p==='/v1/allowance'&&w==='conductor-a'&&ordinal===3)r.networkFailure=true;};
    assert.deepEqual(await pageView(loader,rewrite,2),await pageView(reference(),rewrite,2));
  }});
  for(const field of ['capUnits','capSpend','heldUnits','heldSpend'])cases.push({
    name:'a coercion-equivalent string is not a numeric own '+field,run:async()=>{
      const rewrite=(r,w,p)=>{if(p==='/v1/allowance')r.body.allowance.lease[field]=String(r.body.allowance.lease[field]);};
      assert.deepEqual(await pageView(loader,rewrite),await pageView(reference(),rewrite));
    }
  });
  for(const [name,change] of [
    ['one-unit valid reservation',item=>{item.units=1;item.spend=item.tier==='burst'?8:4;}],
    ['zero-unit invalid reservation',item=>{item.units=0;item.spend=0;}],
    ...['rsv-00000000','rsv-99999999','rsv-ffffffff','rsv-aaaaaaaa','rsv-'+'a'.repeat(31),'rsv-'+'a'.repeat(32),
      'rsv-'+'a'.repeat(33),'rsv-'+'a'.repeat(7),'xrsv-00000001','rsv-00000001x'].map(id=>['reservation lexical '+id,item=>{item.id=id;}])
  ]){
    cases.push({name,run:async()=>{
      const rewrite=(r,w,p)=>{
        if(!conductors.includes(w))return;
        if(p.startsWith('/v1/reservations?'))change(r.body.items[0]);
        if(r.body.reservation)change(r.body.reservation);
      };
      assert.deepEqual(await pageView(loader,rewrite),await pageView(reference(),rewrite));
    }});
  }
  for(const maximum of [0,1,2,1999,2000,2001]){
    cases.push({name:'coherent replay-key maximum '+maximum,run:async()=>{
      const rewrite=(r,w,p)=>{if(p==='/v1/allowance')Object.assign(r.body.allowance.lease,{replayKeys:1,maxReplayKeys:maximum,remainingReplayKeys:maximum-1});};
      assert.deepEqual(await pageView(loader,rewrite),await pageView(reference(),rewrite));
    }});
  }
  for(const [name,change] of [
    ['items not an array',body=>{body.items={};}],
    ['empty returned list',body=>{body.items=[];body.total=0;}],
    ['missing total',body=>{delete body.total;}],
    ['total below item count',body=>{body.total=0;}],
    ['fractional total',body=>{body.total=1.5;}],
    ['malformed item',body=>{body.items[0].state='unknown';}],
    ['wrong price',body=>{body.items[0].spend++;}]
  ])cases.push({name:'second list response '+name,run:async()=>{
    const rewrite=(r,w,p,ordinal)=>{if(p.startsWith('/v1/reservations?')&&ordinal===2)change(r.body);};
    assert.deepEqual(await pageView(loader,rewrite),await pageView(reference(),rewrite));
  }});
  for(const code of ['TOKEN_MALFORMED','TOKEN_UNKNOWN','TOKEN_EXPIRED','NOT_FOUND'])cases.push({
    name:'a later typed refusal visibly retains '+code,run:async()=>{
      const rewrite=(r,w,p,ordinal)=>{if(p==='/v1/allowance'&&ordinal===2){r.status=401;r.body={outcome:code,error:{code,message:'untrusted'}};}};
      assert.deepEqual(await pageView(loader,rewrite),await pageView(reference(),rewrite));
    }
  });
  for (const field of ['capUnits','capSpend','heldUnits','heldSpend','remainingUnits','remainingSpend','replayKeys','maxReplayKeys','remainingReplayKeys']) {
    for (const value of [null, -1, 0, 0.5, '1', 2001]) cases.push({
      name: `untrusted own allowance ${field}=${JSON.stringify(value)}`,
      run: async () => {
        const rewrite = (r,w,p) => { if (p === '/v1/allowance') r.body.allowance.lease[field] = value; };
        assert.deepEqual(await pageView(loader, rewrite), await pageView(reference(), rewrite));
      }
    });
  }
  for (const [section,fields] of [['pool',['units','spend']],['prices',['standard','burst']]]) for(const field of fields) for(const value of [null,-1,0.5,'1',{}]){
        cases.push({name:`untrusted allowance ${section}.${field}=${JSON.stringify(value)}`,run:async()=>{
          const rewrite=(r,w,p)=>{if(p==='/v1/allowance')r.body.allowance[section][field]=value;};
          assert.deepEqual(await pageView(loader,rewrite),await pageView(reference(),rewrite));
        }});
      }
      for(const field of ['id','tier','units','spend','state']) for(const value of [null,-1,0,0.5,'x',{}]){
        cases.push({name:`untrusted reservation ${field}=${JSON.stringify(value)}`,run:async()=>{
          const rewrite=(r,w,p)=>{
            if(p.startsWith('/v1/reservations?'))r.body.items[0][field]=value;
            if(p==='/v1/reservations/'+records[w]?.id&&r.body.reservation)r.body.reservation[field]=value;
          };
          assert.deepEqual(await pageView(loader,rewrite),await pageView(reference(),rewrite));
        }});
      }
  return cases;
}
module.exports = { pureCases, pageCases, pageView, answer };
