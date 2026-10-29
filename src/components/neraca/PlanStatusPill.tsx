import { useTranslation } from 'react-i18next'
import { StatusPill, type StatusTone } from '~/components/neraca/StatusPill'
import type { PlanStatus } from '~/lib/finance/ap-ar/aging'

const STATUS_TONE: Record<PlanStatus, StatusTone> = {
  notSubmitted: 'neutral',
  submitted: 'warning',
  approved: 'warning',
}

function isPlanStatus(value: string): value is PlanStatus {
  return value in STATUS_TONE
}

/** Payment-plan status of a bill: the server sends a language-neutral code, the label comes from i18n. */
export function PlanStatusPill({ status }: { status: string }) {
  const { t } = useTranslation()
  if (!isPlanStatus(status)) return <StatusPill tone="neutral">{status}</StatusPill>
  return <StatusPill tone={STATUS_TONE[status]}>{t(`planStatus.${status}`)}</StatusPill>
}
