import { describe, expect, it } from 'vitest'
import { parseMemberResponse, resolveCurrentSiteMembers } from '../src/iirose/member-resolver'

describe('member response parser', () => {
  it('parses json array payload', () => {
    const payload = 'u2[{"username":"Noβ","uid":"1"},{"username":"Andδ","uid":"2"}]'
    expect(parseMemberResponse(payload)).toEqual([
      { username: 'Noβ', uid: '1', raw: { username: 'Noβ', uid: '1' } },
      { username: 'Andδ', uid: '2', raw: { username: 'Andδ', uid: '2' } },
    ])
  })

  it('parses nested json payload', () => {
    const payload = 'u2{"users":[{"name":"Noβ","id":"1"},{"nickname":"Andδ","uid":"2"}]}'
    const result = parseMemberResponse(payload)
    expect(result.map((item) => item.username)).toEqual(['Noβ', 'Andδ'])
    expect(result.map((item) => item.uid)).toEqual(['1', '2'])
  })

  it('falls back to line-based text parser', () => {
    const payload = 'u2Noβ|1\nAndδ|2\nUserOnly'
    expect(parseMemberResponse(payload)).toEqual([
      { username: 'Noβ', uid: '1', raw: 'Noβ|1' },
      { username: 'Andδ', uid: '2', raw: 'Andδ|2' },
      { username: 'UserOnly', raw: 'UserOnly' },
    ])
  })

  it('resolves members from current site dom state', () => {
    document.body.innerHTML = '<div class="homeHolderMsgContentBoxMemberItem" data-uid="uid-1"></div>'
    const hostWin = window as Window & {
      Objs?: {
        mapHolder?: {
          function?: {
            findUserByUid?: (uid: string | null) => unknown
          }
        }
      }
    }
    hostWin.Objs = {
      mapHolder: {
        function: {
          findUserByUid: (uid) => ['avatar', '2', 'Noβ', 'fff', 'room', 'n', '', '', uid],
        },
      },
    }

    expect(resolveCurrentSiteMembers(hostWin)).toEqual([
      {
        username: 'Noβ',
        uid: 'uid-1',
        raw: ['avatar', '2', 'Noβ', 'fff', 'room', 'n', '', '', 'uid-1'],
      },
    ])
  })
})
