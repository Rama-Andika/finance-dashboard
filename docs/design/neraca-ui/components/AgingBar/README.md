# AgingBar

A single 100% stacked bar of outstanding payables or receivables by age, with a labelled amount under each bucket.

- Buckets match the ERP aging report: Belum jatuh tempo, 0–30, 31–60, 61–90, > 90 hari (due today counts as 0–30).
- Colour gets more urgent with age: `chart-5`, `chart-4`, `warning-soft` with a `warning` edge, `warning`, `danger`. Every bucket also has its label and amount, so colour is never the only cue.
- Header: card title and the total with its as-of date. Amounts in tabular figures, abbreviated by language.
- Clicking a segment or its key opens the aging table filtered to that bucket.
- Phone: keys wrap to two or three columns; the bar stays one line.

Consumer provides: the as-of date, the total, and the five bucket amounts (net per the AP/AR aging rules). Hide a bucket's key when its amount is zero but keep its slot in the order.
