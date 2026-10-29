import { cn } from '~/lib/cn'

export interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'bg-surface-sunken animate-pulse rounded-md',
        className,
      )}
      aria-hidden="true"
    />
  )
}
