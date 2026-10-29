/** A label that is an i18n key, not display text; the UI translates it (server and lib code stay language-neutral). */
const PREFIX = 'i18n:'

export function i18nLabel(key: string): string {
  return `${PREFIX}${key}`
}

/** Translates `i18n:` labels; any other label (an account name from the ERP) is shown as it is. */
export function translateLabel(t: (key: string) => string, label: string): string {
  return label.startsWith(PREFIX) ? t(label.slice(PREFIX.length)) : label
}
