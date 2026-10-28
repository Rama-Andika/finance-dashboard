# Fase 16 – Verifikasi akhir

> Bagian dari rencana implementasi Finance Dashboard · Indeks & aturan umum: [README.md](./README.md)
> Sebelumnya: [15_phase-seed-db-lokal.md](./15_phase-seed-db-lokal.md) · Berikutnya: —
>
> **Wajib sebelum mulai fase ini:** baca [README.md](./README.md) §1 (cara memakai), §2 (aturan emas G1–G38), dan §5 (konvensi kode). Fase 0–14 sudah lulus "✅ Cek selesai"; Fase 15 (opsional) juga lulus bila dikerjakan.

---

## Langkah 16.1 — Pemeriksaan otomatis

```bash
npm run typecheck
npm test
npm run build
```

⛔ IZIN USER: `npm run test:db`.

✅ Semua lulus tanpa error.

## Langkah 16.2 — Cocokkan dengan laporan ERP ⛔ IZIN USER

🎯 Tujuan: angka dashboard sama dengan laporan yang dipakai tim finance (D17).

Minta user membuka laporan ERP berikut **pada DB yang sama dan tanggal/periode yang sama**, lalu isi tabel di `docs/verification-report.md`:

| # | Laporan ERP | Pengaturan | Angka dashboard | Harus |
|---|---|---|---|---|
| V1 | AP Aging (`ap_aging.jsp`) | semua lokasi, `asOf` = akhir bulan lalu | Utang Usaha (neto) + 8 bucket | Sama persis (D24) |
| V2 | AR Aging (`ar/ar_aging.jsp`) | semua lokasi, tanggal sama | Piutang (neto) + bucket | Sama persis (D25) |
| V3 | Laba Rugi generate (`profitloss_segmentgen.jsp`) | bulan lalu (Closed) & YTD | Revenue, COGS, Expense, Other Rev, Other Exp, Net | Sama persis (D26); OCI dibandingkan sebagai bagian Other Revenue ERP |
| V4 | Neraca (`neracabysegment.jsp`) | akhir bulan lalu | Saldo akun keranjang Kas, Bank, Deposito | Sama persis (D19) |
| V5 | Neraca Saldo (`tb_report.jsp`) | bulan lalu | Saldo akun kas (metode cadangan) | Sama (D29) |
| V6 | Arus Kas (`cashflow_report.jsp`) | bulan lalu | Total per laci | Boleh beda; selisih harus dijelaskan oleh panel perbandingan (jurnal campuran, belum terklasifikasi) (D27) |
| V7 | Anggaran (`budgetreport_month.jsp`) | bulan lalu | Budget per akun | Sama persis (D28) |

Setiap selisih dicatat dengan penyebabnya; selisih tanpa penjelasan = langkah belum selesai.

## Langkah 16.3 — Keamanan

Checklist (semua harus "ya"):
- [ ] Respons semua server function (DevTools → Network) tidak memuat `password`, `nomor_rekening`, `npwp`.
- [ ] Membuka server function metrik tanpa cookie session → error `UNAUTHORIZED`.
- [ ] `grep` kode untuk `console.log` di `src/functions/` dan `src/server/` → tidak ada yang mencetak input login, env, atau baris `sysuser`.
- [ ] `.env`, `.dbclient.cnf`, `schema/*.csv` tidak ter-track git (bila git dipakai).
- [ ] Hanya `settings.repo.ts` yang berisi `INSERT … ON DUPLICATE KEY UPDATE`; tidak ada `INSERT`/`UPDATE`/`DELETE`/DDL di file lain dalam `src/`.
- [ ] `sql-guard.test.ts` lulus.
- [ ] Route, nama file, komentar kode, pesan `Error`, log, dan nama test di `src/`, `scripts/`, `tests/` berbahasa Inggris; bahasa Indonesia hanya di `src/i18n/locales/id.json` (G37).

## Langkah 16.4 — Aksesibilitas & tampilan

- [ ] Semua halaman bisa dipakai dengan keyboard saja (Tab, Enter, Esc).
- [ ] Fokus terlihat di tema light & dark.
- [ ] Status selalu punya kata (tidak hanya warna).
- [ ] Hanya satu kartu forest per layar; lime tidak pernah jadi warna teks.
- [ ] `prefers-reduced-motion` mematikan animasi.

## Langkah 16.5 — Bersih-bersih

- Hapus `src/routes/dev-ui.tsx`.
- Perbarui `docs/progress.md` (ringkasan akhir) dan `docs/verification-report.md`.
- Commit **hanya** bila user meminta.

✅ Cek selesai: semua checklist Fase 16 tercentang dan `docs/verification-report.md` lengkap.
