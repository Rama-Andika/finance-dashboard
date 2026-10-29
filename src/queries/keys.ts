export const qk = {
  filterOptions: () => ['filter-options'] as const,
  accountMapping: () => ['settings', 'account-mapping'] as const,
  coaTree: (input: unknown) => ['settings', 'coa-tree', input] as const,
  metric: (name: string, input: unknown) => ['metric', name, input] as const,
  drill: (input: unknown) => ['drill', input] as const,
  dataChecks: (input: unknown) => ['data-checks', input] as const,
}
