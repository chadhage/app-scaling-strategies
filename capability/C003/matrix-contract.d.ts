export type CapabilityStatus = 'planned' | 'documented-supported' | 'qualified' | 'unsupported' | 'unknown';
export type LocalCapabilityStatus = Exclude<CapabilityStatus, 'qualified'>;
export type DocumentedSupport = 'documented-supported' | 'unsupported' | 'unknown';
export type Host = 'app-service' | 'container-apps' | 'aks' | 'functions' | 'unselected';
export type DeploymentFormat = 'code' | 'container' | 'function-code' | 'code-or-container';
export type Mechanism = 'deployment-slots' | 'controlled-slot-swap' | 'native-auto-swap' |
  'http-automatic-scaling-with-slot-traffic' | 'external-routing' | 'single-revision' |
  'multiple-revisions' | 'rolling-deployment' | 'weighted-routing' | 'flex-deployment-slots' |
  'flex-rolling-site-update' | 'host-required';
export type DocumentationReview = 'baseline-only' | 'researcher-documented';

export interface MatrixSource {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly baselinePath: 'README.md' | '.docs\\wiki\\backlog.md';
  readonly verification: DocumentationReview;
}

export interface MatrixConstraint {
  readonly id: string;
  readonly text: string;
  readonly sourceIds: readonly string[];
}

export interface MatrixRow {
  readonly id: string;
  readonly title: string;
  readonly host: Host;
  readonly format: DeploymentFormat;
  readonly runtime: 'unselected' | 'nodejs' | 'java-spring-boot';
  readonly os: 'windows' | 'linux' | 'unspecified' | 'unapproved';
  readonly mechanism: Mechanism;
  readonly status: LocalCapabilityStatus;
  readonly documentedSupport: DocumentedSupport;
  readonly adapter: 'planned' | 'not-applicable';
  readonly qualified: false;
  readonly nativeEvidence: readonly never[];
  readonly firstPlannedNativeTarget: boolean;
  readonly reason: string;
  readonly sourceIds: readonly string[];
  readonly constraints: readonly MatrixConstraint[];
}

export interface CapabilityMatrix {
  readonly schemaVersion: '1.0.0';
  readonly kind: 'host-format-capability-matrix';
  readonly cardId: 'C003';
  readonly scope: 'local-documented-only';
  readonly provenance: {
    readonly baselineCommit: 'a1411c1fd7b081e7772db0ac96eb61d697452c86';
    readonly readmePath: 'README.md';
    readonly backlogPath: '.docs\\wiki\\backlog.md';
    readonly approvalArtifact: 'capability\\C001\\approved-contract.js';
    readonly approvalSourceCommit: '26747d4fbbd51235c612dbd9d8c92ab335aef78e';
    readonly documentationReview: DocumentationReview;
    readonly reviewedAtUtc: string | null;
    readonly reviewNote: string;
  };
  readonly design: {
    readonly runtime: 'Node.js 24 LTS';
    readonly framework: 'Express';
    readonly hosting: 'App Service Linux';
    readonly testTooling: 'Node.js 22.23.4';
    readonly productionRuntimeValidated: false;
    readonly firstNativeTarget: 'App Service: code deployment slots';
    readonly target: {
      readonly os: null;
      readonly sku: null;
      readonly subscription: null;
      readonly resourceGroup: null;
      readonly region: null;
    };
  };
  readonly permissions: {
    readonly liveAzureExecutionApproved: false;
    readonly iacGenerationApproved: false;
    readonly scaffoldApproved: false;
    readonly deploymentApproved: false;
    readonly identityRegistrationApproved: false;
    readonly expenditureApproved: false;
    readonly maximumLiveAzureRuns: 0;
    readonly authorizedCloudSpend: 0;
  };
  readonly sources: readonly MatrixSource[];
  readonly rows: readonly MatrixRow[];
}

export interface ValidationResult { valid: boolean; errors: string[] }
export interface MatrixFilters { host?: Host | ''; format?: DeploymentFormat | ''; status?: CapabilityStatus | ''; query?: string }
export const SCHEMA_VERSION: '1.0.0';
export const STATUSES: readonly CapabilityStatus[];
export const HOSTS: readonly Host[];
export const FORMATS: readonly DeploymentFormat[];
export const MECHANISMS: readonly Mechanism[];
export const FLAG_KEYS: readonly (keyof CapabilityMatrix['permissions'])[];
export const TARGET_KEYS: readonly (keyof CapabilityMatrix['design']['target'])[];
export function validateMatrix(matrix: unknown): ValidationResult;
export function filterRows(matrix: unknown, filters?: MatrixFilters): MatrixRow[];
