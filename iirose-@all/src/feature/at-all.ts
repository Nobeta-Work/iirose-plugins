import type { MemberRecord, PublicMessagePayload } from '../types'
import { generateMessageId } from '../utils/id'
import { safeTrim } from '../utils/string'

export const TRIGGER_TOKEN = '[@全体成员]'
export const MARKDOWN_HEADER = '\\\\\\*'
export const MARKDOWN_TITLE = '### @全体成员'
export const DEFAULT_MAX_MESSAGE_LENGTH = 1800

export function hasAtAllTrigger(text: string): boolean {
  return text.includes(TRIGGER_TOKEN)
}

export function buildAtAllMessage(usernames: string[]): string {
  const mentions = usernames.map((username) => ` [*${username}*] `).join(' ')
  return `${MARKDOWN_HEADER}\n${MARKDOWN_TITLE}\n${mentions}`
}

export function isMessageTooLong(text: string, limit = DEFAULT_MAX_MESSAGE_LENGTH): boolean {
  return text.length > limit
}

export function sanitizeMembers(
  members: MemberRecord[],
  options: {
    selfId?: string | null
    selfUsername?: string | null
  } = {},
): MemberRecord[] {
  const seen = new Set<string>()
  const selfId = safeTrim(options.selfId)
  const selfUsername = safeTrim(options.selfUsername)
  const cleaned: MemberRecord[] = []

  for (const member of members) {
    const username = safeTrim(member.username)
    if (!username) continue
    if (/[\r\n]/.test(username)) continue
    if (selfId && member.uid && safeTrim(member.uid) === selfId) continue
    if (selfUsername && username === selfUsername) continue
    if (seen.has(username)) continue
    seen.add(username)
    cleaned.push({ ...member, username })
  }

  return cleaned
}

export function buildFinalPayload(
  originalPayload: PublicMessagePayload,
  finalMessage: string,
): PublicMessagePayload {
  return {
    ...originalPayload,
    m: finalMessage,
    i: generateMessageId(),
  }
}
