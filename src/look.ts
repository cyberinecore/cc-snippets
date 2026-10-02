import type { FormOp, Snippet, SnippetMode } from '../types'

export type Placement = 'dock' | 'inline'

export const MATRIX_GREEN = '#00FF41'

export const LOOK = {
  title: { bold: true },
  meta: { dimColor: true },
  hint: { dimColor: true },
  error: { color: 'red' },
  heading: { bold: true, color: MATRIX_GREEN },
  accent: { color: MATRIX_GREEN },
  badge: { color: MATRIX_GREEN, bold: true },
  rule: { color: MATRIX_GREEN, dimColor: true },
} as const

export const WIDE_MIN = 90

export type Layout = { rows: number; previewLines: number; showDesc: boolean; hasMargins: boolean }

const LIST_CAP = { dock: 14, inline: 4 } as const
const MIN_LIST = 3

export function layoutFor(placement: Placement, budget: number, extraRows: number): Layout {
  const isRoomy = placement === 'dock' && budget >= 20
  const hasMargins = isRoomy
  const fixed = 1 + extraRows + 1 + 2 + (hasMargins ? 2 : 0)
  const avail = Math.max(1, budget - fixed)
  const cap = LIST_CAP[placement]
  const wantPreview = placement === 'dock' ? (isRoomy ? 4 : 2) : 1
  const showDesc = isRoomy
  const previewBlock = 1 + wantPreview + (showDesc ? 1 : 0)
  if (avail >= MIN_LIST + previewBlock) {
    return { rows: Math.min(cap, avail - previewBlock), previewLines: wantPreview, showDesc, hasMargins }
  }
  return { rows: Math.max(1, Math.min(cap, avail)), previewLines: 0, showDesc: false, hasMargins }
}

export function fit(text: string, width: number): string {
  if (width <= 1) return text.slice(0, Math.max(0, width))
  return text.length > width ? `${text.slice(0, width - 1)}\u2026` : text
}

export type RowColumns = { title: number; slug: number; showMode: boolean }

export function rowColumns(cols: number, slugs: readonly string[]): RowColumns {
  const showMode = cols >= 60
  const slug = Math.min(24, Math.max(4, ...slugs.map(s => s.length)))
  const gaps = 2 * (showMode ? 3 : 2)
  const title = Math.max(8, cols - slug - 1 - (showMode ? 6 : 0) - gaps - 1 - BULLET.length - 1)
  return { title, slug, showMode }
}

export function sourceLetter(s: Snippet): string {
  return s.source === 'project' ? 'P' : 'G'
}

export function plainLine(line: string): string {
  return line
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?)/, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
}

export function previewOf(s: Snippet, lines: number): string[] {
  return s.body.split('\n').filter(l => l.trim() !== '').slice(0, lines).map(plainLine)
}

export const BULLET = '\u2022 '

export const PIN_MARK = '*'

export function shortDesc(s: Snippet): string {
  if (s.desc) return s.desc
  const line = s.body.split('\n').map(l => l.trim()).find(l => l.length > 0) ?? ''
  return line.replace(/^[#>*\-\s]+/, '').replace(/\*\*/g, '')
}

export function metaLine(s: Snippet): string {
  return [s.source, s.mode, s.slug].join(' | ')
}

export function otherMode(mode: SnippetMode): SnippetMode {
  return mode === 'fill' ? 'submit' : 'fill'
}

export function modeLabel(mode: SnippetMode): string {
  return mode === 'fill' ? 'Fill prompt' : 'Submit prompt'
}

export const FORM_TITLE: Readonly<Record<FormOp, string>> = { new: 'New snippet', edit: 'Edit info', duplicate: 'Duplicate snippet' }

export const FIELDS = ['f:title', 'f:slug', 'f:desc', 'f:tags', 'f:body'] as const
