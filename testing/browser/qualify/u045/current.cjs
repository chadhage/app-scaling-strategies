'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const legacy = require('../qualify.cjs');
const adapters = require('../adapters.cjs');
const addendum = require('../addendum.cjs');
const cli = require('../cli.cjs');
const requalify = require('../requalify.cjs');

const APPEND_ATTEMPTS = 3;
const PARENT_BASELINE_SHA256 = '087a938f4643b7bc7aa8256ab5ca70c6cb4a364b34f855c54f5fc844515433cc';
const HEAD_FILE = path.join(__dirname, 'head.json');
const USAGE = [
  'Usage: node testing\\browser\\qualify\\u045\\current.cjs [--json <new-file>] [--timeout-ms <n>] [--requalify]',
  '       node testing\\browser\\qualify\\u045\\current.cjs --check-head <externally-trusted-sha256>',
  'U045 is an explicit opt-in entry; the immutable legacy direct entry, help, comments, and README are not rewritten.',
  '--timeout-ms and QUALIFY_TIMEOUT_MS bound each adapter call; the option wins; the shell receives at most 75 percent.',
  'A security-adapter timeout fails qualification; clock exception: the clock may fail with checkedAtUtc null and qualification may pass.',
  '--json never overwrites; --requalify retains the existing isolated and loopback suite policy and slot options.',
  '--check-head verifies all 272 predecessors and the complete current footprint against an externally trusted head digest.',
  'Report checks establish consistency and agreement with the installed Edge, not authenticity.',
  '',
].join('\n');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const refused = (code,error,extra = {}) => ({ok:false,code,error,...extra});

async function qualifyEdge(options = {}) {
  const bounds = legacy.resolveTimeouts(options, options.env || process.env);
  if (!bounds.ok) return legacy.qualifyEdge(options);
  const factory = options.adapterFactory || adapters.defaultAdapters;
  const configured = {...options, shell:{...options.shell,timeoutMs:bounds.shellTimeoutMs}};
  // The clock is the explicit exception: checkedAtUtc may be null while all security facts still qualify.
  return legacy.qualifyEdge({...configured,adapters:{...factory(configured),...options.adapters}});
}

async function appendFromReport(options = {}) {
  const destination = options.addendumFile || addendum.addendumFileFor(options.qualifiedFile || addendum.SEALED_FILE);
  if (path.resolve(destination).toLowerCase() === path.resolve(addendum.ADDENDUM_FILE).toLowerCase()) {
    return refused('U045_PINNED_FILE_READ_ONLY','The accepted 157 addendum is read-only; supply an explicit private amendment destination');
  }
  const fsApi = options.fsApi || fs;
  let attempts = 0;
  let causeCode = null;
  const retrying = {...fsApi,renameSync(from,to) {
    for (let attempt = 1; attempt <= APPEND_ATTEMPTS; attempt += 1) {
      attempts += 1;
      try {
        return fsApi.renameSync(from,to);
      } catch (error) {
        causeCode = error.code;
        if (!['EPERM','EBUSY'].includes(error.code) || attempt === APPEND_ATTEMPTS) throw error;
      }
    }
  }};
  const result = await addendum.appendFromReport({...options,addendumFile:destination,fsApi:retrying});
  if (result.ok) return {...result,attempts};
  const exhausted = attempts === APPEND_ATTEMPTS && ['EPERM','EBUSY'].includes(causeCode);
  return {...result,code:exhausted ? 'U045_APPEND_RETRY_EXHAUSTED' : 'U045_APPEND_REFUSED',causeCode,attempts};
}

function listFiles(root, fsApi) {
  const files = [];
  function walk(directory, relative) {
    for (const entry of fsApi.readdirSync(directory,{withFileTypes:true})) {
      const name = relative ? `${relative}\\${entry.name}` : entry.name;
      const full = path.join(directory,entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Not a regular source footprint: ${name}`);
      if (entry.isDirectory()) walk(full,name);
      else if (entry.isFile()) files.push(name);
      else throw new Error(`Not a regular source file: ${name}`);
    }
  }
  walk(root,'');
  return files.sort();
}

function verifyHead(options = {}) {
  const root = options.root || path.resolve(__dirname,'..');
  const fsApi = options.fsApi || fs;
  try {
    const bytes = fsApi.readFileSync(options.headFile || path.join(root,'u045','head.json'));
    if (typeof options.expectedHeadSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(options.expectedHeadSha256)
        || sha(bytes) !== options.expectedHeadSha256) {
      return refused('U045_HEAD_DIGEST','The head must match its externally trusted exact-byte digest');
    }
    const head = JSON.parse(bytes.toString('utf8'));
    const parentBytes = Buffer.from(head.parentBaselineBase64,'base64');
    if (head.schema !== 'U045-current-source-head/1' || sha(parentBytes) !== PARENT_BASELINE_SHA256) {
      return refused('U045_PREDECESSOR_ANCHOR','The exact original parent baseline is required');
    }
    const parent = JSON.parse(parentBytes.toString('utf8'));
    const expected = new Map(parent.files.map(file => [file.path,file]));
    if (expected.size !== 272 || !Array.isArray(head.files)) return refused('U045_HEAD_SHAPE','The head must enumerate 272 predecessors and all additions');
    const names = new Set();
    for (const file of head.files) {
      if (typeof file.path !== 'string' || file.path === '' || /[/:]/.test(file.path)
          || file.path.split('\\').some(part => part === '' || part === '.' || part === '..') || names.has(file.path)) {
        return refused('U045_HEAD_PATH','Every source path must be unique, relative, and confined');
      }
      names.add(file.path);
      if (!Array.isArray(file.forms) || file.forms.length === 0) return refused('U045_SOURCE_FORM',`Missing explicit source forms: ${file.path}`);
      const predecessor = expected.get(file.path);
      const original = file.forms.find(form => form.kind === 'original');
      if (predecessor && (!original || original.sha256 !== predecessor.sha256 || original.bytes !== predecessor.bytes || file.role !== 'predecessor')) {
        return refused('U045_PREDECESSOR_FILE',`The original predecessor is not exactly declared: ${file.path}`);
      }
      if (!predecessor && (!file.path.startsWith('u045\\') || file.role !== 'current')) {
        return refused('U045_CURRENT_SCOPE',`An addition is outside the own current namespace: ${file.path}`);
      }
      const source = !file.path.startsWith('evidence\\') && /\.(?:cjs|js|md|feature)$/.test(file.path);
      const kinds = source ? ['original','source-lf','source-crlf'] : ['original'];
      if (JSON.stringify(file.forms.map(form => form.kind)) !== JSON.stringify(kinds)
          || file.forms.some(form => !Number.isInteger(form.bytes) || form.bytes < 0 || !/^[0-9a-f]{64}$/.test(form.sha256))) {
        return refused('U045_SOURCE_FORM',`Invalid or wrongly labelled exact source forms: ${file.path}`);
      }
      const stat = fsApi.lstatSync(path.join(root,file.path));
      if (!stat.isFile() || stat.isSymbolicLink()) return refused('U045_SOURCE_TYPE',`Not a regular file: ${file.path}`);
      const actual = fsApi.readFileSync(path.join(root,file.path));
      if (!file.forms.some(form => form.bytes === actual.length && form.sha256 === sha(actual))) {
        return refused('U045_SOURCE_BYTES',`No declared exact source form matches: ${file.path}`);
      }
      if (source) {
        const lf = Buffer.from(actual.toString('latin1').replace(/\r\n/g,'\n'),'latin1');
        const crlf = Buffer.from(lf.toString('latin1').replace(/\n/g,'\r\n'),'latin1');
        if (file.forms[1].bytes !== lf.length || file.forms[1].sha256 !== sha(lf)
            || file.forms[2].bytes !== crlf.length || file.forms[2].sha256 !== sha(crlf)) {
          return refused('U045_SOURCE_FORM',`Source forms do not describe the observed source: ${file.path}`);
        }
      }
      expected.delete(file.path);
    }
    if (expected.size !== 0) return refused('U045_PREDECESSOR_MISSING',`Missing predecessors: ${[...expected.keys()].join(', ')}`);
    names.add('u045\\head.json');
    const actualNames = listFiles(root,fsApi);
    if (JSON.stringify([...names].sort()) !== JSON.stringify(actualNames)) return refused('U045_FOOTPRINT','The actual complete footprint differs from the head');
    const chain = addendum.verifyFiles({qualifiedFile:path.join(root,'qualified.json'),addendumFile:path.join(root,'qualified.addendum.jsonl'),fsApi});
    const amendment = fsApi.readFileSync(path.join(root,'u045','amendment.jsonl'),'utf8');
    const entry = JSON.parse(amendment);
    const payload = head.files.filter(file => file.path !== 'u045\\amendment.jsonl');
    if (!chain.ok || amendment !== `${JSON.stringify(entry)}\n` || entry.schema !== 'U045-current-amendment/1' || entry.cardId !== 'U045'
        || Object.keys(entry).join(',') !== 'schema,cardId,previous,parentBaselineSha256,payloadSha256,atUtc'
        || typeof entry.atUtc !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.atUtc)
        || entry.previous !== chain.head || entry.parentBaselineSha256 !== PARENT_BASELINE_SHA256 || entry.payloadSha256 !== sha(JSON.stringify(payload))) {
      return refused('U045_AMENDMENT_CHAIN','The own append-only amendment must chain the unchanged 157 head and every current payload file');
    }
    return {ok:true,predecessors:272,currentFiles:head.files.length - 272 + 1,files:actualNames.length,headSha256:sha(bytes),previous:chain.head};
  } catch (error) {
    return refused('U045_HEAD_UNAVAILABLE',`The current head or its source footprint cannot be verified: ${error.message}`);
  }
}

async function main(argv, io = {}) {
  const out = io.stdout || process.stdout;
  const err = io.stderr || process.stderr;
  try {
    if (argv[0] === '--check-head') {
      if (argv.length !== 2) { err.write(USAGE); return 2; }
      const result = verifyHead({...io.headOptions,expectedHeadSha256:argv[1]});
      out.write(`${JSON.stringify(result)}\n`);
      return result.ok ? 0 : 1;
    }
    const parsed = cli.parseArgs(argv);
    if (parsed.error) { err.write(`${parsed.error}\n${USAGE}`); return 2; }
    if (parsed.options.help) { out.write(USAGE); return 0; }
    return await cli.main(argv,{
      ...io,qualify:io.qualify || qualifyEdge,
      requalify:io.requalify || (options => requalify.requalifyEdge({...options,qualify:qualifyEdge})),
    });
  } catch (error) {
    err.write(`FAIL closed: U045_CURRENT_ENTRY: ${error.message}\n`);
    return 1;
  }
}

module.exports = {APPEND_ATTEMPTS,PARENT_BASELINE_SHA256,HEAD_FILE,USAGE,qualifyEdge,appendFromReport,verifyHead,main};
if (require.main === module) main(process.argv.slice(2)).then(code => { process.exitCode = code; });
