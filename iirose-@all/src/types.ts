export type MemberRecord = {
  username: string
  uid?: string
  raw?: unknown
}

export type PublicMessagePayload = {
  m: string
  mc: string
  i?: string
  [key: string]: unknown
}

export type DraftSnapshot = {
  text: string
  element: HTMLElement | HTMLInputElement | HTMLTextAreaElement | null
}
