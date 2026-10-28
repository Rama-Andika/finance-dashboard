# Fase 12 – Export CSV & print

> Bagian dari rencana implementasi Finance Dashboard · Indeks & aturan umum: [README.md](./README.md)
> Sebelumnya: [11_phase-drill-down.md](./11_phase-drill-down.md) · Berikutnya: [13_phase-data-perlu-dicek.md](./13_phase-data-perlu-dicek.md)
>
> **Wajib sebelum mulai fase ini:** baca [README.md](./README.md) §1 (cara memakai), §2 (aturan emas G1–G38), dan §5 (konvensi kode). Semua langkah fase sebelumnya (11_phase-drill-down.md) sudah lulus "✅ Cek selesai".

---

## Langkah 12.1 — Dialog Export CSV

📁 File: ➕ `src/components/export/ExportCsvDialog.tsx`

- Dialog (`ui/dialog`) dengan dua pilihan (U5): "Koma (,) + titik desimal" → `comma-dot`; "Titik koma (;) + koma desimal" → `semicolon-comma`. Pilihan terakhir diingat di `localStorage` (bungkus `try/catch`).
- Data = baris tabel yang sedang tampil (sudah ada di client), dibangun dengan `buildCsv` (langkah 4.5). Angka **penuh**, 2 desimal, tanggal ISO.
- Nama file: `<route>_<entity>_<preset>_<YYYYMMDD>.csv` (nama route bahasa Inggris), contoh `revenue_all_ytd_20261028.csv`.
- Unduh dengan `Blob` + `URL.createObjectURL` + elemen `<a download>`.

✅ Cek selesai:
- File CSV terbuka benar di Excel (Windows, locale Indonesia) dengan format `semicolon-comma`: kolom terpisah, angka terbaca sebagai angka, huruf Indonesia tidak rusak (BOM).

## Langkah 12.2 — Print & PDF

📁 File: ✏️ `src/styles/print.css`, ➕ `src/components/export/PrintButton.tsx`

`print.css` (U4):

```css
@media print {
  @page { size: A4 portrait; margin: 12mm; }
  html, body { background: #fff !important; }
  .no-print, .nr-sidebar, .nr-topbar button, [data-drill-sheet] { display: none !important; }
  .print-only { display: block !important; }
  .nr-card { break-inside: avoid; border-color: #cfd8d2; }
  /* tables stay tables even when printed from a phone */
  .nr-table-wrap { display: block !important; }
  .mobile-cards { display: none !important; }
  a[href]::after { content: none; }
}
.print-only { display: none; }
```

> Dua warna hex di atas adalah pengecualian khusus cetak (kertas selalu putih), bukan bagian tema.

- `PrintButton` → `window.print()`.
- Setiap halaman punya blok `.print-only` di atas: judul halaman, entitas terpilih, preset + rentang tanggal, `asOf`, waktu cetak.
- Grafik tetap SVG (tajam di PDF).

✅ Cek selesai:
- Chrome → Cetak → "Save as PDF": layout A4, tanpa sidebar & tombol, tabel utuh, grafik tajam; juga benar saat dicetak dari lebar 375px.
