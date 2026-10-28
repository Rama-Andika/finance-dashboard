# DataTable

A card-hosted table with a sunken, rounded header band, hairline row dividers and full (unabbreviated) amounts.

- Header band `surface-sunken`, `radius-md`, header text `label` in `ink-muted`. Rows 44px, divider `line`, hover `surface-hover`.
- First column is the thing's name in `body-strong`, optional second line in `code-sm` or caption. Document and account codes in `code`.
- Amounts: right-aligned, tabular figures, full value with thousands separators, the currency in the column header ("Sisa (Rp)"). Negative amounts in parentheses in `ink`, not red.
- State in a StatusPill in the last column; dates as `28 Okt 2026`; a missing value is an em dash.
- Card header holds the title, a scope select, and an icon button for "Ekspor CSV".
- More than 50 rows: virtualise; sticky header band. Rows open the drill-down side sheet.
- Phone (< 768px): render each row as a stacked item (name + amount on one line, codes and status under it) instead of scrolling sideways.

Consumer provides: column definitions (key, label, alignment, formatter), rows, an empty-state sentence, and the row action.
