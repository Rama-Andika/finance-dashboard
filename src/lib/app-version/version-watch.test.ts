import { describe, expect, it, vi } from 'vitest'
import { APP_VERSION, APP_VERSION_HEADER } from './app-version'
import { createVersionStore, isVersionMismatch, withVersionReport } from './version-watch'

describe('app version constants', () => {
  it('is "dev" outside a Vite build, and the header name is lower case', () => {
    expect(APP_VERSION).toBe('dev')
    expect(APP_VERSION_HEADER).toBe('x-app-version')
  })
})

describe('isVersionMismatch', () => {
  it('is true for any different version, newer or older', () => {
    expect(isVersionMismatch('v1.4.0', 'v1.5.0')).toBe(true)
    expect(isVersionMismatch('v1.4.0', 'v1.3.0')).toBe(true)
  })

  it('is false for the same version, and when the server says nothing', () => {
    expect(isVersionMismatch('v1.4.0', 'v1.4.0')).toBe(false)
    expect(isVersionMismatch('v1.4.0', null)).toBe(false)
    expect(isVersionMismatch('v1.4.0', '')).toBe(false)
  })
})

describe('createVersionStore', () => {
  it('tells its listeners only when the answer changes, and follows the server back to the same version', () => {
    const store = createVersionStore('v1.4.0')
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    expect(store.getSnapshot()).toBe(false)
    store.report('v1.4.0')
    store.report(null)
    expect(listener).not.toHaveBeenCalled()
    store.report('v1.5.0')
    store.report('v1.5.0')
    expect(store.getSnapshot()).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    store.report('v1.4.0')
    expect(store.getSnapshot()).toBe(false)
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    store.report('v1.5.0')
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe('withVersionReport', () => {
  it('reports the version header and returns the same response', async () => {
    const response = new Response('x', { headers: { 'X-App-Version': 'v1.5.0' } })
    const base = vi.fn(async () => response)
    const report = vi.fn()
    const result = await withVersionReport(base, report)('/api', { method: 'GET' })
    expect(result).toBe(response)
    expect(base).toHaveBeenCalledWith('/api', { method: 'GET' })
    expect(report).toHaveBeenCalledWith('v1.5.0')
  })

  it('reports null when there is no header, and lets a failed fetch fail', async () => {
    const report = vi.fn()
    await withVersionReport(async () => new Response('x'), report)('/api')
    expect(report).toHaveBeenCalledWith(null)
    const failing = withVersionReport(async () => {
      throw new Error('Failed to fetch')
    }, report)
    await expect(failing('/api')).rejects.toThrow('Failed to fetch')
    expect(report).toHaveBeenCalledTimes(1)
  })
})
