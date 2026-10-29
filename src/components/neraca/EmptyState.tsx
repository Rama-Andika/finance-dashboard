import { Button } from '~/components/neraca/Button'
import { cn } from '~/lib/cn'

export interface EmptyStateProps {
  message: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptyState({ message, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 p-10 text-center',
        className,
      )}
    >
      <p className="nr-muted text-sm max-w-sm">{message}</p>
      {action && (
        <Button variant="secondary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}
