# Progress — Gelombang 2 (perbaikan dari studi data klien)

> Rencana: [`plans/README.md`](../plans/README.md). Baris terbaru ditulis **paling atas**, tepat di bawah baris pemisah tabel (`|---|---|---|---|`).

| Tanggal | Langkah | Hasil | Cek |
|---|---|---|---|
| 2026-10-30 | G2-04.R | Fase 04 dibatalkan atas permintaan user: file posting-freshness, posting.repo, posting-freshness.service, konstanta journal type, teks di Summary, kunci postingThrough, dan Q23 dihapus; D34 ditandai dibatalkan | typecheck lulus; npm test lulus |
| 2026-10-30 | G2-10.4 | Verifikasi akhir: typecheck, test, build, pemeriksaan sisa, dan daftar file selesai; fase selesai: 01, 02, 03, 04, 05, 06, 07, 08, 09; fase dilewati: tidak ada | typecheck lulus; npm test lulus (N=309, F=62); build lulus; Grep sisa bersih; git status sesuai rencana |
| 2026-10-30 | G2-09.7 | Dokumentasi disinkronkan: CLAUDE.md, data-model.md, decisions.md (D31–D38, O15–O17), summary-page.md, summary-queries.md, transit-reconciliation-checks.sql | Grep [Fase dan voucher pada dokumen Summary: tidak ada sisa; npm test lulus |
| 2026-10-30 | G2-08.7 | Ambang umur dana transit: IN_TRANSIT_ALERT_DAYS (bawaan 3); overThreeDays diganti overAlertAge; teks UI netral | typecheck lulus; npm test lulus |
| 2026-10-30 | G2-07.5 | overdueBills (tagihan positif lewat jatuh tempo) dihitung di accumulateAging; kartu Payables Summary memakainya; overdueSubtotal neto tidak berubah; +1 test | typecheck lulus; npm test lulus |
| 2026-10-30 | G2-06.7 | Tabel tagihan Summary: tab jatuh tempo/terlambat (scope di server), kolom status disembunyikan bila tidak ada dokumen Pengakuan Biaya aktif, label status baru; +3 test | typecheck lulus; npm test lulus |
| 2026-10-30 | G2-05.9 | Giro/cek beredar: outstandingGiro, CashPositionResult.giroOutstanding, baris di CashBalanceCard (Summary dan Cash Position); +3 test | typecheck lulus; npm test lulus |
| 2026-10-30 | G2-04.8 | Penanda terposting sampai: posting.repo, posting-freshness.service, SummaryResult.postingFreshness, teks di Summary; +3 test | typecheck lulus; npm test lulus |
| 2026-10-30 | G2-03.7 | Margin dikirim sebagai rasio (pnl.ts, runway.ts); Summary dan P&L memformat dengan formatPercent; test disesuaikan | typecheck lulus; npm test lulus |
| 2026-10-30 | G2-02.4 | Register dana pencairan memakai unsettledAtClause (status 0 atau cair setelah asOf); total dan drill-down satu aturan; +4 test | typecheck lulus; npm test lulus |
| 2026-10-30 | G2-01.8 | Filter canceled_date opsional lewat gl-columns.ts; gl.repo, cashflow.repo, gl-snapshot memakainya; +5 test | typecheck lulus; npm test lulus (N+5) |
| 2026-10-30 | G2-00.4 | Baseline dicatat | typecheck lulus; F=58, N=290; file yang sudah berubah sebelum mulai: M docs/summary-page.md, D plans/18_phase-ap-ar-month-end-snapshot.md, ?? docs/sql/transit-reconciliation-checks.sql |
