# Tooltip

A small floating box (`surface`, `shadow-pop`, `radius-sm`) that shows exact values for a hovered chart mark or an abbreviated figure.

- Chart tooltip: the period in `ink-muted`, then one row per series with the value right-aligned in tabular figures.
- Figure tooltip: the full, unabbreviated amount ("Rp 42.560.118.400") for any abbreviated figure such as `Rp 42,56 M`.
- Opens on hover and on keyboard focus; never holds actions or links.

Consumer provides: the title (period or label) and the rows. Position it above the mark with 8px clearance and flip it below near the top edge.
