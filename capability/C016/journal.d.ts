import type { CommandResult, CommandIdentity } from './commands.cjs';

export interface ObservedAttempt {
  readonly schemaVersion: 1;
  readonly attempt: number;
  readonly process: { readonly pid: number; readonly exitCode: number; readonly stdout: string; readonly stderr: string };
  readonly result: CommandResult;
}
export interface GuardedJournal {
  readonly schemaVersion: 1;
  readonly entries: ReadonlyArray<ObservedAttempt>;
  readonly observedEpoch: 1 | 2 | 3 | null;
  readonly originalUserImpact: 'positive' | 'negative' | 'unknown' | 'not-observed';
  readonly latestOutcome: GuardedJournal['originalUserImpact'];
  readonly unknownAttempts: ReadonlyArray<number>;
  readonly filesystemOperationNow: false;
}
export const limit: 8;
export function validateIdentity(command: CommandIdentity): void;
export function replay(entries: ReadonlyArray<ObservedAttempt>): GuardedJournal;
export function append(journal: GuardedJournal, entry: ObservedAttempt): GuardedJournal;
