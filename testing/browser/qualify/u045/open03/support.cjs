'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {SHA, EDGE, fixtureAdapters} = require('../../tests/support.cjs');
const namespace = path.resolve(__dirname, '..', '..');
const published = process.env.U045_SUBJECT === 'published';
const qualify = () => require(published ? path.join(namespace, 'qualify.cjs') : '../current.cjs');
const append = () => require(published ? path.join(namespace, 'addendum.cjs') : '../current.cjs');
const now = () => new Date('2026-11-11T13:00:00.000Z');
const suite = file => ({
  file, tests:5, pass:5, fail:0, cancelled:0, skipped:0, todo:0,
  testsPassed:true, passed:true, timedOut:false, browserVersionsSeen:['157.0.4341.42'],
});
const report = () => ({
  schemaVersion:1, ok:false, reasonCodes:['MAJOR_NOT_QUALIFIED'], path:EDGE,
  version:'157.0.4341.42', major:157,
  signature:{status:'Valid', publisher:'Microsoft Corporation'}, sha256:SHA,
  requalification:{
    ran:true, passed:true, candidateMajor:157,
    suites:['isolated.test.cjs','loopback.test.cjs'].map(suite),
    edgeAfter:{path:EDGE, version:'157.0.4341.42', sha256:SHA}, edgeChangedDuringRun:false,
  },
});
const machine = async () => ({
  ok:true, major:157, version:'157.0.4341.42', sha256:SHA,
  signature:{status:'Valid', publisher:'Microsoft Corporation'},
});
function workspace(t) {
  const dir = fs.mkdtempSync(path.join(__dirname, 'scratch-u045-'));
  t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  const files = {
    dir, qualifiedFile:path.join(dir,'qualified.json'),
    addendumFile:path.join(dir,'qualified.addendum.jsonl'), reportPath:path.join(dir,'report.json'),
  };
  fs.writeFileSync(files.qualifiedFile, '{"schemaVersion":1,"qualifiedMajors":[156]}\n');
  fs.writeFileSync(files.reportPath, JSON.stringify(report()));
  return {...files, verify:machine, now};
}
module.exports = {fs,path,SHA,EDGE,fixtureAdapters,namespace,published,qualify,append,workspace,report,machine,now};
