const duplicateInAuthority = () => {
  return JSON.stringify({
    schemaVersion: 2,
    itemId: 'U051-test-dup-auth',
    title: 'Test packet with duplicate key in authority',
    servesItems: ['U001'],
    preparedBy: 'test-worker',
    preparedAtUtc: new Date().toISOString(),
    status: 'test',
    authority: null,
    options: [],
    ownerDecisions: {},
    integrity: {},
    validation: {}
  }).replace(
    '"authority":null',
    '"authority":{"source":"first","source":"second","approval":"test"}'
  );
};

const duplicateInOption = () => {
  return JSON.stringify({
    schemaVersion: 2,
    itemId: 'U051-test-dup-opt',
    title: 'Test packet with duplicate key in options',
    servesItems: ['U001'],
    preparedBy: 'test-worker',
    preparedAtUtc: new Date().toISOString(),
    status: 'test',
    authority: { approval: 'test' },
    options: null,
    ownerDecisions: {},
    integrity: {},
    validation: {}
  }).replace(
    '"options":null',
    '"options":[{"id":"first","id":"second","name":"test"}]'
  );
};

const duplicateInDecision = () => {
  return JSON.stringify({
    schemaVersion: 2,
    itemId: 'U051-test-dup-dec',
    title: 'Test packet with duplicate key in decisions',
    servesItems: ['U001'],
    preparedBy: 'test-worker',
    preparedAtUtc: new Date().toISOString(),
    status: 'test',
    authority: { approval: 'test' },
    options: [],
    ownerDecisions: null,
    integrity: {},
    validation: {}
  }).replace(
    '"ownerDecisions":null',
    '"ownerDecisions":{"decisions":[{"key":"first","key":"second","value":"test"}]}'
  );
};

console.log('=== duplicateInAuthority ===');
let json = duplicateInAuthority();
console.log('JSON length:', json.length);
console.log('First 800 chars:');
console.log(json.substring(0, 800));
console.log('---');
try {
  JSON.parse(json);
  console.log('JSON.parse succeeded');
} catch(e) {
  console.log('JSON.parse failed:', e.message);
}

console.log('\n=== duplicateInOption ===');
json = duplicateInOption();
console.log('JSON length:', json.length);
console.log('First 800 chars:');
console.log(json.substring(0, 800));
console.log('---');
try {
  JSON.parse(json);
  console.log('JSON.parse succeeded');
} catch(e) {
  console.log('JSON.parse failed:', e.message);
}

console.log('\n=== duplicateInDecision ===');
json = duplicateInDecision();
console.log('JSON length:', json.length);
console.log('First 800 chars:');
console.log(json.substring(0, 800));
console.log('---');
try {
  JSON.parse(json);
  console.log('JSON.parse succeeded');
} catch(e) {
  console.log('JSON.parse failed:', e.message);
}
