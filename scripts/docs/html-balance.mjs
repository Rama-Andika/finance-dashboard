import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** Elements that never have a closing tag (svg shapes are written self-closed in the guide, so they are listed too). */
const VOID = new Set([
  'meta',
  'link',
  'input',
  'br',
  'hr',
  'img',
  'col',
  'source',
  'wbr',
  'line',
  'path',
  'rect',
  'circle',
  'ellipse',
  'polygon',
  'polyline',
  'stop',
  'use',
])

/**
 * Checks that the elements of an HTML text open and close in a matching order. Comments, the text of script and style
 * elements, and void elements are skipped; an svg element and its other children are tracked like any other element.
 * @param {string} html
 * @returns {string[]} one text per problem, with the line number; an empty list when the text is balanced
 */
export function htmlBalanceProblems(html) {
  /** @type {string[]} */
  const problems = []
  /** @type {{ name: string, line: number }[]} */
  const stack = []
  /** @param {number} index */
  const lineAt = (index) => html.slice(0, index).split('\n').length
  const tag = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>/g
  let match
  while ((match = tag.exec(html)) !== null) {
    if (match[0].startsWith('<!--')) continue
    const closing = match[1] === '/'
    const name = (match[2] ?? '').toLowerCase()
    const selfClosed = match[4] === '/'
    if (!closing && (name === 'script' || name === 'style')) {
      const end = html.indexOf(`</${name}>`, tag.lastIndex)
      if (end === -1) {
        problems.push(`line ${lineAt(match.index)}: <${name}> is never closed`)
        break
      }
      tag.lastIndex = end + name.length + 3
      continue
    }
    if (VOID.has(name) || selfClosed) continue
    if (!closing) {
      stack.push({ name, line: lineAt(match.index) })
      continue
    }
    const top = stack[stack.length - 1]
    if (!top) {
      problems.push(`line ${lineAt(match.index)}: </${name}> has no opening tag`)
    } else if (top.name !== name) {
      problems.push(`line ${lineAt(match.index)}: </${name}> closes <${top.name}> opened at line ${top.line}`)
      const at = stack.map((item) => item.name).lastIndexOf(name)
      if (at !== -1) stack.length = at
    } else {
      stack.pop()
    }
  }
  for (const item of stack) problems.push(`line ${item.line}: <${item.name}> is never closed`)
  return problems
}

// Command line: node scripts/docs/html-balance.mjs <file.html>
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const file = process.argv[2]
  if (!file) {
    console.log('Usage: node scripts/docs/html-balance.mjs <file.html>')
    process.exit(2)
  }
  const problems = htmlBalanceProblems(readFileSync(file, 'utf8'))
  if (problems.length === 0) console.log(`html-balance: OK (${file})`)
  else {
    for (const problem of problems) console.log(`html-balance: ${problem}`)
    process.exit(1)
  }
}
