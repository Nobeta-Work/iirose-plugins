import type { DraftSnapshot } from '../types'

type EditableElement = HTMLElement | HTMLInputElement | HTMLTextAreaElement

export function captureDraftSnapshot(doc: Document): DraftSnapshot {
  const element = findBestEditor(doc)
  return {
    element,
    text: element ? readEditorText(element) : '',
  }
}

export function restoreDraftSnapshot(snapshot: DraftSnapshot): void {
  if (!snapshot.element) return
  writeEditorText(snapshot.element, snapshot.text)
}

function findBestEditor(doc: Document): EditableElement | null {
  const active = doc.activeElement
  if (isEditable(active)) return active

  const selectors = [
    'textarea',
    'input[type="text"]',
    '[contenteditable="true"]',
    '[contenteditable=""]',
    '[role="textbox"]',
  ]

  for (const selector of selectors) {
    const element = doc.querySelector(selector)
    if (isEditable(element)) return element
  }

  return null
}

function isEditable(node: Element | null): node is EditableElement {
  if (!node) return false
  if (node instanceof HTMLTextAreaElement) return true
  if (node instanceof HTMLInputElement && node.type === 'text') return true
  if (node instanceof HTMLElement && (node.isContentEditable || node.getAttribute('role') === 'textbox')) {
    return true
  }
  return false
}

function readEditorText(element: EditableElement): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.value
  }
  return element.textContent ?? ''
}

function writeEditorText(element: EditableElement, text: string): void {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = text
    element.dispatchEvent(new Event('input', { bubbles: true }))
    return
  }
  element.textContent = text
  element.dispatchEvent(new Event('input', { bubbles: true }))
}
