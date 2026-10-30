import { useTranslation } from 'react-i18next'
import { KpiCard } from '~/components/neraca/KpiCard'
import { largestByAmount } from '~/lib/core/money'
import type { Money } from '~/lib/core/types'

type Folder = { id: string; label: string; amount: Money }
type Entity = { name: string; amount: Money }

/** Total revenue with its comparison, the largest category and the largest entity. */
export function RevenueKpiRow({
  total,
  compareTotal,
  compareLabel,
  byFolder,
  byEntity,
  onSelectFolder,
}: {
  total: Money
  compareTotal: Money | null
  compareLabel: string
  byFolder: readonly Folder[]
  byEntity: readonly Entity[]
  onSelectFolder: (folderId: string, folderLabel?: string) => void
}) {
  const { t } = useTranslation()
  const topCategory = largestByAmount(byFolder)
  const topEntity = largestByAmount(byEntity)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <KpiCard
        label={t('nav.revenue')}
        value={total}
        compareValue={compareTotal}
        compareLabel={compareLabel}
        higherIsBetter={true}
      />
      <KpiCard
        label={t('ui.revenue.topCategory')}
        value={topCategory?.amount ?? '0'}
        compareLabel={topCategory?.label || '—'}
        higherIsBetter={true}
        onOpen={topCategory ? () => onSelectFolder(topCategory.id, topCategory.label) : undefined}
      />
      <KpiCard
        label={t('ui.revenue.topEntity')}
        value={topEntity?.amount ?? '0'}
        compareLabel={topEntity?.name || '—'}
        higherIsBetter={true}
      />
    </div>
  )
}
