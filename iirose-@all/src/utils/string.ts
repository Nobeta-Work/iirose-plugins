export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function safeTrim(value: string | null | undefined): string {
  return (value ?? '').trim()
}
