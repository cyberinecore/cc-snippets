import type { Snippet, SortBy, Usage } from '../types'

function tokenScore(s: Snippet, token: string): number {
  const slug = s.slug.toLowerCase()
  const title = s.title.toLowerCase()
  if (slug === token) return 100
  if (slug.startsWith(token)) return 80
  if (slug.split(/[-_.]/).some(seg => seg.startsWith(token))) return 75
  if (title.startsWith(token)) return 70
  if (title.split(/[\s/_-]+/).some(w => w.startsWith(token))) return 60
  if (slug.includes(token) || title.includes(token)) return 50
  if (s.tags.some(t => t.toLowerCase() === token)) return 45
  if (s.tags.some(t => t.toLowerCase().includes(token))) return 40
  if (s.desc.toLowerCase().includes(token)) return 30
  return 0
}

export type RankOptions = { recent?: Usage; by?: SortBy }

export function rank(snippets: readonly Snippet[], query: string, usage: Usage = {}, options: RankOptions = {}): Snippet[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  const recent = options.recent ?? {}
  const used = (s: Snippet) => usage[s.slug] ?? 0
  const last = (s: Snippet) => recent[s.slug] ?? 0
  const pin = (s: Snippet) => (s.pinned ? 1 : 0)
  const primary = options.by === 'recent' ? last : used
  const secondary = options.by === 'recent' ? used : last
  const scored: Array<{ s: Snippet; score: number }> = []
  for (const s of snippets) {
    let score = 0
    let isHit = true
    for (const t of tokens) {
      const ts = tokenScore(s, t)
      if (ts === 0) {
        isHit = false
        break
      }
      score += ts
    }
    if (isHit) scored.push({ s, score })
  }
  scored.sort((a, b) => b.score - a.score || pin(b.s) - pin(a.s) || primary(b.s) - primary(a.s) || secondary(b.s) - secondary(a.s) || a.s.title.localeCompare(b.s.title))
  return scored.map(x => x.s)
}
