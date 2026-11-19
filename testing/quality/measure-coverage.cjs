#!/usr/bin/env node

// Per-file coverage measurement using Node V8 coverage collection
// Requirement: strict AND logic—each file must independently achieve ≥85% line AND ≥85% branch AND ≥85% function

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = 'C:\\Users\\chhage\\repos\\app-scaling-strategies';
const QUALITY_DIR = path.join(REPO_ROOT, 'testing', 'quality');
const COVERAGE_DIR = path.join(REPO_ROOT, '.git', 'kanban-orchestrator', 'execution-u051-20261108-173230', 'coverage');
const RESULTS_DIR = path.join(REPO_ROOT, '.git', 'kanban-orchestrator', 'execution-u051-20261108-173230', 'results');

// Production files requiring ≥85% on all three metrics independently
const PRODUCTION_FILES = [
  'packet-validator.cjs',
  'validate-packet.cjs',
  'rules-hygiene.cjs'
];

// Coverage threshold: EACH file must independently achieve ≥85% line AND ≥85% branch AND ≥85% function
const THRESHOLD = 85;

async function measureCoverage() {
  console.log('U051 Coverage Measurement - Strict AND Logic (each file ≥85% line AND ≥85% branch AND ≥85% function)');
  console.log('============================================================================================\n');

  // Create coverage directory
  if (!fs.existsSync(COVERAGE_DIR)) {
    fs.mkdirSync(COVERAGE_DIR, { recursive: true });
  }

  // Run tests with coverage collection via V8
  const coveragePath = path.join(COVERAGE_DIR, 'v8-coverage');
  if (!fs.existsSync(coveragePath)) {
    fs.mkdirSync(coveragePath, { recursive: true });
  }

  console.log(`Running tests with V8 coverage collection...\n`);
  try {
    const testCmd = `node --no-warnings --experimental-coverage-include-internal --coverage=${coveragePath} ${path.join(QUALITY_DIR, 'tests', 'r4-u051.test.cjs')}`;
    console.log(`Command: ${testCmd}\n`);
    execSync(testCmd, { cwd: REPO_ROOT, stdio: 'inherit' });
  } catch (err) {
    console.error(`Test execution failed: ${err.message}`);
    process.exit(1);
  }

  // Parse coverage files
  const coverageFiles = fs.readdirSync(coveragePath).filter(f => f.endsWith('.json'));
  console.log(`\nCoverage files found: ${coverageFiles.length}`);

  const coverage = {};
  for (const file of coverageFiles) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(coveragePath, file), 'utf8'));
      if (data.result && Array.isArray(data.result)) {
        data.result.forEach(entry => {
          if (entry.url && entry.url.startsWith('file://')) {
            coverage[entry.url] = entry;
          }
        });
      }
    } catch (err) {
      console.error(`Failed to parse coverage file ${file}: ${err.message}`);
    }
  }

  console.log(`Coverage entries parsed: ${Object.keys(coverage).length}\n`);

  // Calculate per-file metrics
  const results = [];
  const fileResults = {};

  for (const prodFile of PRODUCTION_FILES) {
    const prodPath = path.join(QUALITY_DIR, prodFile);
    const fileUrl = `file://${prodPath.replace(/\\/g, '/')}`;
    
    console.log(`\n${prodFile}:`);
    console.log('-'.repeat(60));

    if (!coverage[fileUrl]) {
      console.log(`  WARNING: No coverage data for ${fileUrl}`);
      fileResults[prodFile] = {
        file: prodFile,
        lineCovered: 0,
        lineTotal: 0,
        linePercent: 0,
        branchCovered: 0,
        branchTotal: 0,
        branchPercent: 0,
        functionCovered: 0,
        functionTotal: 0,
        functionPercent: 0,
        pass: false,
        reason: 'No coverage data'
      };
      continue;
    }

    const entry = coverage[fileUrl];
    
    // Count lines
    const lineCount = { covered: 0, total: 0 };
    if (entry.functions) {
      entry.functions.forEach(func => {
        if (func.ranges) {
          func.ranges.forEach(range => {
            const startLine = range.startOffset;
            const endLine = range.endOffset;
            const count = range.count;
            lineCount.total += (endLine - startLine);
            if (count > 0) {
              lineCount.covered += (endLine - startLine);
            }
          });
        }
      });
    }
    const linePercent = lineCount.total > 0 ? Math.round((lineCount.covered / lineCount.total) * 100) : 0;

    // Count branches
    const branchCount = { covered: 0, total: 0 };
    if (entry.branches) {
      entry.branches.forEach(branch => {
        branchCount.total++;
        if (branch.taken > 0 || branch.count > 0) {
          branchCount.covered++;
        }
      });
    }
    const branchPercent = branchCount.total > 0 ? Math.round((branchCount.covered / branchCount.total) * 100) : 0;

    // Count functions
    const functionCount = { covered: 0, total: 0 };
    if (entry.functions) {
      functionCount.total = entry.functions.length;
      entry.functions.forEach(func => {
        if (func.count > 0) {
          functionCount.covered++;
        }
      });
    }
    const functionPercent = functionCount.total > 0 ? Math.round((functionCount.covered / functionCount.total) * 100) : 0;

    // Strict AND logic check
    const pass = (linePercent >= THRESHOLD && branchPercent >= THRESHOLD && functionPercent >= THRESHOLD);

    fileResults[prodFile] = {
      file: prodFile,
      lineCovered: lineCount.covered,
      lineTotal: lineCount.total,
      linePercent,
      branchCovered: branchCount.covered,
      branchTotal: branchCount.total,
      branchPercent,
      functionCovered: functionCount.covered,
      functionTotal: functionCount.total,
      functionPercent,
      pass,
      reason: pass ? 'PASS' : `Below ≥${THRESHOLD}% threshold on: ${
        [
          linePercent < THRESHOLD ? `line ${linePercent}%` : null,
          branchPercent < THRESHOLD ? `branch ${branchPercent}%` : null,
          functionPercent < THRESHOLD ? `function ${functionPercent}%` : null
        ].filter(Boolean).join(', ')
      }`
    };

    console.log(`  Line:     ${linePercent.toFixed(2)}% (${lineCount.covered}/${lineCount.total})`);
    console.log(`  Branch:   ${branchPercent.toFixed(2)}% (${branchCount.covered}/${branchCount.total})`);
    console.log(`  Function: ${functionPercent.toFixed(2)}% (${functionCount.covered}/${functionCount.total})`);
    console.log(`  Status:   ${pass ? 'PASS (all ≥' + THRESHOLD + '%)' : 'FAIL'}`);
    
    results.push(fileResults[prodFile]);
  }

  // Summary
  console.log('\n\n' + '='.repeat(60));
  console.log('COVERAGE SUMMARY (Strict AND Logic)');
  console.log('='.repeat(60));
  
  const allPass = Object.values(fileResults).every(r => r.pass);
  
  for (const [file, result] of Object.entries(fileResults)) {
    const status = result.pass ? '✓ PASS' : '✗ FAIL';
    console.log(`\n${status}: ${file}`);
    console.log(`  Line:     ${result.linePercent.toFixed(2)}% (${result.lineCovered}/${result.lineTotal})`);
    console.log(`  Branch:   ${result.branchPercent.toFixed(2)}% (${result.branchCovered}/${result.branchTotal})`);
    console.log(`  Function: ${result.functionPercent.toFixed(2)}% (${result.functionCovered}/${result.functionTotal})`);
    if (!result.pass) {
      console.log(`  Reason:   ${result.reason}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  if (allPass) {
    console.log('GATE PASSED: All files meet ≥' + THRESHOLD + '% line AND branch AND function');
    console.log('='.repeat(60));
  } else {
    console.log('GATE FAILED: Some files below ≥' + THRESHOLD + '% threshold');
    console.log('='.repeat(60));
    process.exit(1);
  }

  // Save results
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const summaryPath = path.join(COVERAGE_DIR, 'coverage-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    threshold: THRESHOLD,
    files: fileResults,
    allPass,
    gatePassed: allPass
  }, null, 2));

  console.log(`\nDetailed results saved to: ${summaryPath}`);
}

measureCoverage().catch(err => {
  console.error('Coverage measurement error:', err);
  process.exit(1);
});
