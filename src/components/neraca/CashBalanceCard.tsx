import { useTranslation } from 'react-i18next'
import type { IsoDate, Lang, Money } from '~/lib/core/types'
import { FigureTooltip } from '~/components/neraca/FigureTooltip'
import { D } from '~/lib/core/money'
import { formatAmountShort, formatMoneyFull, formatMoneyShort } from '~/lib/format/number'
import { cn } from '~/lib/cn'

export interface CashBalanceCardProps {
  asOf: IsoDate
  entityCount: number
  cash: Money
  bank: Money
  deposit: Money
  inTransit: Money
  /** Giro / cheque payments the bank has not cleared yet: shown as information, not part of the cash position. */
  giroOutstanding?: Money
  onOpen?: () => void
  className?: string
}

export function CashBalanceCard({
  asOf: _asOf,
  entityCount,
  cash,
  bank,
  deposit,
  inTransit,
  giroOutstanding,
  onOpen,
  className,
}: CashBalanceCardProps) {
  const { t, i18n } = useTranslation()
  const lang: Lang = i18n.language?.startsWith('id') ? 'id' : 'en'
  const currency = 'IDR'

  // Cash Position = Cash + Bank (D-decisions §5); deposit and funds in settlement are shown but excluded.
  const total = D(cash).plus(D(bank)).toFixed(2)
  const headlineFull = `${currency} ${formatMoneyFull(total, lang, { decimals: 2 })}`

  const isClickable = Boolean(onOpen)

  return (
    <article
      className={cn('nr-balance nr-on-forest', isClickable && 'cursor-pointer', className)}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (onOpen && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onOpen()
        }
      }}
      tabIndex={isClickable ? 0 : undefined}
      role={isClickable ? 'button' : undefined}
    >
      <svg className="nr-balance-arcs" viewBox="0 0 240 240" aria-hidden="true">
        <circle cx="120" cy="120" r="72" />
        <circle cx="120" cy="120" r="100" />
        <circle cx="120" cy="120" r="119" />
      </svg>
      <div>
        <p className="nr-overline">{t('cashCard.overline', { count: entityCount })}</p>
        <h3 className="nr-balance-name">{t('cashCard.title')}</h3>
      </div>
      <FigureTooltip full={headlineFull}>
        <p className="nr-balance-value">
          <span className="nr-cur">{currency}</span>
          {formatAmountShort(total, lang)}
        </p>
      </FigureTooltip>
      <dl className="nr-balance-rows">
        <dt>{t('cashCard.cash')}</dt>
        <dd>{formatMoneyShort(cash, lang)}</dd>
        <dt>{t('cashCard.bank')}</dt>
        <dd>{formatMoneyShort(bank, lang)}</dd>
        <span className="nr-sep" />
        <dt>{t('cashCard.deposit')}</dt>
        <dd>{formatMoneyShort(deposit, lang)}</dd>
        <dt>{t('cashCard.inTransit')}</dt>
        <dd>{formatMoneyShort(inTransit, lang)}</dd>
        {giroOutstanding !== undefined && !D(giroOutstanding).isZero() && (
          <>
            <dt>{t('cashCard.giro')}</dt>
            <dd>{formatMoneyShort(giroOutstanding, lang)}</dd>
          </>
        )}
      </dl>
    </article>
  )
}
