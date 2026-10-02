export type Placeholder = { name: string; default: string }

export type Rendered = { text: string; cursor: number | undefined }

export const BUILTINS = ['date', 'time'] as const

function isReserved(name: string): boolean {
  return name === 'cursor' || (BUILTINS as readonly string[]).includes(name)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function clockValues(now: Date): Record<string, string> {
  return {
    date: String(now.getFullYear()) + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()),
    time: pad(now.getHours()) + ':' + pad(now.getMinutes()),
  }
}

const TOKEN = /\{\{\s*([A-Za-z_][\w-]*)\s*(?::([^}]*))?\}\}/g

export function placeholdersOf(body: string): Placeholder[] {
  const seen = new Map<string, Placeholder>()
  for (const m of body.matchAll(TOKEN)) {
    const name = m[1] ?? ''
    if (isReserved(name)) continue
    const def = m[2] ?? ''
    const prev = seen.get(name)
    if (!prev) seen.set(name, { name, default: def })
    else if (!prev.default && def) prev.default = def
  }
  return [...seen.values()]
}

export function renderBody(body: string, values: Record<string, string>, builtins: Record<string, string> = {}): Rendered {
  let cursor: number | undefined
  let out = ''
  let last = 0
  for (const m of body.matchAll(TOKEN)) {
    const at = m.index ?? 0
    out += body.slice(last, at)
    last = at + m[0].length
    const name = m[1] ?? ''
    if (name === 'cursor') {
      if (cursor === undefined) cursor = out.length
      continue
    }
    if (name !== 'cursor' && isReserved(name) && Object.hasOwn(builtins, name)) {
      out += builtins[name] ?? ''
      continue
    }
    const given = Object.hasOwn(values, name) ? values[name] : undefined
    out += given !== undefined && given !== '' ? given : (m[2] ?? '')
  }
  out += body.slice(last)
  return { text: out, cursor }
}
