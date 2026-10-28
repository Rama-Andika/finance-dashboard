# CashflowChart

A diverging monthly bar chart: cash in above the zero line (`chart-income`), cash out below it (`chart-expense`), with the selected month haloed and explained in a Tooltip.

- One pair of bars per period month; outer ends rounded `radius-xs`, the ends at zero square.
- Gridlines `chart-grid` (horizontal only), zero line `chart-axis`, ticks and month labels `caption` in `ink-muted`, abbreviated by language (`10 M`, `−5 M` / `10B`, `−5B`).
- Hover or keyboard focus on a month: `lime-soft` halo behind both bars, `lime-strong` outline, bold month label, Tooltip with both values.
- Header: card title, a period select scoped to this card, the net figure for the range in `figure-lg`, and the legend.
- Months after the last closed or open period are left empty, never drawn as zero.
- Clicking a month opens the drill-down sheet (cash-flow lines for that month).

Consumer provides: an ordered list of `{ month, cashIn, cashOut }`, the selected month, the net total and its range label. Provide an `aria-label` that states the range and the largest month.
