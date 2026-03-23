import { describe, expect, it } from 'vitest'
import { buildAtAllMessage, buildFinalPayload, hasAtAllTrigger, MARKDOWN_HEADER, MARKDOWN_TITLE, sanitizeMembers } from '../src/feature/at-all'

describe('at-all feature', () => {
  it('detects trigger token', () => {
    expect(hasAtAllTrigger('hello [@全体成员]')).toBe(true)
    expect(hasAtAllTrigger('hello')).toBe(false)
  })

  it('builds markdown message with fixed header and title', () => {
    const message = buildAtAllMessage(['Noβ', 'Andδ'])
    expect(message).toBe(`${MARKDOWN_HEADER}\n${MARKDOWN_TITLE}\n [*Noβ*]   [*Andδ*] `)
  })

  it('sanitizes duplicates, blanks, and self member', () => {
    const result = sanitizeMembers(
      [
        { username: 'Noβ', uid: '1' },
        { username: 'Noβ', uid: '1' },
        { username: '  ' },
        { username: 'Andδ', uid: '2' },
        { username: 'Self', uid: '3' },
      ],
      { selfId: '3' },
    )

    expect(result).toEqual([
      { username: 'Noβ', uid: '1' },
      { username: 'Andδ', uid: '2' },
    ])
  })

  it('builds final payload with replaced message and new id', () => {
    const payload = buildFinalPayload({ m: '[@全体成员]', mc: '614530', i: 'old' }, 'final')
    expect(payload.m).toBe('final')
    expect(payload.mc).toBe('614530')
    expect(payload.i).not.toBe('old')
  })
})
