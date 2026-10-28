# Fase 11 – Drill-down side sheet

> Bagian dari rencana implementasi Finance Dashboard · Indeks & aturan umum: [README.md](./README.md)
> Sebelumnya: [10_phase-halaman-metrik.md](./10_phase-halaman-metrik.md) · Berikutnya: [12_phase-export-print.md](./12_phase-export-print.md)
>
> **Wajib sebelum mulai fase ini:** baca [README.md](./README.md) §1 (cara memakai), §2 (aturan emas G1–G38), dan §5 (konvensi kode). Semua langkah fase sebelumnya (10_phase-halaman-metrik.md) sudah lulus "✅ Cek selesai".

---

## Langkah 11.1 — State drill-down di URL

📁 File: ➕ `src/components/drill/DrillSheet.tsx`, ➕ `src/components/drill/JournalList.tsx`, ➕ `src/functions/drill.fn.ts`, ➕ `src/server/services/drill.service.ts`

- State disimpan di search param `drill` (`drillSchema`, langkah 7.1) → bisa di-bookmark & dibagikan (F5).
- `DrillSheet` memakai `ui/sheet` dari kanan (ponsel: layar penuh), diberi atribut `data-drill-sheet` (disembunyikan saat cetak), berisi breadcrumb dari `drill.steps`, tabel level berikutnya, tombol kembali satu level, tombol tutup (menghapus param `drill`).
- Baris kategori di tabel halaman bisa di-expand di tempat (hybrid F5); klik baris paling dalam atau tombol "Lihat transaksi" membuka sheet.

Jalur drill-down per metrik (dari `data-model.md` §6):

| Metrik (`drill.metric`) | Urutan level (`kind`) |
|---|---|
| `revenue` | `folder` → `account` → `entity` → jurnal |
| `cashPosition` | `section` (Kas/Bank) → `folder` → `account` → jurnal |
| `inTransit` | `channel` → `entity` → `date` → transaksi `bank_payment` |
| `cashFlow` | `section` (laci) → `subrow` → `account` (lawan) → jurnal |
| `pnl` | `section` (baris P&L) → `folder` → `account` → `entity` → jurnal |
| `expensePaid` | `section` (kategori/folder beban) → `entity` → `vendor` → pembayaran |
| `apAging` | `bucket` → `vendor` → `card` → riwayat pelunasan |
| `arAging` | `bucket` → `customer` → `card` → riwayat pelunasan |
| `fixedCost` | `folder` → `account` → `entity` → jurnal |
| `paymentPlan` | `day` → daftar tagihan (vendor, nomor, sisa, jatuh tempo, status rencana bayar) |
| `budget` | `section` → `folder` → `account` → `entity` → jurnal (actual) |

## Langkah 11.2 — Query drill-down

`getDrillFn` (GET, `authMiddleware`, input = `metricInputSchema` + `drillSchema` + `{ offset: number }`) mengembalikan `{ columns: Array<{ id; label; kind: 'text' | 'code' | 'money' | 'date' | 'status' }>; rows: Array<Record<string, string | null>>; nextKind: string | null; hasMore: boolean }`.

Daftar jurnal (`gl.repo.ts` → `journalLines`):

```sql
SELECT g.gl_id AS glId, g.journal_number AS journalNumber, g.trans_date AS transDate,
       g.journal_type AS journalType, g.memo AS memo, d.coa_id AS coaId,
       SUM(d.debet) AS debet, SUM(d.credit) AS credit
FROM <gl> g
JOIN <gl_detail> d ON d.gl_id = g.gl_id
WHERE g.posted_status = 1
  AND g.canceled_date IS NULL
  AND g.period_id IN (?, …)                -- or trans_date for balances/daily views
  AND d.coa_id IN (?, …)
  [AND d.<segCol> IN (?, …)]
GROUP BY g.gl_id, g.journal_number, g.trans_date, g.journal_type, g.memo, d.coa_id
ORDER BY g.trans_date DESC, g.gl_id DESC
LIMIT 200 OFFSET ?;
```

Riwayat pelunasan kartu AP/AR:

```sql
SELECT p.ap_ar_card_id AS cardId, p.transaction_type AS transactionType,
       p.transaction_number AS transactionNumber, DATE(p.transaction_date) AS txDate, d.amount AS amount
FROM ap_ar_card_detail d
JOIN ap_ar_card p ON p.ap_ar_card_id = d.ap_ar_card_id
WHERE d.invoice_id = ?
ORDER BY p.transaction_date, p.ap_ar_card_id;
```

- `journal_type` ditampilkan sebagai label kelompok §3.4 (kunci i18n `journalType.cashIn`, `journalType.cashOut`, `journalType.sales`, `journalType.purchase`, `journalType.loan`, `journalType.fixedAsset`, `journalType.adjustment`, `journalType.wasteBank`) + kode angka kecil.
- Nomor jurnal, nomor dokumen, dan kode akun memakai font mono.
- "Muat lebih banyak" menambah `offset` 200.

✅ Cek selesai:
- ⛔ IZIN USER: dari halaman Pendapatan, drill folder → akun → entitas → jurnal berjalan; URL berisi `drill`; reload membuka sheet di level yang sama; Σ baris jurnal = angka di level atasnya.
- Esc menutup sheet dan fokus kembali ke baris yang diklik.
