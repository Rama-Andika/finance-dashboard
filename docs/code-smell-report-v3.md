# Laporan Kualitas Kode v3 — Finance Dashboard

Audit **baca-saja** (analisis statis: AST, grep, deteksi blok kembar) atas kode setelah v2, lalu perbaikannya. Tidak ada query ke database. Ukuran: ±22.400 baris kode, 1.529 fungsi, 0 import melingkar, 0 `@ts-ignore`, 0 TODO, 2 `any` (satu internal drizzle).

Temuan **H-01…H-15**. Status di bawah mencerminkan kode di branch `refactor/code-audit-fixes` (tanggal 2026-11-03). Verifikasi: `typecheck`, `lint`, **494 unit test**, dan `build` lulus. `npm run test:db` **belum** dijalankan untuk perubahan ini.

| ID | Tingkat | Masalah | Status | Apa yang dilakukan |
|---|---|---|---|---|
| H-01 | Sedang | Loader P&L mem-prefetch Runway yang tidak dipakai halaman | Selesai | Dihapus dari `profit-loss.tsx` |
| H-02 | Sedang | Drill Expense Paid menjalankan ulang join `ap_ar_card` tiap klik | Selesai | `expensePaidAllocated/Unallocated` di-memo 60 detik (`expense-paid.repo.ts`), dibagi dengan metriknya; `locKeyOf` dipindah ke `apar.shared.ts` |
| H-03 | Rendah-sedang | `accountGroupsOf` dan `loadBalanceInputs` berurutan | Selesai | `Promise.all` di `balance.service.ts`; Revenue, Budget juga membaca paralel |
| H-04 | Rendah | Loop slice berurutan, fan-out tanpa batas | Sebagian | `mapLimit` + `SLICE_CONCURRENCY` (3) di `db/chunk.ts`, dipakai di `gl.repo` (mutasi, per tanggal, saldo awal), `cashflow.repo`, `bank-payment.repo`, `party.repo`, `payment-plan.repo`. **Sengaja tetap berurutan:** query aging live dan Expense Paid (join terberat; paralel justru menambah beban ERP) |
| H-05 | Sedang | `expensePaidDrill` satu fungsi 87 baris, kompleksitas 17 | Selesai | Dipecah: `paymentCardsOf`, `vendorPaymentsDrill`, `directExpenseDrill` |
| H-06 | Sedang | Logika murni di dalam service (Revenue, Budget, Cash Position, Payment Plan) | Selesai | Revenue: `aggregateRevenue`, `revenueTrend`, `splitRevenueByEntity`, `sumNetRevenue` di `lib/finance/pnl/revenue.ts`; Budget: `actualByCoaOf`, `budgetByCoaOf`, `budgetYearMonths`, `summarizeBudget`; Cash Position: `readCashPositionInputs`; Payment Plan: `loadInflows`. Semuanya dengan unit test |
| H-07 | Rendah | `classifyBySetup` / `classifyByFallback` kompleksitas 15–16 | Selesai | Tabel aturan `FALLBACK_RULES` dan fungsi kecil (`setupSubRowsOf`, `takesPortion`). Perilaku dibuktikan sama dengan versi lama lewat uji banding (3.000 setup acak + 2.000+ kombinasi), lalu test tetap `cashflow-classify.test.ts` |
| H-08 | Rendah | `gl.repo.ts` 592 baris, empat model baca | Selesai | Dipecah: `gl-shared`, `gl-by-date`, `gl-opening`, `gl-journal`; `gl.repo.ts` (183 baris) tetap pintu masuk dan mengekspor ulang semuanya, jadi pemanggil dan mock test tidak berubah |
| H-09 | Rendah | Angka ajaib periode, kondisi status dobel, 6 parameter | Selesai | `lib/core/period.ts` (`PERIOD_TYPE`, `isPeriodOpen`, `isRegularPeriod`); `resolvePeriodIds` jadi 3 parameter; tipe `PeriodStatus` dipakai ulang |
| H-10 | Rendah | `KpiCard` kompleksitas 20 | Selesai | Angka dipindah ke `lib/format/kpi.ts` (`kpiFigures`, diuji); footer jadi komponen `KpiFoot` |
| H-11 | Sedang | Pemetaan baris aging disalin 3 kali (6 tempat) | Selesai | `repo/apar.rows.ts` (`toAgingInvoice`, `toAgingUnallocated`); alias SQL snapshot disamakan (`card_id AS invoiceId`) |
| H-12 | Rendah | `Number(x) \|\| 0` menyembunyikan data rusak | Selesai | `db/convert.ts` `toInt(value, fallback)`: null memakai fallback (sama dengan default kolom), nilai bukan bilangan bulat melempar error. Dipakai di repo dan status snapshot |
| H-13 | Rendah | Pembulatan `toFixed(2)` per baris di loop akumulasi | Selesai | `signedDecimal` (tanpa pembulatan) di `sign.ts`; Revenue dan Budget menjumlah Decimal lalu membulatkan sekali |
| H-14 | Rendah | Boilerplate berulang | Selesai | `activePeriodsOf`, `entitiesOfFilter` (`lib/core/filter-scope.ts`, 9 tempat); `metricLoaderDeps` (9 route); `chart-axis.ts` (3 grafik); `EntityDonut` memakai `DonutRing` |
| H-15 | Rendah | Paginasi `OFFSET` di `gl-journal.repo` dan `bank-payment.repo` | **Belum** | Lihat di bawah |

## Kenapa H-15 belum dikerjakan

`OFFSET` di database hanya dipakai dua query (daftar baris jurnal dan daftar transaksi dana belum cair); level drill lain memotong daftar di memori (`pageOf`). Kontrak `offset` mengalir dari klien (`drill.queries.ts`) lewat `drill.fn.ts` ke semua level drill. Paginasi keyset berarti mengganti kontrak itu menjadi kursor (`trans_date`, `gl_id`, `coa_id`, segmen), mengubah penggabungan beberapa tabel GL, dan kondisi `WHERE` berbentuk OR-bertingkat yang harus diuji di **MySQL 5.7 sungguhan**. Disarankan dikerjakan sebagai perubahan tersendiri **setelah** ada pengukuran bahwa halaman dalam benar-benar lambat.

## Catatan perilaku

- `toInt` kini **melempar error** bila kolom integer berisi nilai yang bukan bilangan bulat (dulu menjadi 0 diam-diam).
- Revenue dan Budget menjumlah tanpa pembulatan per baris; hasil sama untuk uang 2 desimal.
- Alias SQL snapshot AP/AR berubah (`invoiceId`); tabel snapshot tidak berubah.
