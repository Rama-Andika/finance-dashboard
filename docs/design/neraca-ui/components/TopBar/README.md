# TopBar

The row above the content that names the page and holds the two global filters, search, notifications and the signed-in user.

- Left: page title in `page-title`. Right, in this order: Entitas trigger (opens EntityPicker), Periode trigger (opens PeriodSelect), search, notifications icon button, avatar with name.
- The filter triggers show their current value in full ("24 dari 87", "Bulan ini · Okt 2026") so a screenshot always says what the numbers cover.
- Filters write to the URL search params; every page reads the same two filters.
- Phone: title + menu button on the first line; the two filter triggers wrap to a second line at full width; search moves into the menu.

Consumer provides: the page title, the current entity selection count and total, the current period label, the user's initials and name.
