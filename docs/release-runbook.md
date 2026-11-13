# Cara merilis versi baru (panduan untuk pemilik)

Panduan ini untuk Anda, pemilik proyek. Anda **tidak perlu hafal apa pun**: ikuti langkahnya satu per satu. Keputusan di balik panduan ini: D70 di `docs/decisions.md`; penjelasan teknis: `docs/project-guide.md` bab 10.9.

## 1. Istilah singkat

- **Rilis** = memberi nomor versi pada keadaan kode sekarang, misalnya `v0.2.0`. Nomor itu adalah "tag" (stiker) di git.
- **Nomor versi** `v0.2.1`: angka terakhir naik untuk perbaikan kecil (PATCH), angka tengah naik untuk fitur baru atau perubahan angka (MINOR), angka pertama naik untuk perubahan besar yang menuntut tindakan operator (MAJOR). Selama angka pertama masih 0, perubahan besar menaikkan angka tengah.
- **Kandidat rilis (rc)**, `v0.2.0-rc.1`: salinan percobaan yang dipasang di **staging** untuk diperiksa dulu.
- **Memberi tag** dan **memasang di server** adalah dua hal berbeda. Anda boleh memberi tag hari ini dan memasangnya di klien bulan depan. Klien boleh melompati versi.

## 2. Sebelum mulai (cukup sekali)

1. Komputer ini punya Git, Node versi 22.21 atau lebih baru (`node -v`), dan akun yang boleh mendorong ke GitHub.
2. Di folder proyek: `npm ci` (memasang alat rilis; hanya di laptop).
3. Semua pekerjaan Anda sudah di-commit dan sudah didorong: `git status` harus menjawab "nothing to commit, working tree clean".

## 3. Cara menulis pesan commit (supaya nomor versi benar)

Tulis `jenis: teks`, misalnya `fix(revenue): jangan hitung nota kredit dua kali`.

| Anda mengerjakan                                                                                                                      | Awali dengan                                                       | Akibat pada nomor                     |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------- |
| Fitur baru                                                                                                                            | `feat:`                                                            | MINOR                                 |
| Perbaikan bug, percepatan                                                                                                             | `fix:`, `perf:`                                                    | PATCH                                 |
| Perapian kode, dokumen, gaya, tes                                                                                                     | `refactor:`, `docs:`, `style:`, `test:`, `chore:`                  | PATCH                                 |
| **Angka di dashboard berubah** (rumus)                                                                                                | jenis apa pun, **plus** baris `Formula-Change: ...` di badan pesan | minimal MINOR                         |
| Operator harus bertindak, atau tidak bisa dibatalkan (migrasi yang tidak tambah-saja, variabel env wajib baru, syarat server berubah) | `feat!:` (tanda seru) atau baris `BREAKING CHANGE: ...`            | MAJOR (di 0.x: MINOR, tetap ditandai) |

Baris `Formula-Change:` dan `BREAKING CHANGE:` ditulis di badan pesan, di baris sendiri, setelah satu baris kosong. Skrip rilis menolak commit yang tidak mengikuti bentuk ini (commit sejak tag terakhir), jadi lebih baik benar sejak awal.

## 4. Rilis kecil (PATCH: perbaikan tanpa perubahan angka)

1. `git switch main` lalu `git pull`.
2. `npm run release -- --dry-run` dan baca hasilnya. Ia mencetak versi yang disarankan, jalur (`fast`), dan semua yang menghalangi. Perbaiki yang tertulis `PROBLEM`.
3. `npm run release`. Ia menjalankan `typecheck`, `lint`, dan tes unit, lalu menanyakan versi (tekan Enter untuk menerima saran) dan meminta Anda mengetik `yes`.
4. Selesai: ada tag baru (misalnya `v0.2.1`), `package.json` dan `CHANGELOG.md` ikut diperbarui, semuanya sudah didorong.
5. Lanjut ke bagian 7 untuk membuat paket dan memasangnya.

## 5. Rilis besar (MINOR atau MAJOR: fitur baru atau angka berubah)

1. `git switch main` lalu `git pull`; pohon kerja bersih.
2. `npm run release -- --dry-run`: catat **versi berikutnya** (misalnya `v0.3.0`) dan jalurnya (`full`).
3. `npm run release -- notes`: membuat kerangka `docs/releases/v0.3.0.md` berisi daftar commit.
4. **Isi kerangka itu** (bahasa Indonesia, untuk finance). Bagian **"Perubahan angka" wajib terisi**: angka mana yang berubah, di halaman mana, dan mengapa; bila tidak ada, tulis "Tidak ada angka yang berubah." Hapus baris `TODO`. Bila ada bagian "Tindakan operator", isi langkah yang harus dilakukan operator.
5. Commit berkas itu: `git add docs/releases/v0.3.0.md` lalu `git commit -m "docs: catatan rilis v0.3.0"` lalu `git push`.
6. `npm run release -- rc`: menjalankan semua gerbang termasuk build, lalu membuat tag `v0.3.0-rc.1`.
7. Pasang `v0.3.0-rc.1` di **staging** (bagian 7) dan periksa bersama finance.
8. Ada yang perlu diperbaiki? Perbaiki, commit, dorong, lalu ulangi langkah 6 (menghasilkan `v0.3.0-rc.2`). Setelah rc terakhir, **jangan mengubah kode lagi**: skrip menolak rilis stabil bila ada berkas lain yang berubah selain `package.json`, `package-lock.json`, `CHANGELOG.md`, dan `docs/releases/`.
9. Bila staging beres: `npm run release`. Skrip memeriksa catatan finance dan selisih dari rc terakhir, menanyakan apakah rc sudah diperiksa di staging (ketik `yes`), lalu membuat tag stabil `v0.3.0`.
10. Lanjut ke bagian 7 untuk production.

## 6. Rilis pertama dan menuju `v1.0.0`

- **Rilis pertama** (belum ada tag): `npm run release -- --dry-run`, lalu `npm run release`. Disarankan `v0.1.0`. Entri `CHANGELOG.md` untuk `v0.1.0` sudah ditulis tangan satu kalimat (riwayat lama sengaja tidak dicantumkan) dan rilis pertama tidak membuat entri otomatis; entri otomatis dimulai dari rilis kedua. Sebelum itu, jalankan `npm run build` sekali dan **commit** `src/routeTree.gen.ts` bila Git menunjukkan berkas itu berubah (generator menulisnya ulang).
- **Production pertama** menjadi `v1.0.0`: ikuti bagian 5 dengan `npm run release -- rc --bump 1.0.0` lalu `npm run release -- --bump 1.0.0`.

## 7. Membuat paket dari tag lalu memasangnya

Paket untuk server **hanya** bisa dibuat tepat dari sebuah tag.

```bash
git fetch origin --tags
git checkout v0.3.0-rc.1
npm run release:pack -- <klien> staging
git switch main
```

Untuk production pakai tag stabil: `git checkout v0.3.0` lalu `npm run release:pack -- <klien> production`. Lalu unggah dan pasang seperti biasa (`docs/project-guide.md` bab 10.9.3 dan 10.9.4, atau `docs/deploy-guide.html`). Server menolak paket yang versinya bukan tag; paket `--local-only` hanya untuk percobaan di laptop.

Setelah terpasang, tab browser yang masih terbuka menampilkan banner "versi aplikasi berubah" dengan tombol **Muat ulang**.

## 8. Bila rilis ternyata buruk

- **Jangan menghapus atau memindahkan tag.** Perbaiki ke depan: commit perbaikan, rilis PATCH baru (bagian 4).
- Di server, kembalikan versi sebelumnya dengan `node <folder deploy>/current/scripts/ops/install.mjs --rollback` (bab 10.9.5).
- Fitur yang belum siap bisa dimatikan tanpa rilis baru dengan feature flag (bab 10.10).
- Hanya bila benar-benar darurat dan `main` berisi pekerjaan yang belum selesai: `docs/emergency-branch.md`.

## 9. Pesan yang mungkin muncul

| Pesan                                                           | Artinya dan yang dilakukan                                                                                                  |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `you are on branch "..."`                                       | Pindah ke `main` (`git switch main`).                                                                                       |
| `the working tree has changes`                                  | Ada berkas yang belum di-commit (termasuk berkas baru). Commit atau simpan dulu.                                            |
| `main is not in step with origin/main`                          | `git pull` atau `git push` dulu.                                                                                            |
| `N commit(s) do not follow "type(scope): text"`                 | Ada pesan commit yang bentuknya salah. Daftarnya dicetak; perbaiki pesannya (minta bantuan bila belum terbiasa).            |
| `docs/releases/vX.Y.Z.md does not exist` / `still has the TODO` | Buat kerangkanya (`npm run release -- notes`) dan isi bagian yang diminta.                                                  |
| `there is no release candidate of vX.Y.Z`                       | Buat rc dulu: `npm run release -- rc`.                                                                                      |
| `since vX.Y.Z-rc.N these files changed ...`                     | Ada perubahan kode setelah rc. Buat rc baru (`npm run release -- rc`) dan periksa lagi di staging.                          |
| `the gate "lint" failed` (dan sejenisnya)                       | Perbaiki masalahnya, commit, dorong, ulangi.                                                                                |
| `the build changed tracked files`                               | Build menulis ulang berkas yang dilacak git (biasanya `src/routeTree.gen.ts`). Lihat `git status`, commit hasilnya, ulangi. |
| `the tag vX.Y.Z already exists`                                 | Tag tidak pernah dipindah. Pilih versi yang lebih baru (`--bump`).                                                          |

## 10. Yang tidak boleh dilakukan

- Jangan membuat tag dengan tangan (`git tag`) dan jangan menghapus tag yang sudah didorong.
- Jangan menjalankan `release-it` langsung; selalu lewat `npm run release` (kecuali prosedur darurat).
- Jangan memasang paket yang dibuat dengan `--local-only` (server menolaknya).
- Asisten AI **tidak boleh** menjalankan perintah rilis sungguhan atau mendorong tag; hanya Anda.
