import type { RunEnvelope, RunEnvelopeLimits, RunEnvelopeRequest, FieldError } from '../C002/validator';
import type { MatrixRow, MatrixSource, CapabilityMatrix } from '../C003/matrix-contract';

export interface NoPrice {
  readonly status: 'not-applicable' | 'missing' | 'unknown';
  readonly currency: null;
  readonly totalMinorUnits: null;
  readonly basis: string;
  readonly source: null;
}

export interface UnverifiedEstimate {
  readonly status: 'unverified-estimate';
  readonly currency: string;
  /** Positive safe integer; currency precision, coverage and freshness are not verified. */
  readonly totalMinorUnits: number;
  readonly basis: string;
  readonly source: {
    readonly reference: string;
    readonly capturedAtUtc: string;
    readonly configurationId: string;
  };
}

interface RequestBase {
  readonly schemaVersion: 1;
  readonly envelopeRequest: RunEnvelopeRequest;
  readonly durationBasis: string;
}

/** Closed records at runtime. No values or limits are defaulted. */
export type PlanRequest = RequestBase & (
  | {
    readonly mode: 'local-resource-free';
    readonly configurationId: null;
    readonly resources: { readonly cloudResourceCount: 0; readonly description: string };
    readonly pricing: NoPrice;
  }
  | {
    readonly mode: 'native-proposal';
    readonly configurationId: string;
    readonly resources: { readonly cloudResourceCount: number | null; readonly description: string };
    readonly pricing: (NoPrice & { readonly status: 'missing' | 'unknown' }) | UnverifiedEstimate;
  }
);

export interface LocalPlan {
  readonly schemaVersion: 1;
  readonly scope: 'local-implementation-only';
  readonly mode: PlanRequest['mode'];
  readonly inputFingerprint: string;
  /** Local review only, never execution authority. */
  readonly canAcknowledge: boolean;
  readonly cloudExecutionAuthorized: false;
  readonly executed: false;
  readonly configuration: MatrixRow | null;
  readonly configurationSources: readonly MatrixSource[];
  readonly cost: (NoPrice | UnverifiedEstimate) & { readonly notice: string };
  readonly duration: {
    readonly comparisonSeconds: number;
    readonly suppliedBounds: { readonly min: number; readonly max: number };
    readonly basis: string;
    readonly nativeElapsedSeconds: null;
    readonly notice: string;
  };
  readonly resources: {
    readonly cloudResourceCount: number | null;
    readonly description: string;
    readonly inventoryVerified: false;
    readonly reserved: false;
  };
  readonly load: RunEnvelope['load'];
  readonly capacity: RunEnvelope['capacity'];
  readonly comparisonLimits: RunEnvelopeLimits;
  readonly permissions: CapabilityMatrix['permissions'];
  readonly liveAzureRuns: 0;
  readonly productionRuntimeValidated: false;
  readonly blockers: readonly Readonly<{ path?: string; code: string; message: string }>[];
  readonly provenance: Readonly<Record<string, unknown>>;
  readonly matrixProvenance: CapabilityMatrix['provenance'];
}

/** valid describes data review, not permission to run. A valid plan may be blocked. */
export type PlanResult =
  | {
    readonly valid: true;
    readonly outcome: 'local-review-ready' | 'blocked-plan';
    readonly executed: false;
    readonly errors: readonly FieldError[];
    readonly plan: LocalPlan;
  }
  | {
    readonly valid: false;
    readonly outcome: 'invalid-plan';
    readonly executed: false;
    readonly errors: readonly FieldError[];
    readonly plan: null;
  };

export interface LocalAcknowledgement {
  readonly scope: 'local-plan-review-only';
  readonly inputFingerprint: string;
  readonly revision: number;
  readonly acknowledgedAtUtc: string;
  readonly cloudExecutionAuthorized: false;
  readonly executed: false;
}

export interface ConsentReviewSession {
  /** Call on every edit, example load or reset, even if an old value is restored. */
  invalidate(): void;
  review(request: unknown, explicitApproval: unknown): Promise<PlanResult>;
  acknowledge(confirmed: unknown): Readonly<{
    accepted: boolean;
    executed: false;
    reasons: readonly Readonly<{ path?: string; code: string; message: string }>[];
    consent: LocalAcknowledgement | null;
  }>;
  snapshot(): Readonly<{
    revision: number;
    pending: boolean;
    review: PlanResult | null;
    consent: LocalAcknowledgement | null;
  }>;
}

export function buildPlan(request: unknown, explicitApproval: unknown): Promise<PlanResult>;
export function createReviewSession(): ConsentReviewSession;
