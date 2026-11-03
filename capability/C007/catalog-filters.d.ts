import type { CatalogEntry, SourceCatalog } from '../C005/catalog-contract';
import type { CapabilityMatrix, Host, MatrixRow } from '../C003/matrix-contract';

export type RiskFilter = 'all' | 'unclassified' | 'assessed' | 'low' | 'medium' | 'high';
export type ReadinessFilter = 'all' | 'portable-available' | 'portable-unavailable' |
  'native-unavailable' | 'native-runnable' | 'native-qualified' | 'parent-complete';
export interface Filters {
  readonly host?: Host | 'all' | '';
  readonly risk?: RiskFilter | '';
  readonly readiness?: ReadinessFilter | '';
}
export interface FilterItem {
  /** The original C005 entry, never a cloned or promoted availability record. */
  readonly entry: CatalogEntry;
  readonly hostAssessment: {
    readonly status: 'not-selected' | 'unknown' | 'incompatible';
    readonly reason: string;
  };
}
export interface FilterResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly filters: {
    readonly host: Host | 'all'; readonly risk: RiskFilter; readonly readiness: ReadinessFilter;
  } | null;
  readonly items: readonly FilterItem[];
  readonly incompatible: readonly FilterItem[];
  readonly matrixRows: readonly MatrixRow[];
  readonly provenance: {
    readonly source: SourceCatalog['source'];
    readonly acceptanceSnapshot: SourceCatalog['acceptanceSnapshot'];
    readonly capabilityMatrix: SourceCatalog['capabilityMatrix'];
  } | null;
  readonly permissions: CapabilityMatrix['permissions'] | null;
  readonly riskReason: string | null;
}
export const RISKS: readonly RiskFilter[];
export const READINESS: readonly ReadinessFilter[];
export const HOST_LABELS: Readonly<Record<Host | 'all', string>>;
export function filterCatalog(catalog: unknown, matrix: unknown, selection?: Filters): FilterResult;
