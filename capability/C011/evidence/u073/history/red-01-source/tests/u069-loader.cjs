'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const source = fs.readFileSync(path.join(__dirname, 'mutate-gen.cjs'), 'utf8');
const box = { module: { exports: {} }, vm };
vm.runInNewContext('const extraTests=[];const LOOP_BOUND=30000000;\n'
  + source.slice(source.indexOf('const STAGES ='), source.indexOf('const sources ='))
  + '\n' + source.slice(source.indexOf('function instrument(text)'), source.indexOf('async function worker'))
  + '\nmodule.exports={generate,instrument};', box);
const authority = box.module.exports;
const PRODUCTION = ['codes.cjs', 'config.cjs', 'contract.js', 'json.cjs', 'page.js', 'server.cjs', 'store.cjs'];
const originals = new Map(PRODUCTION.map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]));

class ModuleFault extends Error {
  constructor(file, cause, phase) {
    super(`${phase}: ${path.basename(file)}: ${String(cause.message)}`);
    this.name = 'U069ModuleFault';
    this.file = file;
    this.cause = cause;
    this.phase = phase;
  }
}
function definitions() {
  const generated = PRODUCTION.flatMap((file) => authority.generate(file, originals.get(file)));
  const text = originals.get('server.cjs');
  const before = /if \(cancelled\(\)\) return undefined;\r?\n\s+registry\.verify\(token\);/.exec(text);
  if (!before) throw new Error('Current required commit-order subject is missing');
  generated.push({ file: 'server.cjs', label: 'required F3: token revalidation before cancellation',
    start: before.index, end: before.index + before[0].length,
    replacement: 'registry.verify(token);\n          if (cancelled()) return undefined;' });
  return generated.map((entry, index) => {
    const original = originals.get(entry.file);
    const changed = original.slice(0, entry.start) + entry.replacement + original.slice(entry.end);
    return { ...entry, id: index + 1, sourceSha256: sha(Buffer.from(original)), mutantSha256: sha(Buffer.from(changed)) };
  });
}
function createLoader(definition = null) {
  const cache = new Map(), tests = [], work = new Map(), executed = new Map(), reads = new Map();
  const target = definition && path.join(root, definition.file);
  const targetText = definition && originals.get(definition.file);
  const changed = definition && targetText.slice(0, definition.start) + definition.replacement + targetText.slice(definition.end);
  const ioPath = path.resolve(root, '..', 'C009', 'http-io.cjs');
  const realIO = require(ioPath);
  const observedIO = { ...realIO, createLanes(options) {
    const admit = realIO.createLanes(options);
    const observed = (request, response, task) => {
      assert.ok(request && typeof request.method === 'string' && Array.isArray(request.rawHeaders), 'C009 admission receives its actual request as argument one');
      assert.ok(response && response.req === request && typeof response.end === 'function', 'C009 admission receives the matching response as argument two');
      assert.equal(typeof task, 'function', 'C009 admission receives the route task as argument three');
      return admit(request, response, task);
    };
    observed.refuse = admit.refuse;
    return observed;
  } };
  const read = (file, encoding) => {
    const absolute = path.resolve(file);
    const bytes = absolute === target ? Buffer.from(changed) : fs.readFileSync(absolute);
    reads.set(absolute,sha(bytes));
    return typeof encoding === 'string' ? bytes.toString(encoding) : bytes;
  };
  const filesystem = new Proxy(fs, { get(object, key) { return key === 'readFileSync' ? read : Reflect.get(object, key); } });
  const register = (...args) => {
    const fn = args.findLast((value) => typeof value === 'function');
    if (fn) tests.push({ name: typeof args[0] === 'string' ? args[0] : fn.name, run: fn });
    return Promise.resolve();
  };
  register.test = register;
  register.before = register.after = register.beforeEach = register.afterEach = () => {};
  function resolve(request, parent) {
    if (request.startsWith('.') || path.isAbsolute(request)) {
      const base = path.resolve(path.dirname(parent), request);
      return [base, base + '.cjs', base + '.js', base + '.json'].find((name) => fs.existsSync(name) && fs.statSync(name).isFile()) || base;
    }
    return null;
  }
  function load(file) {
    const absolute = path.resolve(file);
    if (!absolute.startsWith(root + path.sep)) return absolute === ioPath ? observedIO : require(absolute);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    if (absolute.endsWith('.json')) return JSON.parse(read(absolute, 'utf8'));
    const module = { exports: {} };
    cache.set(absolute, module);
    const ownProduction = path.dirname(absolute) === root && PRODUCTION.includes(path.basename(absolute));
    let text = read(absolute, 'utf8');
    if (ownProduction && path.basename(absolute) !== 'page.js') {
      const counter = { steps: 0, maximum: 2000000, exceeded: false };
      work.set(absolute, counter);
      text = authority.instrument(text);
      text = text.replace(/^const __bound = .*?;\r?\n/m,
        "const __bound=()=>{__u069Work.steps+=1;if(__u069Work.steps>__u069Work.maximum){__u069Work.exceeded=true;throw new Error('U069_ACTUAL_ITERATION_BOUND');}return true;};\n");
    }
    executed.set(absolute, sha(Buffer.from(text)));
    let factory;
    try { factory = new vm.Script('(function(require,module,exports,__filename,__dirname,__u069Work){\n' + text + '\n})', { filename: absolute }).runInThisContext(); }
    catch (error) { cache.delete(absolute); throw new ModuleFault(absolute, error, 'syntax'); }
    const localRequire = (request) => {
      if (request === 'node:test') return register;
      if (request === 'node:fs') return filesystem;
      const resolved = resolve(request, absolute);
      return resolved ? load(resolved) : require(request);
    };
    try { factory(localRequire, module, module.exports, absolute, path.dirname(absolute), work.get(absolute)); }
    catch (error) {
      cache.delete(absolute);
      if (error instanceof ModuleFault) throw error;
      throw new ModuleFault(absolute, error, ownProduction ? 'module-initialization' : 'test-setup');
    }
    return module.exports;
  }
  return {
    load: (file) => load(path.isAbsolute(file) ? file : path.join(root, file)), tests, read, work, executed, reads,
    resetWork() { for (const counter of work.values()) { counter.steps = 0; counter.exceeded = false; } },
    bounded() { return [...work.values()].every((counter) => !counter.exceeded); },
    maximumSteps() { return Math.max(0, ...[...work.values()].map((counter) => counter.steps)); },
    changedSource: changed
  };
}
module.exports = { createLoader, definitions, originals, PRODUCTION, ModuleFault, sha, root, authority };
