export interface InclusiveBounds {
  readonly min: number;
  readonly max: number;
}

/** All numeric fields must be finite safe integers; negative zero is rejected. */
export interface RunEnvelope {
  readonly schemaVersion: 1;
  readonly action: 'local.probe';
  readonly scope: {
    readonly mode: 'local-implementation-only';
    readonly liveAzureRuns: 0;
  };
  readonly load: {
    readonly requestsPerSecond: number;
    readonly concurrentUsers: number;
  };
  readonly durationSeconds: number;
  /** Synthetic comparison units, not an Azure SKU or provisioned capacity. */
  readonly capacity: { readonly units: number };
  readonly budget: { readonly cloudSpend: 0 };
}

/** Explicit local comparison data, never approval or provider/production limits. */
export interface RunEnvelopeLimits {
  readonly kind: 'local-comparison-only';
  readonly label: string;
  readonly load: {
    readonly requestsPerSecond: InclusiveBounds;
    readonly concurrentUsers: InclusiveBounds;
  };
  readonly durationSeconds: InclusiveBounds;
  readonly capacity: { readonly units: InclusiveBounds };
  readonly budget: { readonly cloudSpend: { readonly min: 0; readonly max: 0 } };
}

/** Runtime validation rejects unknown fields at every record level. */
export interface RunEnvelopeRequest {
  readonly envelope: RunEnvelope;
  readonly limits: RunEnvelopeLimits;
}

export interface FieldError {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface C001AuthorityDecision {
  readonly action: string | null;
  readonly allowed: boolean;
  readonly executed: false;
  readonly approvalValid: boolean;
  readonly reasons: ReadonlyArray<{ readonly code: string; readonly message: string; readonly path?: string }>;
  readonly unresolvedNativeChoices: ReadonlyArray<string>;
  readonly nativeExecutionLimit: 0;
  readonly authorizedCloudSpend: 0;
  readonly nativeReady: false;
  readonly productionRuntimeValidated: false;
  readonly snapshotSha256: string;
}

interface ResultBase {
  readonly executed: false;
  readonly authority: C001AuthorityDecision | null;
  readonly errors: ReadonlyArray<FieldError>;
}

export type ValidationResult =
  | (ResultBase & {
    readonly valid: true;
    readonly outcome: 'valid-local-envelope';
    readonly validatedEnvelope: RunEnvelope;
    readonly appliedLimits: RunEnvelopeLimits;
  })
  | (ResultBase & {
    readonly valid: false;
    readonly outcome: 'rejected';
    readonly validatedEnvelope: null;
    readonly appliedLimits: null;
  });

/** Approval must be supplied explicitly; C001 checks it against its pinned snapshot. */
export function validateRunEnvelope(request: unknown, approval: unknown): Promise<ValidationResult>;
