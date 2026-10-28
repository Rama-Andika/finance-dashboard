# Fase 0 – Prasyarat & keamanan

> Bagian dari rencana implementasi Finance Dashboard · Indeks & aturan umum: [README.md](./README.md)
> Sebelumnya: — · Berikutnya: [01_phase-scaffold-manual.md](./01_phase-scaffold-manual.md)
>
> **Wajib sebelum mulai fase ini:** baca [README.md](./README.md) §1 (cara memakai), §2 (aturan emas G1–G38), dan §5 (konvensi kode). Fase ini tidak punya prasyarat fase lain.

---

## Langkah 0.1 — Buat log kemajuan

🎯 Tujuan: tempat mencatat langkah yang selesai, hasil cek, dan usulan.

📁 File: ➕ `docs/progress.md`

Isi awal persis:

```markdown
# Progress — Finance Dashboard

| Tanggal | Langkah | Hasil | Cek |
|---|---|---|---|

## Usulan

## Pertanyaan untuk user
```

✅ Cek selesai:
- File `docs/progress.md` ada dengan tiga judul di atas.

## Langkah 0.2 — Amankan file kredensial DB lokal ⛔ IZIN USER

🎯 Tujuan: `docs/.dbclient.cnf` berisi kredensial DB lokal. File itu tidak boleh berada di folder dokumentasi yang bisa ikut dibagikan.

Langkah:
1. Minta izin user: "Boleh saya memindahkan `docs/.dbclient.cnf` ke root proyek (`.dbclient.cnf`)? Isinya tidak akan saya baca."
2. Setelah diizinkan, pindahkan file **tanpa membuka isinya**:
   ```powershell
   Move-Item -LiteralPath "docs\.dbclient.cnf" -Destination ".dbclient.cnf"
   ```
3. Mulai sekarang perintah CLI MySQL lokal memakai:
   ```bash
   /d/xampp/mysql/bin/mysql.exe --defaults-extra-file=.dbclient.cnf
   ```

🚫 Dilarang: `cat`, `Get-Content`, `type`, atau membuka `.dbclient.cnf` dengan cara apa pun.

✅ Cek selesai:
- `Test-Path ".dbclient.cnf"` → `True`; `Test-Path "docs\.dbclient.cnf"` → `False`.

## Langkah 0.3 — Buat `.gitignore`

> ✔️ **Sudah dibuat** saat repo pertama kali di-commit (28 Oktober 2026). Cukup pastikan isinya sama dengan di bawah; bila beda, samakan.

📁 File: ➕ `.gitignore`

Isi persis:

```gitignore
# dependencies & build output
node_modules/
.output/
.vinxi/
.tanstack/
dist/
coverage/

# secrets
.env
.env.*
!.env.example
.dbclient.cnf
*.cnf

# database exports (may contain client data)
schema/*.csv

# temporary output of drizzle-kit pull
drizzle/

# editor & OS
.vscode/
.idea/
.DS_Store
Thumbs.db
*.log
```

✅ Cek selesai:
- File ada dan memuat baris `.env`, `.dbclient.cnf`, `schema/*.csv`.

## Langkah 0.4 — Buat `.env.example`

🎯 Tujuan: daftar semua variabel lingkungan tanpa nilai rahasia. User sendiri yang membuat `.env` dari file ini.

📁 File: ➕ `.env.example`

Isi persis:

```dotenv
# Database connection. Development: LOCAL database only (e.g. the `demo` database in XAMPP).
# Format: mysql://USER:PASSWORD@HOST:PORT/DATABASE
DATABASE_URL=mysql://USER:PASSWORD@127.0.0.1:3306/demo

# Maximum number of pooled connections (5–10)
DB_POOL_SIZE=5

# Session cookie encryption secret, at least 32 random characters
SESSION_SECRET=replace-with-at-least-32-random-characters

# Time zone used to decide "today" (see plans/README.md §9, K5)
APP_TIMEZONE=Asia/Jakarta

# Comma-separated root account codes for OCI (decisions.md O4)
PNL_OCI_ROOT_CODES=9

# ERP APP_ID_INDEX used to generate a new system_main row ID (plan phase 8, step 8.5)
ERP_APP_ID_INDEX=7

# Integration tests & seed only (phase 15). Must be a local host.
TEST_DATABASE_URL=mysql://USER:PASSWORD@127.0.0.1:3306/finance_dashboard_dev
SEED_DEMO_LOGIN_ID=demo
SEED_DEMO_PASSWORD=change-me-demo-password
```

Lalu tulis di `docs/progress.md` bagian "Pertanyaan untuk user":

> Mohon buat file `.env` dengan menyalin `.env.example` lalu isi nilai aslinya. Saya tidak akan membuka file `.env`.

🚫 Dilarang: membuat atau mengisi `.env` sendiri.

✅ Cek selesai:
- `.env.example` ada, semua nilai adalah contoh (tidak ada password asli).

## Langkah 0.5 — Inisialisasi git (opsional) ⛔ IZIN USER

> ✔️ **Sudah dilakukan** (28 Oktober 2026): repo git dibuat dengan branch `main` dan remote `origin` = `https://github.com/Rama-Andika/finance-dashboard` (repo **publik**). Langkah ini cukup diverifikasi dengan `git status`. Commit & push tetap hanya bila user meminta.

1. Tanya user: "Mau saya jalankan `git init` sekarang?" Bila tidak, lewati langkah ini.
2. Bila ya: `git init`, lalu `git status` dan pastikan `.env`, `.dbclient.cnf`, dan `schema/*.csv` **tidak** muncul di daftar file.
3. **Jangan commit** sampai user meminta.

✅ Cek selesai:
- Langkah dilewati atas jawaban user, **atau** `git status` tidak menampilkan file rahasia.
