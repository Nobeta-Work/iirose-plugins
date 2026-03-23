import { AtAllApp } from './app'

declare global {
  interface Window {
    __IIROSE_AT_ALL_APP__?: AtAllApp
    send?: (data: unknown) => unknown
  }
}

;(function bootstrap() {
  const topWin = window
  const frame = topWin.document.getElementById('mainFrame') as HTMLIFrameElement | null
  const hostWin = frame?.contentWindow || topWin

  if (hostWin.__IIROSE_AT_ALL_APP__) {
    return
  }

  const init = () => {
    const canInstallWithLegacySend = typeof hostWin.send === 'function'
    const canInstallWithMoveinputDo = Boolean(
      (hostWin as Window & { Utils?: { service?: { moveinputDo?: unknown } } }).Utils?.service?.moveinputDo,
    )

    if (!canInstallWithLegacySend && !canInstallWithMoveinputDo) {
      hostWin.setTimeout(init, 500)
      return
    }

    const app = new AtAllApp(hostWin)
    hostWin.__IIROSE_AT_ALL_APP__ = app
    app.install()
  }

  if (hostWin.document.readyState === 'complete') {
    init()
  } else {
    hostWin.addEventListener('load', init, { once: true })
  }
})()
