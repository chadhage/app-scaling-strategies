export type Condition = 'forced' | 'orderly' | 'gap';
export type UserImpact = 'interrupted' | 'uninterrupted' | 'unverified';
export type Verification = 'pass' | 'fail' | 'unknown';
export type Phase = 'ready' | 'active' | 'observed' | 'checked';
export interface Input {
  readonly condition: Condition;
  readonly prediction: UserImpact;
}
export type Action = { readonly type: 'start'; readonly input: Input }
  | { readonly type: 'observe' | 'check' | 'reset' };
export interface Work {
  readonly id: 'request-1' | 'request-2' | 'job-1' | 'job-2';
  readonly kind: 'request' | 'job';
  readonly fromEpoch: 'old-v1';
  readonly attemptedTransition: true;
  readonly observedEpoch: 'old-v1' | 'new-v2' | null;
  readonly completed: boolean | null;
  readonly elapsedMs: number | null;
  readonly effectCount: number | null;
  readonly attempts: number | null;
  readonly terminationRecorded: boolean;
  readonly outcome: 'interrupted' | 'uninterrupted' | 'unknown';
}
export interface Metrics {
  readonly attempted: number;
  readonly uninterrupted: number;
  readonly interrupted: number;
  readonly unknown: number;
  readonly lost: number;
  readonly retried: number;
  readonly duplicated: number;
  readonly unresolved: number;
  readonly late: number;
  readonly confirmedSuccessFraction: string;
}
export interface Result extends Metrics {
  readonly userImpact: UserImpact;
  readonly predictionMatched: boolean | null;
  readonly verification: Verification;
  readonly accountingComplete: boolean;
  readonly observationsComplete: boolean;
  readonly expectedInterruptionObserved: boolean;
  readonly successfulSyntheticMigration: boolean;
  readonly cleanup: 'not-applicable-data-only';
  readonly reason: string;
}
export interface Run {
  readonly id: number;
  readonly input: Input;
  readonly stage: 'active' | 'observed' | 'checked' | 'cancelled';
  readonly observation: 'pending' | 'captured';
  readonly work: readonly Work[];
  readonly trace: readonly string[];
  readonly result: Result | null;
}
export interface State {
  readonly schemaVersion: 1;
  readonly phase: Phase;
  readonly currentRunId: number | null;
  readonly history: readonly Run[];
}
export interface Totals extends Metrics {
  readonly rehearsals: number;
  readonly cancelled: number;
}
export const LIMITS: Readonly<{ journeys: 4; budgetMs: 1000; rehearsals: 4 }>;
export const CONDITIONS: readonly Condition[];
export const PREDICTIONS: readonly UserImpact[];
export function createState(): State;
export function transition(state: State, action: Action): State;
export function summarize(state: State): Totals;
