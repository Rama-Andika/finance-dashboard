import { Skeleton } from '~/components/neraca/Skeleton'

export function MetricSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* KPI Cards row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>

      {/* Chart row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="h-80 lg:col-span-2 rounded-lg" />
        <Skeleton className="h-80 lg:col-span-1 rounded-lg" />
      </div>

      {/* Table section */}
      <Skeleton className="h-96 rounded-lg" />
    </div>
  )
}
