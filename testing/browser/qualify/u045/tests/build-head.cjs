'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const addendum = require('../../addendum.cjs');
const parentBytes = () => fs.readFileSync(path.join(__dirname,'fixtures','parent-baseline.json'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function isSource(file) {
  return (!file.startsWith('evidence\\') || file.startsWith('u045\\')) && /\.(?:cjs|js|md|feature)$/.test(file);
}
function forms(file,bytes,acceptedOriginal) {
  const record = (kind,value) => ({kind,bytes:value.length,sha256:sha(value)});
  const result = [acceptedOriginal
    ? {kind:'original',bytes:acceptedOriginal.bytes,sha256:acceptedOriginal.sha256}
    : record('original',bytes)];
  if (isSource(file)) {
    const lf = Buffer.from(bytes.toString('latin1').replace(/\r\n/g,'\n'),'latin1');
    result.push(record('source-lf',lf),record('source-crlf',Buffer.from(lf.toString('latin1').replace(/\n/g,'\r\n'),'latin1')));
  }
  return result;
}
function walk(root,relative='',result=[]) {
  for (const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})) {
    const file = relative ? `${relative}\\${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(root,file,result);
    else if (entry.isFile()) result.push(file);
    else throw new Error(`Not an ordinary fixture source file: ${file}`);
  }
  return result.sort();
}
function build(root,atUtc = new Date().toISOString()) {
  const rawParent = parentBytes();
  const parent = JSON.parse(rawParent);
  const old = new Map(parent.files.map(file => [file.path,file]));
  const payload = walk(root).filter(file => !['u045\\head.json','u045\\amendment.jsonl'].includes(file)).map(file => ({
    path:file,role:old.has(file) ? 'predecessor' : 'current',forms:forms(file,fs.readFileSync(path.join(root,file)),old.get(file)),
  }));
  const chain = addendum.verifyFiles({qualifiedFile:path.join(root,'qualified.json'),addendumFile:path.join(root,'qualified.addendum.jsonl')});
  if (!chain.ok) throw new Error(chain.error);
  const amendment = `${JSON.stringify({
    schema:'U045-current-amendment/1',cardId:'U045',previous:chain.head,
    parentBaselineSha256:sha(rawParent),payloadSha256:sha(JSON.stringify(payload)),atUtc,
  })}\n`;
  fs.mkdirSync(path.join(root,'u045'),{recursive:true});
  fs.writeFileSync(path.join(root,'u045','amendment.jsonl'),amendment);
  const files = [...payload,{
    path:'u045\\amendment.jsonl',role:'current',forms:forms('u045\\amendment.jsonl',Buffer.from(amendment)),
  }].sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const head = {
    schema:'U045-current-source-head/1',headRole:'externally trusted exact bytes, not a self-hashing source exemption',
    parentBaselineBase64:rawParent.toString('base64'),files,
  };
  const bytes = Buffer.from(`${JSON.stringify(head,null,2)}\n`);
  fs.writeFileSync(path.join(root,'u045','head.json'),bytes);
  return {head,sha256:sha(bytes),bytes};
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(__dirname,'scratch-u045-head-'));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const namespace = path.resolve(__dirname,'..','..');
  for (const file of JSON.parse(parentBytes()).files) {
    const target = path.join(root,file.path);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.copyFileSync(path.join(namespace,file.path),target);
  }
  fs.mkdirSync(path.join(root,'u045'));
  fs.writeFileSync(path.join(root,'u045','probe.cjs'),"'use strict';\nmodule.exports = 1;\n");
  return {root,...build(root,'2026-11-11T13:00:00.000Z')};
}
function rewrite(space,change) {
  const head = JSON.parse(fs.readFileSync(path.join(space.root,'u045','head.json'),'utf8'));
  change(head);
  const bytes = Buffer.from(`${JSON.stringify(head,null,2)}\n`);
  fs.writeFileSync(path.join(space.root,'u045','head.json'),bytes);
  return sha(bytes);
}
module.exports = {sha,isSource,forms,walk,build,fixture,rewrite,parentBytes};
if (require.main === module) {
  if (Date.now() >= Date.parse(process.env.U045_FIXED_DEADLINE)) throw new Error('U045_FIXED_DEADLINE');
  const result = build(process.argv[2]);
  process.stdout.write(`${JSON.stringify({headSha256:result.sha256,files:result.head.files.length+1})}\n`);
}
