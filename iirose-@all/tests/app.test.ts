import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AtAllApp } from '../src/app'
import { MemberResolver } from '../src/iirose/member-resolver'

function createHostWindow() {
  const hostWin = window as unknown as Window & { send: ReturnType<typeof vi.fn> }
  hostWin.document.body.innerHTML = '<textarea></textarea>'
  hostWin.localStorage.clear()
  hostWin.localStorage.setItem('username', 'Self')
  const originalSend = vi.fn()
  hostWin.send = originalSend
  return { hostWin, originalSend }
}

describe('AtAllApp', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('passes through normal message', () => {
    const { hostWin, originalSend } = createHostWindow()
    const app = new AtAllApp(hostWin)
    app.install()

    hostWin.send(JSON.stringify({ m: 'hello', mc: '1', i: 'm1' }))
    expect(originalSend).toHaveBeenCalledTimes(1)
  })

  it('intercepts at-all message and sends transformed payload once', async () => {
    const { hostWin, originalSend } = createHostWindow()
    vi.spyOn(MemberResolver.prototype, 'resolveOnce').mockResolvedValue([
      { username: 'Noβ', uid: '2' },
      { username: 'Self', uid: '1' },
    ])

    const app = new AtAllApp(hostWin)
    app.install()

    const textarea = hostWin.document.querySelector('textarea') as HTMLTextAreaElement
    textarea.value = '[@全体成员]'

    hostWin.send(JSON.stringify({ m: '[@全体成员]', mc: '1', i: 'm1' }))

    await Promise.resolve()
    await Promise.resolve()

    const sentMessages = originalSend.mock.calls.map((args) => args[0] as string)
    expect(sentMessages).toHaveLength(1)

    const payload = JSON.parse(sentMessages[0]) as { m: string }
    expect(payload.m.startsWith('\\\\\\*\n### @全体成员\n')).toBe(true)
    expect(payload.m.includes('[*Noβ*]')).toBe(true)
    expect(payload.m.includes('[*Self*]')).toBe(false)
  })

  it('intercepts current-site moveinputDo path', async () => {
    const { hostWin } = createHostWindow()
    const hostWinAny = hostWin as Window & {
      Utils?: { service?: { moveinputDo?: (...args: unknown[]) => unknown } }
      socket?: { send?: ReturnType<typeof vi.fn> }
    }
    const originalMoveinputDo = vi.fn()
    hostWinAny.Utils = {
      service: {
        moveinputDo: originalMoveinputDo,
      },
    }
    hostWinAny.socket = {
      send: vi.fn(),
    }

    vi.spyOn(MemberResolver.prototype, 'resolveOnce').mockResolvedValue([
      { username: 'Noβ', uid: '2' },
      { username: 'Andδ', uid: '3' },
    ])

    const app = new AtAllApp(hostWin)
    app.install()

    hostWinAny.Utils?.service?.moveinputDo?.('[@全体成员]')
    await Promise.resolve()
    await Promise.resolve()

    expect(originalMoveinputDo).toHaveBeenCalledTimes(1)
    const [message] = originalMoveinputDo.mock.calls[0]
    expect(typeof message).toBe('string')
    expect((message as string).startsWith('\\\\\\*\n### @全体成员\n')).toBe(true)
    expect(message).toContain('[*Noβ*]')
    expect(message).toContain('[*Andδ*]')
  })
})
