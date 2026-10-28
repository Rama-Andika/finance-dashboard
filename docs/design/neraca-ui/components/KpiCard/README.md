# KpiCard

A white card with one label, one abbreviated figure, and a comparison line, used in the top row of every metric page.

- Label `kpi-label`; figure `figure-xl` with the currency (`Rp` / `IDR`) set smaller in `ink-muted`; footer = DeltaPill + caption naming the comparison.
- The figure is abbreviated by language (ID `Rp 42,56 M`, EN `IDR 42.56B`); the full amount appears in a Tooltip on hover and focus.
- Three KpiCards sit beside one CashBalanceCard in a 4-column row on desktop, 2 columns on tablet, 1 on phones.
- The whole card is the drill-down target: clicking opens the side sheet for that metric.

Consumer provides: label, value (number), currency, comparison value and period name, whether higher is better.

Don't put charts, icons or a second figure in this card; use a regular card for that.
