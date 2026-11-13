# Cabang darurat: memperbaiki versi yang sudah dirilis tanpa membawa pekerjaan yang belum selesai

**Pakai ini hanya bila benar-benar darurat dan jarang.** Aturan biasa: tidak ada cabang rilis permanen; semua klien pindah ke `main` terbaru; pekerjaan yang belum selesai dimatikan dengan feature flag (`docs/project-guide.md` bab 10.10). Bila perbaikan bisa menunggu rilis PATCH biasa dari `main` (`docs/release-runbook.md`), lakukan itu.

## Mengapa dari tag, bukan dari `main`?

Bayangkan dapur. **`main`** adalah meja dapur: ada masakan yang masih setengah matang. **Tag terakhir** (misalnya `v1.4.0`) adalah hidangan yang sudah dihidangkan ke klien. Bila hidangan itu salah garam, Anda memperbaiki **hidangan yang sudah dihidangkan**, bukan mengambil seluruh meja dapur. Cabang yang dipotong dari `main` membawa semua pekerjaan yang belum selesai ke klien. Cabang yang dipotong dari tag hanya membawa isi versi itu ditambah perbaikan Anda.

## Langkah

1. Ketahui versi yang berjalan di klien (`node <folder deploy>/current/scripts/ops/install.mjs --status`), misalnya `v1.4.0`. Pastikan tag itu ada: `git fetch origin --tags` lalu `git tag --list "v1.4.*"`.
2. Potong cabang **dari tag itu**, bukan dari `main`:

   ```bash
   git switch -c fix/v1.4.1 v1.4.0
   git push -u origin fix/v1.4.1
   ```

3. Perbaiki sekecil mungkin. Commit dengan pesan biasa, misalnya `fix(payables): ...` (tambahkan `Formula-Change:` bila angka berubah; rilis yang mengubah angka sebaiknya **bukan** jalur darurat).
4. Jalankan pemeriksaan dengan tangan (jalur darurat tidak melewati skrip rilis biasa, yang hanya mau berjalan di `main`):

   ```bash
   npm run typecheck
   npm run lint
   npm test
   git push
   ```

5. Beri tag PATCH dari cabang ini ⚠️ (perintah ini **belum pernah dijalankan**; jalankan hanya oleh pemilik):

   ```bash
   node node_modules/release-it/bin/release-it.js --config .release-it.json 1.4.1 --ci --git.requireBranch=fix/v1.4.1
   ```

   Ini menaikkan `package.json`, menambah entri `CHANGELOG.md`, membuat commit `chore(release): v1.4.1`, memberi tag `v1.4.1`, dan mendorongnya. Tag yang sudah didorong **tidak pernah dipindah atau dihapus**.

6. Buat paket dari tag itu dan pasang seperti biasa:

   ```bash
   git checkout v1.4.1
   npm run release:pack -- <klien> production
   git switch main
   ```

7. **Gabungkan perbaikan ke `main`** supaya versi berikutnya tidak membawa bug yang sama dan supaya riwayat tag utuh:

   ```bash
   git switch main
   git pull
   git merge --no-ff v1.4.1
   ```

   Bila git melaporkan konflik: di `package.json` ambil baris `"version"` milik `main`; di `package-lock.json` ambil versi `main` lalu jalankan `npm install --package-lock-only` bila perlu (tanyakan dulu); di `CHANGELOG.md` simpan kedua entri (yang terbaru di atas). Lalu `git add` berkas itu, `git commit`, dan `git push`.

8. Hapus cabang kerja bila mau: `git branch -d fix/v1.4.1` (cabang di remote boleh tetap).

## Setelah itu

Kembali ke aturan biasa: rilis berikutnya dibuat dari `main` dengan `npm run release`. Klien yang tidak terkena masalah tidak perlu memasang `v1.4.1`; mereka boleh melompat ke versi berikutnya.
