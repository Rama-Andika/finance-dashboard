# PeriodSelect

A select trigger and menu of period presets; the only way to change the reporting period (no free date range).

- Presets: Bulan ini, Bulan lalu, Kuartal ini, Tahun berjalan (YTD), 12 bulan terakhir. Each row shows the resolved months as a hint in `ink-muted`, so nobody has to guess what "Kuartal ini" means.
- A separate toggle row "Termasuk Periode 13" adds the year-end adjustment period to YTD and 12-month views.
- The Daily Payment Plan page swaps the list for forward presets: 7, 14, 30 hari ke depan.
- Selected row: `lime-soft` ground, weight 600. Menu: `surface`, `shadow-pop`, `radius-md`.

Consumer provides: the preset list with resolved labels (from the `periode` table, never computed from today alone) and the selected preset.
