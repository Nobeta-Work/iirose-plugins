import { logInfo, logWarn } from '../utils/logger'

export class Notifier {
  constructor(private readonly hostWin: Window) {}

  info(message: string): void {
    logInfo(message)
    this.render(message)
  }

  warn(message: string): void {
    logWarn(message)
    this.render(message, true)
  }

  private render(message: string, isWarn = false): void {
    const doc = this.hostWin.document
    if (!doc?.body) return

    let container = doc.getElementById('iia-toast')
    if (!container) {
      container = doc.createElement('div')
      container.id = 'iia-toast'
      container.setAttribute(
        'style',
        [
          'position:fixed',
          'right:16px',
          'bottom:16px',
          'z-index:2147483647',
          'padding:10px 12px',
          'border-radius:8px',
          'font-size:12px',
          'background:rgba(0,0,0,.75)',
          'color:#fff',
          'max-width:320px',
          'box-shadow:0 8px 24px rgba(0,0,0,.2)',
        ].join(';'),
      )
      doc.body.appendChild(container)
    }

    container.textContent = message
    if (isWarn) {
      container.style.background = 'rgba(160, 40, 20, .92)'
    } else {
      container.style.background = 'rgba(0,0,0,.75)'
    }

    this.hostWin.clearTimeout(Number(container.dataset.timer || 0))
    const timer = this.hostWin.setTimeout(() => {
      container?.remove()
    }, 2200)
    container.dataset.timer = String(timer)
  }
}
