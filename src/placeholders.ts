export type Placeholder = { name: string; default: string }

export type Rendered = { text: string; cursor: number | undefined }

const TOKEN = /\{\{\s*([A-Za-z_][\w-]*)\s*(?::([^}]*))?\}\}/g

export function placeholdersOf(body: string): Placeholder[] {
  const seen = new Map<string, Placeholder>()
  for (const m of body.matchAll(TOKEN)) {
    const name = m[1] ?? ''
    if (name === 'cursor') continue
    const def = m[2] ?? ''
    const prev = seen.get(name)
    if (!prev) seen.set(name, { name, default: def })
    else if (!prev.default && def) prev.default = def
  }
  return [...seen.values()]
}

export function renderBody(body: string, values: Record<string, string>): Rendered {
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
    const given = Object.hasOwn(values, name) ? values[name] : undefined
    out += given !== undefined && given !== '' ? given : (m[2] ?? '')
  }
  out += body.slice(last)
  return { text: out, cursor }
}
