'use strict';
const {audit}=require('./u074-audit.cjs'),{sha}=require('./u074-seal.cjs');
function decide(checked){
  const issues=[],need=name=>{const record=checked.records.get(name);if(!record||record.execution.exitCode!==record.execution.expectedExitCode||record.execution.timedOut||record.execution.signal)issues.push('CURRENT_CAPTURE_REQUIRED:'+name);return record;};
  for(const name of ['U074-final-core','U074-final-inventory','U074-final-coverage','U074-final-source-git','U074-final-consumer','U074-final-fresh-lf','U074-final-fresh-crlf'])need(name);
  const core=need('U074-final-core');
  if(core){
    if(core.summary.tests<=0||core.summary.pass!==core.summary.tests||core.summary.fail||core.summary.cancelled||core.summary.skipped||core.summary.todo)issues.push('CURRENT_WHOLE_CORE_NONPASS');
    const observed=/C011_ASSERTIONS (.+)$/m.exec(core.stdout);
    if(!observed)issues.push('ACTUAL_ASSERTION_CENSUS_REQUIRED');
    else{const value=JSON.parse(observed[1]);if(value.tests!==core.summary.tests||value.declared!==value.tests||value.assertions<=0||value.zeroAssertionTests.length)issues.push('ACTUAL_ASSERTIONS_INCOMPLETE');}
  }
  const report=JSON.parse(checked.readers.read('evidence/u074/current/final-report.json'));
  let text='';
  for(const name of report.captureNames){const record=need(name);if(record)text+=record.stdout+'\n';}
  for(const issue of audit(report,text,checked.freeze,checked.readers.read))issues.push(issue);
  const coverage=checked.data.get('coverage');
  if(!coverage?.passed||coverage.files?.length!==7||coverage.missing.length||coverage.unenumerated.length)issues.push('WHOLE_PRODUCTION_COVERAGE_SET');
  for(const row of coverage?.files||[])if(!row.loaded||row.lines<85||row.branches<85||row.functions<85||row.nestedExit!==0||row.failures.length)issues.push('COVERAGE_BELOW_85:'+row.file);
  if(coverage?.actualRows?.length!==7)issues.push('ACTUAL_WHOLE_FILE_ROWS_REQUIRED');
  for(const row of coverage?.actualRows||[]){
    const out=checked.projection(row.output),record=coverage.files.find(value=>value.file===row.file);
    const found=new RegExp('^#\\s+'+row.file.replace('.','\\.')+'\\s+\\|\\s+(\\d+(?:\\.\\d+)?)\\s+\\|\\s+(\\d+(?:\\.\\d+)?)\\s+\\|\\s+(\\d+(?:\\.\\d+)?)','m').exec(out);
    if(!found||Number(found[1])!==record.lines||Number(found[2])!==record.branches||Number(found[3])!==record.functions||row.command.status!==0)issues.push('ACTUAL_COVERAGE_ROW_DIFFERS:'+row.file);
  }
  const source=checked.data.get('source-git');
  if(!source?.passed||source.inheritedFiles!==7005||source.productionEdits!==0||source.importEdits!==0)issues.push('CURRENT_SOURCE_GIT_REQUIRED');
  const consumer=checked.data.get('consumer');
  if(consumer?.code!==0||consumer.summary.tests<=0||consumer.summary.pass!==consumer.summary.tests||!consumer.sourceBytesMatchBeforeAndAfter)issues.push('CURRENT_CONSUMER_REQUIRED');
  for(const mode of ['lf','crlf']){
    const fresh=checked.data.get('fresh-'+mode);
    if(!fresh||fresh.mode!==mode||fresh.code!==0||fresh.summary.pass!==fresh.summary.tests||fresh.summary.tests<=0||fresh.summary.fail||fresh.summary.cancelled||fresh.summary.skipped||fresh.summary.todo)issues.push('CURRENT_FRESH_REQUIRED:'+mode);
  }
  const native=checked.data.get('browser');
  if(!native||native.browser?.major!==157||native.observations?.length!==2||native.observations.some(row=>!row.cleanup.clean))issues.push('CURRENT_QUALIFIED_NATIVE_REQUIRED');
  const proof=checked.data.get('provenance');
  if(!proof||proof.sourceFreezeSha256!==sha(checked.readers.read('evidence/u074/current/source-freeze.json'))||proof.credit!==0||proof.originalCoreChronologyCertified!==false)issues.push('ONE_FROZEN_EPOCH_REQUIRED');
  return issues;
}
module.exports={decide};
