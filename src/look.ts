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

const MIN_LIST = 3

export const PAGE_SIZE = { fallback: 10, min: 3, max: 30 } as const
export const DOCK_CHROME = 14
export const INLINE_CHROME = 8

export function pageSizeOf(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^[0-9]+$/.test(raw) ? Number(raw) : NaN
  return Number.isInteger(n) && n >= PAGE_SIZE.min && n <= PAGE_SIZE.max ? n : PAGE_SIZE.fallback
}

export function layoutFor(placement: Placement, budget: number, extraRows: number, cap: number): Layout {
  const isRoomy = placement === 'dock' && budget >= 20
  const hasMargins = isRoomy
  const fixed = 1 + extraRows + 1 + 2 + (hasMargins ? 2 : 0)
  const avail = Math.max(1, budget - fixed)
  const wantPreview = placement === 'dock' ? (isRoomy ? 4 : 2) : 1
  const showDesc = isRoomy
  const previewBlock = 1 + wantPreview + (showDesc ? 1 : 0)
  if (avail >= MIN_LIST + previewBlock) {
    return { rows: Math.min(cap, avail - previewBlock), previewLines: wantPreview, showDesc, hasMargins }
  }
  return { rows: Math.max(1, Math.min(cap, avail)), previewLines: 0, showDesc: false, hasMargins }
}

const ZERO_WIDTH: ReadonlyArray<readonly [number, number]> = [
  [0x0300, 0x036f], [0x0483, 0x0489], [0x0591, 0x05bd], [0x0610, 0x061a], [0x064b, 0x065f],
  [0x0e31, 0x0e31], [0x0e34, 0x0e3a], [0x0e47, 0x0e4e], [0x1ab0, 0x1aff], [0x1dc0, 0x1dff],
  [0x200b, 0x200f], [0x20d0, 0x20ff], [0xfe00, 0xfe0f], [0xfe20, 0xfe2f], [0xe0100, 0xe01ef],
]

const WIDE: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], [0x231a, 0x231b], [0x2329, 0x232a], [0x23e9, 0x23ec], [0x23f0, 0x23f0], [0x23f3, 0x23f3],
  [0x25fd, 0x25fe], [0x2614, 0x2615], [0x2648, 0x2653], [0x267f, 0x267f], [0x2693, 0x2693], [0x26a1, 0x26a1],
  [0x26aa, 0x26ab], [0x26bd, 0x26be], [0x26c4, 0x26c5], [0x26ce, 0x26ce], [0x26d4, 0x26d4], [0x26ea, 0x26ea],
  [0x26f2, 0x26f3], [0x26f5, 0x26f5], [0x26fa, 0x26fa], [0x26fd, 0x26fd], [0x2705, 0x2705], [0x270a, 0x270b],
  [0x2728, 0x2728], [0x274c, 0x274c], [0x274e, 0x274e], [0x2753, 0x2755], [0x2757, 0x2757], [0x2795, 0x2797],
  [0x27b0, 0x27b0], [0x27bf, 0x27bf], [0x2b1b, 0x2b1c], [0x2b50, 0x2b50], [0x2b55, 0x2b55],
  [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xa000, 0xa4cf], [0xa960, 0xa97f],
  [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe10, 0xfe19], [0xfe30, 0xfe6f], [0xff00, 0xff60], [0xffe0, 0xffe6],
  [0x1f004, 0x1f004], [0x1f0cf, 0x1f0cf], [0x1f18e, 0x1f18e], [0x1f191, 0x1f19a], [0x1f200, 0x1f251],
  [0x1f300, 0x1f64f], [0x1f680, 0x1f6ff], [0x1f7e0, 0x1f7eb], [0x1f90c, 0x1f9ff], [0x1fa70, 0x1faff],
  [0x20000, 0x3fffd],
]

function inRanges(cp: number, ranges: ReadonlyArray<readonly [number, number]>): boolean {
  for (const [lo, hi] of ranges) {
    if (cp < lo) return false
    if (cp <= hi) return true
  }
  return false
}

function charWidth(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0
  if (cp === 0x200d || cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0
  if (inRanges(cp, ZERO_WIDTH)) return 0
  return inRanges(cp, WIDE) ? 2 : 1
}

export function cellWidth(text: string): number {
  let w = 0
  for (const ch of text) w += charWidth(ch)
  return w
}

export function textRows(text: string, width: number): number {
  const w = Math.max(1, width)
  return text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(cellWidth(line) / w)), 0)
}

export function padStartCells(text: string, width: number): string {
  return ' '.repeat(Math.max(0, width - cellWidth(text))) + text
}

export function fit(text: string, width: number): string {
  if (cellWidth(text) <= width) return text
  if (width <= 0) return ''
  let out = ''
  let used = 0
  for (const ch of text) {
    const cw = charWidth(ch)
    if (used + cw > width - 1) break
    out += ch
    used += cw
  }
  return `${out}\u2026`
}

export type RowColumns = { title: number; slug: number; showMode: boolean }

export function rowColumns(cols: number, slugs: readonly string[]): RowColumns {
  const showMode = cols >= 60
  const slug = Math.min(24, Math.max(4, ...slugs.map(s => cellWidth(s))))
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

export function wrappedRows(labels: readonly string[], width: number, gap: number): number {
  const w = Math.max(1, width)
  let rows = labels.length > 0 ? 1 : 0
  let used = 0
  for (const label of labels) {
    const lw = cellWidth(label)
    const next = used === 0 ? lw : used + gap + lw
    if (used > 0 && next > w) {
      rows += 1
      used = lw
    } else {
      used = next
    }
    if (used > w) {
      rows += Math.ceil(used / w) - 1
      used = used % w
    }
  }
  return rows
}
