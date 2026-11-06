'use strict';

// Edge qualification (U018): the installed msedge.exe must carry a valid Authenticode signature whose certificate
// subject names Microsoft Corporation as the organization, and its file version must belong to a major listed in
// qualified.json (sealed) or in its append-only, hash-chained addendum qualified.addendum.jsonl (see addendum.cjs). The actual
// version and SHA-256 are recorded, never compared with a historical build or hash.
// Every failure to prove a fact is a failure: the check fails closed. All I/O goes through injectable adapters.
// The module lives in testing\browser\qualify\ (not testing\browser\qualify.cjs): the publisher authorizes only this new directory.
const { organizationOf } = require('./subject.cjs');
const { parseVersion, validateQualifiedMajors } = require('./version.cjs');
const { defaultAdapters, QUALIFIED_FILE } = require('./adapters.cjs');

const REQUIRED_ORGANIZATION = 'Microsoft Corporation';
// One knob drives both waits (options.timeoutMs, QUALIFY_TIMEOUT_MS or --timeout-ms): every adapter call may take that long, and the
// one PowerShell start behind the signature and the file version is ended at 75 percent of it, so the outer bound never fires first.
// A timeout can only make a check fail, never pass.
const DEFAULT_TIMEOUT_MS = 240000;
const MAX_TIMEOUT_MS = 1800000;
const TIMEOUT_ENV = 'QUALIFY_TIMEOUT_MS';
const SHELL_SHARE = 0.75;
const DIGEST = /^[0-9a-f]{64}$/i;

const validMs = (value) => Number.isInteger(value) && value >= 1 && value <= MAX_TIMEOUT_MS;
const timeoutRule = (name) => `${name} must be an integer number of milliseconds from 1 to ${MAX_TIMEOUT_MS}`;

function resolveTimeouts(options = {}, env = process.env) {
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  if (options.timeoutMs !== undefined) {
    if (!validMs(options.timeoutMs)) return { ok: false, error: timeoutRule('options.timeoutMs') };
    timeoutMs = options.timeoutMs;
  } else {
    const key = Object.keys(env).find((name) => name.toLowerCase() === TIMEOUT_ENV.toLowerCase());
    if (key !== undefined) {
      const given = env[key];
      if (typeof given !== 'string' || !/^[1-9]\d*$/.test(given) || !validMs(Number(given))) return { ok: false, error: timeoutRule(TIMEOUT_ENV) };
      timeoutMs = Number(given);
    }
  }
  const explicit = options.shell ? options.shell.timeoutMs : undefined;
  if (explicit !== undefined && !validMs(explicit)) return { ok: false, error: timeoutRule('options.shell.timeoutMs') };
  const own = Math.max(1, Math.floor(timeoutMs * SHELL_SHARE));
  return { ok: true, timeoutMs, shellTimeoutMs: explicit === undefined ? own : Math.min(explicit, own) };
}

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
    qualifiedVia: null,
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
  if (!majors.ok) return;
  if (majors.majors.includes(parsed.major)) {
    report.qualifiedVia = majors.sealed === null || majors.sealed.includes(parsed.major) ? 'sealed' : 'addendum';
  } else {
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
  const report = newReport();
  const findings = [];
  const add = (code, message) => findings.push({ code, message });
  const conclude = () => {
    report.reasons = findings.map((finding) => `${finding.code}: ${finding.message}`);
    report.reasonCodes = findings.map((finding) => finding.code);
    report.ok = findings.length === 0 && report.signature.status === 'Valid'
      && report.signature.publisher === REQUIRED_ORGANIZATION && report.sha256 !== null
      && report.major !== null && report.qualifiedMajors.includes(report.major);
    return report;
  };
  const timeouts = resolveTimeouts(options, options.env || process.env);
  if (!timeouts.ok) {
    add('QUALIFY_TIMEOUT_INVALID', timeouts.error);
    return conclude();
  }
  const timeoutMs = timeouts.timeoutMs;
  const adapters = { ...defaultAdapters({ ...options, shell: { ...options.shell, timeoutMs: timeouts.shellTimeoutMs } }), ...options.adapters };
  const ask = (label, call) => settle(label, timeoutMs, call);

  const clock = await ask('clock', () => new Date(adapters.now()).toISOString());
  report.checkedAtUtc = clock.error ? null : clock.value;

  const listed = await ask('qualified list', () => adapters.readQualified(options.qualifiedPath || QUALIFIED_FILE));
  const majors = listed.error ? { ok: false, error: listed.error.message } : validateQualifiedMajors(listed.value);
  if (majors.ok) {
    report.qualifiedMajors = majors.majors;
    majors.sealed = Array.isArray(listed.value.sealedMajors) ? listed.value.sealedMajors : null;
  } else if (listed.error && listed.error.code === 'QUALIFIED_ADDENDUM_INVALID') {
    add('QUALIFIED_ADDENDUM_INVALID', `qualified.addendum.jsonl cannot be used: ${majors.error}`);
  } else {
    add('QUALIFIED_MAJORS_INVALID', `qualified.json cannot be used: ${majors.error}`);
  }

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

  let changed = false;
  const markChanged = (detail) => {
    if (!changed) add('EDGE_CHANGED_DURING_CHECK', `${target} changed while it was being checked${detail}`);
    changed = true;
  };
  // The digest, the signature and the version come from separate opens of the file. Reading the digest again after the
  // shell answered and requiring equal digests catches a swap that restores size and modification time.
  if (report.sha256 !== null) {
    const first = report.sha256;
    const again = await ask('sha256', () => adapters.sha256(target));
    if (again.error) {
      add(isTimeout(again.error) ? 'SHA256_TIMEOUT' : 'SHA256_UNAVAILABLE', `the second read of the binary failed: ${again.error.message}`);
      report.sha256 = null;
    } else if (typeof again.value !== 'string' || !DIGEST.test(again.value)) {
      add('SHA256_UNAVAILABLE', 'the second read of the binary did not return a SHA-256 digest');
      report.sha256 = null;
    } else if (again.value.toLowerCase() !== first) {
      markChanged(`: the SHA-256 differs between the first read and the read after the signature check (${first} then ${again.value.toLowerCase()})`);
      report.sha256 = null;
    }
  }

  const after = await ask('stat', () => adapters.statFile(target));
  const last = after.value;
  if (!(last && last.exists === true && last.isFile === true
      && last.size === looks[chosen].size && last.mtimeMs === looks[chosen].mtimeMs)) {
    markChanged('');
  }
  return conclude();
}

module.exports = { qualifyEdge, resolveTimeouts, REQUIRED_ORGANIZATION, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, TIMEOUT_ENV };

if (require.main === module) {
  const failed = (error) => {
    process.exitCode = 1;
    try {
      process.stderr.write(`FAIL closed: the check itself failed: ${String(error && error.message !== undefined ? error.message : error).replace(/\s+/g, ' ').trim()}\n`);
    } catch {
      // stderr is broken as well: the exit code still says failure
    }
  };
  try {
    require('./cli.cjs').main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, failed);
  } catch (error) {
    failed(error);
  }
}
