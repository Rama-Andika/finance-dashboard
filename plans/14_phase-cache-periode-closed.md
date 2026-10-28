# Fase 14 – Cache periode Closed

> Bagian dari rencana implementasi Finance Dashboard · Indeks & aturan umum: [README.md](./README.md)
> Sebelumnya: [13_phase-data-perlu-dicek.md](./13_phase-data-perlu-dicek.md) · Berikutnya: [15_phase-seed-db-lokal.md](./15_phase-seed-db-lokal.md)
>
> **Wajib sebelum mulai fase ini:** baca [README.md](./README.md) §1 (cara memakai), §2 (aturan emas G1–G38), dan §5 (konvensi kode). Semua langkah fase sebelumnya (13_phase-data-perlu-dicek.md) sudah lulus "✅ Cek selesai".

---

📁 File: ✏️ `src/server/cache.ts`, ➕ `src/server/cache.test.ts`, ✏️ `src/server/repo/gl.repo.ts` (pembungkus), ✏️ `src/functions/settings.fn.ts`

## Langkah 14.1 — Cache memori

```ts
export function createLruCache<V>(opts: { maxEntries: number; ttlMs: number }): {
  get(key: string, nowMs?: number): V | undefined
  set(key: string, value: V, nowMs?: number): void
  clear(): void
  size(): number
}
export function memo<V>(key: string, ttlMs: number, loader: () => Promise<V>): Promise<V>   // from step 7.3
export function hashIds(ids: readonly string[]): string   // first 16 chars of sha1 over the sorted IDs
```

- Satu cache agregat GL: `maxEntries: 500`, `ttlMs: 6 jam`.
- **Hanya** periode berstatus `Closed` yang di-cache (D20). Kunci: `mv|<table>|<periodeId>|Closed|<hashIds(segIds)>|<hashIds(coaIds)>|<groupBy>`.
- `movementsByPeriods` memecah periode: yang `Closed` diambil per periode dari cache (bila kosong → query → simpan); yang `Open`/`Pre Closed` selalu dihitung ulang.
- `saveAccountMappingFn` memanggil `clear()` pada semua cache setelah simpan berhasil.

✅ Cek selesai (test wajib, loader palsu yang menghitung jumlah panggilan):
- Panggilan kedua dengan kunci sama tidak memanggil loader.
- Entri kedaluwarsa setelah TTL (pakai `nowMs`).
- Entri paling lama dibuang saat melebihi `maxEntries`.
- Periode `Open` tidak pernah masuk cache.
