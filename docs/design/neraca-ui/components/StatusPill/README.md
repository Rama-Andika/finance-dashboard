# StatusPill

An outlined pill with a dot that names the state of one record (a tagihan, a payment, a period).

- Neutral `.nr-status-neutral` (`ink` text, `line-strong` border): finished or idle states such as "Lunas", "Belum diajukan", "Ditutup".
- Warning `.nr-status-warning`: in progress and waiting on a person, such as "Diajukan", "Disetujui, menunggu bayar", "Pre Closed".
- Danger `.nr-status-danger`: overdue or failed, such as "Lewat jatuh tempo", "Gagal cair".
- The word carries the meaning; colour only repeats it.

Consumer provides: the status label (from the fixed vocabulary above, translated) and the tone.

There is no green "success" pill on purpose: finished states stay neutral so only problems draw the eye.
