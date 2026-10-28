# Fase 13 – Panel "Data perlu dicek"

> Bagian dari rencana implementasi Finance Dashboard · Indeks & aturan umum: [README.md](./README.md)
> Sebelumnya: [12_phase-export-print.md](./12_phase-export-print.md) · Berikutnya: [14_phase-cache-periode-closed.md](./14_phase-cache-periode-closed.md)
>
> **Wajib sebelum mulai fase ini:** baca [README.md](./README.md) §1 (cara memakai), §2 (aturan emas G1–G38), dan §5 (konvensi kode). Semua langkah fase sebelumnya (12_phase-export-print.md) sudah lulus "✅ Cek selesai".

---

📁 File: ➕ `src/server/repo/data-checks.repo.ts`, ➕ `src/server/services/data-checks.service.ts`, ➕ `src/functions/data-checks.fn.ts`, ➕ `src/components/data-checks/DataChecksPanel.tsx`

## Langkah 13.1 — Daftar pemeriksaan

| Kode | Pemeriksaan | Sumber | Tingkat |
|---|---|---|---|
| `Q1b` | Tagihan AP non-dagang (type 1) yang ber-`payment_status = 2` tanpa baris pelunasan (§4.7). `payment_status` di sini **hanya** penanda pemeriksaan, tidak dipakai untuk angka (G21) | `ap_ar_card` + `ap_ar_card_detail` | warning |
| `Q7` | Vendor/pelanggan di kartu yang tidak ada di master | `ap_ar_card.owner_id` | warning |
| `Q8` | Lokasi kartu yang tidak ada di `pos_location` | `ap_ar_card.location_id` | warning |
| `Q9` | Dana belum cair > 7 hari atau bertanggal di masa depan | `bank_payment` (type 1/2, status 0) | warning |
| `AR_UNALLOC` | Pembayaran pelanggan tanpa alokasi (tidak dihitung, D25) | langkah 9.9 | warning |
| `CF_UNCLASSIFIED` | Arus kas "Belum terklasifikasi" (jumlah & nilai) | langkah 9.6 | warning |
| `CF_IDENTITY` | Kas awal + arus kas ≠ kas akhir | langkah 9.6 | danger |
| `REC_TRANSIT` | Saldo GL Dana dalam pencairan ≠ register `bank_payment` | langkah 9.3 | warning |
| `REC_AP` | Subledger AP ≠ saldo GL akun kontrol | langkah 9.8 | warning |
| `UNPOSTED` | Jumlah jurnal `posted_status = 0` dalam rentang (angka belum final, §4.1) | `gl` | warning |
| `SETTINGS` | Pemetaan akun masih default / rusak / ada akun dihapus | langkah 8.6 | warning |

Contoh query `Q9`:

```sql
SELECT COUNT(*) AS n, COALESCE(SUM(bp.amount), 0) AS amount
FROM bank_payment bp
WHERE bp.type IN (1, 2) AND bp.status = 0
  AND (bp.transaction_date < ? OR bp.transaction_date >= ?)   -- today − 7 days · today + 1 day
  [AND bp.segment1_id IN (?, …)];
```

Server function: `getDataChecksFn` (GET, `authMiddleware`, input `metricInputSchema`) mengembalikan `Array<{ code: string; level: 'warning' | 'danger'; count: number; amount: Money | null; link: string }>`; teks pesannya dari i18n (`dataChecks.<code>`).

## Langkah 13.2 — Tampilan

- Ikon `Bell` di TopBar menampilkan jumlah temuan; klik membuka sheet "Data perlu dicek" berisi `Notice` per temuan (kalimat pertama tebal menyebut jumlah/nilai, satu kalimat akibat, satu tautan ke rincian).
- Di halaman terkait, temuan yang relevan juga tampil sebagai `Notice` di atas kartu yang bersangkutan (maks 2 Notice bertumpuk; sisanya lewat tautan "Lihat semua").

✅ Cek selesai:
- ⛔ IZIN USER: di DB `demo`, `Q9` menemukan ±9 baris (§4.7) dan `CF_UNCLASSIFIED`/sumber "aturan bawaan" tampil (setup `demo` tidak valid, §2.2).
