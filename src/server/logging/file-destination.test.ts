import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFileSink, pruneOldLogFiles, type BuildStream } from './file-destination'
import { LOG_FILE_PATTERN } from './log-file-name'

type FakeStream = {
  writes: string[]
  errorHandlers: ((error: Error) => void)[]
  write: (line: string) => boolean
  flushSync: ReturnType<typeof vi.fn>
  end: ReturnType<typeof vi.fn>
  on: (event: 'error', handler: (error: Error) => void) => FakeStream
}

function fakeStream(): FakeStream {
  const stream: FakeStream = {
    writes: [],
    errorHandlers: [],
    write: (line) => {
      stream.writes.push(line)
      return true
    },
    flushSync: vi.fn(),
    end: vi.fn(),
    on: (_event, handler) => {
      stream.errorHandlers.push(handler)
      return stream
    },
  }
  return stream
}

describe('createFileSink (fake stream)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('keeps the lines written while the file is opening and writes them in order once it is open', async () => {
    const stream = fakeStream()
    const build = vi.fn(async () => stream) as unknown as BuildStream
    const sink = createFileSink({ dir: 'x', build, onProblem: vi.fn() })
    sink.write('a\n')
    sink.write('b\n')
    await sink.whenOpen()
    sink.write('c\n')
    expect(stream.writes).toEqual(['a\n', 'b\n', 'c\n'])
    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({ frequency: 'daily', dateFormat: 'yyyy-MM-dd', mkdir: true }),
    )
  })

  it('reports a failure once, drops lines meanwhile, and opens the file again later', async () => {
    const stream = fakeStream()
    let calls = 0
    const build = vi.fn(async () => {
      calls += 1
      if (calls === 1) throw new Error('EACCES: permission denied')
      return stream
    }) as unknown as BuildStream
    const onProblem = vi.fn()
    const sink = createFileSink({ dir: 'x', build, onProblem, reopenDelayMs: 60_000 })
    await sink.whenOpen()
    expect(onProblem).toHaveBeenCalledTimes(1)
    expect(onProblem.mock.calls[0]?.[0]).toContain('could not be opened')
    expect(onProblem.mock.calls[0]?.[0]).toContain('EACCES')

    sink.write('lost\n')
    await vi.advanceTimersByTimeAsync(60_000)
    await sink.whenOpen()
    sink.write('kept\n')
    expect(stream.writes).toEqual(['kept\n'])
    expect(onProblem).toHaveBeenCalledTimes(1)
  })

  it('stops writing after a write error and opens a new stream later', async () => {
    const first = fakeStream()
    const second = fakeStream()
    const streams = [first, second]
    const build = vi.fn(async () => streams.shift() as FakeStream) as unknown as BuildStream
    const onProblem = vi.fn()
    const sink = createFileSink({ dir: 'x', build, onProblem, reopenDelayMs: 1000 })
    await sink.whenOpen()
    sink.write('one\n')
    first.errorHandlers[0]?.(new Error('ENOSPC: no space left on device'))
    expect(onProblem).toHaveBeenCalledTimes(1)
    expect(first.end).toHaveBeenCalled()
    sink.write('dropped\n')

    await vi.advanceTimersByTimeAsync(1000)
    await sink.whenOpen()
    sink.write('two\n')
    expect(first.writes).toEqual(['one\n'])
    expect(second.writes).toEqual(['two\n'])

    // an error from the old stream must not break the new one
    first.errorHandlers[0]?.(new Error('late error'))
    sink.write('three\n')
    expect(second.writes).toEqual(['two\n', 'three\n'])
    expect(onProblem).toHaveBeenCalledTimes(1)
  })

  it('flushes the open stream and never throws while flushing', async () => {
    const stream = fakeStream()
    const sink = createFileSink({ dir: 'x', build: (async () => stream) as unknown as BuildStream, onProblem: vi.fn() })
    sink.flush() // not open yet
    await sink.whenOpen()
    sink.flush()
    expect(stream.flushSync).toHaveBeenCalledTimes(1)
    stream.flushSync.mockImplementation(() => {
      throw new Error('sonic boom is not ready yet')
    })
    expect(() => sink.flush()).not.toThrow()
  })
})

describe('createFileSink (real pino-roll)', () => {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'logs-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('creates the folder and writes the lines to app.<day>.<n>.log', async () => {
    const logDir = join(dir, 'nested', 'logs')
    const sink = createFileSink({ dir: logDir })
    await sink.whenOpen()
    sink.write('{"level":"info","msg":"one"}\n')
    sink.write('{"level":"info","msg":"two"}\n')
    // The file opens a moment after the stream is created; keep flushing until the lines are on disk.
    await vi.waitFor(() => {
      sink.flush()
      const files = readdirSync(logDir)
      expect(files).toHaveLength(1)
      expect(files[0]).toMatch(LOG_FILE_PATTERN)
      expect(readFileSync(join(logDir, files[0] as string), 'utf8')).toBe(
        '{"level":"info","msg":"one"}\n{"level":"info","msg":"two"}\n',
      )
    })
  })
})

describe('pruneOldLogFiles', () => {
  it('removes only log files older than the retention and leaves every other file alone', async () => {
    const removed: string[] = []
    const result = await pruneOldLogFiles({
      dir: '/logs',
      retentionDays: 30,
      today: '2026-11-10',
      list: async () => [
        'app.2026-09-01.1.log',
        'app.2026-10-10.12.log',
        'app.2026-10-11.1.log', // exactly 30 days back: kept
        'app.2026-11-10.1.log',
        'app.log',
        'notes.txt',
        'other.2026-01-01.1.log',
      ],
      remove: async (path) => {
        removed.push(path.replace(/\\/g, '/'))
      },
    })
    expect(result).toEqual(['app.2026-09-01.1.log', 'app.2026-10-10.12.log'])
    expect(removed).toEqual(['/logs/app.2026-09-01.1.log', '/logs/app.2026-10-10.12.log'])
  })

  it('goes on when one file cannot be removed, and answers nothing for a missing folder', async () => {
    const result = await pruneOldLogFiles({
      dir: '/logs',
      retentionDays: 1,
      today: '2026-11-10',
      list: async () => ['app.2026-11-01.1.log', 'app.2026-11-02.1.log'],
      remove: async (path) => {
        if (path.includes('11-01')) throw new Error('EBUSY')
      },
    })
    expect(result).toEqual(['app.2026-11-02.1.log'])

    const missing = await pruneOldLogFiles({
      dir: '/nope',
      retentionDays: 1,
      today: '2026-11-10',
      list: async () => {
        throw new Error('ENOENT')
      },
    })
    expect(missing).toEqual([])
  })
})
