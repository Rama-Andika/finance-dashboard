export const qk = {
  filterOptions: () => ['filter-options'] as const,
  accountMapping: () => ['settings', 'account-mapping'] as const,
  coaTree: (input: unknown) => ['settings', 'coa-tree', input] as const,
  metric: (name: string, input: unknown) => ['metric', name, input] as const,
  drill: (input: unknown) => ['drill', input] as const,
  dataChecks: (input: unknown) => ['data-checks', input] as const,
  snapshotInfo: () => ['snapshot-info'] as const,
  // Prefixes: invalidating one of these reaches every query of that kind (keys.test.ts keeps them in step with the above).
  allMetrics: () => ['metric'] as const,
  allDrills: () => ['drill'] as const,
  allDataChecks: () => ['data-checks'] as const,
}
