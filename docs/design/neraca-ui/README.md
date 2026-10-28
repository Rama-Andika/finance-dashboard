Neraca UI adalah bahasa visual Finance Dashboard grup holding: kanvas abu kehijauan yang tenang, kartu putih tipis tanpa bayangan, hijau hutan sebagai "bobot", dan lime sebagai satu-satunya aksen. Angka adalah tokoh utama; semua elemen lain mundur.

## Prinsip

1. **Angka dulu, hiasan belakangan.** Setiap kartu punya satu angka utama (`figure-xl` atau `figure-lg`). Label, perbandingan, dan ikon selalu lebih kecil dan `ink-muted`.
2. **Satu hijau tua, satu lime.** `forest` memberi bobot (kartu Posisi Kas, tombol utama, batang pengeluaran). `lime` menandai "yang aktif / yang masuk" (menu aktif, batang pendapatan, delta naik). Jangan tambahkan warna merek lain.
3. **Datar.** Kartu dibatasi `line` 1px dan `radius-lg`, bukan bayangan. `shadow-pop` hanya untuk yang melayang (menu, tooltip, popover).
4. **Status selalu punya kata.** Warna status (`danger`, `warning`, `positive`) selalu disertai teks atau tanda (▲ ▼, "Lewat jatuh tempo"), tidak pernah warna saja.

## Konten & bahasa

- Dashboard dua bahasa: **English (default)** dan **Bahasa Indonesia**. Tulis label pendek, kata benda, huruf kapital di awal kata untuk judul kartu ("Total Pendapatan", "Arus Kas"), huruf kalimat untuk keterangan ("Bulan lalu Rp 38,57 M").
- Sebut hal dengan nama yang dikenal orang finance, bukan nama tabel: "Utang Usaha", bukan "ap_ar_card"; "Dana dalam pencairan", bukan "piutang EDC".
- **Mata uang:** `Rp` + spasi tipis + angka. Angka besar di kartu disingkat dan **mengikuti bahasa**:
  - ID: `Rb` (ribu), `Jt` (juta), `M` (miliar), `T` (triliun) → `Rp 42,56 M`
  - EN: `K`, `M` (million), `B` (billion), `T` → `IDR 42.56B`
  - ⚠️ "M" berarti miliar di ID dan million di EN. Tooltip selalu menampilkan angka penuh: `Rp 42.560.118.400`.
- **Tabel** memakai angka penuh, rata kanan, `font-variant-numeric: tabular-nums`. Angka negatif ditulis dalam kurung, warna `ink`: `(1.234.500)`. Merah hanya untuk keadaan buruk (lewat jatuh tempo, delta turun), bukan untuk setiap angka negatif.
- **Tanggal:** `28 Okt 2026` (ID) / `28 Oct 2026` (EN) di tabel; `Okt` / `Oct` di sumbu grafik; ISO `2026-10-28` hanya di ekspor CSV.
- **Kode akun & nomor dokumen** selalu `code` (JetBrains Mono): `1121-00-014`, `IN092514068`.
- Tombol menyebut hasilnya: "Ekspor CSV", "Simpan pemetaan", "Terapkan". Pesan galat menjelaskan apa yang salah dan apa yang bisa dilakukan: "Periode Okt 2026 belum ditutup. Angka masih bisa berubah."
- Tidak ada emoji. Tidak ada tanda seru.

## Warna

- Halaman di `canvas`; kartu, sidebar, dan top bar di `surface` dengan border `line`.
- Teks utama `ink`; teks sekunder `ink-muted`. Keduanya ≥ 4.5:1 pada `surface` dan `canvas` di kedua tema.
- `forest` + `on-forest` untuk **satu** kartu sorotan per halaman (Posisi Kas) dan tombol utama. Garis hiasan di dalamnya memakai `forest-line`; teks sekunder `on-forest-muted`.
- `lime` hanya sebagai **isian** dengan teks `on-lime` di atasnya. Jangan pernah lime sebagai warna teks atau garis tipis di latar terang (kontrasnya terlalu rendah).
- `lime-soft` untuk chip berwarna lembut dan latar avatar; teks di atasnya `ink`.
- Status: `danger` / `on-danger` / `danger-soft`, `warning` / `on-warning` / `warning-soft`, `positive` (teks saja). Warna status terpisah dari aksen; jangan pakai `lime` untuk "berhasil" di tabel status — pakai pill netral "Lunas".
- Grafik: `chart-income` (lime) untuk uang masuk, `chart-expense` (forest; sage di tema gelap) untuk uang keluar, `chart-1` … `chart-5` untuk kategori berurutan dari porsi terbesar, `chart-grid` untuk gridline, `chart-axis` untuk garis nol.
- Fokus keyboard: garis `focus` 2px dengan offset 2px; di atas kartu forest pakai `focus-on-forest`.

## Tipografi

- Satu keluarga, **Plus Jakarta Sans** (`--font-sans`), dimuat dari Google Fonts:
  `https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap`
- **JetBrains Mono** (`--font-mono`) hanya untuk kode akun, nomor jurnal, dan nomor dokumen.
- Skala tetap — jangan buat ukuran baru:
  - Angka: `figure-xl` 40/44 (angka utama KPI), `figure-lg` 32/36 (Posisi Kas), `figure-md` 20/28 (pusat donat, subtotal).
  - Teks: `page-title` 24/32, `card-title` 17/24, `kpi-label` 15/22, `body` 14/20, `body-strong`, `label` 13/18, `caption` 12/16, `overline` 11/14 huruf kapital.
- Semua angka memakai `tabular-nums` supaya kolom dan kartu sejajar.
- Simbol mata uang di angka besar ditulis lebih kecil dan `ink-muted` (`Rp` 20px di depan `figure-xl`).

## Ruang & layout

- Grid dasar 4px: `space-1` … `space-10`. Padding kartu `space-5`; jarak antar kartu `space-4`; jarak antar seksi `space-8`.
- Desktop (≥ 1024px): sidebar `sidebar-width` di kiri, top bar `topbar-height`, kolom utama maksimal `content-max`.
- Susunan Ringkasan: baris KPI (kartu Posisi Kas forest + 3 kartu KPI putih) → baris grafik (Arus Kas 2/3 + Komposisi 1/3) → tabel (lebar penuh).
- Tablet (768–1023px): sidebar menjadi ikon saja; KPI 2 kolom.
- Ponsel (< 768px): sidebar menjadi drawer; semua kartu 1 kolom; tabel berubah menjadi daftar kartu (nama + angka + pill), bukan tabel yang digulir ke samping.
- Tinggi kontrol `control-height` (36px) untuk tombol, input, select, dan tombol ikon.

## Bentuk, garis, bayangan

- Radius: `radius-lg` kartu, `radius-md` popover/notice/pita header tabel, `radius-sm` tombol/input/item menu, `radius-xs` pill status dan batang grafik, `radius-pill` delta pill dan avatar.
- Border 1px `line` untuk kartu dan pemisah baris; `line-strong` untuk batas kontrol.
- Bayangan: `shadow-pop` untuk elemen melayang; `shadow-glow` untuk batang/titik grafik yang sedang dipilih. Tidak ada bayangan lain.

## Grafik

- Arus kas bulanan = batang **divergen**: pendapatan di atas garis nol (`chart-income`), pengeluaran di bawah (`chart-expense`), ujung luar membulat `radius-xs`.
- Bulan terpilih/hover: batang diberi `shadow-glow` + garis `lime-strong`, dan tooltip `shadow-pop` berisi bulan + dua angka.
- Sumbu dan label memakai `caption` `ink-muted`; gridline `chart-grid` horizontal saja; sumbu Y disingkat sesuai bahasa (`10 M`, `5 M`, `0`, `−5 M`).
- Donat: maksimal 5 segmen (sisanya digabung "Lainnya" dengan `chart-5`), angka total di tengah `figure-md`, legenda di bawah berisi chip persen + nama + angka rata kanan.
- Setiap grafik punya padanan tabel (drill-down) dan teks alternatif ringkas.

## Status & state

- Delta pill: naik `lime`/`on-lime` dengan ▲, turun `danger`/`on-danger` dengan ▼, datar `surface-sunken`/`ink-muted` dengan –. Untuk akun beban, "naik" berarti buruk → pakai pill turun-merah walau angkanya naik (lihat Budget vs Actual).
- Status pill bergaris (border 1px + teks + titik): netral `ink` + `line-strong` ("Lunas"), `warning` ("Diajukan", "Disetujui, menunggu bayar"), `danger` ("Lewat jatuh tempo", "Gagal").
- Notice "Data perlu dicek" memakai `warning-soft` + ikon segitiga + kalimat yang menyebut jumlahnya.
- Hover: `surface-hover`. Pressed tombol forest: `forest-strong`. Disabled: opasitas 0.5, kursor default, tanpa hover.
- Loading: skeleton blok `surface-sunken` dengan bentuk yang sama dengan isinya; jangan spinner di tengah kartu.
- Kosong: satu kalimat apa yang akan muncul + satu tombol tindakan, `space-10` padding.

## Ikonografi

- **Lucide** (`lucide-react`), garis 1.75px, ukuran 18px di menu dan tombol, 16px di dalam pill dan tabel. Warna mengikuti teks (`currentColor`).
- Tidak ada ikon berwarna, tidak ada emoji, tidak ada ilustrasi.
- Tidak ada logo di sumber: nama produk ditulis "Neraca" dengan Plus Jakarta Sans 700, didahului tanda bintang 8-ujung sederhana dari Lucide (`asterisk`) sampai klien memberi logo.

## Gerak

- Transisi 150ms `ease-out` untuk hover, warna, dan buka/tutup menu. Batang grafik tumbuh sekali saat dimuat (300ms). Tidak ada animasi berulang.
- Hormati `prefers-reduced-motion`: matikan pertumbuhan batang dan transisi.

## Yang dihindari

- Gradien, kaca buram, bayangan pada kartu biasa, garis aksen di sisi kiri kartu.
- Lebih dari satu kartu forest per layar; lime sebagai warna teks.
- Angka disingkat di dalam tabel; merah untuk semua angka negatif.
- Nama tabel database atau kode internal di label UI.
