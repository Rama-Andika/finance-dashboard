# Tabs

Equal-width text tabs with an underline that switch what one card shows (Pendapatan / Beban in the breakdown card).

- Selected tab: `ink`, weight 600, 2px underline in `indicator` (forest in light, lime in dark). Other tabs `ink-muted`.
- Two to four tabs, one or two words each. More choices belong in a select.
- Switching tabs never changes the global filters (entity, period).

Consumer provides: the tab labels and the selected index, with `role="tablist"`, `role="tab"` and `aria-selected`.
