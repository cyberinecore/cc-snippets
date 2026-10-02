import type { Snippet, SnippetMode, SnippetSource, LoadError } from '../types'

export type ParseResult = { ok: true; snippet: Snippet } | { ok: false; error: LoadError }

const FRONTMATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
const SLUG_OK = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export function slugFromPath(path: string): string {
  const name = path.split('/').pop() ?? path
  return name.replace(/\.md$/i, '')
}

function unquote(raw: string): string {
  const v = raw.trim()
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    try {
      const decoded: unknown = JSON.parse(v)
      if (typeof decoded === 'string') return decoded
    } catch {
      throw new Error(`malformed double-quoted value: ${v}`)
    }
  }
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'")
  return v
}

function splitList(inner: string): string[] {
  const items: string[] = []
  let cur = ''
  let quote: '"' | "'" | null = null
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i] ?? ''
    if (quote) {
      cur += ch
      if (ch === '\\' && quote === '"') {
        cur += inner[i + 1] ?? ''
        i++
      } else if (ch === quote) {
        quote = null
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch
      cur += ch
    } else if (ch === ',') {
      items.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  if (quote) throw new Error(`unterminated quote in list: [${inner}]`)
  items.push(cur)
  return items
}

function inlineList(raw: string): string[] {
  const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '')
  return splitList(inner).map(unquote).filter(s => s.length > 0)
}

export function parseFrontmatter(block: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  let listKey: string | undefined
  for (const line of block.split(/\r?\n/)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const item = /^\s+-\s*(.*)$/.exec(line) ?? /^-\s+(.*)$/.exec(line)
    if (item && listKey) {
      const prev = out[listKey]
      const list = Array.isArray(prev) ? prev : []
      const value = unquote(item[1] ?? '')
      if (value) list.push(value)
      out[listKey] = list
      continue
    }
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (!kv) throw new Error(`cannot read frontmatter line: ${line.trim()}`)
    const key = kv[1] ?? ''
    const rest = kv[2] ?? ''
    if (rest.trim() === '') {
      listKey = key
      out[key] = []
    } else if (rest.trim().startsWith('[')) {
      listKey = undefined
      out[key] = inlineList(rest)
    } else {
      listKey = undefined
      out[key] = unquote(rest)
    }
  }
  return out
}

function asString(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined
  return Array.isArray(v) ? v.join(', ') : v
}

function asList(v: string | string[] | undefined): string[] {
  if (v === undefined) return []
  if (Array.isArray(v)) return v
  return v.split(',').map(s => s.trim()).filter(Boolean)
}

export function parseSnippet(path: string, text: string, source: SnippetSource, mtimeMs = 0): ParseResult {
  const match = FRONTMATTER.exec(text)
  if (!match) return { ok: false, error: { path, reason: 'missing frontmatter (--- block with title)' } }
  let fm: Record<string, string | string[]>
  try {
    fm = parseFrontmatter(match[1] ?? '')
  } catch (err) {
    return { ok: false, error: { path, reason: err instanceof Error ? err.message : String(err) } }
  }
  const title = asString(fm.title)?.trim()
  if (!title) return { ok: false, error: { path, reason: 'frontmatter has no title' } }
  const slug = (asString(fm.slug)?.trim() || slugFromPath(path))
  if (!SLUG_OK.test(slug)) return { ok: false, error: { path, reason: `invalid slug "${slug}"` } }
  const modeRaw = (asString(fm.mode)?.trim() || 'fill').toLowerCase()
  if (modeRaw !== 'fill' && modeRaw !== 'submit') {
    return { ok: false, error: { path, reason: `mode must be fill or submit, got "${modeRaw}"` } }
  }
  const body = text.slice(match[0].length).replace(/\r\n/g, '\n').replace(/^\n/, '').replace(/\s+$/, '')
  return {
    ok: true,
    snippet: {
      slug,
      title,
      desc: asString(fm.desc)?.trim() ?? '',
      tags: asList(fm.tags),
      mode: modeRaw as SnippetMode,
      body,
      path,
      source,
      mtimeMs,
    },
  }
}

const PLAIN = /^[A-Za-z0-9_][\w .:/()+-]*$/

function scalar(v: string): string {
  return PLAIN.test(v) && v.trim() === v && !v.includes(': ') && !v.endsWith(':') ? v : JSON.stringify(v)
}

function tagScalar(v: string): string {
  return /^[\w./-]+$/.test(v) ? v : JSON.stringify(v)
}

export function serializeSnippet(s: Pick<Snippet, 'slug' | 'title' | 'desc' | 'tags' | 'mode' | 'body'>, fileSlug: string): string {
  const lines = ['---', `title: ${scalar(s.title)}`]
  if (s.slug !== fileSlug) lines.push(`slug: ${scalar(s.slug)}`)
  if (s.desc) lines.push(`desc: ${scalar(s.desc)}`)
  if (s.tags.length > 0) lines.push(`tags: [${s.tags.map(tagScalar).join(', ')}]`)
  if (s.mode !== 'fill') lines.push(`mode: ${s.mode}`)
  lines.push('---', '')
  return `${lines.join('\n')}${s.body}\n`
}

export type Merged = { snippets: Snippet[]; all: Snippet[]; duplicates: string[] }

export function mergeSources(globals: Snippet[], projects: Snippet[]): Merged {
  const bySlug = new Map<string, Snippet>()
  const duplicates: string[] = []
  const add = (s: Snippet) => {
    const prev = bySlug.get(s.slug)
    if (prev && prev.source === s.source) duplicates.push(`${s.slug}: ${prev.path} and ${s.path}`)
    if (!prev || prev.source === s.source || s.source === 'project') bySlug.set(s.slug, s)
  }
  for (const s of globals) add(s)
  for (const s of projects) add(s)
  const snippets = [...bySlug.values()].sort((a, b) => a.title.localeCompare(b.title))
  return { snippets, all: [...globals, ...projects], duplicates }
}

export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '')
}
