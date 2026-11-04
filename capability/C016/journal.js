(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'C016Journal', { value: factory() });
}(globalThis, function () {
  'use strict';

  const outcomes = ['positive', 'negative', 'unknown'];
  const recoveries = ['none', 'correct-closed-command', 'inspect-and-declare-next',
    'inspect-and-retry-identical', 'operator-review-no-marker-reclamation'];
  const ids = ['synthetic-run-001', 'synthetic-run-002'];
  const known = [
    [
      ['5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca', 'bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57'],
      ['4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6', '789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b'],
      ['3a39ca1a91489054dd38231cc34e78734e11ef148111bd9824e31851eda5512b', '66f2593752364d65b37d145cf9b784e09dc86867643766bd9f14f8c7d0f1f135'],
    ],
    [
      ['81b39523c4b45b3c01ff24e641af5f03ca5334ee126844af2cd97fc244dafd4c', '76e4c0ec75225e33704c6228be4d24f76a5fc3bbb4d0cb8bc7551943d8952330'],
      ['205bc96964ccd0db9cbbd1365b95524081caaceafa9bd4ea120f6f0cea718f8f', 'e4eaf2b69c1debe1fc70077ca718fca38c179dd86c044fce52fe9f28677bd7c5'],
      ['a25f8f6398bf4384feab99053e766bec4bb8cd8c604f549b9c755ea7d08527ba', '958567aaf50a9a48c7d59d833cc8d38b066ad4d124202efa7374b0c2a78b731f'],
    ],
  ];
  const hash = /^[0-9a-f]{64}$/;
  const resultKeys = ['schemaVersion', 'cardId', 'mode', 'namespace', 'pid', 'commandId', 'command',
    'outcome', 'disposition', 'code', 'publicationPerformed', 'acknowledgment', 'observation', 'errors', 'allowedRecovery'];

  function reject(message) { throw new Error(`JOURNAL_INVALID: ${message}`); }
  function record(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))) reject('Expected a closed plain record.');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== keys.length || keys.some((key) =>
      !Object.hasOwn(descriptors, key) || !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable)) {
      reject('Missing, extra, hidden or accessor fields.');
    }
  }
  function integer(value, min, max) {
    if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < min || value > max) reject('Unsafe or out-of-range integer.');
  }
  function text(value, max = 256) {
    if (typeof value !== 'string' || value.length > max) reject('Missing or oversized string.');
  }
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function identity(command) {
    record(command, ['commandId', 'kind', 'runId', 'expectedEpoch', 'epoch', 'stateSha256']);
    integer(command.expectedEpoch, 0, 2);
    if (command.epoch !== command.expectedEpoch + 1 || !ids.includes(command.runId) ||
        command.kind !== ['submit', 'advance', 'finish'][command.expectedEpoch] ||
        !hash.test(command.stateSha256) || !/^C016-[0-9a-f]{64}$/.test(command.commandId)) reject('Invalid closed command identity.');
    const declared = known[ids.indexOf(command.runId)][command.expectedEpoch];
    if (command.commandId !== `C016-${declared[0]}` || command.stateSha256 !== declared[1]) reject('Unknown command/payload digest, not one of the six declared C015 synthetic commands.');
  }
  function validate(entry, index) {
    record(entry, ['schemaVersion', 'attempt', 'process', 'result']);
    if (entry.schemaVersion !== 1 || entry.attempt !== index + 1) reject('Attempt sequence or version mismatch.');
    const process = entry.process;
    record(process, ['pid', 'exitCode', 'stdout', 'stderr']);
    integer(process.pid, 1, Number.MAX_SAFE_INTEGER);
    integer(process.exitCode, 0, 255);
    text(process.stdout, 65536);
    text(process.stderr, 65536);
    const result = entry.result;
    record(result, resultKeys);
    if (result.schemaVersion !== 1 || result.cardId !== 'C016' || result.mode !== 'actual-local-filesystem-command' ||
        !/^test-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(result.namespace) ||
        result.pid !== process.pid || !outcomes.includes(result.outcome) || !recoveries.includes(result.allowedRecovery)) {
      reject('Result scope, process, outcome or recovery mismatch.');
    }
    if (result.command) identity(result.command);
    if (result.commandId !== (result.command?.commandId || null)) reject('Declared/result command identity mismatch.');
    text(result.code);
    if (!Array.isArray(result.errors) || result.errors.length > 8) reject('Errors must be bounded.');
    for (const error of result.errors) {
      record(error, ['code', 'message']);
      text(error.code);
      text(error.message, 2048);
    }
    if (result.outcome === 'positive') {
      if (!result.command || !['published', 'idempotent-confirmed'].includes(result.disposition) ||
          result.publicationPerformed !== (result.disposition === 'published') || process.exitCode !== 0) {
        reject('Positive outcome must be a received publication or observed idempotent result.');
      }
      record(result.observation, ['source', 'observedEpoch', 'matchedEpoch', 'stateSha256', 'history']);
      const seen = result.observation;
      integer(seen.observedEpoch, result.command.epoch, 3);
      if (seen.matchedEpoch !== result.command.epoch || seen.stateSha256 !== result.command.stateSha256 ||
          seen.source !== (result.disposition === 'published' ? 'C015.persist' : 'C015.restore') ||
          !Array.isArray(seen.history) || seen.history.length < 1 || seen.history.length > 3) reject('Observation mismatch.');
      if ((seen.source === 'C015.persist' && (result.code !== 'LOCAL_PUBLISHED' || !result.acknowledgment ||
          seen.observedEpoch !== result.command.epoch || seen.history.length !== 1)) ||
          (seen.source === 'C015.restore' && seen.history.length !== seen.observedEpoch)) reject('Publication receipt or complete restored history required.');
      let previous = 0;
      for (const item of seen.history) {
        record(item, ['epoch', 'stateSha256']);
        integer(item.epoch, previous + 1, 3);
        if (seen.source === 'C015.restore' && item.epoch !== previous + 1) reject('Restored history must be contiguous.');
        if (item.stateSha256 !== known[ids.indexOf(result.command.runId)][item.epoch - 1][1]) reject('Unknown observed synthetic digest.');
        previous = item.epoch;
      }
      if (previous !== seen.observedEpoch) reject('Latest observed epoch is not in the retained history.');
      if (!seen.history.some((item) => item.epoch === seen.matchedEpoch && item.stateSha256 === seen.stateSha256)) reject('Matching observed history is required.');
      if (result.acknowledgment) {
        const ack = result.acknowledgment;
        record(ack, ['schemaVersion', 'kind', 'runId', 'epoch', 'stateSha256', 'regularFileFlushed', 'published']);
        if (ack.schemaVersion !== 1 || ack.kind !== 'local-file-write-receipt' || ack.runId !== result.command.runId ||
            ack.epoch !== result.command.epoch || ack.stateSha256 !== result.command.stateSha256 ||
            ack.regularFileFlushed !== true || ack.published !== true || seen.observedEpoch !== ack.epoch) reject('Matching acknowledgment required.');
        if (result.disposition === 'idempotent-confirmed' && result.code !== 'MATCHING_LOCAL_ACK') reject('Matching restore acknowledgment code required.');
      } else if (result.code !== 'MATCHING_VERIFIED_HISTORY' || seen.observedEpoch <= result.command.epoch) {
        reject('No success-shaped receipt may be invented for unobserved or older state.');
      }
    } else if (result.acknowledgment !== null || result.observation !== null ||
        (result.outcome === 'negative' && (result.disposition !== 'rejected' || result.publicationPerformed !== false)) ||
        (result.outcome === 'unknown' && (result.disposition !== 'unconfirmed' || ![false, null].includes(result.publicationPerformed)))) {
      reject('A negative/unknown attempt cannot contain a receipt or positive observation.');
    }
    if (process.exitCode === 0) {
      let parsed;
      try { parsed = JSON.parse(process.stdout); } catch { reject('Received result is not JSON.'); }
      if (JSON.stringify(parsed) !== JSON.stringify(result)) reject('Received stdout/result mismatch.');
    } else {
      if (result.outcome !== 'unknown' || !process.stderr || process.stdout !== '') reject('Unreceived attempts must retain their original unknown outcome and streams.');
      let failed;
      try { failed = JSON.parse(process.stderr.trim().split(/\r?\n/).at(-1)); } catch { reject('Original unreceived stderr is not a closed worker observation.'); }
      if (failed.code !== result.code || failed.pid !== process.pid || failed.acknowledged !== false) reject('Original unreceived stderr must match without a success receipt.');
    }
  }

  function replay(entries) {
    if (!Array.isArray(entries) || entries.length > 8) reject('Journal has an eight-attempt bound.');
    entries.forEach(validate);
    const copy = JSON.parse(JSON.stringify(entries));
    const positives = copy.filter((entry) => entry.result.outcome === 'positive');
    return freeze({
      schemaVersion: 1, entries: copy,
      observedEpoch: positives.length ? positives.at(-1).result.observation.observedEpoch : null,
      originalUserImpact: copy[0]?.result.outcome || 'not-observed',
      latestOutcome: copy.at(-1)?.result.outcome || 'not-observed',
      unknownAttempts: copy.filter((entry) => entry.result.outcome === 'unknown').map((entry) => entry.attempt),
      filesystemOperationNow: false,
    });
  }

  function append(journal, entry) {
    record(journal, ['schemaVersion', 'entries', 'observedEpoch', 'originalUserImpact', 'latestOutcome', 'unknownAttempts', 'filesystemOperationNow']);
    const before = replay(journal.entries);
    if (JSON.stringify(before) !== JSON.stringify(journal)) reject('Journal projection was changed.');
    return replay([...journal.entries, entry]);
  }

  return Object.freeze({ replay, append, validateIdentity: identity, limit: 8 });
}));
