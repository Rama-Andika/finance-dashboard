# EntityPicker

A popover for choosing one, several or all entities (locations), with search, a count, "Pilih semua / Kosongkan", and an explicit "Terapkan".

- Flat list, no grouping. Each row: checkbox (`forest` when checked), entity name `body-strong`, code in `code-sm`.
- Search matches name and code. The count line ("3 dari 87 dipilih") is always visible.
- Changes apply only on "Terapkan", so a slow dashboard is not recomputed on every tick; "Batal" restores the previous selection.
- All entities selected = consolidation (simple sum, no elimination). The trigger then reads "Semua entitas".
- Phone: opens as a full-screen sheet with the same parts.

Consumer provides: the entity list (id, name, code), the current selection, and the apply/cancel handlers.
