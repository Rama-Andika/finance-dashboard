import { describe, expect, it } from 'vitest'
import { createSshTransport, remoteCommandLine, scpArguments, shellQuote, sshArguments } from './transport.mjs'

const TARGET = { ssh: 'oxy@staging.example.com', sshPort: 2222 }

describe('shellQuote', () => {
  it('wraps a word in single quotes', () => {
    expect(shellQuote('node')).toBe("'node'")
    expect(shellQuote(5205)).toBe("'5205'")
  })

  it('keeps spaces and shell characters inside the quotes', () => {
    expect(shellQuote('a b; rm -rf / $(x) `y` "z"')).toBe(`'a b; rm -rf / $(x) \`y\` "z"'`)
  })

  it('closes, escapes and reopens around a single quote', () => {
    expect(shellQuote("it's")).toBe(`'it'\\''s'`)
  })
})

describe('remoteCommandLine', () => {
  it('quotes every argument and goes to the folder first', () => {
    expect(
      remoteCommandLine(
        ['node', 'scripts/ops/release.mjs', 'list', '--root', '/home/oxy/x'],
        '/home/oxy/x/releases/r1',
      ),
    ).toBe("cd '/home/oxy/x/releases/r1' && 'node' 'scripts/ops/release.mjs' 'list' '--root' '/home/oxy/x'")
  })

  it('needs no folder, and needs a program', () => {
    expect(remoteCommandLine(['test', '-d', '/home/oxy/x'])).toBe("'test' '-d' '/home/oxy/x'")
    expect(() => remoteCommandLine([])).toThrow('needs a program')
  })

  it('cannot be tricked by an argument that looks like a command', () => {
    const line = remoteCommandLine(['echo', "x'; rm -rf /; echo '"])
    expect(line).toBe(`'echo' 'x'\\''; rm -rf /; echo '\\'''`)
  })
})

describe('sshArguments and scpArguments', () => {
  it('never asks a question, and uses the port of the target', () => {
    const args = sshArguments(TARGET, "'ls'")
    expect(args).toEqual([
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=15',
      '-o',
      'ServerAliveInterval=15',
      '-o',
      'ServerAliveCountMax=4',
      '-p',
      '2222',
      'oxy@staging.example.com',
      "'ls'",
    ])
    const copy = scpArguments(TARGET, 'release.tgz', '/home/oxy/x/releases/.incoming/release.tgz')
    expect(copy.slice(0, 8)).toEqual(args.slice(0, 8))
    expect(copy.slice(8)).toEqual([
      '-P',
      '2222',
      'release.tgz',
      'oxy@staging.example.com:/home/oxy/x/releases/.incoming/release.tgz',
    ])
  })
})

describe('createSshTransport', () => {
  function fake(result) {
    const calls = []
    const spawn = (program, args, options) => {
      calls.push({ program, args, options })
      return result
    }
    return { calls, transport: createSshTransport(TARGET, { spawn }) }
  }

  it('runs a program through ssh and returns what it printed', () => {
    const { calls, transport } = fake({ status: 0, stdout: 'hello\n', stderr: '' })
    const result = transport.run(['node', '-v'], { cwd: '/home/oxy/x', timeoutMs: 5000 })
    expect(result).toEqual({ code: 0, stdout: 'hello\n', stderr: '' })
    expect(calls).toHaveLength(1)
    expect(calls[0].program).toBe('ssh')
    expect(calls[0].args.at(-1)).toBe("cd '/home/oxy/x' && 'node' '-v'")
    expect(calls[0].options).toMatchObject({ timeout: 5000, encoding: 'utf8' })
  })

  it('returns the exit code of the program, 255 when ssh itself failed, 124 on a timeout', () => {
    expect(fake({ status: 3, stdout: '', stderr: 'boom' }).transport.run(['false']).code).toBe(3)
    expect(
      fake({ status: null, stdout: '', stderr: '', error: new Error('spawn ssh ENOENT') }).transport.run(['x']),
    ).toEqual({
      code: 255,
      stdout: '',
      stderr: 'spawn ssh ENOENT',
    })
    const timeout = Object.assign(new Error('spawnSync ssh ETIMEDOUT'), { code: 'ETIMEDOUT' })
    expect(fake({ status: null, stdout: '', stderr: '', error: timeout }).transport.run(['x']).code).toBe(124)
  })

  it('sends a file with scp from its own folder, by name only', () => {
    const { calls, transport } = fake({ status: 0, stdout: '', stderr: '' })
    transport.upload('/work/out/release.tgz', '/home/oxy/x/releases/.incoming/release.tgz')
    expect(calls[0].program).toBe('scp')
    expect(calls[0].options.cwd).toBe('/work/out')
    expect(calls[0].args).toContain('release.tgz')
    expect(calls[0].args.at(-1)).toBe('oxy@staging.example.com:/home/oxy/x/releases/.incoming/release.tgz')
  })

  it('refuses a folder or file name on the server that is not a plain path', () => {
    const { calls, transport } = fake({ status: 0, stdout: '', stderr: '' })
    expect(() => transport.run(['ls'], { cwd: '/home/oxy/x y' })).toThrow('plain absolute path')
    expect(() => transport.upload('/work/a.tgz', '/home/oxy/$(x)')).toThrow('plain absolute path')
    expect(calls).toEqual([])
  })
})
