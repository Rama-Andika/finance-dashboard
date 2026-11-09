import { useTranslation } from 'react-i18next'
import { Notice } from '~/components/ui/Notice'
import { D } from '~/lib/core/money'
import { formatMoneyFull } from '~/lib/format/number'
import type { BalanceSheetResult } from '~/lib/finance/balance-sheet/result'
import type { Lang } from '~/lib/core/types'

/**
 * The notices above the figures: no period, sides that do not match, balances that are not from a saved opening, no
 * comparison period, and (with more than one entity) that the entities are simply added up.
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
        />
      )}
      {data.method === 'bridge' && (
        <Notice
          tone="info"
          title={t('balanceSheet.notice.bridgeTitle')}
          body={t('balanceSheet.notice.bridgeBody', {
            period: data.openingPeriodName ?? '',
            count: data.unclosedCount,
          })}
        />
      )}
      {data.method === 'full-history' && (
        <Notice tone="info" title={t('balanceSheet.notice.historyTitle')} body={t('balanceSheet.notice.historyBody')} />
      )}
      {data.compare && data.compare.period === null && <Notice tone="info" title={t('balanceSheet.compare.missing')} />}
      {data.meta.entityCount > 1 && (
        <Notice
          tone="info"
          title={t('balanceSheet.notice.consolidationTitle', { count: data.meta.entityCount })}
          body={t('balanceSheet.notice.consolidationBody')}
        />
      )}
    </>
  )
}
