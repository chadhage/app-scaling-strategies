const { findDuplicateJsonKeys } = require('./json-token-reader.cjs');

const rawJson = '{"schemaVersion":2,"itemId":"U051-test-dup-auth","title":"Test packet with duplicate key in authority","servesItems":["U002"],"preparedBy":"test-worker","preparedAtUtc":"2025-01-08T12:00:00.000Z","status":"test","authority":{"source":"first","source":"second"},"options":[],"ownerDecisions":{"decisions":[]},"integrity":{},"validation":{}}';

console.log('=== TEST G2 DUPLICATE DETECTION ===');
console.log('Input length:', rawJson.length);
console.log('Contains duplicate authority:', rawJson.includes('"source":"first","source":"second"'));
console.log('---');

try {
  console.log('Calling findDuplicateJsonKeys...');
  const findings = findDuplicateJsonKeys(rawJson);
  console.log('Findings count:', findings.length);
  console.log('Findings:', JSON.stringify(findings, null, 2));
  
  if (findings.length === 0) {
    console.log('\n⚠️  NO FINDINGS RETURNED! Expected DUPLICATE_JSON_KEY finding.');
  } else {
    findings.forEach((f, i) => {
      console.log(`Finding ${i}: code=${f.code}, path=${f.path}`);
    });
  }
} catch (err) {
  console.error('ERROR:', err.message);
  console.error('Stack:', err.stack);
}
