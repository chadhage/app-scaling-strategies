import type { RestoreReceipt, SyntheticRunId, FixtureNamespace } from './reader.cjs';
import type { FieldError } from '..\\C002\\validator.js';

export function readFresh(namespace: FixtureNamespace, runId: SyntheticRunId): Promise<RestoreReceipt>;
export class ReaderError extends Error {
  readonly code: string;
  readonly details: ReadonlyArray<Partial<FieldError>>;
  readonly pid: number | null;
  constructor(code: string, message: string, details?: ReadonlyArray<Partial<FieldError>>, pid?: number | null);
}
