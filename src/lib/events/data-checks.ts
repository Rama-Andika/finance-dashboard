/** Helper to trigger opening the global Data Checks side panel from anywhere. */
export function openDataChecks() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('open-data-checks'))
  }
}
