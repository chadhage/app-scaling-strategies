(function () {
  'use strict';

  const { DownloadSession, validateManifest } = globalThis.C025Download;
  const elements = Object.fromEntries([
    'profile', 'version', 'pin', 'range', 'fetch-range', 'resume', 'finish', 'reset',
    'status', 'error', 'target', 'runtime', 'identity', 'etag', 'accepted', 'ranges',
    'cursor', 'original-hash', 'assembly-hash', 'failures', 'manifest', 'observations'
  ].map((id) => [id, document.getElementById(id)]));
  let session = null;
  let ready = false;
  let busy = false;
  let pageEvents = [];
  let pageError = '';

  function target() {
    return { profileId: elements.profile.value, version: elements.version.value };
  }
  function query() { return new URLSearchParams(target()).toString(); }
  function options() {
    return { cache: 'no-store', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(6000) };
  }
  function controlState() {
    const snapshot = session?.snapshot();
    for (const id of ['profile', 'version']) elements[id].disabled = !ready || busy;
    elements.pin.disabled = !ready || busy || Boolean(session);
    elements.range.disabled = !session || busy;
    elements['fetch-range'].disabled = !session || busy || snapshot.attemptLimitReached;
    for (const id of ['resume', 'finish']) {
      elements[id].disabled = !session || busy || snapshot.cursor === null || snapshot.attemptLimitReached;
    }
    elements.reset.disabled = busy || (!ready && !pageEvents.length);
  }
  function render() {
    const snapshot = session?.snapshot();
    const requested = target();
    elements.target.textContent = ready ? `Next request target: ${requested.profileId} / ${requested.version}.` : 'No verified local target available.';
    elements.identity.textContent = snapshot?.manifest.artifactId || 'none';
    elements.etag.textContent = snapshot?.manifest.etag || 'none';
    elements.accepted.textContent = snapshot ? `${snapshot.acceptedBytes} / ${snapshot.totalBytes}` : '0 / unknown';
    elements.ranges.textContent = snapshot?.ranges.length ?
      snapshot.ranges.map(({ start, end }) => `${start}-${end} (${end - start + 1} bytes)`).join(', ') : 'none';
    elements.cursor.textContent = snapshot ?
      (snapshot.cursor === null ? 'none — coverage complete; inspect hash outcome' : String(snapshot.cursor)) :
      'unknown — pin an original first';
    elements['original-hash'].textContent = snapshot?.expectedSha256 || 'unknown';
    elements['assembly-hash'].textContent = snapshot?.assembledSha256 || 'not computed — no exact-byte proof';
    elements.failures.textContent = String((snapshot?.failures || 0) + pageEvents.filter((event) => event.outcome !== 'accepted').length);
    elements.manifest.textContent = JSON.stringify(snapshot?.manifest || null, null, 2);
    elements.observations.textContent = JSON.stringify({ pageEvents, assembly: snapshot || null }, null, 2);
    elements.error.textContent = pageError || (['rejected', 'unknown'].includes(snapshot?.outcome) ?
      `${snapshot.lastAttempt.code}: ${snapshot.lastAttempt.message}` : '');
    if (busy) elements.status.textContent = 'PENDING — waiting for actual HTTP bytes; no new success claimed.';
    else if (pageError) elements.status.textContent = 'UNKNOWN / REJECTED — no new byte verification.';
    else if (!snapshot) elements.status.textContent = 'NOT STARTED — no bytes or hash verified.';
    else if (snapshot.outcome === 'verified') elements.status.textContent = 'BYTES VERIFIED — complete original bytes and real SHA-256 match.';
    else if (snapshot.outcome === 'verified-with-failures') elements.status.textContent = 'BYTES VERIFIED WITH EARLIER FAILURES — exact original bytes; not a clean run.';
    else if (snapshot.outcome === 'rejected') elements.status.textContent = `REJECTED — ${snapshot.lastAttempt.code}; accepted bytes and earlier failures retained.`;
    else if (snapshot.outcome === 'unknown') elements.status.textContent = `UNKNOWN — ${snapshot.lastAttempt.code}; no exact-byte success inferred.`;
    else elements.status.textContent = `INCOMPLETE — ${snapshot.acceptedBytes}/${snapshot.totalBytes} bytes; next missing byte ${snapshot.cursor}.`;
    if (!busy && snapshot && (requested.profileId !== snapshot.manifest.profileId || requested.version !== snapshot.manifest.artifactVersion)) {
      elements.status.textContent += ' TARGET DIFFERS from the pinned original; a new version cannot be appended.';
    }
    controlState();
  }
  async function conduct(action) {
    if (busy) return;
    busy = true;
    pageError = '';
    render();
    try { await action(); }
    catch (error) {
      if (session) session.recordFailure('NETWORK_UNKNOWN', error.message || 'No response observed.', 'unknown');
      else {
        pageError = error.message || 'No response observed.';
        pageEvents.push({ outcome: 'unknown', code: 'MANIFEST_UNKNOWN', message: pageError });
      }
    } finally { busy = false; render(); }
  }
  async function fetchRange(range) {
    const response = await fetch(`/artifact?${query()}`, {
      ...options(), headers: { Range: range, 'If-Range': session.snapshot().manifest.etag }
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    await session.observe({
      requestedRange: range, status: response.status,
      headers: Object.fromEntries(response.headers.entries()), bytes
    });
  }
  async function resumeNext() {
    const snapshot = session.snapshot();
    if (snapshot.cursor === null) return;
    const range = `bytes=${snapshot.cursor}-${Math.min(snapshot.cursor + 1023, snapshot.totalBytes - 1)}`;
    elements.range.value = range;
    await fetchRange(range);
  }

  document.getElementById('pin-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!ready || session) return;
    void conduct(async () => {
      const requested = target();
      const response = await fetch(`/api/manifest?${query()}`, options());
      if (response.status !== 200) throw new Error(`Manifest HTTP ${response.status}; no original was pinned.`);
      const manifest = validateManifest(await response.json());
      if (manifest.profileId !== requested.profileId || manifest.artifactVersion !== requested.version) {
        throw new Error('Manifest identity differs from the explicit request.');
      }
      session = new DownloadSession(manifest);
    });
  });
  elements['fetch-range'].addEventListener('click', () => {
    if (session) void conduct(() => fetchRange(elements.range.value));
  });
  elements.resume.addEventListener('click', () => {
    if (session) void conduct(resumeNext);
  });
  elements.finish.addEventListener('click', () => {
    if (session) void conduct(async () => {
      for (let count = 0; count < 8 && session.snapshot().cursor !== null; count++) {
        await resumeNext();
        if (['rejected', 'unknown'].includes(session.snapshot().outcome)) break;
      }
    });
  });
  elements.reset.addEventListener('click', () => {
    if (busy) return;
    session = null;
    pageEvents = [];
    pageError = '';
    elements.range.value = 'bytes=0-1023';
    render();
    if (ready) elements.pin.focus();
  });
  for (const id of ['profile', 'version']) elements[id].addEventListener('change', render);

  async function initialize() {
    try {
      const response = await fetch('/api/catalog', options());
      if (response.status !== 200) throw new Error(`Catalog HTTP ${response.status}.`);
      const catalog = await response.json();
      if (catalog.cardId !== 'C025' || catalog.dataKind !== 'synthetic' || catalog.localOnly !== true ||
          catalog.nativeTargetQualified !== false || catalog.productionRuntimeValidated !== false ||
          catalog.durableStorage !== false || catalog.liveAzureRuns !== 0 || catalog.authorizedCloudSpend !== 0 ||
          catalog.lease?.bindAddress !== '127.0.0.1' || !Number.isSafeInteger(catalog.lease.lifetimeMs) ||
          catalog.lease.lifetimeMs < 1 || catalog.lease.lifetimeMs > 900000 ||
          !Array.isArray(catalog.profiles) || catalog.profiles.length !== 2 ||
          JSON.stringify(catalog.versions) !== '["r1","r2"]') {
        throw new Error('Local-only scope or bounded listener is unverified; conducting is disabled.');
      }
      for (const profile of catalog.profiles) {
        if (!/^synthetic-\d{3}$/.test(profile.id) || typeof profile.displayName !== 'string') throw new Error('Invalid synthetic catalog.');
        const option = document.createElement('option');
        option.value = profile.id;
        option.textContent = `${profile.id} — ${profile.displayName}`;
        elements.profile.append(option);
      }
      for (const version of catalog.versions) {
        const option = document.createElement('option');
        option.value = version;
        option.textContent = version;
        elements.version.append(option);
      }
      elements.runtime.textContent = `Tooling ${catalog.testRuntime}; not production runtime certification. Listener expires ${catalog.lease.expiresAtUtc} (${catalog.lease.lifetimeMs} ms maximum lifetime).`;
      ready = true;
    } catch (error) {
      pageError = error.message || 'Local fixture is unavailable.';
      pageEvents.push({ outcome: 'unknown', code: 'CATALOG_UNKNOWN', message: pageError });
    }
    render();
  }
  render();
  void initialize();
}());
