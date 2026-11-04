import type { RestoreReceipt, SyntheticRunId, C015FixtureError } from '..\\C015\\store.cjs';

export type { RestoreReceipt, SyntheticRunId, C015FixtureError };
export type FixtureNamespace = 'synthetic-restart-v1' | `test-${string}`;

export function reopen(namespace: FixtureNamespace, runId: SyntheticRunId): Promise<RestoreReceipt>;
