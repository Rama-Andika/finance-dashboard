import type { ReactNode } from 'react'
import { cn } from '~/lib/cn'

export type StatusTone = 'neutral' | 'warning' | 'danger'

export interface StatusPillProps {
  tone: StatusTone
  children: ReactNode
  className?: string
}

export function StatusPill({ tone, children, className }: StatusPillProps) {
  const toneClass = {
    neutral: 'nr-status-neutral',
    warning: 'nr-status-warning',
    danger: 'nr-status-danger',
  }[tone]

  return (
    <span className={cn('nr-status', toneClass, className)}>
      {children}
    </span>
  )
}
