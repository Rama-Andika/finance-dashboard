import type { IsoDate, Money } from '~/lib/finance/types'
import { FigureTooltip } from '~/components/neraca/FigureTooltip'
import { cn } from '~/lib/cn'

export interface CashBalanceCardProps {
  asOf: IsoDate
  entityCount: number
  cash: Money
  bank: Money
  deposit: Money
  inTransit: Money
  onOpen?: () => void
  currency?: string
  className?: string
}

function formatShortMock(val: Money | null): string {
  if (val === null) return '0'
  const n = Number.parseFloat(val)
  if (Number.isNaN(n)) return val
  const abs = Math.abs(n)
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2).replace('.', ',')} T`
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2).replace('.', ',')} M`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2).replace('.', ',')} jt`
  return n.toLocaleString('id-ID')
}

export function CashBalanceCard({
  asOf: _asOf,
  entityCount,
  cash,
  bank,
  deposit,
  inTransit,
  onOpen,
  currency = 'Rp',
  className,
}: CashBalanceCardProps) {
  const cashNum = Number.parseFloat(cash) || 0
  const bankNum = Number.parseFloat(bank) || 0
  const totalNum = cashNum + bankNum

  const headlineShort = formatShortMock(totalNum.toString())
  const headlineFull = `${currency} ${totalNum.toLocaleString('id-ID')}`

  const isClickable = Boolean(onOpen)

  return (
    <article
      className={cn(
        'nr-balance nr-on-forest',
        isClickable && 'cursor-pointer',
        className,
      )}
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
        <p className="nr-overline">
          Kas &amp; Bank · {entityCount} entitas
        </p>
        <h3 className="nr-balance-name">Posisi Kas</h3>
      </div>
      <FigureTooltip full={headlineFull}>
        <p className="nr-balance-value">
          <span className="nr-cur">{currency}</span>
          {headlineShort}
        </p>
      </FigureTooltip>
      <dl className="nr-balance-rows">
        <dt>Kas</dt>
        <dd>{currency} {formatShortMock(cash)}</dd>
        <dt>Bank</dt>
        <dd>{currency} {formatShortMock(bank)}</dd>
        <span className="nr-sep" />
        <dt>Deposito (terpisah)</dt>
        <dd>{currency} {formatShortMock(deposit)}</dd>
        <dt>Dana dalam pencairan</dt>
        <dd>{currency} {formatShortMock(inTransit)}</dd>
      </dl>
    </article>
  )
}
