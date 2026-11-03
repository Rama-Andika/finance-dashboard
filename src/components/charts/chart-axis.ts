/** The look every chart shares (Neraca UI tokens): the category axis has a line and bigger labels, the value axis only labels. */
export const categoryAxisProps = {
  axisLine: { stroke: 'var(--chart-axis)' },
  tickLine: false,
  tick: { fill: 'var(--ink-muted)', fontSize: 12 },
} as const

export const valueAxisProps = {
  axisLine: false,
  tickLine: false,
  tick: { fill: 'var(--ink-muted)', fontSize: 11 },
} as const
