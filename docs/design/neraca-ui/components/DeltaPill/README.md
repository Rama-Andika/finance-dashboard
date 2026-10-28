# DeltaPill

A small rounded pill that shows how a figure changed against the comparison period, coloured by whether the change is good.

- Good change: `.nr-delta-up` (`lime` / `on-lime`). Bad change: `.nr-delta-down` (`danger` / `on-danger`). No change or no comparison: `.nr-delta-flat`.
- The arrow shows the **direction of the number** (▲ up, ▼ down); the colour shows **good or bad**. Expenses going up is ▲ in a danger pill.
- Percent with a comma decimal in ID (`2,84%`) and a dot in EN (`2.84%`); tabular figures.

Consumer provides: the signed change, and whether higher is better for the account group (Revenue and Other Revenue: higher is better; Cost Of Sales, Expense and Other Expense: lower is better).

Always follow it with a caption that names the comparison ("Bulan lalu Rp 41,38 M").
