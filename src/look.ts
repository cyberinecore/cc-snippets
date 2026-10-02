import type { Snippet, SnippetMode } from '../types'

export type Placement = 'dock' | 'inline'

export const LOOK = {
  title: { bold: true },
  meta: { dimColor: true },
  hint: { dimColor: true },
  error: { color: 'red' },
  heading: { bold: true },
} as const

export const WIDE_MIN = 90

export function pageSize(placement: Placement, isWide: boolean): number {
  if (placement === 'dock') return 6
  return isWide ? 5 : 4
}

export function previewLines(placement: Placement, isWide: boolean): number {
  if (placement === 'dock') return 8
  return isWide ? 6 : 3
}

export function metaLine(s: Snippet): string {
  return [s.source, s.mode, s.slug].join(' | ')
}

export function bodyExcerpt(body: string, max: number): string[] {
  const lines = body.split('\n')
  if (lines.length <= max) return lines
  return [...lines.slice(0, max - 1), `... ${lines.length - max + 1} more line(s)`]
}

export function otherMode(mode: SnippetMode): SnippetMode {
  return mode === 'fill' ? 'submit' : 'fill'
}

export function modeLabel(mode: SnippetMode): string {
  return mode === 'fill' ? 'Fill prompt' : 'Submit prompt'
}
