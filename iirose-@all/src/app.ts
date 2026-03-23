import { buildAtAllMessage, buildFinalPayload, DEFAULT_MAX_MESSAGE_LENGTH, hasAtAllTrigger, isMessageTooLong, sanitizeMembers } from './feature/at-all'
import { captureDraftSnapshot, restoreDraftSnapshot } from './iirose/editor'
import { resolveRuntimeContext } from './iirose/context'
import { MemberResolver } from './iirose/member-resolver'
import { parsePublicMessagePayload, serializePublicMessagePayload } from './iirose/payload'
import { IiroseTransport } from './iirose/transport'
import type { PublicMessagePayload } from './types'
import { Notifier } from './ui/notice'
import { logError, logInfo } from './utils/logger'

export class AtAllApp {
  private readonly notifier: Notifier
  private readonly transport: IiroseTransport
  private readonly memberResolver: MemberResolver
  private sendTaskPending = false
  private bypassMoveinputDo = false

  constructor(private readonly hostWin: Window) {
    this.notifier = new Notifier(hostWin)
    this.transport = new IiroseTransport(hostWin)
    this.memberResolver = new MemberResolver(hostWin, this.transport)
  }

  install(): void {
    const moveinputInstalled = this.installMoveinputDoInterceptor()
    this.transport.install(moveinputInstalled ? undefined : (data) => this.handleLegacyOutgoing(data))
    this.notifier.info('I@A 已加载')
    logInfo('initialized')
  }

  private handleLegacyOutgoing(data: unknown): boolean {
    const payload = parsePublicMessagePayload(data)
    if (!payload) return false
    if (!hasAtAllTrigger(payload.m)) return false

    if (this.sendTaskPending) {
      this.notifier.warn('I@A 正在处理中，请稍候')
      return true
    }

    const draft = captureDraftSnapshot(this.hostWin.document)
    void this.processPayloadSubmission(
      {
        rawText: payload.m,
        selfId: payload.mc,
        submit: (finalMessage) => {
          const finalPayload = buildFinalPayload(payload, finalMessage)
          this.transport.sendRaw(serializePublicMessagePayload(finalPayload))
        },
      },
      draft,
    )
    return true
  }

  private installMoveinputDoInterceptor(): boolean {
    const service = (this.hostWin as Window & { Utils?: { service?: { moveinputDo?: (...args: unknown[]) => unknown } } }).Utils?.service
    if (!service || typeof service.moveinputDo !== 'function') {
      return false
    }

    const originalMoveinputDo = service.moveinputDo.bind(service)
    const app = this

    service.moveinputDo = function patchedMoveinputDo(text: unknown, ...args: unknown[]): unknown {
      if (app.bypassMoveinputDo) {
        return originalMoveinputDo(text, ...args)
      }

      if (typeof text !== 'string' || !hasAtAllTrigger(text)) {
        return originalMoveinputDo(text, ...args)
      }

      if (app.sendTaskPending) {
        app.notifier.warn('I@A 正在处理中，请稍候')
        return false
      }

      const draft = captureDraftSnapshot(app.hostWin.document)
      void app.processPayloadSubmission(
        {
          rawText: text,
          selfId: null,
          submit: (finalMessage) => {
            app.bypassMoveinputDo = true
            try {
              originalMoveinputDo(finalMessage, ...args)
            } finally {
              app.bypassMoveinputDo = false
            }
          },
        },
        draft,
      )

      return false
    }

    return true
  }

  private async processPayloadSubmission(
    submission: {
      rawText: string
      selfId: string | null
      submit: (finalMessage: string) => void
    },
    draft: ReturnType<typeof captureDraftSnapshot>,
  ): Promise<void> {
    this.sendTaskPending = true
    const context = resolveRuntimeContext(this.hostWin)

    try {
      const members = await this.memberResolver.resolveOnce()
      const cleaned = sanitizeMembers(members, {
        selfId: submission.selfId,
        selfUsername: context.selfUsername,
      })

      if (cleaned.length === 0) {
        this.notifier.warn('当前房间暂无可提及成员')
        restoreDraftSnapshot(draft)
        return
      }

      const finalMessage = buildAtAllMessage(cleaned.map((item) => item.username))
      if (isMessageTooLong(finalMessage, DEFAULT_MAX_MESSAGE_LENGTH)) {
        this.notifier.warn('当前消息过长，已阻止发送')
        restoreDraftSnapshot(draft)
        return
      }

      submission.submit(finalMessage)
      logInfo('send success', {
        roomId: context.roomId,
        mentionCount: cleaned.length,
        finalLength: finalMessage.length,
      })
    } catch (error) {
      logError('send failed', error)
      this.notifier.warn('I@A 处理失败，请重试')
      restoreDraftSnapshot(draft)
    } finally {
      this.sendTaskPending = false
    }
  }
}
