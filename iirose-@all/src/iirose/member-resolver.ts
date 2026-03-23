import type { MemberRecord } from '../types'
import { normalizeWhitespace } from '../utils/string'
import type { IiroseTransport } from './transport'

const USERNAME_KEYS = ['username', 'name', 'nick', 'nickname', 'uname', 'userName']
const UID_KEYS = ['uid', 'id', 'userId']

export class MemberResolver {
  constructor(
    private readonly hostWin: Window,
    private readonly transport: IiroseTransport,
  ) {}

  async resolveOnce(timeoutMs = 2500): Promise<MemberRecord[]> {
    const currentSiteMembers = resolveCurrentSiteMembers(this.hostWin)
    if (currentSiteMembers.length > 0) {
      return currentSiteMembers
    }

    const responsePromise = this.transport.waitForIncoming((payload) => payload.startsWith('u2'), timeoutMs)
    this.transport.sendRaw('r2')
    const payload = await responsePromise
    return parseMemberResponse(payload)
  }
}

export function resolveCurrentSiteMembers(hostWin: Window): MemberRecord[] {
  const doc = hostWin.document
  const findUserByUid = (
    hostWin as Window & {
      Objs?: {
        mapHolder?: {
          function?: {
            findUserByUid?: (uid: string | null) => unknown
          }
        }
      }
    }
  ).Objs?.mapHolder?.function?.findUserByUid

  if (typeof findUserByUid !== 'function') {
    return []
  }

  const items = Array.from(doc.querySelectorAll<HTMLElement>('.homeHolderMsgContentBoxMemberItem[data-uid]'))
  const members: MemberRecord[] = []

  for (const item of items) {
    const uid = item.getAttribute('data-uid')
    if (!uid) continue
    const user = findUserByUid(uid)
    if (!Array.isArray(user)) continue

    const username = typeof user[2] === 'string' ? user[2] : ''
    const resolvedUid = typeof user[8] === 'string' ? user[8] : uid
    if (!username) continue

    members.push({
      username: normalizeWhitespace(username),
      uid: resolvedUid,
      raw: user,
    })
  }

  return members
}

export function parseMemberResponse(payload: string): MemberRecord[] {
  const body = payload.startsWith('u2') ? payload.slice(2) : payload
  const trimmed = body.trim()

  if (!trimmed) return []

  const jsonLike = extractJsonLikeBody(trimmed)
  if (jsonLike) {
    try {
      const parsed = JSON.parse(jsonLike) as unknown
      const members = extractMembersFromUnknown(parsed)
      if (members.length > 0) return members
    } catch {
      // Keep falling back to heuristic parsing.
    }
  }

  return parseHeuristicTextMembers(trimmed)
}

function extractJsonLikeBody(text: string): string | null {
  const firstBrace = text.indexOf('{')
  const firstBracket = text.indexOf('[')
  const positions = [firstBrace, firstBracket].filter((pos) => pos >= 0)
  if (positions.length === 0) return null
  return text.slice(Math.min(...positions))
}

function extractMembersFromUnknown(input: unknown): MemberRecord[] {
  const output: MemberRecord[] = []
  visitUnknown(input, output)
  return output
}

function visitUnknown(input: unknown, output: MemberRecord[]): void {
  if (Array.isArray(input)) {
    for (const item of input) visitUnknown(item, output)
    return
  }

  if (typeof input !== 'object' || input === null) {
    return
  }

  const record = input as Record<string, unknown>
  const username = findFirstString(record, USERNAME_KEYS)
  const uid = findFirstString(record, UID_KEYS)
  if (username) {
    output.push({ username: normalizeWhitespace(username), uid: uid || undefined, raw: input })
  }

  for (const value of Object.values(record)) {
    visitUnknown(value, output)
  }
}

function findFirstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    if (typeof record[key] === 'string' && record[key]) {
      return record[key] as string
    }
  }
  return null
}

function parseHeuristicTextMembers(text: string): MemberRecord[] {
  const rows = text
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean)

  const members: MemberRecord[] = []

  for (const row of rows) {
    const pipeMatch = row.match(/^([^|>]{1,40})[|>](\w+)$/)
    if (pipeMatch) {
      members.push({ username: normalizeWhitespace(pipeMatch[1]), uid: pipeMatch[2], raw: row })
      continue
    }

    const simpleMatch = row.match(/^([^\s|>]{1,40})$/)
    if (simpleMatch) {
      members.push({ username: normalizeWhitespace(simpleMatch[1]), raw: row })
    }
  }

  return members
}
