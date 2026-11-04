import type { RunEnvelope, RunEnvelopeLimits, FieldError } from '..\\C002\\validator.js';

export type SyntheticRunId = 'synthetic-run-001' | 'synthetic-run-002';
export type SyntheticEpoch = 1 | 2 | 3;
export interface SyntheticState {
  readonly schemaVersion: 1;
  readonly cardId: 'C015';
  readonly dataKind: 'closed-synthetic-fixture';
  readonly runId: SyntheticRunId;
  readonly epoch: SyntheticEpoch;
  readonly envelope: RunEnvelope;
  readonly limits: RunEnvelopeLimits;
  readonly record: {
    readonly status: 'prepared' | 'running' | 'completed';
    readonly completedStep: 'prepare' | 'advance' | 'finish';
    readonly pendingStep: 'advance' | 'finish' | 'none';
    readonly acknowledgedUnits: SyntheticEpoch;
  };
}
export interface Acknowledgment {
  readonly schemaVersion: 1;
  readonly kind: 'local-file-write-receipt';
  readonly runId: SyntheticRunId;
  readonly epoch: SyntheticEpoch;
  readonly stateSha256: string;
  readonly regularFileFlushed: true;
  readonly published: true;
}
export interface PersistedFile {
  readonly formatVersion: 1;
  readonly state: SyntheticState;
  readonly previousStateSha256: string | null;
  readonly stateSha256: string;
  readonly acknowledgment: Acknowledgment;
}
interface LocalResult {
  readonly schemaVersion: 1;
  readonly mode: 'actual-local-filesystem';
  readonly namespace: string;
  readonly pid: number;
  readonly state: SyntheticState;
  readonly acknowledgment: Acknowledgment;
  readonly stateSha256: string;
  readonly directoryDurability: 'not-guaranteed';
  readonly powerLossGuarantee: false;
}
export interface WriteReceipt extends LocalResult {
  readonly acknowledged: true;
  readonly regularFileFlushes: 2;
  readonly publish: 'same-directory-rename';
}
export interface RestoreReceipt extends LocalResult {
  readonly restored: true;
  readonly history: ReadonlyArray<{ readonly epoch: SyntheticEpoch; readonly stateSha256: string }>;
  readonly source: 'read-and-verified-immutable-files';
  readonly writesPerformed: 0;
}
export interface C015FixtureError extends Error {
  readonly code: string;
  readonly details: ReadonlyArray<Partial<FieldError>>;
}
export function persist(namespace: string, candidate: unknown,
  options?: { readonly testFault: 'after-partial-write' | 'after-flush' | 'after-publish' }): Promise<WriteReceipt>;
export function restore(namespace: string, runId: SyntheticRunId): Promise<RestoreReceipt>;
