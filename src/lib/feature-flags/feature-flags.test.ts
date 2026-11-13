import { describe, expect, it } from 'vitest'
import { keepEnabled } from './filter'
import { parseFeatureFlags } from './parse'
import { allFlagsOff, FEATURE_FLAG_NAMES } from './registry'

describe('registry', () => {
  it('has the example flag, and allFlagsOff turns every known flag off', () => {
    expect(FEATURE_FLAG_NAMES).toContain('example')
    expect(allFlagsOff()).toEqual({ example: false })
  })
})

describe('parseFeatureFlags', () => {
  it('turns a flag on only for the JSON value true', () => {
    expect(parseFeatureFlags('{"version":1,"flags":{"example":true}}')).toEqual({
      state: { example: true },
      problem: null,
    })
    for (const value of ['"true"', '1', '"yes"', 'null', 'false', '[]', '{}']) {
      expect(parseFeatureFlags(`{"version":1,"flags":{"example":${value}}}`).state).toEqual({ example: false })
    }
  })

  it('keeps a flag that is not mentioned off, and ignores names it does not know', () => {
    expect(parseFeatureFlags('{"version":1,"flags":{}}')).toEqual({ state: { example: false }, problem: null })
    expect(parseFeatureFlags('{"version":1,"flags":{"someFutureFlag":true,"__proto__":true}}')).toEqual({
      state: { example: false },
      problem: null,
    })
  })

  it('fails closed: nothing stored, empty text, broken JSON or the wrong shape turns everything off', () => {
    expect(parseFeatureFlags(null)).toEqual({ state: { example: false }, problem: 'missing' })
    expect(parseFeatureFlags('   ')).toEqual({ state: { example: false }, problem: 'missing' })
    for (const text of [
      '{broken',
      '[]',
      '"x"',
      '{"flags":{"example":true}}',
      '{"version":2,"flags":{"example":true}}',
      '{"version":1,"flags":[]}',
      '{"version":1}',
    ]) {
      expect(parseFeatureFlags(text), text).toEqual({ state: { example: false }, problem: 'invalid' })
    }
  })
})

describe('keepEnabled', () => {
  const items = [{ id: 'a' }, { id: 'b', flag: 'example' as const }]
  it('keeps items without a flag and items whose flag is on', () => {
    expect(keepEnabled(items, { example: false }).map((i) => i.id)).toEqual(['a'])
    expect(keepEnabled(items, { example: true }).map((i) => i.id)).toEqual(['a', 'b'])
  })
})
