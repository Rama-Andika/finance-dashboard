# DonutBreakdown

A card with Pendapatan/Beban tabs, a donut of the top categories with the total in its centre, and a legend of percent chips, names and amounts.

- At most five segments, ordered by size, coloured `chart-1` … `chart-5`; everything beyond the fourth largest is merged into "Lainnya" (`chart-5`).
- Segments are separated by a 2px gap; the ring is 18px thick. Centre: caption ("Total beban") over `figure-md`.
- Legend rows: chip with the percent (text colour per chip: `on-chart-1`, `on-lime`, or `ink`), category name, amount right-aligned in tabular figures.
- Categories are CoA folders (HEADER accounts), never departments.
- Clicking a segment or legend row opens the drill-down sheet for that folder.

Consumer provides: the tab state, the period label, and `{ name, amount }` for each category already merged to five; percentages are computed from the total and rounded so they add up to 100.

## Variant: per entity

`<DonutBreakdown variant="entity" />` draws a ring of up to 10 entities plus a merged "Lainnya" segment (`chart-1` … `chart-10`, `chart-other`). The legend lists only the 5 largest as a colour dot, the name and the percent (no amounts) and adds one "+N lainnya" row for the rest. Hover on a segment or legend row shows the full amount. The card header has a "Details ›" link (`nr-card-link`). Entities with zero or negative revenue are not drawn; a small note says how many were left out.
