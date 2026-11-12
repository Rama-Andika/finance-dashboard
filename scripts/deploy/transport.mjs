import { spawnSync } from 'node:child_process'
import { basename, dirname } from 'node:path'
import { isSafeRemotePath } from '../lib/release-layout.mjs'

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000

/** Never ask a question on the terminal, give up on a server that does not answer, notice a dead connection. */
const CONNECTION_OPTIONS = [
  '-o',
  'BatchMode=yes',
  '-o',
  'ConnectTimeout=15',
  '-o',
  'ServerAliveInterval=15',
  '-o',
  'ServerAliveCountMax=4',
]

/**
 * @typedef {{ code: number, stdout: string, stderr: string }} RunResult
 * @typedef {{ ssh: string, sshPort: number }} Destination
 */

/**
 * One word for the shell of the server: inside single quotes, and a single quote inside becomes '\''.
 * @param {string | number} value
 */
export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

/**
 * The line the shell of the server runs: go to the folder (when given), then the program with every argument quoted.
 * @param {string[]} argv the program and its arguments
 * @param {string} [cwd] an absolute folder on the server
 */
export function remoteCommandLine(argv, cwd) {
  if (argv.length === 0) throw new Error('a remote command needs a program')
  const command = argv.map(shellQuote).join(' ')
  return cwd === undefined ? command : `cd ${shellQuote(cwd)} && ${command}`
}

/** @param {Destination} target @param {string} commandLine */
export function sshArguments(target, commandLine) {
  return [...CONNECTION_OPTIONS, '-p', String(target.sshPort), target.ssh, commandLine]
}

/** @param {Destination} target @param {string} localName a file name (no folder) @param {string} remoteFile an absolute path on the server */
export function scpArguments(target, localName, remoteFile) {
  return [...CONNECTION_OPTIONS, '-P', String(target.sshPort), localName, `${target.ssh}:${remoteFile}`]
}

/**
 * @param {import('node:child_process').SpawnSyncReturns<string>} result
 * @returns {RunResult}
 */
function toRunResult(result) {
  const timedOut = result.error && 'code' in result.error && result.error.code === 'ETIMEDOUT'
  return {
    code: timedOut ? 124 : (result.status ?? 255),
    stdout: result.stdout ?? '',
    stderr: result.stderr || (result.error ? result.error.message : ''),
  }
}

/**
 * Runs programs on a server over SSH and sends files over SCP.
 * @param {Destination} target
 * @param {{ spawn?: typeof spawnSync }} [options] spawn: replaced in tests
 */
export function createSshTransport(target, { spawn = spawnSync } = {}) {
  return {
    /**
     * @param {string[]} argv
     * @param {{ cwd?: string, timeoutMs?: number }} [options]
     * @returns {RunResult}
     */
    run(argv, { cwd, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
      if (cwd !== undefined && !isSafeRemotePath(cwd))
        throw new Error('the folder on the server is not a plain absolute path')
      const result = spawn('ssh', sshArguments(target, remoteCommandLine(argv, cwd)), {
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 32 * 1024 * 1024,
      })
      return toRunResult(result)
    },
    /**
     * @param {string} localFile
     * @param {string} remoteFile an absolute path on the server
     * @param {{ timeoutMs?: number }} [options]
     * @returns {RunResult}
     */
    upload(localFile, remoteFile, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
      if (!isSafeRemotePath(remoteFile)) throw new Error('the file on the server is not a plain absolute path')
      const result = spawn('scp', scpArguments(target, basename(localFile), remoteFile), {
        cwd: dirname(localFile),
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 32 * 1024 * 1024,
      })
      return toRunResult(result)
    },
  }
}
