import type { Breakdown } from '../../core/types'
import { toChartNumber } from '../../core/money'
import type { DrawerKey } from './cashflow'
import { translateCfLabel } from './cashflow-labels'

type Translate = (key: string) => string

export type CashFlowActivityRow = {
  id: string
  name: string
  amount: string
  isUnclassified?: boolean
  /** Server sub-group value, used as the drill-down id. */
  subGroupId?: string
  isDrawerHeader?: boolean
  drawerKey?: string
}

type DrawerData = {
  drawer: DrawerKey
  total: string
  rows: Array<{ subGroup: string; amount: string; unclassified?: boolean }>
}

const DRAWER_LABEL_KEY: Record<DrawerKey, string> = {
  OPERATING: 'metric.operating',
  INVESTING: 'metric.investing',
  FUNDING: 'metric.financing',
}

export type WaterfallBar = {
  name: string
  /** Display only: recharts needs a JS number for the bar; `rawAmount` keeps the exact value. */
  amountNum: number
  rawAmount: string
  color: string
}

/** Opening cash → the three activities → closing cash, as bars for the waterfall chart. */
export function buildWaterfall(
  cf: { openingCash: string; closingCash: string; drawers: Array<{ drawer: DrawerKey; total: string }> },
  t: Translate,
): WaterfallBar[] {
  const totalOf = (drawer: DrawerKey) => cf.drawers.find((d) => d.drawer === drawer)?.total ?? '0'
  const activity = (drawer: DrawerKey): WaterfallBar => {
    const rawAmount = totalOf(drawer)
    const amountNum = toChartNumber(rawAmount)
    return {
      name: t(DRAWER_LABEL_KEY[drawer]),
      amountNum,
      rawAmount,
      color: amountNum >= 0 ? 'var(--chart-income)' : 'var(--chart-expense)',
    }
  }

  return [
    { name: t('metric.openingCash'), amountNum: toChartNumber(cf.openingCash), rawAmount: cf.openingCash, color: 'var(--chart-5)' },
    activity('OPERATING'),
    activity('INVESTING'),
    activity('FUNDING'),
    { name: t('metric.closingCash'), amountNum: toChartNumber(cf.closingCash), rawAmount: cf.closingCash, color: 'var(--chart-1)' },
  ]
}

/** One header row per activity, followed by its sub-rows. */
export function buildActivityRows(drawers: DrawerData[], t: Translate): CashFlowActivityRow[] {
  const result: CashFlowActivityRow[] = []
  for (const d of drawers) {
    result.push({
      id: `drawer-${d.drawer}`,
      name: t(DRAWER_LABEL_KEY[d.drawer]),
      amount: d.total,
      isDrawerHeader: true,
      drawerKey: d.drawer,
    })
    for (const r of d.rows) {
      result.push({
        id: `row-${d.drawer}-${r.subGroup}`,
        name: r.unclassified ? t('ui.col.unclassified') : translateCfLabel(t, r.subGroup),
        subGroupId: r.subGroup,
        amount: r.amount,
        isUnclassified: r.unclassified,
        drawerKey: d.drawer,
      })
    }
  }
  return result
}

/** Server labels are language-neutral; translate the fixed categories and unknown vendors. */
export function localizeExpense(b: Breakdown, t: Translate): Breakdown {
  return {
    ...b,
    label:
      b.id === 'apBills' || b.id === 'unallocated'
        ? t(`ui.col.${b.id}`)
        : b.label || t('ui.col.unknownVendor'),
    children: b.children?.map((c) => localizeExpense(c, t)),
  }
}
