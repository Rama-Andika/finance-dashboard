# Rencana Revisi — Oxy Finance Dashboard (13 poin)

Dokumen perencanaan saja: **belum ada kode yang ditulis**. Ditulis supaya bisa dikerjakan langkah demi langkah oleh model/pengembang lain. Semua nama file relatif ke root proyek.

Keputusan user (sudah dijawab):
- Poin 2: daftar **periode nyata** dari tabel `periode` (preset YTD / 12 bulan tetap ada di atasnya).
- Poin 3–6, 12: **tabel ringkasan baru berawalan `dash_` di database ERP** (bukan database terpisah), diperbarui terjadwal oleh proses Node bersama aplikasi, **dengan fitur migrasi database** (lihat bagian "Fitur migrasi").
- Poin 9–10: **paginasi dan sort di server**.
- Poin 8: **angka penuh `1,000,000` di tabel dan detail; ringkas di kartu KPI dengan pemisah yang sama** (mis. `42.56B`).

Urutan kerja yang disarankan: **Tahap A** (poin 1, 7, 13, 11, 8, 2 — kecil, tidak bergantung satu sama lain) → **Tahap B** (poin 9–10, tabel server) → **Tahap C** (poin 3–6, 12, tabel ringkasan; paling besar, keputusan infrastruktur sudah final di bagian "Keputusan user untuk Tahap C").

---

## Tahap A — perbaikan kecil

**Status (dikerjakan):** poin 1, 2, 7, 8, 11, 13 selesai di kode; `tsc` bersih, 173 unit test lulus, build berhasil. Diverifikasi di browser: halaman login (nama, footer, tema, bahasa). **Belum diverifikasi di browser** karena butuh login: alur logout→login ke halaman asal (poin 1), pemilih periode (poin 2), dan format angka di halaman data (poin 8) — hanya diuji lewat unit test.

### Poin 1 — setelah logout lalu login, kenapa ke Summary?

**Penyebab (terverifikasi di kode):** `src/components/neraca/TopBar.tsx`, fungsi `handleLogout`, memanggil `router.navigate({ to: '/login', search: { redirect: '/summary' } })`. Jadi tujuan setelah login selalu `/summary`, apa pun halaman sebelumnya. (Kalau sesi *kedaluwarsa*, `_authed.tsx` sudah benar: ia mengirim `redirect: location.href`.)

**Perbaikan:**
1. Di `handleLogout`, isi `redirect` dengan alamat halaman saat ini lengkap dengan query string (path + filter entitas/periode), bukan `/summary`.
2. Alamat itu datang dari URL, jadi **harus divalidasi**: hanya path internal yang diawali satu `/` (bukan `//` dan bukan `http…`). Skema di `src/routes/login.tsx` baru memeriksa `startsWith('/')`; perketat agar `//evil.com` ditolak (open redirect).
3. `login.tsx` memakai `router.navigate({ to: search.redirect })` dengan `to` berisi string yang menyertakan query; pastikan query string ikut terbawa (gunakan `href`/`location` yang sesuai, bukan memisah manual) dan `drill` (JSON) tidak merusak validasi.

**Cek:** buka `/profit-loss?preset=ytd&entity=…` → logout → login → harus kembali ke halaman itu dengan filter yang sama. Uji juga redirect berbahaya (`?redirect=//example.com`) → harus jatuh ke `/summary`.

### Poin 7 — nama proyek: **Oxy Finance Dashboard**

Teks tampilan yang mengandung "Neraca" (terverifikasi dengan grep):
- `src/routes/__root.tsx:17` judul tab `Neraca — Finance Dashboard`
- `src/routes/login.tsx:109` judul `Neraca`
- `src/components/neraca/SidebarNav.tsx:66` merek di sidebar
- `src/components/export/PrintHeader.tsx:26` kepala cetak `Neraca — {title}`
- `src/i18n/locales/en.json:32` dan `id.json:32` (`Sign in to Neraca` / `Masuk ke Neraca`)
- cek juga `package.json` (`name`), `README`/`docs/*.md` bila ada kata "Neraca" sebagai nama produk, dan `docs/design/` (artefak desain; ubah teks produknya saja).

Yang **sengaja tidak diganti** (nama internal, mengganti berisiko): folder `src/components/neraca/`, `src/styles/neraca.css`, awalan kelas CSS `nr-`, nama cookie `nr_theme`/`nr_lang`/`nr_session` (mengganti nama cookie sesi membuat semua pengguna logout), `globalThis.__nrPool`. Catat ini di dokumen agar tidak dianggap ketinggalan. Opsional terpisah: ganti nama folder/CSS setelah semua selesai.

**Cek:** `grep -ri neraca src` hanya menyisakan nama internal di atas; judul tab, login, sidebar, hasil cetak menampilkan "Oxy Finance Dashboard".

### Poin 13 — footer "dibuat oleh www.oxysystem.com"

- Tambah satu komponen footer kecil, dipakai di `src/components/layout/AppShell.tsx` (di bawah `<main>`) dan di halaman `src/routes/login.tsx`.
- Teks lewat i18n (en: `Built by`, id: `Dibuat oleh`) + tautan `https://www.oxysystem.com` dengan `target="_blank"` dan `rel="noopener noreferrer"`.
- Footer ikut tema terang/gelap (pakai token warna yang ada di `src/styles/tokens.css`); disembunyikan atau disederhanakan di cetak (`print.css`) — **atau** ditampilkan di kepala cetak; putuskan saat implementasi (default: tampil kecil di akhir cetak).
- Pada layout mobile footer tidak boleh menutupi konten atau memicu scroll horizontal.

**Cek:** footer tampil di semua halaman berlogin + halaman login, tautan terbuka di tab baru, kontras warna cukup di tema gelap.

### Poin 11 — ganti theme dan language terasa tidak mulus

**Penyebab (terverifikasi di kode):** `TopBar.tsx`, `toggleTheme` dan `toggleLang` menunggu `setPrefsFn` (panggilan ke server), lalu memanggil `router.invalidate()`. `invalidate()` menjalankan ulang semua `beforeLoad`/loader halaman dan merender ulang pohon dari root, sehingga ada jeda dan kedipan; tema baru baru terlihat setelah putaran server selesai.

**Perbaikan:**
1. **Optimistis:** ubah dulu di klien (atribut tema pada elemen `<html>` / kelas, `i18n.changeLanguage`) lalu simpan cookie di latar belakang (fire-and-forget; bila gagal, kembalikan dan tampilkan pesan kecil).
2. Hapus `router.invalidate()` untuk dua aksi ini. Data halaman tidak bergantung pada tema/bahasa, kecuali teks yang dibuat server — pastikan server mengembalikan **kunci** (sudah menjadi aturan proyek), bukan teks jadi.
3. Cegah kilatan: transisi warna ringan (`background-color`, `color`, `border-color`, ±150 ms) pada `body` dan komponen utama, dihormati `prefers-reduced-motion` (sudah ada di `neraca.css:7`). Hindari `transition: all`.
4. Di render server (SSR), tema/bahasa sudah dibaca dari cookie (`prefs.fn.ts`); pastikan nilai klien dan SSR tetap sama saat muat ulang (tidak ada hydration mismatch).
5. Format angka/tanggal ikut bahasa (lihat poin 8: pemisah angka kini sama di kedua bahasa, jadi ganti bahasa tidak mengubah angka).

**Cek:** klik tema/bahasa → perubahan tampak < 100 ms, tidak ada permintaan jaringan yang memblokir, tidak ada kedipan putih; muat ulang halaman menghasilkan tema/bahasa yang sama.

### Poin 8 — satu format uang: `1,000,000`

Keadaan sekarang (`src/lib/format/number.ts`): `formatMoneyFull` memakai `.` ribuan dan `,` desimal untuk bahasa Indonesia, dan `,` / `.` untuk Inggris; `formatMoneyShort`/`formatAmountShort`/`formatAxisShort` memakai satuan berbeda per bahasa (`Jt`, `M` di id; `M`, `B` di en). 92 pemakaian di komponen/route.

Keputusan: **satu format untuk semua bahasa**: pemisah ribuan `,`, desimal `.`.
1. `formatMoneyFull`: abaikan `lang` untuk pemisah → `1,000,000`; desimal (bila dipakai) `1,000,000.50`. Pertahankan aturan yang ada: tanpa desimal secara default; negatif tampil `(1,000)` — **konfirmasi dengan user** bila ingin tanda minus (`-1,000`) sebagai pengganti kurung.
2. Angka ringkas di KPI: pemisah desimal `.` untuk kedua bahasa dan **satu set satuan** (`K`, `M`, `B`, `T`; contoh `42.56B`). Hapus cabang `lang === 'id'` (`Jt`, spasi tipis/NBSP khusus id). `formatAxisShort` mengikuti.
3. `formatPercent` dan `DeltaPill`: saat ini `,` desimal untuk id. Samakan jadi `.` agar konsisten satu format (`12.34%`).
4. Kolom ekspor CSV (`ExportCsvDialog`) punya pilihan pemisah sendiri untuk spreadsheet — **biarkan** (itu pilihan pengguna untuk Excel).
5. Perbarui test: `src/lib/format/number.test.ts` (ekspektasi `Rp 42,56 M`, `Jt`, dll. harus diganti), dan test lain yang menyebut hasil format. Tambah test tabel-kebenaran: 0, 999, 1,000, 1,000,000, 999,999,999, negatif, pembulatan batas (`999.995` → ke satuan berikutnya), nilai sangat besar (T).
6. Awalan mata uang (`Rp`/`IDR`): tetapkan satu (default: tidak ditulis di setiap angka bila judul kolom/kartu sudah memuat "(IDR)"; di KPI tampil `IDR`). Konfirmasi saat implementasi.

**Cek:** `grep -rn "formatMoney\|formatAmount\|formatAxis" src` — semua jalur melewati fungsi yang sama; tidak ada `toLocaleString`/`Intl.NumberFormat` lepas di komponen (cek dengan grep).

### Poin 2 — Period select dari tabel `periode`

Keadaan sekarang: `src/components/neraca/PeriodSelect.tsx` hanya punya 5 preset tetap; label ditambah petunjuk bulan (`presetHints`) dari `resolvePeriod`; mode maju untuk Payment Plan (7/14/30 hari). Tabel `periode` sudah dibaca server (`listPeriods`, `getCachedPeriods`) dengan kolom id, nama, tanggal mulai/akhir, status (Open / Pre Closed / Closed), tipe (reguler / periode 13), nama tabel GL.

Keputusan: dropdown berisi **periode nyata**, preset tetap ada di atasnya.
1. **Sumber data:** tambahkan server function (mis. `getPeriodOptionsFn`) yang mengembalikan daftar periode dari `getCachedPeriods()` (sudah di-cache 10 menit) — hanya id, nama, mulai, akhir, status, tipe. Bentuknya lewat `filterOptionsQueryOptions` yang sudah ada di `src/queries/filters.queries.ts` (cek isinya, perluas bila cocok).
2. **Tampilan:** di dalam popover, bagian atas = preset (Bulan ini, Bulan lalu, Kuartal ini, YTD, 12 bulan), bagian bawah = daftar periode terurut terbaru dulu, tiap baris `Okt 2026 · Open`. Pilihan **satu periode** atau **rentang dari–sampai**. Periode tipe 13 hanya muncul bila saklar "Termasuk periode 13" aktif. Tampilkan lencana status (Open/Closed) karena angka periode Open belum final.
3. **URL & skema:** `globalSearchSchema` (`src/lib/filters/search-schema.ts`) kini hanya `preset` enum. Tambah bentuk lain: `from` dan `to` (id periode atau `YYYY-MM`), tervalidasi terhadap daftar periode di server; bila `from/to` ada, `preset` diabaikan. Pertahankan kompatibilitas tautan lama (`preset=ytd`).
4. **Server:** `resolvePeriod` (`src/lib/finance/periods.ts`) harus bisa menerima rentang eksplisit selain preset; hitung `d1`, `asOf` (tidak melewati hari ini, aturan data-model §1.2), `periodIds`, `months`, dan **periode pembanding** (rentang sama panjang sebelumnya). Tambah test seperti yang sudah ada untuk preset (`periods.test.ts`).
5. **Mode Payment Plan** (horizon 7/14/30 hari ke depan) tidak berubah; periode tidak berlaku di sana.
6. Daftar bisa panjang (belasan tahun): beri pencarian/pengelompokan per tahun atau daftar yang dapat digulir, jangan merender ratusan baris sekaligus.
7. **Kunci cache:** kunci metrik di server (`memoMetric`) dan klien (`qk.metric`) memuat input, jadi rentang baru otomatis menjadi kunci berbeda; cek tidak ada tempat yang masih mengandalkan enum preset saja (grep `preset` di `src/server` dan `src/queries`).

**Cek:** pilih Sep 2026 saja → semua halaman menampilkan Sep 2026 dan pembanding Agu 2026; pilih rentang Jan–Sep; periode Open berlabel; tautan lama `?preset=ytd` tetap bekerja.

---

## Tahap B — tabel besar (poin 9 dan 10)

**Status (dikerjakan):** selesai untuk tabel vendor (Payables), customer (Receivables), tagihan 7 hari (Summary), dan daftar di drill-down AP/AR/Payment Plan. Yang sengaja **belum**: (1) paginasi keyset untuk daftar jurnal (tetap OFFSET + "muat lagi" 200 baris); (2) sort di kolom drill-down (urutan tetap: saldo terbesar / jatuh tempo terlama); (3) tabel laporan berbentuk pohon (P&L, Revenue, Budget, Cash Flow) tidak diubah sesuai rencana. Catatan: halaman Payables/Receivables/Summary baru benar-benar cepat setelah Tahap C, karena data dasarnya (AP Aging) masih dihitung dengan query lama yang lambat; Tahap B hanya mengecilkan payload dan DOM.

### Prinsip
Tabel **tidak pernah** menerima atau merender semua baris. Server mengirim satu halaman dan total baris; urutan diproses di server (supaya benar untuk seluruh data, bukan hanya halaman yang tampil).

### Kontrak data (satu pola untuk semua tabel besar)
- Masukan: `page` (mulai 1), `pageSize` (pilihan 25/50/100, default 25, **maksimum dipaksa di server**), `sortBy` (kunci kolom dari **daftar putih** per tabel), `sortDir` (`asc`/`desc`), dan kata pencarian bila ada.
- Keluaran: `rows`, `total`, `page`, `pageSize`, serta total keseluruhan (jumlah uang dari **semua** baris, bukan hanya halaman) bila tabel punya baris total.
- Validasi dengan zod di server function; `sortBy` yang tidak ada di daftar putih ditolak (tidak pernah dimasukkan ke SQL sebagai teks).
- Sort stabil: selalu tambahkan kunci pembeda (id) di urutan akhir supaya halaman tidak melompat.
- Pindah halaman / ganti sort tidak memuat ulang metrik lain: gunakan query terpisah per tabel (`keepPreviousData`/placeholder agar tabel tidak berkedip).

### Tabel yang terdampak dan kolom sort yang disarankan
| Tabel (halaman) | Ukuran | Kolom bisa diurutkan |
|---|---|---|
| Daftar vendor (Payables) | ribuan | Nama, Total hutang, Jatuh tempo lewat (overdue), tiap bucket aging |
| Daftar customer (Receivables) | ribuan | Nama, Total piutang, Overdue, bucket aging |
| Tagihan jatuh tempo (Payment Plan, Summary 7 hari) | puluhan ribu bila "semua" | Tanggal jatuh tempo (default naik), Jumlah, Vendor, Status rencana bayar |
| Daftar tagihan di drill-down (AP/AR) | puluhan ribu | Nomor, Tgl transaksi, Jatuh tempo, Saldo |
| Daftar jurnal di drill-down | jutaan | Tgl (default turun), Nomor, Jumlah — **gunakan paginasi keyset** (tanggal + id terakhir) bukan OFFSET |
| Baris laporan (Revenue per folder, P&L, Fixed Cost, Budget, Cash Flow) | puluhan–ratusan, berbentuk pohon | Urutan akuntansi tetap; sort hanya pada kolom jumlah di tingkat yang sama; **tanpa paginasi** (ringkas) |
| Kolom per entitas (Cash Position per entitas, 87 baris) | ≤ ±100 | Nama, Jumlah; paginasi klien sudah cukup |

Aturan: tabel pohon laporan keuangan **tidak** dipaginasi (struktur akuntansi harus utuh) tetapi tetap dibatasi karena jumlah barisnya kecil; tabel "daftar" mendapat paginasi server.

### Komponen UI
- Perluas `src/components/neraca/DataTable.tsx` (kini memuat semua baris, tanpa sort/paginasi): mode `manual` — sort dan paginasi dikendalikan dari luar; header kolom bisa diklik (ikon panah, `aria-sort`), kontrol halaman (sebelumnya/berikutnya, nomor halaman, pilihan ukuran halaman, teks "1–25 dari 162.865").
- Sort & halaman disimpan di URL (`?page=2&sort=balance&dir=desc`) per tabel agar bisa dibagikan dan tahan muat ulang; reset ke halaman 1 saat filter berubah.
- Kartu mobile (`mobileCard`) ikut paginasi.
- Aksesibilitas: tombol header sort dapat diakses keyboard, status sort diumumkan.

### Cek
Tabel 160 ribu baris: waktu respons per halaman < 1 detik (setelah Tahap C), payload < 100 KB, DOM ≤ 100 baris; sort berpindah ke kolom lain mengubah urutan seluruh data (periksa baris pertama vs query langsung).

---

## Tahap C — halaman lambat dan data tidak muncul (poin 3, 4, 5, 6, 12)

### Diagnosis (terukur di DB demo, MariaDB 10.4, semua index `idx_dash_*` sudah terpasang)
| Query | Waktu |
|---|---:|
| AP tagihan terbuka (semua entitas) | **625 dtk**, 162.865 baris |
| Data Checks Q7 vendor | **197 dtk** |
| AP pembayaran belum teralokasi | 15 dtk |
| AR tagihan terbuka | 4,6 dtk |
| Data Checks Q8 | 2,8 dtk |

- **"Data tidak muncul"** di Summary, Payables, Payment Plan: halaman menunggu query AP ±10 menit (Summary dan Payment Plan juga memanggil AP Aging), jadi tetap di skeleton atau kena batas waktu. Receivables (AR) hanya ±5 dtk untuk semua entitas, jadi di sana lambat tetapi tampil.
- **Lebih lambat saat banyak entitas dipilih:** filter `location_id IN (…87 id…)` menambah pekerjaan pada tabel yang `location_id`-nya tidak tersaring baik, dan setiap kombinasi entitas adalah kunci cache berbeda (tiap pilihan baru = query penuh lagi).
- Index tidak cukup: masalahnya jumlah pekerjaan per tagihan (±994 ribu tagihan dibaca, digabung dengan pembayaran, dikelompokkan lewat tabel sementara). Penulisan ulang query dengan tabel turunan di MariaDB malah lebih lambat (strategi `LATERAL DERIVED`, >773 dtk).
- Beberapa tab/permintaan paralel menjalankan query berat yang sama berulang kali selama query pertama belum selesai (terlihat 3 koneksi identik di `processlist`) — cache hanya terisi setelah selesai.

### Keputusan: tabel ringkasan `dash_*` di database ERP ("snapshot")

Prinsip: **tabel ERP tetap hanya dibaca**; dashboard hanya menulis ke tabel barunya sendiri berawalan `dash_` (di database ERP yang sama), yang diisi oleh pekerjaan terjadwal; halaman membaca dari sana (tabel kecil, ber-index tepat), hasil dalam hitungan detik tanpa memandang jumlah entitas.

**Tabel yang direncanakan** (nama contoh):
1. `snap_ap_ar_open` — satu baris per tagihan AP/AR yang masih punya sisa pada tanggal snapshot: id kartu, modul (AP/AR), pihak (vendor/customer), lokasi, akun, tanggal transaksi, jatuh tempo, jenis, jumlah asli, sisa, nomor tagihan, status rencana bayar bila perlu. Index: (modul, lokasi, jatuh tempo), (modul, pihak). Ukuran ±160 ribu baris untuk AP.
2. `snap_ap_ar_unallocated` — pembayaran/retur belum teralokasi (±150 baris AP).
3. `snap_gl_monthly` — jumlah debet/kredit per (periode, akun, segmen entitas). Periode **Closed** dihitung sekali dan tidak diubah; periode **Open/Pre Closed** dihitung ulang tiap siklus. Memakai ini, Revenue, P&L, Fixed Cost, Budget, Cash Position (saldo), Runway menjadi query ringan lintas ±87 entitas.
4. `snap_cash_lines` (opsional, bila Cash Flow masih lambat): garis jurnal kas per periode, atau hasil klasifikasi Cash Flow per periode.
5. `snap_checks` — hasil Data Checks (Q1b, Q7, Q8, Q9, jurnal belum diposting, rekonsiliasi) dihitung oleh pekerjaan terjadwal, dibaca panel seketika (poin 12).
6. `snap_meta` — waktu terakhir tiap snapshot berhasil, durasi, jumlah baris, status/galat. Dipakai untuk label **"Data per 28 Okt 2026, 08.00"** di sidebar (blok yang sebelumnya dikodekan statis dan sudah dihapus; kini diisi dari sini) dan peringatan bila snapshot terlalu lama.

**Pekerjaan terjadwal (refresh)** (penjadwal dan frekuensi: lihat "Keputusan user untuk Tahap C"):
- Modul refresh (mis. `src/server/dash/refresh.ts`, dipicu timer di proses server; juga bisa dipanggil dari `scripts/refresh-snapshots.ts`) yang membaca ERP dengan query yang sudah ada (diberi batas waktu), menulis ke skema dashboard dengan pola *bangun di tabel bayangan lalu tukar* (`RENAME TABLE` atomik) agar halaman tidak pernah melihat data setengah jadi.
- Frekuensi (diputuskan): AP/AR dan GL periode Open tiap 10 menit, Data Checks tiap 30 menit; periode Closed sekali lalu hanya bila statusnya berubah (deteksi lewat status di tabel `periode`).
- Kunci pelaksanaan: hanya satu refresh berjalan pada satu waktu (kunci advisory `GET_LOCK`), refresh gagal tidak menimpa snapshot lama, galat dicatat di `snap_meta`.
- Dua mode jalan: timer di proses server **dan** tombol "Segarkan sekarang" untuk admin (ditolak bila refresh sedang berjalan).

**Aturan pemakaian di aplikasi:**
- Halaman "per hari ini" (AP/AR Aging, Payment Plan, Data Checks, Cash Position saat ini) membaca snapshot.
- Permintaan dengan tanggal acuan (`asOf`) lampau di AP/AR tidak ada di snapshot harian → pilihan: (a) tetap memakai query langsung ERP dengan batas waktu dan peringatan "mungkin lambat", atau (b) menyimpan snapshot akhir bulan tiap periode Closed. Putuskan bersama user (lihat pertanyaan terbuka).
- Filter entitas = `WHERE lokasi IN (…)` pada tabel snapshot kecil ber-index → cepat untuk berapa pun entitas.
- Setelah migrasi, hapus cache 60 detik/5 menit yang tidak lagi diperlukan untuk jalur itu, tetapi **pertahankan** pembagian permintaan yang sama (satu permintaan sedang berjalan dipakai bersama, sudah ada di `memo`).
- Tetap pertahankan konsistensi angka: uji bahwa total AP Aging dari snapshot = total dari query langsung ERP pada tanggal yang sama (rekonsiliasi) dan tetap mencocokkan saldo GL akun kontrol (fitur rekonsiliasi yang sudah ada).

**Poin per halaman:**
- **Poin 3 Summary:** membaca snapshot untuk AP Aging, Payment Plan 7 hari, Cash Position, P&L, Revenue, Runway, Fixed Cost; tidak ada query besar saat halaman dibuka. Jika snapshot belum ada (instalasi baru), tampilkan keadaan kosong yang jelas dengan tombol/petunjuk menjalankan refresh — bukan skeleton selamanya.
- **Poin 4 Payables:** daftar vendor + bucket dari `snap_ap_ar_open` dengan agregasi per vendor di SQL; daftar tagihan lewat paginasi server (Tahap B).
- **Poin 5 Receivables:** sama untuk AR.
- **Poin 6 Payment Plan:** tagihan jatuh tempo dan arus kas harian dari snapshot; saldo kas awal dari snapshot saldo kas.
- **Poin 12 Data verification drawer:** membaca `snap_checks`; tidak lagi menjalankan Cash Flow/AP/AR/Q7/Q8 saat dibuka. Tampilkan "diperiksa pada …" dari `snap_meta`.

### Hal yang tetap perlu diperbaiki di query ERP (dipakai oleh pekerjaan refresh)
Karena refresh tetap membaca ERP, ia harus selesai dalam batas waktu wajar (target < 10 menit, di luar jam sibuk bila perlu):
- AP tagihan terbuka: tulis ulang dalam dua langkah di aplikasi/skrip (jumlahkan pembayaran per tagihan dari `ap_ar_card_detail` di satu query, ambil tagihan di query lain, gabungkan di memori atau tabel sementara), hindari satu query besar `GROUP BY` 12 kolom. Ukur di **MySQL 5.7 sungguhan** (optimizer MariaDB berbeda).
- Q7 vendor: ganti menjadi pencarian `owner_id` yang tidak ada di `vendor` lewat himpunan (ambil `DISTINCT owner_id` modul AP lewat index lalu cocokkan dengan `vendor`), bukan join per kartu.
- Semua langkah baru wajib kompatibel MySQL 5.7 (tanpa CTE/window function/LATERAL) — `src/server/repo/sql-guard.test.ts` tetap berlaku.

### Keputusan user untuk Tahap C (final)

| Pertanyaan | Keputusan |
|---|---|
| Lokasi tabel | **Tabel baru berawalan `dash_` di database ERP yang sama** (bukan database terpisah). Nama database diambil dari `DATABASE_URL`, sehingga bisa dipindah ke database lain kelak hanya dengan konfigurasi. |
| Penjadwal | **Proses Node bersama aplikasi**: timer di server + kunci DB (`GET_LOCK`) agar tidak ganda bila ada lebih dari satu proses. |
| Kesegaran | **AP/AR dan GL periode Open: 10 menit; Data Checks: 30 menit.** Label "Data per hh:mm" selalu tampil; tombol "Segarkan sekarang" untuk admin. |
| `asOf` lampau di AP/AR | **Snapshot akhir bulan tiap periode Closed** disimpan sekali (tabel `dash_snap_ap_ar_month_end`), dipakai untuk perbandingan dan tanggal lampau. Tanggal bebas di tengah bulan tidak didukung cepat. |
| Kolom "terakhir diubah" di ERP | **Tidak ada** (diperiksa di `src/server/db/schema.ts` dan `schema/columns.csv`): `ap_ar_card` dan `ap_ar_card_detail` hanya punya `create_date`. Konsekuensi: refresh inkremental hanya bisa menangkap baris **baru** (lewat `create_date` / id terbesar); perubahan atau penghapusan baris lama tidak terdeteksi. Maka: refresh penuh tiap siklus untuk AP/AR terbuka (hasilnya hanya ±160 ribu baris), dan satu **rekonsiliasi penuh** harian. Inkremental baru dipertimbangkan bila refresh penuh melebihi target waktu. |

Catatan keamanan akibat tabel `dash_` berada di database ERP: akun DB dashboard butuh hak tulis (CREATE/INSERT/UPDATE/DELETE/DROP) di database itu. MySQL tidak bisa membatasi hak berdasarkan awalan nama tabel, jadi **kode wajib** hanya menulis ke tabel berawalan `dash_`: semua tulis lewat satu modul (`src/server/dash/`), nama tabel tulis ditetapkan konstan (bukan dari input), dan ada tes statis (seperti `sql-guard.test.ts`) yang gagal bila ada `INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE` ke tabel tanpa awalan `dash_`. Dev memakai akun yang sama dengan sekarang. Pada produksi, sebaiknya akun migrasi (hak DDL) dipisahkan dari akun aplikasi (hak INSERT/UPDATE/DELETE pada `dash_*`).

### Fitur migrasi database (permintaan user) — memakai drizzle-kit

Tujuan: struktur tabel `dash_*` dibuat dan diubah lewat berkas migrasi berversi, bukan SQL manual, supaya dev, staging, dan produksi sama dan perubahan bisa dilacak.

**Keputusan:** memakai **drizzle-kit** (sudah terpasang, v0.31) dengan konfigurasi dan folder **terpisah** dari yang dipakai untuk membaca struktur ERP. Alasan: biaya kecil dan tipe TypeScript untuk tabel `dash_*` otomatis. Kekurangan yang diterima: drizzle-kit **tidak punya rollback otomatis**.

Mengapa konfigurasi lama tidak dipakai langsung: `drizzle.config.ts` sekarang memuat daftar tabel ERP di `tablesFilter` (dipakai `db:pull`) dan hanya mau jalan di `localhost`. Menambah tabel `dash_*` ke sana mencampur dua tujuan.

Rancangan:
1. **Skema terpisah:** `src/server/dash/schema.ts` hanya berisi tabel `dash_*` (tidak mengimpor atau mengubah `src/server/db/schema.ts`). Tiap tabel memakai tipe ID string yang sama dengan ERP (`bigint` string) dan DECIMAL sebagai string.
2. **Konfigurasi terpisah:** `drizzle.dash.config.ts` dengan `schema: './src/server/dash/schema.ts'`, `out: './drizzle-dash'`, `tablesFilter: ['dash_*']`, dan `migrations: { table: 'dash_migrations' }` (nama tabel pelacak berawalan `dash_`, bukan `__drizzle_migrations`). Pemeriksaan "hanya localhost" hanya berlaku untuk `generate`/studio; `migrate` terhadap staging/produksi dijalankan dengan konfigurasi eksplisit dan konfirmasi.
3. **Perintah (package.json):**
   - `db:dash:generate` → `drizzle-kit generate --config drizzle.dash.config.ts` (membuat berkas SQL; tidak menyentuh DB).
   - `db:dash:migrate` → menjalankan berkas yang belum diterapkan.
   - `db:dash:check` → memeriksa konsistensi berkas migrasi dan snapshot-nya (untuk CI).
   - **Jangan membuat skrip `push` untuk konfigurasi ini, dan jangan menjalankan `drizzle-kit push` terhadap DB ERP.** `push` membandingkan DB dengan skema lalu bisa menjatuhkan tabel yang tidak dikenal.
4. **Peninjauan berkas hasil `generate`:** setiap berkas SQL ditinjau manual sebelum di-commit. Tes statis baru (gaya `src/server/repo/sql-guard.test.ts`) memeriksa semua berkas di `drizzle-dash/`:
   - setiap `CREATE/ALTER/DROP/TRUNCATE/INSERT/UPDATE/DELETE` hanya menyentuh tabel berawalan `dash_`;
   - tidak ada sintaks yang tidak ada di MySQL 5.7 (mis. kolom ekspresi/`INVISIBLE`, tipe JSON generated tertentu, `CHECK` yang diharapkan ditegakkan, `DEFAULT (ekspresi)`);
   - tidak ada `DROP TABLE` di berkas baru tanpa penanda persetujuan eksplisit.
5. **Rollback:** untuk perubahan yang berisiko, tulis berkas `down` manual di `drizzle-dash/rollback/NNNN_down.sql` (tidak dijalankan otomatis; dijalankan manual saat darurat) dan catat caranya di dokumentasi. Karena tabel `dash_*` hanya berisi data turunan yang bisa dibangun ulang dari ERP, rollback paling aman adalah **`DROP` tabel lalu refresh ulang**.
6. **Saat aplikasi start:** periksa apakah ada migrasi tertunda (bandingkan jurnal `drizzle-dash/meta` dengan `dash_migrations`). Default: log galat jelas dan halaman snapshot menampilkan pesan "migrasi belum dijalankan" (halaman lain tetap jalan). `AUTO_MIGRATE=1` di `.env` menjalankan migrasi otomatis saat start (default mati di produksi, boleh hidup di dev). Gunakan kunci `GET_LOCK('dash_migrate')` agar dua proses tidak migrasi bersamaan.
7. **Test:** (a) tes statis di atas; (b) tes DB (`test:db`) yang menjalankan semua migrasi dari nol pada database uji (`TEST_DATABASE_URL`) dan memastikan menjalankan dua kali tidak mengubah apa-apa; (c) tes bahwa tabel `dash_*` hasil migrasi cocok dengan skema TypeScript.
8. **Dokumentasi:** bagian di README/`docs/` tentang cara menambah tabel (ubah skema → `generate` → tinjau → `migrate`), aturan keselamatan di atas, dan cara rollback; perbarui `.env.example` (`AUTO_MIGRATE`, interval refresh).

**Batasan akses tulis tetap berlaku:** semua kode yang menulis ke DB berada di `src/server/dash/`, dan hanya ke tabel `dash_*`.

Hubungannya dengan tabel yang direncanakan: daftar tabel `dash_*` di atas (`dash_snap_ap_ar_open`, `dash_snap_ap_ar_unallocated`, `dash_snap_gl_monthly`, `dash_snap_ap_ar_month_end`, `dash_snap_cash_lines` bila perlu, `dash_snap_checks`, `dash_snap_meta`, `dash_migrations`) masing-masing dibuat oleh satu atau lebih berkas migrasi hasil `drizzle-kit generate`. Ganti awalan nama tabel contoh `snap_*` di bagian atas dokumen ini dengan `dash_snap_*`.

Urutan pengerjaan Tahap C: (1) fitur migrasi + tes → (2) migrasi tabel `dash_snap_meta` → (3) pekerjaan refresh untuk AP/AR terbuka + service membaca snapshot (poin 4, 5, 6, sebagian 3) → (4) GL bulanan (poin 3 lainnya) → (5) Data Checks (poin 12) → (6) snapshot akhir bulan untuk perbandingan.

### Verifikasi Tahap C
- Waktu buka tiap halaman (semua 87 entitas dipilih) < 2 detik dari snapshot; cek dengan log durasi server function.
- Rekonsiliasi: total snapshot = total query langsung ERP pada tanggal yang sama (selisih 0) untuk AP, AR, saldo kas, P&L satu bulan.
- Uji gagal: matikan DB ERP saat refresh → snapshot lama tetap dilayani, `snap_meta` mencatat galat, UI menampilkan umur data.
- Uji dua refresh bersamaan → yang kedua ditolak oleh kunci.
- `test:db` tetap lulus; tambahkan tes untuk pekerjaan refresh pada DB uji (database uji terpisah lewat `TEST_DATABASE_URL`).

---

## Ringkasan 13 poin

| # | Topik | Tahap | Ukuran | Status |
|---|---|---|---|---|
| 1 | Redirect setelah login | A | kecil | akar masalah ditemukan (`TopBar.tsx` `handleLogout` memaku `/summary`) |
| 2 | Period select dari tabel `periode` | A | sedang | desain diputuskan |
| 3 | Summary lambat/tak muncul | C | besar | akar masalah terukur; desain snapshot |
| 4 | Payables lambat/tak muncul | C + B | besar | idem |
| 5 | Receivables lambat | C + B | sedang | AR ±5 dtk; sisanya filter banyak entitas |
| 6 | Payment Plan lambat/tak muncul | C + B | sedang | bergantung AP |
| 7 | Nama "Oxy Finance Dashboard" | A | kecil | daftar tempat lengkap |
| 8 | Format uang `1,000,000` | A | sedang | keputusan: penuh di tabel, ringkas di KPI |
| 9 | Sort di kolom penting | B | sedang | tabel daftar kolom per tabel |
| 10 | Cara menampilkan tabel besar | B | sedang | paginasi + sort di server |
| 11 | Ganti tema/bahasa tidak mulus | A | kecil | penyebab: tunggu server + `router.invalidate()` |
| 12 | Drawer Data Verification lambat | C | sedang | baca `dash_snap_checks` |
| 13 | Footer oxysystem.com | A | kecil | komponen footer + i18n |
