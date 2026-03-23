type IncomingListener = (payload: string) => void

export class IiroseTransport {
  private readonly incomingListeners = new Set<IncomingListener>()
  private readonly originalSend: ((data: unknown) => unknown) | null
  private bypassDepth = 0
  private readonly wsCtor: typeof WebSocket | undefined

  constructor(private readonly hostWin: Window) {
    this.originalSend = typeof hostWin.send === 'function' ? hostWin.send.bind(hostWin) : null
    this.wsCtor = (hostWin as Window & { WebSocket?: typeof WebSocket }).WebSocket
  }

  install(onOutgoing?: (data: unknown) => boolean | void): void {
    const transport = this

    if (this.originalSend && onOutgoing) {
      this.hostWin.send = function patchedSend(data: unknown): unknown {
        if (transport.bypassDepth > 0) {
          return transport.originalSend?.(data)
        }

        const shouldBypass = onOutgoing(data)
        if (shouldBypass === true) {
          return undefined
        }

        return transport.originalSend?.(data)
      }
    }

    const wsProto = this.wsCtor?.prototype
    if (wsProto && typeof wsProto.dispatchEvent === 'function') {
      const originalDispatch = wsProto.dispatchEvent
      wsProto.dispatchEvent = function patchedDispatchEvent(this: WebSocket, event: Event): boolean {
        if (event instanceof MessageEvent) {
          const decoded = decodeIncomingData(event.data)
          if (decoded) {
            transport.emitIncoming(decoded)
          }
        }
        return originalDispatch.call(this, event)
      }
    }
  }

  withBypass<T>(fn: () => T): T {
    this.bypassDepth += 1
    try {
      return fn()
    } finally {
      this.bypassDepth -= 1
    }
  }

  sendRaw(data: unknown): unknown {
    const socketSend = this.resolveSocketSend()
    if (typeof data === 'string' && socketSend) {
      return this.withBypass(() => socketSend(data))
    }
    if (!this.originalSend) {
      throw new Error('IIROSE send() is unavailable')
    }
    return this.withBypass(() => this.originalSend?.(data))
  }

  onIncoming(listener: IncomingListener): () => void {
    this.incomingListeners.add(listener)
    return () => {
      this.incomingListeners.delete(listener)
    }
  }

  waitForIncoming(predicate: (payload: string) => boolean, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = this.hostWin.setTimeout(() => {
        unsubscribe()
        reject(new Error('Timed out waiting for matching incoming payload'))
      }, timeoutMs)

      const unsubscribe = this.onIncoming((payload) => {
        if (!predicate(payload)) return
        this.hostWin.clearTimeout(timeout)
        unsubscribe()
        resolve(payload)
      })
    })
  }

  private emitIncoming(payload: string): void {
    for (const listener of this.incomingListeners) {
      listener(payload)
    }
  }

  private resolveSocketSend(): ((data: string) => unknown) | null {
    const socket = (this.hostWin as Window & { socket?: { send?: (data: string) => unknown } }).socket
    if (socket && typeof socket.send === 'function') {
      return socket.send.bind(socket)
    }
    return null
  }
}

function decodeIncomingData(data: unknown): string | null {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(data))
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return null
  }
  return null
}
