import { useTranslation } from 'react-i18next'
import { Notice } from '~/components/ui/Notice'
import { D } from '~/lib/core/money'
import { formatMoneyFull } from '~/lib/format/number'
import { openDataChecks } from '~/lib/events/data-checks'
import type { BalanceSheetResult } from '~/lib/finance/balance-sheet/result'
import type { Lang } from '~/lib/core/types'

/**
 * The notices above the figures: no period, sides that do not match, or no comparison period.
 */
export function BalanceSheetNotices({ data, lang }: { data: BalanceSheetResult; lang: Lang }) {
  const { t } = useTranslation()

  if (data.status === 'no-period') {
    return <Notice tone="warning" title={t('balanceSheet.notice.noPeriod')} />
  }

  const difference = data.statement.totals.difference
  return (
    <>
      {!D(difference).isZero() && (
        <Notice
          tone="danger"
          title={t('balanceSheet.notice.unbalancedTitle')}
          body={t('balanceSheet.notice.unbalancedBody', { amount: formatMoneyFull(difference, lang) })}
          action={{
            label: t('dataChecks.openAction'),
            onClick: openDataChecks,
          }}
        />
      )}
      {data.compare && data.compare.period === null && <Notice tone="info" title={t('balanceSheet.compare.missing')} />}
    </>
  )
}
