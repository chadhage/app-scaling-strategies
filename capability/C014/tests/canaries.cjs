'use strict';

// Test seeds, not production code. Every value below is a FICTIONAL CANARY derived from fixed phrases: no real credential, address,
// number or person. The ids name a canary without printing it, so a failing assertion never writes a canary into evidence.
const { createHash } = require('node:crypto');

const digest = (label) => createHash('sha256').update(`C014-fictional-canary|${label}`).digest();
const b64u = (label, size) => digest(label).toString('base64url').slice(0, size);
const hex = (label, size) => digest(label).toString('hex').slice(0, size);
const digits = (label, size) => BigInt(`0x${digest(label).toString('hex')}`).toString().slice(0, size);
// A management token: c009_ plus 43 base64url characters; the last one keeps the two unused bits zero so the text is a canonical 32-byte value.
const token = (name) => `c009_${`CANARY${name}${b64u(`token-${name}`, 43)}`.slice(0, 42)}${'AEIMQUYcgkosw048'[digest(`tail-${name}`)[0] % 16]}`;

const WHO = ['visitor', 'conductor-a', 'conductor-b', 'operator'];
const PEOPLE = {
  visitor: ['Ottoline', 'Brackenridge'], 'conductor-a': ['Zorvald', 'Quillfeather'], 'conductor-b': ['Marnie', 'Thistlewick'], operator: ['Fenwick', 'Dunmarrow']
};
const contact = (who) => ({
  name: PEOPLE[who].join(' '),
  email: `${PEOPLE[who].join('.').toLowerCase()}.${hex(`mail-${who}`, 6)}@canary-mail.invalid`,
  phone: `+1-555-0100-${digits(`phone-${who}`, 4)}`
});

function seedConfig() {
  const tokens = Object.fromEntries(WHO.map((who) => [who, token(who.replace(/-/g, ''))]));
  const password = `CNRYpw${hex('db-password', 20)}`;
  const user = `svc_canary_${hex('db-user', 8)}`;
  const host = `canary-db-${hex('db-host', 8)}.synthetic.invalid`;
  return {
    tokens,
    signingKey: `CNRY-SIGNING-${b64u('signing', 40)}`,
    connectionString: `Server=tcp:${host},1433;Database=canary_evidence;User Id=${user};Password=${password};Encrypt=true;`,
    serviceCredential: { id: `svc-canary-${hex('service-id', 8)}`, secret: `CNRYsvc${b64u('service-secret', 36)}` },
    contacts: Object.fromEntries(WHO.map((who) => [who, contact(who)]))
  };
}

// The canaries a sweep scans for: every leaf of the configuration plus the parts a log line or a connection string would reveal.
function canaryList(config = seedConfig()) {
  const list = [];
  const add = (id, value) => list.push({ id, value });
  for (const who of WHO) add(`token-${who}`, config.tokens[who]);
  add('signing-key', config.signingKey);
  add('connection-string', config.connectionString);
  const pairs = Object.fromEntries(config.connectionString.split(';').filter(Boolean).map((part) => part.split(/=(.*)/s).slice(0, 2)));
  add('db-password', pairs.Password);
  add('db-user', pairs['User Id']);
  add('db-host', pairs.Server.replace(/^tcp:/, '').split(',')[0]);
  add('service-id', config.serviceCredential.id);
  add('service-secret', config.serviceCredential.secret);
  for (const who of WHO) {
    const { name, email, phone } = config.contacts[who];
    add(`name-${who}`, name);
    add(`surname-${who}`, name.split(' ')[1]);
    add(`email-${who}`, email);
    add(`phone-${who}`, phone);
  }
  return list;
}

// Values a client plants in its own requests (headers, URL, query, body): the server never held them and must never echo them.
const clientCanaries = () => ['header', 'url', 'query', 'body', 'cookie', 'agent'].map((id) => ({ id: `client-${id}`, value: `CNRYclient${id}${hex(`client-${id}`, 16)}` }));

module.exports = Object.freeze({ WHO, seedConfig, canaryList, clientCanaries, token, hex });
