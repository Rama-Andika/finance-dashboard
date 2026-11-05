import '@tanstack/react-start/server-only'

/** How long one named step of a refresh took. A step that failed is recorded too, so the log shows where it stopped. */
export type StepTiming = { name: string; ms: number }

export type StepTimer = {
  /** Runs `fn` and records its duration under `name`, whether it finishes or throws. */
  time<T>(name: string, fn: () => Promise<T>): Promise<T>
  /** The steps that have finished so far, in the order they finished. */
  steps: StepTiming[]
}

export function createStepTimer(options: { now?: () => number; onStart?: (name: string) => void } = {}): StepTimer {
  const now = options.now ?? Date.now
  const steps: StepTiming[] = []
  return {
    steps,
    async time(name, fn) {
      options.onStart?.(name)
      const t0 = now()
      try {
        return await fn()
      } finally {
        steps.push({ name, ms: now() - t0 })
      }
    },
  }
}

/** A timer that measures nothing, for callers that do not want a breakdown. */
export const untimed: StepTimer = { steps: [], time: (_name, fn) => fn() }

/** 480ms, 12.3s, 11m 10s: short enough to read in a log line, exact enough to compare steps. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const totalSeconds = Math.round(ms / 1000)
  return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`
}

/** "AP/AR snapshot 11m 10s, GL snapshot 1.2s": the steps in the order they ran. */
export function formatSteps(steps: readonly StepTiming[]): string {
  return steps.map((step) => `${step.name} ${formatDuration(step.ms)}`).join(', ')
}
