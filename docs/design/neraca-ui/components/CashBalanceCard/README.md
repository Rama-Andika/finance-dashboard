# CashBalanceCard

The single forest-green card on a page: Cash Position (Kas + Bank) as of the period end, with its breakdown and the two figures that sit outside the headline.

- Ground `forest`, text `on-forest`, secondary text `on-forest-muted`, decorative arcs and the divider `forest-line`.
- Overline names what is counted and for how many entities ("Kas & Bank · 24 entitas"); title "Posisi Kas"; figure `figure-lg`.
- Rows above the divider add up to the headline (Kas, Bank). Rows below it are shown but **not** included: Deposito and Dana dalam pencairan.
- Only one per screen. Controls placed on it use `focus-on-forest` for the focus ring.

Consumer provides: as-of date, entity count, headline value, the summing rows, the excluded rows.

Don't use it for any other metric; its colour means "cash you can use today".
