// Diagnostic test: capture exact JSON.stringify output and test substrate extraction regexes
const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./support.cjs');
const fs = require('node:fs');
const path = require('node:path');

test('Phase 3c Diagnostic: Substrate Extraction Regex Analysis', async (t) => {
  const packet = load();
  const text = JSON.stringify(packet);
  
  // Save full stringified JSON for inspection
  const diagnosticDir = path.join(__dirname, '../../..', '.git/kanban-orchestrator/execution-u051-20261108-173230/scratch/U051');
  if (!fs.existsSync(diagnosticDir)) fs.mkdirSync(diagnosticDir, { recursive: true });
  
  fs.writeFileSync(path.join(diagnosticDir, 'stringify-output.json'), text, 'utf8');
  console.log(`✓ Full JSON.stringify output saved to: ${diagnosticDir}/stringify-output.json`);
  console.log(`  Total length: ${text.length} chars`);
  
  // Test Authority extraction
  console.log('\n=== AUTHORITY EXTRACTION ===');
  const authorityMatch = text.match(/"authority"\s*:\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
  if (authorityMatch) {
    console.log(`✓ Authority extraction regex MATCHED (${authorityMatch[0].length} chars)`);
    console.log('  Start: ' + authorityMatch[0].substring(0, 100) + '...');
    console.log('  End: ...' + authorityMatch[0].substring(authorityMatch[0].length - 100));
    
    // Count nested braces
    let openCount = 0;
    let closeCount = 0;
    for (const c of authorityMatch[0]) {
      if (c === '{') openCount++;
      if (c === '}') closeCount++;
    }
    console.log(`  Brace balance: open=${openCount}, close=${closeCount}, balanced=${openCount === closeCount}`);
  } else {
    console.log('✗ Authority extraction regex FAILED TO MATCH');
  }
  
  // Debug: Show authority section from text
  const authorityIdx = text.indexOf('"authority"');
  if (authorityIdx >= 0) {
    console.log('\n  Raw authority section (first 500 chars after "authority"):');
    console.log('  ' + text.substring(authorityIdx, authorityIdx + 500));
  }
  
  // Test Options extraction
  console.log('\n=== OPTIONS EXTRACTION ===');
  const optionsMatch = text.match(/"options"\s*:\s*\[([\s\S]*?)\]/);
  if (optionsMatch) {
    console.log(`✓ Options extraction regex MATCHED (${optionsMatch[0].length} chars, array content: ${optionsMatch[1].length} chars)`);
    console.log('  Start: ' + optionsMatch[0].substring(0, 100) + '...');
    
    // Try to extract individual elements
    const optionsArray = optionsMatch[1];
    const elementPattern = /\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
    let elemMatch;
    let elemIndex = 0;
    while ((elemMatch = elementPattern.exec(optionsArray)) !== null) {
      console.log(`  Element ${elemIndex}: ${elemMatch[0].length} chars`);
      elemIndex++;
    }
    console.log(`  Total elements extracted: ${elemIndex}`);
  } else {
    console.log('✗ Options extraction regex FAILED TO MATCH');
  }
  
  // Test OwnerDecisions extraction
  console.log('\n=== OWNERDECISIONS EXTRACTION ===');
  const decisionsMatch = text.match(/"ownerDecisions"\s*:\s*\{[^{}]*"decisions"\s*:\s*\[([\s\S]*?)\]\s*\}/);
  if (decisionsMatch) {
    console.log(`✓ OwnerDecisions extraction regex MATCHED (${decisionsMatch[0].length} chars)`);
    console.log('  Start: ' + decisionsMatch[0].substring(0, 100) + '...');
    
    const decisionsArray = decisionsMatch[1];
    const elementPattern = /\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
    let elemMatch;
    let elemIndex = 0;
    while ((elemMatch = elementPattern.exec(decisionsArray)) !== null) {
      console.log(`  Element ${elemIndex}: ${elemMatch[0].length} chars`);
      elemIndex++;
    }
    console.log(`  Total elements extracted: ${elemIndex}`);
  } else {
    console.log('✗ OwnerDecisions extraction regex FAILED TO MATCH');
  }
  
  // Now test with a duplicate key injected in authority
  console.log('\n=== DUPLICATE KEY INJECTION TEST ===');
  const textWithDuplicate = text.replace(/"authority":\{/, '"authority":{"duplicate_key":"first",');
  
  // Re-test authority extraction on modified text
  const authorityMatchWithDup = textWithDuplicate.match(/"authority"\s*:\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
  if (authorityMatchWithDup) {
    console.log(`✓ Authority extraction with duplicate MATCHED (${authorityMatchWithDup[0].length} chars)`);
    
    // Now scan for keys in extracted authority
    const keyPattern = /"([^"\\]*(\\.[^"\\]*)*)"(?=\s*:)/g;
    let match;
    const keys = new Map();
    while ((match = keyPattern.exec(authorityMatchWithDup[0])) !== null) {
      const keyName = match[1];
      if (!keys.has(keyName)) keys.set(keyName, []);
      keys.get(keyName).push(match.index);
    }
    
    console.log(`  Found ${keys.size} unique keys in authority`);
    for (const [keyName, positions] of keys.entries()) {
      if (positions.length > 1) {
        console.log(`  DUPLICATE FOUND: "${keyName}" at positions ${positions.join(', ')}`);
      }
    }
  } else {
    console.log('✗ Authority extraction with duplicate FAILED');
  }
  
  assert.ok(true, 'Diagnostic complete');
});
