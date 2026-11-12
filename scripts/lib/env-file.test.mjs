import { describe, expect, it } from 'vitest'
import { parseEnvFile } from './env-file.mjs'

describe('parseEnvFile', () => {
  it('reads KEY=value lines and skips blank lines and comments', () => {
    const { entries, problems } = parseEnvFile('# a comment\n\nA=1\n  # an indented comment\nB_2=two words\nC=\n')
    expect(problems).toEqual([])
    expect(entries).toEqual([
      { key: 'A', value: '1', line: 3 },
      { key: 'B_2', value: 'two words', line: 5 },
      { key: 'C', value: '', line: 6 },
    ])
  })

  it('reads Windows line endings and a byte order mark', () => {
    const { entries, problems } = parseEnvFile(String.fromCharCode(0xfeff) + 'A=1\r\nB=2\r\n')
    expect(problems).toEqual([])
    expect(entries.map((entry) => `${entry.key}=${entry.value}`)).toEqual(['A=1', 'B=2'])
  })

  it('keeps an equals sign and a hash inside a value', () => {
    const { entries, problems } = parseEnvFile('URL=mysql://u:p@h:3306/db?x=1\nPASS=ab#cd\n')
    expect(problems).toEqual([])
    expect(entries.map((entry) => entry.value)).toEqual(['mysql://u:p@h:3306/db?x=1', 'ab#cd'])
  })

  it('removes one pair of quotes and allows spaces and a hash inside them', () => {
    const { entries, problems } = parseEnvFile(`A="x y # z"\nB='1'\n`)
    expect(problems).toEqual([])
    expect(entries.map((entry) => entry.value)).toEqual(['x y # z', '1'])
  })

  it.each([
    ['KEY =1', 'no space before the ='],
    ['key=1', 'lowercase key'],
    ['export A=1', 'export'],
    ['  A=1', 'leading spaces'],
    ['A= 1', 'a space after the ='],
    ['A=1 ', 'trailing spaces'],
    ['A=1 # note', 'a comment after the value'],
    ['A="open', 'an unclosed quote'],
    ['A="', 'a single quote character'],
    ['just text', 'no ='],
  ])('reports %j (%s) without reading it as an entry', (line) => {
    const { entries, problems } = parseEnvFile(`${line}\n`)
    expect(entries).toEqual([])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/^line 1: /)
  })

  it('reports a key that is set twice, with the line of the first one', () => {
    const { entries, problems } = parseEnvFile('A=1\nB=2\nA=3\n')
    expect(entries.map((entry) => entry.key)).toEqual(['A', 'B'])
    expect(problems).toEqual(['line 3: A is already set on line 1'])
  })

  it('never repeats a value in a message, not even when the line is broken', () => {
    const secret = 'super-secret-value'
    const text = [
      `export A=${secret}`,
      `B =${secret}`,
      `C=${secret} # note`,
      `D= ${secret}`,
      `${secret}`,
      `E="${secret}`,
    ].join('\n')
    const { problems } = parseEnvFile(text)
    expect(problems).toHaveLength(6)
    expect(problems.join('\n')).not.toContain(secret)
  })
})
