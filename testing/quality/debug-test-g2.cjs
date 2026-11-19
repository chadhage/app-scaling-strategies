'use strict';
const { validatePacket } = require('./packet-validator.cjs');

// Test fixture: duplicate "key" in decisions array
const rawJsonString = JSON.stringify({
  schemaVersion: 2,
  itemId: 'U051-test-dup',
  title: 'Test packet with duplicate key',
  servesItems: ['U002'],
  preparedBy: 'test-worker',
  preparedAtUtc: new Date().toISOString(),
  status: 'test',
  authority: {},
  options: [],
  ownerDecisions: null,
  integrity: {},
  validation: {}
}).replace(
  '"ownerDecisions":null',
  '"ownerDecisions":{"decisions":[{"key":"first","key":"second","question":"test?"}]}'
);

console.log('=== TEST: G2 Duplicate Key Detection ===');
console.log('Raw JSON string:', rawJsonString.substring(0, 200), '...');
console.log('Contains duplicate "key":', rawJsonString.includes('"key":"first","key":"second"'));

const packet = JSON.parse(rawJsonString);
console.log('Packet parsed successfully');

const result = validatePacket(packet, {}, rawJsonString);
console.log('\n=== RESULT ===');
console.log('Result ok:', result.ok);
console.log('Findings count:', result.findings.length);
console.log('Findings:', JSON.stringify(result.findings, null, 2));

// Extract codes
const codes = new Set(result.findings.map(f => f.code));
console.log('\n=== CODES ===');
console.log('Codes set:', Array.from(codes));
console.log('Contains DUPLICATE_JSON_KEY:', codes.has('DUPLICATE_JSON_KEY'));
console.log('Contains VALIDATOR_ERROR:', codes.has('VALIDATOR_ERROR'));

// Verify expected behavior
const expected = ['DUPLICATE_JSON_KEY'];
const actual = Array.from(codes);
console.log('\n=== VERIFICATION ===');
console.log('Expected:', expected);
console.log('Actual:', actual);
console.log('Match:', JSON.stringify(expected.sort()) === JSON.stringify(actual.sort()));
