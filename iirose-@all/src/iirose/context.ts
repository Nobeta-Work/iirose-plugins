import { safeTrim } from '../utils/string'

export type RuntimeContext = {
  roomId: string | null
  selfUsername: string | null
}

export function resolveRuntimeContext(hostWin: Window): RuntimeContext {
  return {
    roomId: resolveCurrentRoomId(hostWin),
    selfUsername: resolveCurrentUsername(hostWin),
  }
}

export function resolveCurrentRoomId(hostWin: Window): string | null {
  const href = hostWin.location?.href ?? ''
  const roomMatch = href.match(/\[__([^\]]+)\]/)
  if (roomMatch) return roomMatch[1]

  const hashMatch = href.match(/[?&]room(?:Id)?=([^&#]+)/i)
  if (hashMatch) return decodeURIComponent(hashMatch[1])

  return null
}

export function resolveCurrentUsername(hostWin: Window): string | null {
  const candidates = [
    'iirose_username',
    'iirose_user_name',
    'username',
    'nickName',
  ]

  for (const key of candidates) {
    const value = safeTrim(hostWin.localStorage?.getItem(key))
    if (value) return value
  }

  const meta = hostWin.document?.querySelector<HTMLElement>('[data-iia-self-username]')
  const fromMeta = safeTrim(meta?.dataset.iiaSelfUsername)
  if (fromMeta) return fromMeta

  return null
}
