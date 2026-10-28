# SidebarNav

The fixed left column (`sidebar-width`) with the product name, one link per metric page, a settings group, and a data-freshness note at the bottom.

- Items: 18px Lucide icon + `label`, 40px tall, `radius-sm`. Current page `aria-current="page"` gets the `lime` fill with `on-lime` text; others `ink-muted`, hover `surface-hover`.
- Order follows how finance reads the business: Ringkasan, Pendapatan, Posisi Kas, Arus Kas, Laba Rugi, Utang, Piutang, Rencana Bayar, Anggaran; then the "Pengaturan" group (Pemetaan Akun).
- The bottom note is a `forest` panel stating when data was read and whether the period is still open. It replaces upsell banners; never use this slot for promotion.
- Tablet: icons only (labels as tooltips). Phone: a drawer opened from the top bar.

Consumer provides: the item list with icons and routes, the current route, the as-of timestamp and period status.
