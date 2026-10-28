# Button

A 36px action control in four looks: primary (`forest`), secondary (outlined), accent (`lime`) and ghost.

- **Primary** `.nr-btn-primary`: the one action that applies or commits ("Terapkan", "Simpan"). At most one per card or popover.
- **Secondary** `.nr-btn`: everyday actions next to content ("Ekspor CSV", "Cetak"). Border `line-strong`.
- **Accent** `.nr-btn-accent`: rare; only for a call to action that must stand out on a neutral page, never next to a primary button.
- **Ghost** `.nr-btn-ghost`: dismiss or cancel inside popovers.
- **Icon** `.nr-btn-icon`: square, always with `aria-label`.

Consumer provides: the label (verb + object, sentence case), an optional 18px Lucide icon before the label, and `disabled` when the action is unavailable.

Do name the result ("Ekspor CSV"). Do not use "OK" or "Submit", and never place two primaries side by side.
