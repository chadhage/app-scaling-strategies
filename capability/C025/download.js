(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'C025Download', { value: factory() });
}(globalThis, function () {
  'use strict';

  const MAX_BYTES = 8192;
  const MAX_ATTEMPTS = 64;

  class DownloadError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }

  function fail(code, message) { throw new DownloadError(code, message); }
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function validateManifest(input) {
    let value;
    try { value = JSON.parse(JSON.stringify(input)); }
    catch { fail('INVALID_MANIFEST', 'The pinned manifest must be JSON data.'); }
    if (!value || value.apiContract !== 'ranged-download/1' || value.dataKind !== 'synthetic' ||
        value.localOnly !== true || !/^synthetic-\d{3}$/.test(value.profileId || '') ||
        !['r1', 'r2'].includes(value.artifactVersion) ||
        value.artifactId !== `C025:${value.profileId}:${value.artifactVersion}` ||
        !Number.isSafeInteger(value.byteLength) || value.byteLength < 1 || value.byteLength > MAX_BYTES ||
        !/^[a-f0-9]{64}$/.test(value.sha256 || '') || value.etag !== `"sha256-${value.sha256}"` ||
        value.lineage?.cardId !== 'C020' || value.lineage.apiContract !== 'getProfile/1' ||
        value.lineage.profileId !== value.profileId || value.lineage.stamp?.dataKind !== 'synthetic' ||
        typeof value.lineage.stamp.deploymentStamp !== 'string' ||
        !value.lineage.stamp.deploymentStamp || value.lineage.stamp.deploymentStamp.length > 100) {
      fail('INVALID_MANIFEST', 'Explicit bounded synthetic identity, strong hash/ETag and C020 lineage are required.');
    }
    return freeze(value);
  }

  function requestBounds(text, total) {
    const match = typeof text === 'string' && text.length <= 100 && /^bytes=(\d*)-(\d*)$/.exec(text);
    if (!match || (!match[1] && !match[2])) fail('REQUEST_RANGE_MISMATCH', 'The request was not a supported single bytes range.');
    const start = match[1] ? Number(match[1]) : null;
    const end = match[2] ? Number(match[2]) : null;
    if ((start !== null && (!Number.isSafeInteger(start) || start >= total)) ||
        (end !== null && !Number.isSafeInteger(end)) ||
        (start !== null && end !== null && start > end) || (start === null && end === 0)) {
      fail('REQUEST_RANGE_MISMATCH', 'The response cannot satisfy the recorded request.');
    }
    return {
      start: start === null ? Math.max(0, total - end) : start,
      end: start === null || end === null ? total - 1 : Math.min(end, total - 1)
    };
  }

  async function sha256(bytes) {
    if (!globalThis.crypto?.subtle) fail('HASH_UNKNOWN', 'SHA-256 is unavailable; complete bytes are not a verified artifact.');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  class DownloadSession {
    #manifest;
    #bytes;
    #seen;
    #events = [];
    #digest = null;
    #verification = 'incomplete';
    #busy = false;
    #limited = false;

    constructor(manifest) {
      this.#manifest = validateManifest(manifest);
      this.#bytes = new Uint8Array(this.#manifest.byteLength);
      this.#seen = new Uint8Array(this.#manifest.byteLength);
    }

    #append(event) {
      this.#events.push(freeze({ attempt: this.#events.length + 1, ...event }));
      return this.#events.length - 1;
    }

    #atLimit() {
      if (this.#events.length < MAX_ATTEMPTS) return false;
      if (!this.#limited) {
        this.#append({ outcome: 'rejected', code: 'ATTEMPT_LIMIT', message: 'Reset explicitly before further attempts; existing bytes and failures are retained.' });
        this.#limited = true;
      }
      return true;
    }

    recordFailure(code, message, outcome = 'rejected', details = {}) {
      if (!this.#atLimit()) {
        this.#append({
          requestedRange: String(details.requestedRange || '').slice(0, 100),
          httpStatus: details.httpStatus ?? null, outcome: outcome === 'unknown' ? 'unknown' : 'rejected',
          code: String(code).slice(0, 80), message: String(message).slice(0, 240),
          contentRange: String(details.contentRange || '').slice(0, 100),
          etag: String(details.etag || '').slice(0, 100), newBytes: 0
        });
      }
      return this.snapshot();
    }

    async observe(observation) {
      if (this.#atLimit()) return this.snapshot();
      if (this.#busy) return this.recordFailure('IN_FLIGHT', 'A range observation is already pending.');
      this.#busy = true;
      const details = {
        requestedRange: observation?.requestedRange, httpStatus: observation?.status,
        contentRange: observation?.headers?.['content-range'], etag: observation?.headers?.etag
      };
      let acceptedIndex = null;
      try {
        if (observation?.status !== 206) {
          fail(`HTTP_${observation?.status ?? 'UNKNOWN'}`, 'Only 206 partial content can be appended; a 200 replacement is never mixed into a pinned assembly.');
        }
        const headers = observation.headers || {};
        const manifest = this.#manifest;
        if (headers.etag !== manifest.etag ||
            headers['x-c025-artifact-id'] !== manifest.artifactId ||
            headers['x-c025-artifact-version'] !== manifest.artifactVersion ||
            headers['x-c020-deployment-stamp'] !== manifest.lineage.stamp.deploymentStamp) {
          fail('ARTIFACT_CHANGED', 'ETag, identity, version or C020 lineage differs from the pinned original.');
        }
        if (headers['accept-ranges'] !== 'bytes' || headers['content-type'] !== 'application/octet-stream' ||
            (headers['content-encoding'] && headers['content-encoding'] !== 'identity')) {
          fail('INVALID_REPRESENTATION', 'Only unencoded binary bytes with explicit range support are accepted.');
        }
        const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(headers['content-range'] || '');
        if (!match) fail('INVALID_CONTENT_RANGE', 'A single exact Content-Range is required.');
        const [start, end, total] = match.slice(1).map(Number);
        if (![start, end, total].every(Number.isSafeInteger) || start > end || end >= total ||
            total !== manifest.byteLength) {
          fail('INVALID_CONTENT_RANGE', 'The interval or original total is inconsistent with the pinned artifact.');
        }
        const expected = requestBounds(observation.requestedRange, total);
        if (start !== expected.start || end !== expected.end) fail('REQUEST_RANGE_MISMATCH', 'The returned interval does not match the recorded request.');
        const bytes = observation.bytes;
        if (!(bytes instanceof Uint8Array) || bytes.byteLength !== end - start + 1 ||
            headers['content-length'] !== String(bytes.byteLength)) {
          fail('LENGTH_MISMATCH', 'Actual body bytes, declared length and accepted interval must agree.');
        }
        for (let i = 0; i < bytes.length; i++) {
          if (this.#seen[start + i] && this.#bytes[start + i] !== bytes[i]) {
            fail('OVERLAP_CONFLICT', 'An overlap disagrees with already accepted bytes; no part of this response was accepted.');
          }
        }
        let newBytes = 0;
        for (let i = 0; i < bytes.length; i++) {
          if (!this.#seen[start + i]) newBytes++;
          this.#bytes[start + i] = bytes[i];
          this.#seen[start + i] = 1;
        }
        acceptedIndex = this.#append({
          ...details, outcome: 'accepted', code: 'RANGE_ACCEPTED',
          acceptedRange: { start, end }, bodyBytes: bytes.length, newBytes
        });
        if (this.#seen.every((value) => value === 1)) {
          this.#digest = await sha256(this.#bytes.slice());
          if (this.#digest !== manifest.sha256) {
            this.#verification = 'hash-mismatch';
            fail('HASH_MISMATCH', 'Complete coverage has the wrong SHA-256. Reset is required; these bytes are not the original.');
          }
          this.#verification = 'verified';
        }
      } catch (error) {
        const code = String(error.code || 'OBSERVATION_UNKNOWN').slice(0, 80);
        const message = String(error.message || 'Observation failed.').slice(0, 240);
        const outcome = code === 'HASH_UNKNOWN' || !(error instanceof DownloadError) ? 'unknown' : 'rejected';
        if (acceptedIndex !== null) {
          // Hashing completes the same HTTP attempt; the attempt cap must not hide its failure.
          this.#events[acceptedIndex] = freeze({ ...this.#events[acceptedIndex], outcome, code, message });
        } else this.recordFailure(code, message, outcome, details);
      } finally {
        this.#busy = false;
      }
      return this.snapshot();
    }

    snapshot() {
      const ranges = [];
      let acceptedBytes = 0;
      let cursor = null;
      for (let i = 0; i < this.#seen.length; i++) {
        if (!this.#seen[i]) { if (cursor === null) cursor = i; continue; }
        const start = i;
        while (i + 1 < this.#seen.length && this.#seen[i + 1]) i++;
        ranges.push({ start, end: i });
        acceptedBytes += i - start + 1;
      }
      const failures = this.#events.filter((event) => event.outcome !== 'accepted').length;
      const last = this.#events.at(-1);
      const outcome = last?.outcome === 'rejected' || last?.outcome === 'unknown' ? last.outcome :
        this.#verification === 'verified' ? (failures ? 'verified-with-failures' : 'verified') : 'incomplete';
      return freeze({
        manifest: this.#manifest, outcome, verification: this.#verification,
        acceptedBytes, totalBytes: this.#seen.length, cursor, ranges,
        expectedSha256: this.#manifest.sha256, assembledSha256: this.#digest,
        failures, attempts: this.#events.slice(), lastAttempt: last || null,
        attemptLimitReached: this.#limited, pending: this.#busy
      });
    }

    verifiedBytes() {
      if (this.#verification !== 'verified') fail('NOT_VERIFIED', 'Incomplete, unknown or mismatched bytes are not a verified artifact.');
      return this.#bytes.slice();
    }
  }

  return Object.freeze({ DownloadSession, DownloadError, validateManifest, sha256, MAX_BYTES, MAX_ATTEMPTS });
}));
