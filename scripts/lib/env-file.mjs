const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/

/**
 * Reads the text of an environment file. The accepted form is deliberately small, so that systemd, Node and this checker
 * read the same file the same way: KEY=value per line, no spaces around the =, no "export", comments on their own line
 * (a line that starts with #), one pair of quotes around a value is allowed.
 * A message names the line and the key, and never repeats a value.
 * @param {string} text
 * @returns {{ entries: { key: string, value: string, line: number }[], problems: string[] }}
 */
export function parseEnvFile(text) {
  /** @type {{ key: string, value: string, line: number }[]} */
  const entries = []
  /** @type {string[]} */
  const problems = []
  /** @type {Map<string, number>} */
  const firstLine = new Map()

  // A byte order mark (some editors write one at the start of a file) is not part of the first key.
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  source.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) return
    if (/^\s/.test(raw)) {
      problems.push(`line ${line}: a line must start in the first column (no spaces before the key)`)
      return
    }
    if (raw.startsWith('export ')) {
      problems.push(`line ${line}: do not start a line with "export"`)
      return
    }
    const eq = raw.indexOf('=')
    if (eq === -1) {
      problems.push(`line ${line}: a line must be KEY=value, or a comment that starts with #`)
      return
    }
    const key = raw.slice(0, eq)
    if (!KEY_PATTERN.test(key)) {
      problems.push(
        `line ${line}: the key before the = must be capital letters, digits and underscores, with no space before the =`,
      )
      return
    }
    let value = raw.slice(eq + 1)
    if (/^\s/.test(value)) {
      problems.push(`line ${line}: ${key} has a space right after the =`)
      return
    }
    const quote = value[0]
    if (quote === '"' || quote === "'") {
      if (value.length < 2 || value[value.length - 1] !== quote) {
        problems.push(`line ${line}: ${key} has a quote that is not closed`)
        return
      }
      value = value.slice(1, -1)
    } else {
      if (/\s$/.test(value)) {
        problems.push(`line ${line}: ${key} has spaces at the end of the value`)
        return
      }
      if (/\s#/.test(value)) {
        problems.push(`line ${line}: ${key} has a comment after the value; put comments on their own line`)
        return
      }
    }
    const earlier = firstLine.get(key)
    if (earlier !== undefined) {
      problems.push(`line ${line}: ${key} is already set on line ${earlier}`)
      return
    }
    firstLine.set(key, line)
    entries.push({ key, value, line })
  })

  return { entries, problems }
}
