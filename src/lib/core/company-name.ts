/** The company name for display: runs of spaces and line breaks become one space, and null when nothing usable is left. */
export function companyDisplayName(raw: string | null | undefined): string | null {
  const name = (raw ?? '').replace(/\s+/g, ' ').trim()
  return name === '' ? null : name
}

/** Title of the browser tab: "<Company> | <App>", or only the app name when the company name is not known. */
export function documentTitle(companyName: string | null | undefined, appName: string): string {
  return companyName ? `${companyName} | ${appName}` : appName
}
