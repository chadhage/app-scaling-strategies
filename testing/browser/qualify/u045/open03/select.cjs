'use strict';
const fs=require('node:fs'),path=require('node:path');
const own=path.resolve(__dirname,'..');
const retained=fs.readdirSync(path.join(own,'tests')).filter(file=>file.endsWith('.test.cjs')).sort()
  .map(file=>`u045\\tests\\${file}`);
const current=[...retained,'u045\\open03\\residuals.test.cjs','u045\\open03\\historical-counterparts.test.cjs',
  'u045\\open03\\current-consumer.test.cjs'];
module.exports={current,role:'NEW current selection; complete retained current routine plus all three OPEN03 executable test files. Exact-version frozen tests/evidence authority is separately executed, whole and unchanged, on its physical predecessor-only tree.'};
if(require.main===module)process.stdout.write(JSON.stringify(module.exports)+'\n');
