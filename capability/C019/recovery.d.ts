import type { Acknowledgment, SyntheticRunId, SyntheticEpoch } from '..\\C015\\store.cjs';

export type C015Code =
  | 'UNKNOWN_FIXTURE_ID' | 'UNKNOWN_RUN_ID' | 'UNKNOWN_EPOCH' | 'INVALID_JSON_DATA'
  | 'CLOSED_SCHEMA' | 'STATE_VERSION_OR_SCOPE' | 'INVALID_ENVELOPE' | 'NON_SYNTHETIC_STATE'
  | 'INVALID_ARGUMENTS' | 'TEST_FAULT_SCOPE' | 'LOCAL_CONSENT_REQUIRED' | 'C001_CONSENT_DENIED'
  | 'SCOPED_C015_APPROVAL_REQUIRED' | 'SCOPED_C015_APPROVAL_DRIFT'
  | 'CURRENT_CONSENT_UNAVAILABLE' | 'CURRENT_CONSENT_INVALID' | 'FILE_VERSION'
  | 'STATE_DIGEST' | 'HISTORY_CHAIN' | 'ACKNOWLEDGMENT_MISMATCH' | 'INVALID_UTF8'
  | 'CORRUPT_JSON' | 'UNEXPECTED_FILE' | 'STATE_OVERSIZE' | 'STATE_CHANGED_DURING_READ'
  | 'HISTORY_GAP' | 'EPOCH_IDENTITY' | 'PUBLISH_VERIFICATION' | 'PATH_SCOPE'
  | 'UNSAFE_PATH' | 'UNSAFE_FILE' | 'STORAGE_ERROR' | 'PUBLISH_EXISTS'
  | 'WRITE_INCOMPLETE' | 'STATE_MISSING' | 'HOLD_UNOBSERVED' | 'STALE_EPOCH';
export type RecoveryAction = 'reinspect' | 'confirm-operator-review' | 'stop';
export type NoticeCode =
  | 'NO_OBSERVATION' | 'FAILURE_OBSERVED' | 'HOLD_OBSERVED' | 'INVALID_OBSERVATION'
  | 'ACTION_NOT_ALLOWED' | 'STALE_ACTION' | 'CONTEXT_MISMATCH' | 'READ_LIMIT'
  | 'INVALID_REINSPECTION' | 'HISTORICAL_REINSPECTION' | 'READ_DATA_NOT_RECOVERY'
  | 'READ_ERROR_RETAINED' | 'REVIEW_NEEDED_CONFIRMED' | 'STOPPED' | 'VIEW_RESET'
  | 'UNKNOWN_SELECTION' | 'SELECTION_CHANGED' | 'HISTORY_LIMIT';
export interface PendingContext {
  readonly runId: SyntheticRunId | null;
  readonly epoch: SyntheticEpoch | null;
  readonly pendingStep: 'advance' | 'finish' | 'none' | null;
}
export interface TypedFailure {
  readonly schemaVersion: 1;
  readonly kind: 'C019-typed-failure';
  readonly error:
    | { readonly source: 'C015'; readonly name: 'C015FixtureError'; readonly code: C015Code }
    | { readonly source: 'C019'; readonly name: null; readonly code: 'UNRECOGNIZED_ERROR' };
  readonly context: PendingContext;
  readonly priorAcknowledgment: Acknowledgment | null;
  readonly provenance: 'actual-C015-API' | 'actual-C015-process';
}
export interface ReadData {
  readonly schemaVersion: 1;
  readonly kind: 'C019-read-data';
  readonly provenance: 'actual-C015-API';
  readonly acknowledgment: Acknowledgment;
  readonly writesPerformed: 0;
  readonly recoveryConfirmed: false;
}
export interface HistoryEntry {
  readonly sequence: number;
  readonly code: NoticeCode;
  readonly action: RecoveryAction | null;
  readonly accepted: boolean;
  readonly mode: 'historical-teaching' | 'actual-read-only';
  readonly status: ConsoleState['status'];
  readonly failure: TypedFailure | null;
  readonly inspection: TypedFailure | ReadData | null;
  readonly recoveryConfirmed: false;
  readonly writesAuthorized: false;
}
export interface ConsoleState {
  readonly schemaVersion: 1;
  readonly status: 'uninspected' | 'rejected' | 'failed' | 'held-unobserved' | 'stopped';
  readonly mode: 'historical-teaching' | 'actual-read-only';
  readonly failure: TypedFailure | null;
  readonly unknownContext: { readonly runId: boolean; readonly epoch: boolean; readonly pendingStep: boolean };
  readonly operatorReviewNeeded: boolean;
  readonly operatorReviewAcknowledged: boolean;
  readonly inspectionCount: number;
  readonly lastInspection: TypedFailure | ReadData | null;
  readonly actions: ReadonlyArray<RecoveryAction>;
  readonly recoveryConfirmed: false;
  readonly writesAuthorized: false;
  readonly revision: number;
  readonly history: ReadonlyArray<HistoryEntry>;
  readonly notification: { readonly code: NoticeCode; readonly message: string };
}
export interface Decision {
  readonly accepted: boolean;
  readonly code: NoticeCode;
  readonly state: ConsoleState;
}
export class RecoveryConsole {
  constructor(mode?: 'historical-teaching' | 'actual-read-only');
  readonly state: ConsoleState;
  observe(observation: unknown): Decision;
  dispatch(action: unknown, exactCurrentRevision: unknown, inspection?: unknown): Decision;
  reject(code: 'UNKNOWN_SELECTION' | 'SELECTION_CHANGED' | 'INVALID_OBSERVATION'): Decision;
  resetView(): Decision;
}
export const historyLimit: 48;
export const inspectionLimit: 3;
