'use strict';

// Edge qualification (U018): the installed msedge.exe must carry a valid Authenticode signature whose certificate
// subject names Microsoft Corporation as the organization, and its file version must belong to a major listed in
// qualified.json. The actual version and SHA-256 are recorded, never compared with a historical build or hash.
// Every failure to prove a fact is a failure: the check fails closed. All I/O goes through injectable adapters.
// The module lives in testing\browser\qualify\ (not testing\browser\qualify.cjs): the publisher authorizes only this new directory.
const { organizationOf } = require('./subject.cjs');
const { parseVersion, validateQualifiedMajors } = require('./version.cjs');
const { defaultAdapters, QUALIFIED_FILE } = require('./adapters.cjs');

const REQUIRED_ORGANIZATION = 'Microsoft Corporation';
const DEFAULT_TIMEOUT_MS = 90000;
const DIGEST = /^[0-9a-f]{64}$/i;

function settle(label, timeoutMs, call) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ error: Object.assign(new Error(`${label} did not answer within ${timeoutMs} ms`), { code: 'QUALIFY_TIMEOUT' }) });
    }, timeoutMs);
    Promise.resolve().then(call).then(
      (value) => { clearTimeout(timer); resolve({ value }); },
      (error) => { clearTimeout(timer); resolve({ error }); },
    );
  });
}

const isTimeout = (error) => error.code === 'QUALIFY_TIMEOUT' || error.code === 'SHELL_TIMEOUT';
const text = (value) => (typeof value === 'string' ? value : null);

function newReport() {
  return {
    schemaVersion: 1,
    checkedAtUtc: null,
    ok: false,
    reasons: [],
    reasonCodes: [],
    path: null,
    version: null,
    major: null,
    signature: { status: null, publisher: null, subject: null, issuer: null, thumbprint: null },
    sha256: null,
    qualifiedMajors: [],
    candidates: [],
  };
}

function judgeSignature(answer, report, add) {
  if (answer.error) {
    add(isTimeout(answer.error) ? 'SIGNATURE_TIMEOUT' : 'SIGNATURE_UNAVAILABLE', answer.error.message);
    return;
  }
  const found = answer.value;
  if (found === null || typeof found !== 'object' || typeof found.status !== 'string') {
    add('SIGNATURE_UNAVAILABLE', 'the signature query returned no status');
    return;
  }
  report.signature = {
    status: found.status,
    publisher: null,
    subject: text(found.subject),
    issuer: text(found.issuer),
    thumbprint: text(found.thumbprint),
  };
  if (found.status !== 'Valid') add('SIGNATURE_NOT_VALID', `the Authenticode status is ${found.status}, not Valid`);
  if (found.status === 'Valid' || report.signature.subject !== null) {
    const organization = organizationOf(found.subject);
    if (organization.ok) report.signature.publisher = organization.organization;
    if (!organization.ok || organization.organization !== REQUIRED_ORGANIZATION) {
      const why = organization.ok ? `the organization is ${JSON.stringify(organization.organization)}` : organization.error;
      add('PUBLISHER_NOT_MICROSOFT', `the signer is not ${REQUIRED_ORGANIZATION}: ${why}`);
    }
  }
}

function judgeVersion(answer, majors, report, add) {
  if (answer.error) {
    add(isTimeout(answer.error) ? 'VERSION_TIMEOUT' : 'VERSION_UNAVAILABLE', answer.error.message);
    return;
  }
  if (typeof answer.value !== 'string' || answer.value === '') {
    add('VERSION_UNAVAILABLE', 'the file version resource has no value');
    return;
  }
  const parsed = parseVersion(answer.value);
  if (!parsed.ok) {
    add('VERSION_UNPARSABLE', `${JSON.stringify(answer.value)}: ${parsed.error}`);
    return;
  }
  report.version = parsed.text;
  report.major = parsed.major;
  if (majors.ok && !majors.majors.includes(parsed.major)) {
    add('MAJOR_NOT_QUALIFIED', `major ${parsed.major} is not in the qualified majors [${majors.majors.join(', ')}]`);
  }
}

function judgeHash(answer, report, add) {
  if (answer.error) {
    add(isTimeout(answer.error) ? 'SHA256_TIMEOUT' : 'SHA256_UNAVAILABLE', answer.error.message);
  } else if (typeof answer.value !== 'string' || !DIGEST.test(answer.value)) {
    add('SHA256_UNAVAILABLE', 'the hash adapter did not return a SHA-256 digest');
  } else {
    report.sha256 = answer.value.toLowerCase();
  }
}

async function qualifyEdge(options = {}) {
  const adapters = { ...defaultAdapters(options), ...options.adapters };
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const report = newReport();
  const findings = [];
  const add = (code, message) => findings.push({ code, message });
  const ask = (label, call) => settle(label, timeoutMs, call);
  const conclude = () => {
    report.reasons = findings.map((finding) => `${finding.code}: ${finding.message}`);
    report.reasonCodes = findings.map((finding) => finding.code);
    report.ok = findings.length === 0 && report.signature.status === 'Valid'
      && report.signature.publisher === REQUIRED_ORGANIZATION && report.sha256 !== null
      && report.major !== null && report.qualifiedMajors.includes(report.major);
    return report;
  };

  const clock = await ask('clock', () => new Date(adapters.now()).toISOString());
  report.checkedAtUtc = clock.error ? null : clock.value;

  const listed = await ask('qualified list', () => adapters.readQualified(options.qualifiedPath || QUALIFIED_FILE));
  const majors = listed.error ? { ok: false, error: listed.error.message } : validateQualifiedMajors(listed.value);
  if (majors.ok) report.qualifiedMajors = majors.majors;
  else add('QUALIFIED_MAJORS_INVALID', `qualified.json cannot be used: ${majors.error}`);

  const discovered = options.path === undefined
    ? await ask('candidate list', () => adapters.candidates(options.env || process.env))
    : { value: [options.path] };
  const candidates = Array.isArray(discovered.value) ? discovered.value.filter((entry) => typeof entry === 'string') : [];
  const looks = [];
  for (const candidate of candidates) {
    const look = await ask('stat', () => adapters.statFile(candidate));
    looks.push(look.value && look.value.exists === true ? look.value : { exists: false });
  }
  report.candidates = candidates.map((candidate, index) => ({ path: candidate, exists: looks[index].exists }));
  const chosen = looks.findIndex((look) => look.exists);
  if (chosen < 0) {
    add('EDGE_NOT_FOUND', `no msedge.exe at ${candidates.length} candidate location(s)`);
    return conclude();
  }
  const target = candidates[chosen];
  report.path = target;
  if (looks[chosen].isFile !== true) {
    add('EDGE_NOT_A_FILE', `${target} is not a regular file`);
    return conclude();
  }

  const [hash, signature, version] = await Promise.all([
    ask('sha256', () => adapters.sha256(target)),
    ask('signature', () => adapters.signature(target)),
    ask('fileVersion', () => adapters.fileVersion(target)),
  ]);
  judgeHash(hash, report, add);
  judgeSignature(signature, report, add);
  judgeVersion(version, majors, report, add);

  const after = await ask('stat', () => adapters.statFile(target));
  const last = after.value;
  if (!(last && last.exists === true && last.isFile === true
      && last.size === looks[chosen].size && last.mtimeMs === looks[chosen].mtimeMs)) {
    add('EDGE_CHANGED_DURING_CHECK', `${target} changed while it was being checked`);
  }
  return conclude();
}

module.exports = { qualifyEdge, REQUIRED_ORGANIZATION };

if (require.main === module) {
  require('./cli.cjs').main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
