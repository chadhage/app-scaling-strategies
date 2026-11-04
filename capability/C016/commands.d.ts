import type { SyntheticRunId, SyntheticState, Acknowledgment } from '..\\C015\\store.cjs';

export interface LocalCommand {
  readonly schemaVersion: 1;
  readonly kind: 'submit' | 'advance' | 'finish';
  readonly runId: SyntheticRunId;
  readonly expectedEpoch: 0 | 1 | 2;
  readonly candidate: SyntheticState;
}
export interface CommandIdentity {
  readonly commandId: string;
  readonly kind: LocalCommand['kind'];
  readonly runId: SyntheticRunId;
  readonly expectedEpoch: 0 | 1 | 2;
  readonly epoch: 1 | 2 | 3;
  readonly stateSha256: string;
}
export interface LocalObservation {
  readonly source: 'C015.persist' | 'C015.restore';
  readonly observedEpoch: 1 | 2 | 3;
  readonly matchedEpoch: 1 | 2 | 3;
  readonly stateSha256: string;
  readonly history: ReadonlyArray<{ readonly epoch: 1 | 2 | 3; readonly stateSha256: string }>;
}
interface ResultBase {
  readonly schemaVersion: 1;
  readonly cardId: 'C016';
  readonly mode: 'actual-local-filesystem-command';
  readonly namespace: string | null;
  readonly pid: number;
  readonly commandId: string | null;
  readonly command: CommandIdentity | null;
  readonly code: string;
  readonly errors: ReadonlyArray<{ readonly code: string; readonly message: string }>;
  readonly allowedRecovery: 'none' | 'correct-closed-command' | 'inspect-and-declare-next'
    | 'inspect-and-retry-identical' | 'operator-review-no-marker-reclamation';
}
export type CommandResult =
  | (ResultBase & { readonly outcome: 'positive'; readonly disposition: 'published' | 'idempotent-confirmed';
      readonly publicationPerformed: boolean; readonly acknowledgment: Acknowledgment | null;
      readonly observation: LocalObservation })
  | (ResultBase & { readonly outcome: 'negative'; readonly disposition: 'rejected';
      readonly publicationPerformed: false; readonly acknowledgment: null; readonly observation: null })
  | (ResultBase & { readonly outcome: 'unknown'; readonly disposition: 'unconfirmed';
      readonly publicationPerformed: false | null; readonly acknowledgment: null; readonly observation: null });
export function makeCommand(runId: SyntheticRunId, expectedEpoch: 0 | 1 | 2): LocalCommand;
export function describeCommand(command: LocalCommand): CommandIdentity;
export function execute(ownedFreshC015TestUUID: string, command: unknown): Promise<CommandResult>;
