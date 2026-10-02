import type { PendingCursor } from '../types'

export type Box = { text: string; cursor: number }

export function insertAt(box: Box, insert: string, caretInInsert: number | undefined): { text: string; caret: number } {
  const at = Math.max(0, Math.min(box.cursor, box.text.length))
  const text = box.text.slice(0, at) + insert + box.text.slice(at)
  const caret = at + (caretInInsert ?? insert.length)
  return { text, caret }
}

export type EditLike = { text: string; start: number; end: number; inputText: string }

export function redirectEdit(pending: PendingCursor, e: EditLike): Box | undefined {
  if (e.text !== pending.text) return undefined
  const p = pending.cursor
  const at = pending.at
  if (e.inputText !== '' && e.start === at && e.end === at) {
    const text = e.text.slice(0, p) + e.inputText + e.text.slice(p)
    return { text, cursor: p + e.inputText.length }
  }
  if (e.inputText === '' && e.end === at && e.start === at - 1) {
    if (p === 0) return { text: e.text, cursor: 0 }
    return { text: e.text.slice(0, p - 1) + e.text.slice(p), cursor: p - 1 }
  }
  if (e.inputText === '' && e.start === e.end) {
    return { text: e.text, cursor: p }
  }
  return undefined
}
