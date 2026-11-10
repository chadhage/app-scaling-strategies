'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const child = require('node:child_process');
const { createRequire } = require('node:module');
const authority = require('./u072-authority.cjs');
const { ROOT, REPO, sha } = authority;
const [name, expected, separator, ...args] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(name) || !/^[01]$/.test(expected) || separator !== '--' || !args.length) throw Error('name expectedExit -- nodeArguments');
const privateRoot = process.env.U072_PRIVATE_ROOT;
const shared = process.env.C014_SHARED_RECORDER;
if (!privateRoot || !path.isAbsolute(privateRoot) || !shared) throw Error('explicit owned private root and unchanged shared recorder are required');
const directory = path.join(privateRoot, 'captures', name);
fs.mkdirSync(directory, { recursive: true });
const source = fs.readFileSync(shared, 'utf8');
const declaration = /^const repo = ('(?:\\.|[^'])*');$/m.exec(source);
if (!declaration) throw Error('unrecognized shared recorder root');
const oldRoot = vm.runInNewContext(declaration[1]);
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? entry.name === 'scratch' ? [] : walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
const files = process.env.U072_CAPTURE_INPUTS
  ? JSON.parse(fs.readFileSync(process.env.U072_CAPTURE_INPUTS))
  : [...authority.sourceNames().map((name) => path.join('capability','C014',name)),
    ...walk(path.join(ROOT,'evidence')).map((file) => path.relative(REPO,file)),
    ...Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT,'imports.json'))).imports),
    ...Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT,'imports.final.json'))).imports)];
const inputs = [...new Set(files)].sort();
for (const name of inputs) {
  const file = path.join(REPO, name);
  if (!fs.existsSync(file)) throw Error('a declared actual source is missing');
  const target = path.join(directory,'inputs',name);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,fs.readFileSync(file),{flag:'wx'});
}
const spec = { name, purpose: `U072 exact private command capture ${name}; source namespace dependency set, not a claim that every pinned member was read`,
  args, inputs, outDir:path.relative(REPO,directory), expectedExitCode:Number(expected), timeoutMs:2400000,
  env:{ C014_ACTIVE_CAPTURE:name } };
const specFile=path.join(directory,'invocation.json');
fs.writeFileSync(specFile,JSON.stringify(spec,null,2)+'\n',{flag:'wx'});
fs.writeFileSync(path.join(directory,'recorder.json'),JSON.stringify({schema:'U072-unchanged-recorder-root-adapter/1',
  sharedSourceSha256:sha(Buffer.from(source)),adapterSha256:sha(fs.readFileSync(__filename)),
  role:'Exact unmodified stdout/stderr of the declared command are private originals. Public derivatives are separately hashed and labelled.'},null,2)+'\n',{flag:'wx'});
const original=process.argv;
process.argv=[process.execPath,'<SHARED-RECORDER>',specFile];
const realRequire=createRequire(shared);
const mapped=(id)=>{
  if(id==='node:path')return{...path,join:(first,...rest)=>path.join(first===oldRoot?REPO:first,...rest)};
  if(id==='node:child_process')return{...child,spawnSync:(exe,argv,options)=>child.spawnSync(exe,argv,{...options,cwd:REPO})};
  return realRequire(id);
};
try{vm.runInThisContext(`(function(require){\n${source}\n})`,{filename:'<UNCHANGED-SHARED-RECORDER>'})(mapped);}
finally{process.argv=original;}
