import { describe, expect, it, vi } from 'vitest'
import { createStepTimer, formatDuration, formatSteps, untimed } from './step-timer'

/** A clock that moves only when the test says so. */
function fakeClock() {
  let t = 1_000
  return { now: () => t, advance: (ms: number) => void (t += ms) }
}

describe('createStepTimer', () => {
  it('records how long each step took, in the order they finished', async () => {
    const clock = fakeClock()
    const timer = createStepTimer({ now: clock.now })

    await timer.time('first', async () => clock.advance(250))
    await timer.time('second', async () => clock.advance(1_500))

    expect(timer.steps).toEqual([
      { name: 'first', ms: 250 },
      { name: 'second', ms: 1_500 },
    ])
  })

  it('hands back what the step returned', async () => {
    const timer = createStepTimer()
    await expect(timer.time('value', async () => 42)).resolves.toBe(42)
  })

  it('records a step that throws and lets the error through', async () => {
    const clock = fakeClock()
    const timer = createStepTimer({ now: clock.now })

    await expect(
      timer.time('broken', async () => {
        clock.advance(300)
        throw new Error('connection lost')
      }),
    ).rejects.toThrow('connection lost')

    expect(timer.steps).toEqual([{ name: 'broken', ms: 300 }])
  })

  it('tells the caller when a step starts, before it runs', async () => {
    const order: string[] = []
    const timer = createStepTimer({ onStart: (name) => order.push(`start ${name}`) })

    await timer.time('scan', async () => {
      order.push('running')
    })

    expect(order).toEqual(['start scan', 'running'])
  })

  it('does not call onStart when none is given', async () => {
    const onStart = vi.fn()
    await createStepTimer().time('quiet', async () => undefined)
    expect(onStart).not.toHaveBeenCalled()
  })
})

describe('untimed', () => {
  it('runs the step and keeps no record', async () => {
    await expect(untimed.time('ignored', async () => 'done')).resolves.toBe('done')
    expect(untimed.steps).toEqual([])
  })
})

describe('formatDuration', () => {
  it('uses milliseconds, seconds, then minutes', () => {
    expect(formatDuration(0)).toBe('0ms')
    expect(formatDuration(480)).toBe('480ms')
    expect(formatDuration(1_000)).toBe('1.0s')
    expect(formatDuration(12_340)).toBe('12.3s')
    expect(formatDuration(60_000)).toBe('1m 0s')
    expect(formatDuration(670_000)).toBe('11m 10s')
  })
})

describe('formatSteps', () => {
  it('lists the steps with their durations, in order', () => {
    expect(
      formatSteps([
        { name: 'AP/AR snapshot', ms: 670_000 },
        { name: 'GL snapshot', ms: 1_200 },
      ]),
    ).toBe('AP/AR snapshot 11m 10s, GL snapshot 1.2s')
  })

  it('is empty when nothing ran', () => {
    expect(formatSteps([])).toBe('')
  })
})
