import { CircleCheck, TriangleAlert } from 'lucide-react'
import { cn } from '~/lib/cn'

export type NoticeTone = 'warning' | 'danger' | 'success'

export interface NoticeProps {
  tone: NoticeTone
  title: string
  body?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function Notice({ tone, title, body, action, className }: NoticeProps) {
  const isDanger = tone === 'danger'
  const Icon = tone === 'success' ? CircleCheck : TriangleAlert
  const role = isDanger ? 'alert' : 'status'

  return (
    <div
      role={role}
      className={cn('nr-notice', isDanger && 'nr-notice-danger', tone === 'success' && 'nr-notice-success', className)}
    >
      <Icon className="nr-icon" size={18} strokeWidth={1.75} aria-hidden="true" />
      <div>
        <b>{title}</b>
        {body && <> {body}</>}
        {action && (
          <>
            {' '}
            <button
              type="button"
              onClick={action.onClick}
              className="font-semibold underline cursor-pointer hover:opacity-80"
            >
              {action.label}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
