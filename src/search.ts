import type { Snippet, Usage } from '../types'

function tokenScore(s: Snippet, token: string): number {
  const slug = s.slug.toLowerCase()
  const title = s.title.toLowerCase()
  if (slug === token) return 100
  if (slug.startsWith(token)) return 80
  if (title.startsWith(token)) return 70
  if (title.split(/[\s/_-]+/).some(w => w.startsWith(token))) return 60
  if (slug.includes(token) || title.includes(token)) return 50
  if (s.tags.some(t => t.toLowerCase() === token)) return 45
  if (s.tags.some(t => t.toLowerCase().includes(token))) return 40
  if (s.desc.toLowerCase().includes(token)) return 30
  return 0
}

export function rank(snippets: readonly Snippet[], query: string, usage: Usage = {}): Snippet[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  const used = (s: Snippet) => usage[s.slug] ?? 0
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
  scored.sort((a, b) => b.score - a.score || used(b.s) - used(a.s) || a.s.title.localeCompare(b.s.title))
  return scored.map(x => x.s)
}
