'use strict';

// The management side: it HOLDS the secrets and the PII of this fixture and USES them only here, on the server: tokens (through the C009 registry), the
// signing key (an HMAC over the public bundle), the connection string (a fictional store that fails the way naive drivers do, with the string in its
// message), the service credential (a fictional upstream call) and the contacts (fictional people attached to the records they request).
// Nothing in this file is real and nothing here is ever sent anywhere: both services are in-process fakes.
const { createHmac } = require('node:crypto');
const contract = require('../C009/contract.js');
const { MIN_SECRET } = require('./canon.cjs');

// Every protected value is at least MIN_SECRET (6) characters, because that is the shortest value the redactor can hold by value: what the validator accepts, the redactor can protect.
// The lengths: a token 48; the signing key 32 to 128; the connection string 16 to 512 whose server, host, user, password (and database, when given) are 6 or more each;
// the service credential id and secret 6 to 128; a contact name 6 to 61, an e-mail 7 to 193 (local part 3 to 64, domain 3 to 128), a phone 8 to 27.
const TOKEN = /^c009_[A-Za-z0-9_-]{43}$/;
const KEY = /^[A-Za-z0-9_-]{32,128}$/;
const NAME = /^[A-Za-z][A-Za-z '-]{5,60}$/;
const EMAIL = /^[^@\s]{3,64}@[^@\s]{3,128}$/;
const PHONE = /^\+?[0-9][0-9 ()-]{6,24}[0-9]$/;
const SERVICE_FIELD = /^[A-Za-z0-9_-]{6,128}$/;
const CONNECTION = /^[\x20-\x7e]{16,512}$/;
const IDENTITIES = Object.freeze(Object.keys(contract.identities));
const sameKeys = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
// The 43 characters must be a canonical 32-byte value, so the registry issues exactly this text.
const canonical = (token) => Buffer.from(token.slice(5), 'base64url').toString('base64url') === token.slice(5);

// A typed refusal of a configuration; it names the field and never carries a value.
class ConfigError extends Error {
  constructor(field) {
    super('CONFIG_INVALID');
    this.name = 'ConfigError';
    this.code = 'CONFIG_INVALID';
    this.field = field;
  }
}

class StoreError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'StoreError';
  }
}

function parseConnection(connectionString) {
  const pairs = Object.fromEntries(connectionString.split(';').filter(Boolean).map((part) => {
    const at = part.indexOf('=');
    return at < 1 ? ['', ''] : [part.slice(0, at).trim(), part.slice(at + 1)];
  }));
  // host: the server name alone, without the protocol prefix and the port, as a driver message or a log line would print it
  const host = typeof pairs.Server === 'string' ? pairs.Server.replace(/^[A-Za-z]+:/, '').split(',')[0] : undefined;
  return { server: pairs.Server, host, database: pairs.Database, user: pairs['User Id'], password: pairs.Password };
}

function validate(config) {
  const need = (ok, field) => { if (!ok) throw new ConfigError(field); };
  need(sameKeys(config, ['tokens', 'signingKey', 'connectionString', 'serviceCredential', 'contacts']), 'config');
  need(sameKeys(config.tokens, IDENTITIES) && Object.values(config.tokens).every((token) => typeof token === 'string' && TOKEN.test(token) && canonical(token))
    && new Set(Object.values(config.tokens)).size === IDENTITIES.length, 'tokens');
  need(typeof config.signingKey === 'string' && KEY.test(config.signingKey), 'signingKey');
  need(typeof config.connectionString === 'string' && CONNECTION.test(config.connectionString), 'connectionString');
  const { server, host, database, user, password } = parseConnection(typeof config.connectionString === 'string' ? config.connectionString : '');
  const long = (part) => typeof part === 'string' && part.length >= MIN_SECRET;
  need([server, host, user, password].every(long) && (database === undefined || long(database)), 'connectionString');
  need(sameKeys(config.serviceCredential, ['id', 'secret']) && Object.values(config.serviceCredential).every((part) => typeof part === 'string' && SERVICE_FIELD.test(part)), 'serviceCredential');
  need(sameKeys(config.contacts, IDENTITIES) && Object.values(config.contacts).every((contact) => sameKeys(contact, ['name', 'email', 'phone'])
    && typeof contact.name === 'string' && NAME.test(contact.name) && typeof contact.email === 'string' && EMAIL.test(contact.email)
    && typeof contact.phone === 'string' && PHONE.test(contact.phone)), 'contacts');
}

function createVault(input) {
  validate(input);
  // A private deep copy: the caller's object can no longer change what the vault holds, and nothing returned from here aliases it.
  const config = structuredClone(input);
  const connection = parseConnection(config.connectionString);
  const seeded = IDENTITIES.map((identity) => Buffer.from(config.tokens[identity].slice(5), 'base64url'));

  return {
    identities: IDENTITIES,
    // The registry draws its 32 random bytes from here, so the configured tokens are the ones it issues (in the order of the identity table).
    tokenSource: () => seeded.shift() || null,
    status: () => ({ tokens: IDENTITIES.length, signingKey: true, connectionString: true, serviceCredential: true, contacts: IDENTITIES.length }),
    sign: (bytes) => createHmac('sha256', config.signingKey).update(bytes).digest('hex'),
    contactFor: (subject) => ({ ...config.contacts[subject] }),
    // Everything the redactor must know by value: every leaf, and the parts of a leaf that a log line or a driver message would reveal. A part shorter than MIN_SECRET
    // (a given name of five characters, a three-character e-mail local part, the digits of a short phone) cannot be held by value and is not listed.
    secrets() {
      const list = [...Object.values(config.tokens), config.signingKey, config.connectionString, connection.server, connection.host, connection.database, connection.user,
        connection.password, config.serviceCredential.id, config.serviceCredential.secret];
      for (const { name, email, phone } of Object.values(config.contacts)) {
        list.push(name, ...name.split(/[ '-]+/), email, email.split('@')[0], phone, phone.replace(/\D/g, ''));
      }
      return [...new Set(list)].filter((value) => typeof value === 'string' && value.length >= MIN_SECRET);
    },
    // The fictional upstream call: the request carries the credential, the way a naive client logs it.
    dispatch(runId, units, subject) {
      const contact = config.contacts[subject];
      const { id, secret } = config.serviceCredential;
      return {
        request: { method: 'POST', url: 'https://upstream.synthetic.invalid/dispatch', headers: { authorization: `Bearer ${secret}`, 'x-service-id': id }, body: { run: runId, units, requester: { ...contact } } },
        steps: [
          { event: 'dispatch', detail: `POST https://upstream.synthetic.invalid/dispatch as ${id} Authorization: Bearer ${secret} for ${contact.name} <${contact.email}> ${contact.phone}` },
          { event: 'response', detail: '202 accepted' }
        ]
      };
    },
    // The fictional store: a failure carries the whole connection string in its message and the password in its cause, as naive drivers do.
    checkStore(mode) {
      if (mode === 'fail') {
        throw new StoreError(`Login failed for user '${connection.user}' using ${config.connectionString}`, { cause: new Error(`connect ECONNREFUSED ${connection.server} (password ${connection.password})`) });
      }
      return { steps: [{ event: 'connect', detail: `connected to ${connection.server} as ${connection.user}` }] };
    }
  };
}

module.exports = Object.freeze({ ConfigError, StoreError, createVault, parseConnection });
