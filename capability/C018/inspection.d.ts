import type { RestoreReceipt, SyntheticRunId } from './reader.cjs';

export interface InspectionEntry {
  readonly runId: string | null;
  readonly outcome: 'observed' | 'unknown' | 'hold';
  readonly code: string;
  readonly message: string;
  readonly pid: number | null;
  readonly epoch: number | null;
}
export interface InspectionView {
  readonly status: 'UNKNOWN' | 'READING' | 'OBSERVED' | 'HOLD';
  readonly message: string;
  readonly selectedRunId: string | null;
  readonly current: RestoreReceipt | null;
  readonly journal: ReadonlyArray<InspectionEntry>;
  readonly blocked: boolean;
}
export interface Inspector {
  snapshot(): InspectionView;
  lookup(runId: SyntheticRunId): Promise<InspectionView>;
  reconnect(): Promise<InspectionView>;
  edit(runId: string): InspectionView;
  disconnect(): InspectionView;
  resetDisplay(): InspectionView;
}
export const maximumJournalEntries: 64;
export function checkObservation(receipt: unknown, runId: SyntheticRunId): RestoreReceipt;
export function createInspector(read: (runId: SyntheticRunId) => Promise<RestoreReceipt>,
  onChange?: (view: InspectionView) => void): Inspector;
