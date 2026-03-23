import type { PublicMessagePayload } from '../types'

export function parsePublicMessagePayload(raw: unknown): PublicMessagePayload | null {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      return toPublicPayload(parsed)
    } catch {
      return null
    }
  }

  if (typeof raw === 'object' && raw !== null) {
    return toPublicPayload(raw as Record<string, unknown>)
  }

  return null
}

function toPublicPayload(input: Record<string, unknown>): PublicMessagePayload | null {
  if (typeof input.m !== 'string') return null
  if (typeof input.mc !== 'string') return null
  if (typeof input.g === 'string' && input.g.length > 0) return null
  return input as PublicMessagePayload
}

export function serializePublicMessagePayload(payload: PublicMessagePayload): string {
  return JSON.stringify(payload)
}
