# Notice

An inline message on a tinted ground that tells the reader something about the data on screen and what to do next.

- Warning `.nr-notice` (`warning-soft`): "Data perlu dicek", a period that is still open, unmapped cash-flow lines.
- Danger `.nr-notice-danger` (`danger-soft`): reconciliation failures and numbers that cannot be trusted.
- Structure: a bold first sentence that states the fact with its count or amount, one plain sentence about the consequence, then one link to the records.

Consumer provides: the message, the link target, and `role="status"` (warning) or `role="alert"` (danger).

Place it above the card it concerns, at that card's full width. Never stack more than two; collect the rest in a "Data perlu dicek" panel.
