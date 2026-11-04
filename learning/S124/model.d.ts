export type Strategy = 'shared-slots' | 'separate-plans';
export type Fixture = 'healthy' | 'overlap' | 'warmup-only' | 'session-loss'
  | 'missing-receipt' | 'pinned-client' | 'dependency-outage' | 'platform-restart' | 'drain-pending';
export type Command = Readonly<{ type: 'compare'; strategy: Strategy; fixture: Fixture }>
  | Readonly<{ type: 'route'; percent: 100 }>
  | Readonly<{ type: 'add-placement' | 'warm' | 'drain' | 'retain' | 'retire' }>;
export type State = Readonly<{ schemaVersion: 1; commands: readonly Command[] }>;
export type Classification = 'neutral' | 'positive' | 'negative' | 'unknown';
export type Phase = 'awaiting-compare' | 'compared' | 'ready' | 'held'
  | 'exposed' | 'exposed-held' | 'retained' | 'retired';
export interface Receipt {
  readonly id: string;
  readonly kind: 'new-admission' | 'existing-work';
  readonly observed: boolean;
  readonly expectedEndpoint: string;
  readonly observedEndpoint: string | null;
  readonly httpStatus: number | null;
  readonly latencyMs: number | null;
  readonly sessionPreserved: boolean | null;
  readonly businessState: string | null;
  readonly effectCount: number | null;
  readonly completed: boolean | null;
  readonly dependencyAvailable: boolean | null;
  readonly classification: Exclude<Classification, 'neutral'>;
  readonly reason: string;
}
export interface HistoryEntry {
  readonly step: number;
  readonly command: Command;
  readonly phase: Phase;
  readonly classification: Classification;
  readonly userOutcome: string;
  readonly message: string;
  readonly attempted: number;
  readonly passed: number;
  readonly failed: number;
  readonly unknown: number;
  readonly observation: Readonly<Record<string, unknown>>;
}
export interface Projection {
  readonly phase: Phase;
  readonly strategy: Strategy | null;
  readonly fixture: Fixture | null;
  readonly planLabels: readonly string[];
  readonly slotLabels: readonly string[];
  readonly planCount: 0 | 1 | 2;
  readonly workers: 0 | 2 | 4;
  readonly totalComputeUnits: 0 | 24 | 48;
  readonly fictionalCostUnits: 0 | 2 | 4;
  readonly placements: 0 | 2 | 3;
  readonly extraPlacement: boolean;
  readonly computeIsolated: boolean;
  readonly independentDependencies: false;
  readonly independentFaultDomains: 'unverified';
  readonly sharedDependency: string;
  readonly lifecycleControl: string;
  readonly warmUp: 'unobserved' | 'passed' | 'failed';
  readonly requestedPercent: 0 | 100;
  readonly effectivePercent: 0 | 100 | null;
  readonly outstandingWork: 0 | 2;
  readonly pinnedSessions: 0 | 1;
  readonly drainComplete: boolean;
  readonly retentionObserved: boolean;
  readonly attempted: number;
  readonly passed: number;
  readonly failed: number;
  readonly unknown: number;
  readonly safeAborts: number;
  readonly classification: Classification;
  readonly userOutcome: string;
  readonly message: string;
  readonly latestData: Readonly<Record<string, unknown>>;
  readonly receipts: readonly Receipt[];
  readonly history: readonly HistoryEntry[];
}
export const BANNER: 'Training rehearsal - synthetic data - not a live Azure result';
export const MAX_ACTIONS: 24;
export const STRATEGIES: readonly Strategy[];
export const FIXTURES: Readonly<Record<Fixture, Readonly<{
  label: string; blueDemand: number; warmDemand: number; initialized: boolean;
}>>>;
export const DATA: Readonly<{
  unitsPerPlan: 24; workersPerPlan: 2; journeyBudgetMs: 500; existingWork: 2;
  dependency: string; expectedState: string; blueEndpoint: string; greenEndpoint: string;
  sharedPlans: readonly string[]; separatePlans: readonly string[];
  sharedSlots: readonly string[]; extraPlacement: string; retentionTick: 1;
}>;
export function initialState(): State;
export function transition(state: State, command: Command): State;
export function project(state: State): Projection;
export function parsePercent(text: string): 100;
