// pino-roll ships no type declarations. This declares the small part that file-destination.ts uses.
declare module 'pino-roll' {
  /** A pino-roll stream is a sonic-boom stream. */
  export type RollingStream = {
    write(chunk: string): boolean
    flushSync(): void
    end(): void
    on(event: 'error', listener: (error: Error) => void): RollingStream
  }

  export type PinoRollOptions = {
    /** Base path; the file written is "<file>.<yyyy-MM-dd>.<n>.log" */
    file: string
    frequency?: 'daily' | 'hourly' | number
    dateFormat?: string
    extension?: string
    mkdir?: boolean
  }

  const build: (options: PinoRollOptions) => Promise<RollingStream>
  export default build
}
