import type { EngineInterface, Register, RenderInput } from 'claude-code'
import type { Draft, Filter, FormOp, Library, LoadError, Snippet, SnippetMode, SnippetSource, Usage, View } from '../types'
import { insertAt, redirectEdit } from '../src/caret'
import { BULLET, LOOK, fit, layoutFor, metaLine, modeLabel, otherMode, plainLine, previewOf, rowColumns, shortDesc, sourceLetter } from '../src/look'
import { isUnder, mergeSources, parseSnippet, serializeSnippet, shortSlug, slugFromPath, slugify, titleFromDraft } from '../src/model'
import { placeholdersOf, renderBody } from '../src/placeholders'
import { rank } from '../src/search'

const libraryRef = { plugin: 'cyberine-snippets', key: 'library' } as const
const usageRef = { plugin: 'cyberine-snippets', key: 'usage' } as const
const queryRef = { plugin: 'cyberine-snippets', key: 'query' } as const
const filterRef = { plugin: 'cyberine-snippets', key: 'filter' } as const
const pageRef = { plugin: 'cyberine-snippets', key: 'page' } as const
const focusedRef = { plugin: 'cyberine-snippets', key: 'focused' } as const
const viewRef = { plugin: 'cyberine-snippets', key: 'view' } as const
const valuesRef = { plugin: 'cyberine-snippets', key: 'values' } as const
const draftRef = { plugin: 'cyberine-snippets', key: 'draft' } as const
const formErrorRef = { plugin: 'cyberine-snippets', key: 'formError' } as const
const pendingCursorRef = { plugin: 'cyberine-snippets', key: 'pendingCursor' } as const
const bodyEditRef = { plugin: 'cyberine-snippets', key: 'bodyEdit' } as const
const heldRef = { plugin: 'cyberine-snippets', key: 'held' } as const

const PANE = 'snippets'
const PANE_ROWS = 20
const INLINE_BUDGET = 11
const TRIGGER = ';;'
const SLUG_OK = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const MAX_FILES = 2000
const MAX_DEPTH = 6
const USAGE_KEY = 'usage'
const ALL_FILTER: Filter = { source: 'all', tag: '' }

function nextSource(cur: Filter['source'], hasProject: boolean): Filter['source'] {
  const order: Array<Filter['source']> = hasProject ? ['all', 'global', 'project'] : ['all', 'global']
  return order[(order.indexOf(cur) + 1) % order.length] ?? 'all'
}

function nextTag(cur: string, tags: readonly string[]): string {
  const order = ['', ...tags]
  return order[(order.indexOf(cur) + 1) % order.length] ?? ''
}

const HELP = [
  '/sn [query]   open the picker, optionally pre-filtered',
  '/sn new       create a snippet',
  '/sn cancel    stop editing a snippet body in the prompt',
  '/sn reload    re-read the snippet folders',
  '/sn list      print slug - title per snippet',
  '/sn doctor    print folders, skipped files and duplicate slugs',
].join('\n')

let isWriting = false

type PaneEvent = RenderInput<'Pane', 'terminal' | 'desktop' | 'vscode'>
type Saved = { slug: string; title: string; path: string; body: string }
type SaveResult = { ok: true; saved: Saved } | { ok: false; error: string }
type ApplyOutcome =
  | { kind: 'filled'; text: string; caret: number; pendingCaret: number | null }
  | { kind: 'submitted' }
  | { kind: 'refused'; reason: string }

async function turnPage($: EngineInterface, delta: number, pages: number): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await $.state.get(pageRef)
    const next = Math.max(0, Math.min(pages - 1, (cur.value ?? 0) + delta))
    const r = await $.state.set(pageRef, next, { ifVersion: cur.version })
    if (r.isSet) return
  }
}

async function patchFilterState($: EngineInterface, patch: Partial<Filter>): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await $.state.get(filterRef)
    const r = await $.state.set(filterRef, { ...(cur.value ?? ALL_FILTER), ...patch }, { ifVersion: cur.version })
    if (r.isSet) return
  }
}

async function setValue($: EngineInterface, name: string, value: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await $.state.get(valuesRef)
    const r = await $.state.set(valuesRef, { ...(cur.value ?? {}), [name]: value }, { ifVersion: cur.version })
    if (r.isSet) return
  }
}

async function patchDraft($: EngineInterface, fallback: Draft, patch: (d: Draft) => Draft): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await $.state.get(draftRef)
    const r = await $.state.set(draftRef, patch(cur.value ?? fallback), { ifVersion: cur.version })
    if (r.isSet) return
  }
}

async function getLibrary($: EngineInterface): Promise<Library | undefined> {
  return (await $.state.get(libraryRef)).value
}

async function byPath($: EngineInterface, path: string): Promise<Snippet | undefined> {
  return (await getLibrary($))?.all.find(s => s.path === path)
}

async function go($: EngineInterface, view: View): Promise<void> {
  await $.state.set(formErrorRef, '')
  await $.state.set(viewRef, view)
  if (view.screen === 'fill' || view.screen === 'form') await claimKeys($, view.screen === 'form' ? 'f:title' : null)
}

async function claimKeys($: EngineInterface, key: string | null): Promise<void> {
  const r = await $.ui.open({ id: PANE, title: 'Snippets', focus: true, closeOnEscape: true, holdToasts: true, rows: PANE_ROWS })
  $.ui.log(`focus: reclaim for ${key ?? 'fill form'} isPlaced=${String(r.isPlaced)}`, { to: 'debug' })
  if (key) await $.ui.focus({ requestId: PANE, key }).catch(() => undefined)
}

async function walk($: EngineInterface, dir: string, depth: number, out: Array<{ path: string; mtimeMs: number }>): Promise<void> {
  if (depth > MAX_DEPTH || out.length >= MAX_FILES) return
  const entries = await $.fs.list(dir).catch(() => [])
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const path = `${dir}/${entry.name}`
    if (entry.kind === 'dir') await walk($, path, depth + 1, out)
    else if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.md')) out.push({ path, mtimeMs: entry.mtimeMs })
    if (out.length >= MAX_FILES) return
  }
}

async function readSource($: EngineInterface, dir: string, source: SnippetSource, errors: LoadError[]): Promise<Snippet[]> {
  if (!(await $.fs.exists(dir).catch(() => false))) return []
  const files: Array<{ path: string; mtimeMs: number }> = []
  await walk($, dir, 0, files)
  files.sort((a, b) => a.path.localeCompare(b.path))
  const snippets: Snippet[] = []
  for (const file of files) {
    const text = await $.fs.read(file.path).catch((err: unknown) => {
      errors.push({ path: file.path, reason: err instanceof Error ? err.message : String(err) })
      return undefined
    })
    if (text === undefined) continue
    const parsed = parseSnippet(file.path, text, source, file.mtimeMs)
    if (parsed.ok) snippets.push(parsed.snippet)
    else errors.push(parsed.error)
  }
  return snippets
}

async function snippetRoots($: EngineInterface): Promise<Library['roots']> {
  const home = (await $.env.get('HOME')) ?? ''
  const override = await $.env.get('CYBERINE_SNIPPETS_DIR')
  const global = override && override.trim() ? override.trim().replace(/\/$/, '') : `${home}/.claude/snippets`
  const repo = await $.session.repo().catch(() => null)
  const root = repo?.root ?? (await $.session.root().catch(() => ''))
  const project = root ? `${root.replace(/\/$/, '')}/.claude/snippets` : null
  return { global, project: project === global ? null : project }
}

async function readUsage($: EngineInterface): Promise<Usage> {
  const raw = await $.store.get(USAGE_KEY).catch(() => undefined)
  const usage: Usage = {}
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'number') usage[k] = v
  }
  return usage
}

async function reload($: EngineInterface): Promise<Library> {
  const roots = await snippetRoots($)
  const errors: LoadError[] = []
  const globals = await readSource($, roots.global, 'global', errors)
  const projects = roots.project ? await readSource($, roots.project, 'project', errors) : []
  const { snippets, all, duplicates } = mergeSources(globals, projects)
  const library: Library = { snippets, all, errors, duplicates, roots, loadedAt: Date.now() }
  await $.state.set(libraryRef, library)
  await $.state.set(usageRef, await readUsage($))
  return library
}

async function openPicker($: EngineInterface, view: View, query: string): Promise<{ text?: string }> {
  if (!(await getLibrary($))) await reload($)
  await $.state.set(queryRef, query)
  await $.state.set(filterRef, ALL_FILTER)
  await $.state.set(pageRef, 0)
  await $.state.set(focusedRef, null)
  await $.state.set(valuesRef, {})
  await go($, view)
  const r = await $.ui.open({ id: PANE, title: 'Snippets', focus: true, closeOnEscape: true, holdToasts: true, rows: PANE_ROWS })
  return { text: r.isPlaced ? undefined : 'snippets: the pane could not be placed; widen the terminal or close other dialogs' }
}

async function closePicker($: EngineInterface): Promise<void> {
  await $.ui.close({ id: PANE })
}

async function restoreHeld($: EngineInterface, why: string): Promise<void> {
  const { value: held } = await $.state.get(heldRef)
  $.ui.log(`trigger: restore (${why}), held=${held ? 'yes' : 'no'}`, { to: 'debug' })
  if (!held) return
  await $.state.set(heldRef, null)
  const filled = await $.prompt.fill({ text: held.text, mode: 'replace' })
  if (filled.isFilled && filled.cursor !== held.cursor) await $.state.set(pendingCursorRef, { text: filled.text, cursor: held.cursor, at: filled.cursor })
}

async function focusFromTrigger($: EngineInterface): Promise<void> {
  const r = await $.ui.open({ id: PANE, title: 'Snippets', focus: true, closeOnEscape: true, holdToasts: true, rows: PANE_ROWS })
  $.ui.log(`trigger: refocus open isPlaced=${String(r.isPlaced)}${r.isPlaced ? '' : ` reason=${r.reason}`}`, { to: 'debug' })
  if (!r.isPlaced) {
    await $.ui.close({ id: PANE })
    await restoreHeld($, 'not placed')
    $.ui.log(`trigger: not placed: ${r.reason}`, { to: 'debug' })
    $.ui.status('Snippets picker needs a wider terminal (about 110+ columns); your draft is back. /sn opens it at any width.')
  }
}

async function applySnippet($: EngineInterface, s: Snippet, values: Record<string, string>, mode: SnippetMode): Promise<ApplyOutcome> {
  const rendered = renderBody(s.body, values)
  const { value: holding } = await $.state.get(heldRef)
  if (mode === 'submit' && !holding) {
    const sent = await $.prompt.submit({ text: rendered.text })
    if (sent.drop !== undefined) return { kind: 'refused', reason: sent.drop }
    return { kind: 'submitted' }
  }
  const { value: held } = await $.state.get(heldRef)
  const box = held ?? (await $.prompt.read())
  const hasDraft = box.text.length > 0
  const planned = insertAt(hasDraft ? box : { text: '', cursor: 0 }, rendered.text, rendered.cursor)
  const filled = held
    ? await $.prompt.fill({ text: planned.text, mode: 'replace' })
    : await $.prompt.fill({ text: rendered.text, mode: hasDraft ? 'insert' : 'replace' })
  if (!filled.isFilled) return { kind: 'refused', reason: filled.refusal ?? 'the prompt box did not take the text' }
  if (held) await $.state.set(heldRef, null)
  const pendingCaret = planned.caret !== filled.cursor && filled.text === planned.text ? planned.caret : null
  return { kind: 'filled', text: filled.text, caret: filled.cursor, pendingCaret }
}

async function applyNow($: EngineInterface, s: Snippet, values: Record<string, string>, mode: SnippetMode): Promise<void> {
  let outcome = await applySnippet($, s, values, mode)
  if (outcome.kind === 'refused' && outcome.reason === 'dialog') {
    const { value: held } = await $.state.get(heldRef)
    await $.state.set(heldRef, null)
    await closePicker($)
    if (held) await $.state.set(heldRef, held)
    outcome = await applySnippet($, s, values, mode)
  }
  if (outcome.kind === 'refused') {
    $.ui.toast(`snippets: not applied (${outcome.reason})`)
    return
  }
  await closePicker($)
  if (outcome.kind === 'filled' && outcome.pendingCaret !== null) {
    await $.state.set(pendingCursorRef, { text: outcome.text, cursor: outcome.pendingCaret, at: outcome.caret })
  }
  const usage = await readUsage($)
  usage[s.slug] = (usage[s.slug] ?? 0) + 1
  await $.store.set(USAGE_KEY, usage)
  await $.state.set(usageRef, usage)
}

async function choose($: EngineInterface, path: string, mode?: SnippetMode): Promise<void> {
  const s = await byPath($, path)
  if (!s) return
  const names = placeholdersOf(s.body)
  if (names.length > 0) {
    const values: Record<string, string> = Object.create(null) as Record<string, string>
    for (const p of names) values[p.name] = p.default
    await $.state.set(valuesRef, { ...values })
    await go($, { screen: 'fill', path, mode: mode ?? s.mode })
    const first = names[0]
    if (first) await $.ui.focus({ requestId: PANE, key: `v:${first.name}` }).catch(() => undefined)
    return
  }
  await applyNow($, s, {}, mode ?? s.mode)
}

function draftFrom(s: Snippet | undefined, op: FormOp): Draft {
  if (!s) return { title: '', slug: '', desc: '', tags: '', mode: 'fill', source: 'global', body: '' }
  return {
    title: op === 'duplicate' ? `${s.title} (copy)` : s.title,
    slug: op === 'duplicate' ? `${s.slug}-copy` : s.slug,
    desc: s.desc,
    tags: s.tags.join(', '),
    mode: s.mode,
    source: s.source,
    body: s.body,
  }
}

async function startForm($: EngineInterface, op: FormOp, path: string | null, preset?: { slug?: string; body?: string; fromDraft?: boolean }): Promise<void> {
  const s = path ? await byPath($, path) : undefined
  const draft = draftFrom(op === 'new' ? undefined : s, op)
  if (preset?.slug) {
    draft.slug = preset.slug
    draft.title = preset.slug.replace(/[-_.]+/g, ' ')
  }
  if (preset?.body !== undefined) draft.body = preset.body
  if (preset?.fromDraft) {
    draft.title = titleFromDraft(draft.body) || 'Untitled snippet'
    draft.slug = shortSlug(draft.title) || 'snippet'
  }
  await $.state.set(draftRef, draft)
  await go($, { screen: 'form', op, path: op === 'new' ? null : path, fromDraft: preset?.fromDraft })
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function insideSnippetRoots($: EngineInterface, ...paths: string[]): Promise<boolean> {
  const lib = await getLibrary($)
  return paths.every(p => isUnder(lib?.roots.global, p) || isUnder(lib?.roots.project, p))
}

async function moveNoClobber($: EngineInterface, from: string, to: string): Promise<boolean> {
  if (!(await insideSnippetRoots($, from, to))) return false
  await $.process.run(['mkdir', '-p', to.slice(0, to.lastIndexOf('/'))])
  const r = await $.process.run(['mv', '-n', from, to])
  return r.exitCode === 0 && !(await $.fs.exists(from)) && (await $.fs.exists(to))
}

async function createExclusive($: EngineInterface, path: string, text: string): Promise<boolean> {
  const tmp = `${path.slice(0, path.lastIndexOf('/'))}/.snippet-${stamp()}.tmp`
  if (!(await insideSnippetRoots($, path, tmp))) return false
  await $.fs.write(tmp, text)
  const isMoved = await moveNoClobber($, tmp, path)
  if (!isMoved) await $.process.run(['rm', '-f', '--', tmp])
  return isMoved
}

async function unchangedOnDisk($: EngineInterface, s: Snippet): Promise<boolean> {
  const stat = await $.fs.stat(s.path).catch(() => undefined)
  return stat !== undefined && stat.mtimeMs === s.mtimeMs
}

async function saveDraft($: EngineInterface, op: FormOp, originalPath: string | null, draft: Draft): Promise<SaveResult> {
  if (isWriting) return { ok: false, error: 'Another save is still running' }
  isWriting = true
  try {
    const title = draft.title.trim()
    const slug = draft.slug.trim() || shortSlug(title)
    if (!title) return { ok: false, error: 'Title is required' }
    if (!SLUG_OK.test(slug)) return { ok: false, error: 'Slug: letters, digits, . _ - only, starting with a letter or digit' }
    const tags = draft.tags.split(',').map(t => t.trim()).filter(Boolean)
    const original = originalPath ? await byPath($, originalPath) : undefined
    if (op !== 'new' && !original) return { ok: false, error: 'The original file is gone; run /sn reload' }
    const isEdit = op === 'edit' && original !== undefined
    const source: SnippetSource = isEdit ? original.source : draft.source
    const lib = await getLibrary($)
    const root = source === 'project' ? lib?.roots.project : lib?.roots.global
    if (!root) return { ok: false, error: 'No project folder in this session; choose global' }
    const clash = lib?.all.find(s => s.source === source && s.slug === slug && !(isEdit && s.path === original.path))
    if (clash) {
      const taken = new Set(lib?.all.filter(s => s.source === source).map(s => s.slug))
      let n = 2
      while (taken.has(`${slug}-${n}`)) n++
      return { ok: false, error: `A ${source} snippet with slug "${slug}" already exists (${clash.path}); try "${slug}-${n}"` }
    }
    const keepPath = isEdit && (slug === original.slug || slugFromPath(original.path) !== original.slug)
    const path = keepPath && original ? original.path : `${root}/${slug}.md`
    const body = draft.body.replace(/\r\n/g, '\n').replace(/\s+$/, '')
    const text = serializeSnippet({ slug, title, desc: draft.desc.trim(), tags, mode: draft.mode, body }, slugFromPath(path))
    const check = parseSnippet(path, text, source)
    if (!check.ok) return { ok: false, error: check.error.reason }
    if (isEdit && !(await unchangedOnDisk($, original))) return { ok: false, error: `${original.path} changed on disk since it was loaded; run /sn reload` }
    if (!(await insideSnippetRoots($, path))) return { ok: false, error: `${path} is outside the snippet folders` }
    if (keepPath) {
      await $.fs.write(path, text)
    } else if (!(await createExclusive($, path, text))) {
      return { ok: false, error: `${path} already exists` }
    }
    if (isEdit && path !== original.path) {
      const isTrashed = await moveNoClobber($, original.path, `${root}/.trash/${original.slug}.${stamp()}.md`)
      if (!isTrashed) $.ui.toast(`snippets: saved ${path}, but could not move away ${original.path}`)
    }
    await reload($)
    return { ok: true, saved: { slug, title, path, body } }
  } finally {
    isWriting = false
  }
}

async function deleteSnippet($: EngineInterface, path: string): Promise<string> {
  const s = await byPath($, path)
  if (!s) return 'The file is gone; run /sn reload'
  if (!(await unchangedOnDisk($, s))) return `${s.path} changed on disk since it was loaded; run /sn reload`
  const lib = await getLibrary($)
  const root = s.source === 'project' ? lib?.roots.project : lib?.roots.global
  const base = root && s.path.startsWith(`${root}/`) ? root : s.path.slice(0, s.path.lastIndexOf('/'))
  const isMoved = await moveNoClobber($, s.path, `${base}/.trash/${s.slug}.${stamp()}.md`)
  await reload($)
  return isMoved ? '' : `Could not move ${s.path} to the trash folder`
}

async function editBodyInPrompt($: EngineInterface, target: Saved): Promise<void> {
  await closePicker($)
  const filled = await $.prompt.fill({ text: target.body, mode: 'replace' })
  if (!filled.isFilled) {
    $.ui.toast(`snippets: the prompt box did not take the body (${filled.refusal ?? 'unknown'})`)
    return
  }
  await $.state.set(bodyEditRef, { slug: target.slug, title: target.title, path: target.path })
  $.ui.status(`Editing snippet "${target.title}": Enter saves it, /sn cancel stops`)
}

async function endBodyEdit($: EngineInterface): Promise<void> {
  await $.state.set(bodyEditRef, null)
  $.ui.status(undefined)
}

async function renderPane($: EngineInterface, e: PaneEvent) {
  const view = (await $.state.get(viewRef)).value ?? { screen: 'list' }
  switch (view.screen) {
    case 'detail':
      return renderDetail($, e, view.path)
    case 'fill':
      return renderFill($, e, view.path, view.mode)
    case 'form':
      return renderForm($, e, view.op, view.path, view.fromDraft === true)
    case 'delete':
      return renderDelete($, e, view.path)
    default:
      return renderList($, e)
  }
}

function gone($: EngineInterface, e: PaneEvent, what: string) {
  const { Box, Text, Button } = $.ui.resolve(e)
  return (
    <Box flexDirection="column">
      <Text key="gone" {...LOOK.error}>{`${what} is gone (reloaded, renamed or deleted)`}</Text>
      <Button plain key="back" autoFocus onPress={() => { void go($, { screen: 'list' }) }}>[ Back ]</Button>
    </Box>
  )
}

async function renderList($: EngineInterface, e: PaneEvent) {
  const { Box, Text, Button, Input } = $.ui.resolve(e)
  const library = (await $.state.get(libraryRef)).value
  const usage = (await $.state.get(usageRef)).value ?? {}
  const query = (await $.state.get(queryRef)).value ?? ''
  const filter = (await $.state.get(filterRef)).value ?? ALL_FILTER
  const page = (await $.state.get(pageRef)).value ?? 0
  const focused = (await $.state.get(focusedRef)).value ?? null
  const { value: held } = await $.state.get(heldRef)
  const all = library?.snippets ?? []
  const placement = e.props.placement
  const cols = Math.max(20, e.props.bodyColumns - 1)
  const matches = (q: string, f: Filter) => rank(all.filter(s => (f.source === 'all' || s.source === f.source) && (!f.tag || s.tags.includes(f.tag))), q, usage)
  const hits = matches(query, filter)
  const layout = layoutFor(placement, placement === 'dock' ? e.props.scroll.bodyRows : INLINE_BUDGET, Boolean(held && held.text.trim()))
  const size = layout.rows
  const pages = Math.max(1, Math.ceil(hits.length / size))
  const current = Math.min(page, pages - 1)
  const shown = hits.slice(current * size, current * size + size)
  const focusedHit = hits.find(s => s.path === focused) ?? shown[0]
  const col = rowColumns(cols, shown.map(s => s.slug))
  const previewText = !focusedHit || layout.previewLines === 0
    ? []
    : layout.previewLines === 1
      ? [plainLine(shortDesc(focusedHit))].filter(l => l.trim() !== '')
      : previewOf(focusedHit, layout.previewLines).filter(l => l.trim() !== '')
  const tags = [...new Set(all.flatMap(s => s.tags))].sort()
  const errors = library?.errors.length ?? 0
  const hasProject = Boolean(library?.roots.project)

  const setQuery = (v: string) => {
    void $.state.set(queryRef, v)
    void $.state.set(pageRef, 0)
    void $.state.set(focusedRef, null)
  }
  const submitSearch = (v: string) => {
    void (async () => {
      const f = (await $.state.get(filterRef)).value ?? ALL_FILTER
      const top = matches(v, f)[0]
      if (top) await choose($, top.path)
    })()
  }
  const turn = (delta: number) => () => {
    void turnPage($, delta, pages)
    void $.state.set(focusedRef, null)
  }
  const patchFilter = (patch: Partial<Filter>) => {
    void patchFilterState($, patch)
    void $.state.set(pageRef, 0)
    void $.state.set(focusedRef, null)
  }
  const openNew = () => { void startForm($, 'new', null) }
  const hasDraft = Boolean(held && held.text.trim())
  const saveDraftButton = hasDraft ? (
    <Box key="save-draft-row" flexDirection="column">
      <Button plain key="save-draft" onPress={() => { void startForm($, 'new', null, { body: held?.text ?? '', fromDraft: true }) }}>[ Save this draft as a snippet ]</Button>
      <Text key="save-draft-preview" {...LOOK.meta} wrap="truncate-end">{`  "${(held?.text ?? '').replace(/\s+/g, ' ').trim()}"  (Up from search)`}</Text>
    </Box>
  ) : null

  if (all.length === 0) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text key="empty" {...LOOK.heading}>No snippets yet</Text>
        {saveDraftButton}
        <Text key="where" {...LOOK.meta} wrap="wrap">{`Add .md files under ${library?.roots.global ?? '~/.claude/snippets'}${hasProject ? ` or ${library?.roots.project}` : ''}, or create one here.`}</Text>
        {errors > 0 ? <Text key="errs" {...LOOK.error}>{`${errors} file(s) skipped, run /sn doctor`}</Text> : null}
        <Button plain key="new-empty" variant="primary" autoFocus onPress={openNew}>[ New snippet ]</Button>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingRight={1}>
      {saveDraftButton}
      <Input key="q" label="Search " autoFocus placeholder="type to filter" value={query} submitLabel="use top hit" onInput={setQuery} onSubmit={submitSearch} />
      <Box key="results" flexDirection="column" marginTop={layout.hasMargins ? 1 : 0} paddingLeft={1}>
        {shown.length === 0 ? (
          <Box key="none" flexDirection="column">
            <Text key="none-t" {...LOOK.meta}>No matches</Text>
            <Box key="none-acts" flexDirection="row" gap={2}>
              <Button plain key="clear-q" onPress={() => setQuery('')}>[ Clear search ]</Button>
              {filter.source !== 'all' || filter.tag ? <Button plain key="clear-f" onPress={() => patchFilter(ALL_FILTER)}>[ Clear filters ]</Button> : null}
            </Box>
          </Box>
        ) : null}
        {shown.map(s => (
          <Box key={`row-${s.path}`} flexDirection="row" columnGap={2}>
            <Box key={`t-${s.path}`} flexGrow={1}>
              <Button key={`r:${s.path}`} plain onPress={() => { void choose($, s.path) }}>{BULLET + fit(s.title, col.title)}</Button>
            </Box>
            {col.showMode ? <Text key={`mo:${s.path}`} {...LOOK.meta}>{s.mode.padEnd(6)}</Text> : null}
            <Text key={`sl:${s.path}`} {...LOOK.accent}>{fit(s.slug, col.slug).padStart(col.slug)}</Text>
            <Text key={`b:${s.path}`} {...LOOK.badge}>{sourceLetter(s)}</Text>
          </Box>
        ))}
      </Box>
      {pages > 1 ? (
        <Box key="pager" flexDirection="row" gap={2}>
          {current > 0 ? <Button plain key="prev" onPress={turn(-1)}>[ Prev ]</Button> : null}
          <Text key="pg" {...LOOK.meta}>{`page ${current + 1}/${pages}`}</Text>
          {current < pages - 1 ? <Button plain key="next" onPress={turn(1)}>[ Next ]</Button> : null}
        </Box>
      ) : null}
      {previewText.length > 0 ? (
        <Box key="preview" flexDirection="column">
          <Text key="rule" {...LOOK.rule}>{'\u2500'.repeat(Math.max(8, cols))}</Text>
          {focusedHit?.desc && layout.showDesc ? <Text key="p-desc" {...LOOK.meta} wrap="truncate-end">{focusedHit.desc}</Text> : null}
          {previewText.map((line, i) => <Text key={`p-l${i}`} wrap="truncate-end">{line}</Text>)}
        </Box>
      ) : null}
      <Box key="tools" flexDirection="row" flexWrap="wrap" columnGap={2} marginTop={layout.hasMargins ? 1 : 0}>
        {focusedHit ? <Button plain key="details" onPress={() => { void go($, { screen: 'detail', path: focusedHit.path }) }}>[ Details ]</Button> : null}
        <Button plain key="new" onPress={openNew}>[ New ]</Button>
        <Button plain key="src" onPress={() => patchFilter({ source: nextSource(filter.source, hasProject) })}>{`[ Source: ${filter.source} ]`}</Button>
        {tags.length > 0 ? <Button plain key="tag" onPress={() => patchFilter({ tag: nextTag(filter.tag, tags) })}>{`[ Tag: ${filter.tag || 'all'} ]`}</Button> : null}
        <Text key="hint" {...LOOK.hint} wrap="truncate-end">{`${hits.length}/${all.length}${errors > 0 ? ` (${errors} skipped)` : ''}  Enter use  Tab move  Esc close`}</Text>
      </Box>
    </Box>
  )
}

async function renderDetail($: EngineInterface, e: PaneEvent, path: string) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const s = await byPath($, path)
  if (!s) return gone($, e, 'This snippet')
  const names = placeholdersOf(s.body)
  const back = () => { void go($, { screen: 'list' }) }
  return (
    <Box flexDirection="column">
      <Text key="title" {...LOOK.title} wrap="wrap">{s.title}</Text>
      {s.desc ? <Text key="desc" {...LOOK.meta} wrap="wrap">{s.desc}</Text> : null}
      <Text key="meta" {...LOOK.meta} wrap="truncate-end">{`${metaLine(s)}${s.tags.length ? ` | ${s.tags.join(', ')}` : ''}`}</Text>
      <Text key="path" {...LOOK.meta} wrap="truncate-start">{s.path}</Text>
      {names.length > 0 ? <Text key="vars" {...LOOK.meta} wrap="wrap">{`Placeholders: ${names.map(p => (p.default ? `${p.name}=${p.default}` : p.name)).join(', ')}`}</Text> : null}
      <Box key="body" flexDirection="column" marginY={1}>
        {s.body.split('\n').map((line, i) => <Text key={`b${i}`} wrap="wrap">{line || ' '}</Text>)}
      </Box>
      <Box key="use" flexDirection="row" flexWrap="wrap" columnGap={2}>
        <Button plain key="apply" variant="primary" autoFocus onPress={() => { void choose($, s.path) }}>{`[ ${modeLabel(s.mode)} ]`}</Button>
        <Button plain key="apply-alt" hotkey="a" onPress={() => { void choose($, s.path, otherMode(s.mode)) }}>{`${modeLabel(otherMode(s.mode))} instead`}</Button>
      </Box>
      <Box key="manage" flexDirection="row" flexWrap="wrap" columnGap={2}>
        <Button plain key="edit-body" hotkey="e" onPress={() => { void editBodyInPrompt($, s) }}>Edit body in prompt</Button>
        <Button plain key="edit-info" hotkey="i" onPress={() => { void startForm($, 'edit', s.path) }}>Edit info</Button>
        <Button plain key="dup" hotkey="u" onPress={() => { void startForm($, 'duplicate', s.path) }}>Duplicate</Button>
        <Button plain key="del" hotkey="d" onPress={() => { void go($, { screen: 'delete', path: s.path }) }}>Delete</Button>
        <Button plain key="back" hotkey="b" role="dismiss" onPress={back}>Back</Button>
      </Box>
    </Box>
  )
}

async function renderFill($: EngineInterface, e: PaneEvent, path: string, mode: SnippetMode) {
  const { Box, Text, Button, Input } = $.ui.resolve(e)
  const s = await byPath($, path)
  const values = (await $.state.get(valuesRef)).value ?? {}
  if (!s) return gone($, e, 'This snippet')
  const names = placeholdersOf(s.body)
  const apply = () => {
    void (async () => {
      const fresh = (await $.state.get(valuesRef)).value ?? {}
      await applyNow($, s, fresh, mode)
    })()
  }
  const advance = (i: number) => () => {
    const next = names[i + 1]
    if (next) void $.ui.focus({ requestId: PANE, key: `v:${next.name}` })
    else apply()
  }
  return (
    <Box flexDirection="column">
      <Text key="h" {...LOOK.heading} wrap="truncate-end">{`Fill in: ${s.title}`}</Text>
      {names.map((p, i) => (
        <Input
          key={`v:${p.name}`}
          label={`${p.name} `}
          autoFocus={i === 0 ? true : undefined}
          placeholder={p.default || p.name}
          value={Object.hasOwn(values, p.name) ? (values[p.name] ?? '') : ''}
          submitLabel={i === names.length - 1 ? modeLabel(mode).toLowerCase() : 'next'}
          onInput={v => { void setValue($, p.name, v) }}
          onSubmit={advance(i)}
        />
      ))}
      <Box key="acts" flexDirection="row" gap={2} marginTop={1}>
        <Button plain key="apply" variant="primary" onPress={apply}>{`[ ${modeLabel(mode)} ]`}</Button>
        <Button plain key="back" role="dismiss" onPress={() => { void go($, { screen: 'detail', path }) }}>[ Back ]</Button>
      </Box>
    </Box>
  )
}

const FORM_TITLE: Record<FormOp, string> = { new: 'New snippet', edit: 'Edit info', duplicate: 'Duplicate snippet' }
const FIELDS = ['f:title', 'f:slug', 'f:desc', 'f:tags', 'f:body'] as const

async function renderForm($: EngineInterface, e: PaneEvent, op: FormOp, path: string | null, fromDraft: boolean) {
  const { Box, Text, Button, Input } = $.ui.resolve(e)
  const draft = (await $.state.get(draftRef)).value
  const error = (await $.state.get(formErrorRef)).value ?? ''
  const library = (await $.state.get(libraryRef)).value
  if (!draft) return gone($, e, 'The draft')
  const set = (patch: Partial<Draft>) => { void patchDraft($, draft, d => ({ ...d, ...patch })) }
  const setTitle = (v: string) => {
    void patchDraft($, draft, base => {
      const isDerived = op !== 'edit' && (base.slug === '' || base.slug === shortSlug(base.title))
      return { ...base, title: v, slug: isDerived ? shortSlug(v) : base.slug }
    })
  }
  const hasBodyField = op === 'new' && !fromDraft && !draft.body.includes('\n')
  const order = FIELDS.filter(k => k !== 'f:body' || hasBodyField)
  const nextFrom = (key: (typeof FIELDS)[number]) => () => {
    const next = order[order.indexOf(key) + 1]
    void $.ui.focus({ requestId: PANE, key: next ?? 'save' })
  }
  const cancel = () => { void go($, path ? { screen: 'detail', path } : { screen: 'list' }) }
  const save = (thenEditBody: boolean) => () => {
    void (async () => {
      const current = (await $.state.get(draftRef)).value ?? draft
      const r = await saveDraft($, op, path, current)
      if (!r.ok) {
        await $.state.set(formErrorRef, r.error)
        return
      }
      if (fromDraft) {
        await closePicker($)
        await restoreHeld($, 'saved draft as snippet')
        $.ui.toast(`snippets: saved as ${r.saved.slug} (${current.source}); your draft is back in the prompt`)
        return
      }
      if (thenEditBody) {
        await editBodyInPrompt($, r.saved)
        return
      }
      await go($, { screen: 'detail', path: r.saved.path })
    })()
  }
  const lines = draft.body ? draft.body.split('\n').length : 0
  return (
    <Box flexDirection="column">
      <Text key="h" {...LOOK.heading}>{fromDraft ? 'Save draft as snippet' : FORM_TITLE[op]}</Text>
      <Input key="f:title" label="Title " autoFocus value={draft.title} placeholder="e.g. Summarize this PR" onInput={setTitle} onSubmit={nextFrom('f:title')} />
      <Input key="f:slug" label="Slug  " value={draft.slug} placeholder={op === 'edit' ? 'required' : 'derived from the title'} onInput={v => set({ slug: v })} onSubmit={nextFrom('f:slug')} />
      <Input key="f:desc" label="Desc  " value={draft.desc} placeholder="one line, optional" onInput={v => set({ desc: v })} onSubmit={nextFrom('f:desc')} />
      <Input key="f:tags" label="Tags  " value={draft.tags} placeholder="comma separated" onInput={v => set({ tags: v })} onSubmit={nextFrom('f:tags')} />
      {hasBodyField ? (
        <Input key="f:body" label="Body  " value={draft.body} placeholder="one line here, or Save and edit body in prompt" onInput={v => set({ body: v })} onSubmit={nextFrom('f:body')} />
      ) : (
        <Box key="f:body-box" flexDirection="column">
          <Text key="f:body-info" {...LOOK.meta}>{`Body (${lines} ${lines === 1 ? 'line' : 'lines'})${fromDraft ? '' : ', change it with "Edit body in prompt"'}:`}</Text>
          {draft.body.split('\n').filter(l => l.trim() !== '').slice(0, 2).map((line, i) => <Text key={`f:bl${i}`} {...LOOK.meta} wrap="truncate-end">{`  ${line || ' '}`}</Text>)}
        </Box>
      )}
      {placeholdersOf(draft.body).length > 0 ? <Text key="f:vars" {...LOOK.meta} wrap="truncate-end">{`Contains placeholders: ${placeholdersOf(draft.body).map(p => p.name).join(', ')}`}</Text> : null}
      <Box key="selects" flexDirection="row" columnGap={2} flexWrap="wrap">
        <Button plain key="f:mode" onPress={() => set({ mode: draft.mode === 'fill' ? 'submit' : 'fill' })}>{`[ Mode: ${draft.mode} ]`}</Button>
        {op !== 'edit' && library?.roots.project ? (
          <Button plain key="f:source" onPress={() => set({ source: draft.source === 'project' ? 'global' : 'project' })}>{`[ Save to: ${draft.source} ]`}</Button>
        ) : null}
      </Box>
      {error ? <Text key="err" {...LOOK.error} wrap="wrap">{error}</Text> : null}
      <Box key="acts" flexDirection="row" columnGap={2} flexWrap="wrap" marginTop={1}>
        <Button plain key="save" variant="primary" onPress={save(false)}>[ Save ]</Button>
        {fromDraft ? null : <Button plain key="save-edit" onPress={save(true)}>[ Save and edit body in prompt ]</Button>}
        <Button plain key="cancel" role="dismiss" onPress={cancel}>[ Cancel ]</Button>
      </Box>
    </Box>
  )
}

async function renderDelete($: EngineInterface, e: PaneEvent, path: string) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const s = await byPath($, path)
  const error = (await $.state.get(formErrorRef)).value ?? ''
  if (!s) return gone($, e, 'This snippet')
  const remove = () => {
    void (async () => {
      const err = await deleteSnippet($, path)
      if (err) {
        await $.state.set(formErrorRef, err)
        return
      }
      $.ui.toast(`snippets: deleted ${s.slug} (moved to .trash)`)
      await go($, { screen: 'list' })
    })()
  }
  return (
    <Box flexDirection="column">
      <Text key="h" {...LOOK.heading} wrap="wrap">{`Delete "${s.title}"?`}</Text>
      <Text key="path" {...LOOK.meta} wrap="truncate-start">{s.path}</Text>
      <Text key="note" {...LOOK.meta} wrap="wrap">{`The file moves to the .trash folder of its snippet root.${s.source === 'project' ? ' A global snippet with the same slug, if any, shows again.' : ''}`}</Text>
      {error ? <Text key="err" {...LOOK.error} wrap="wrap">{error}</Text> : null}
      <Box key="acts" flexDirection="row" gap={2} marginTop={1}>
        <Button plain key="cancel" autoFocus hotkey="c" role="dismiss" onPress={() => { void go($, { screen: 'detail', path }) }}>Cancel</Button>
        <Button plain key="confirm" hotkey="y" onPress={remove}>Delete file</Button>
      </Box>
    </Box>
  )
}

async function runCommand($: EngineInterface, args: string): Promise<{ text?: string }> {
  const [verb = '', ...rest] = args.split(/\s+/)
  switch (verb.toLowerCase()) {
    case 'reload': {
      const library = await reload($)
      const skipped = library.errors.length > 0 ? `, ${library.errors.length} skipped (see /sn doctor)` : ''
      return { text: `snippets: ${library.snippets.length} snippet(s) loaded${skipped}` }
    }
    case 'list': {
      const library = await getLibrary($)
      const rows = (library?.snippets ?? []).map(s => `${s.slug} - ${s.title}${s.source === 'project' ? ' [project]' : ''}`)
      return { text: rows.length > 0 ? rows.join('\n') : 'snippets: no snippets yet. /sn new creates one.' }
    }
    case 'doctor': {
      const library = await getLibrary($)
      const lines = [
        `global dir: ${library?.roots.global ?? '?'}`,
        `project dir: ${library?.roots.project ?? '(none)'}`,
        `snippets: ${library?.snippets.length ?? 0}`,
        ...(library?.errors ?? []).map(err => `skipped ${err.path}: ${err.reason}`),
        ...(library?.duplicates ?? []).map(d => `duplicate slug ${d}`),
      ]
      if ((library?.errors.length ?? 0) === 0 && (library?.duplicates.length ?? 0) === 0) lines.push('no problems found')
      return { text: lines.join('\n') }
    }
    case 'help':
      return { text: HELP }
    case 'cancel': {
      const { value: editing } = await $.state.get(bodyEditRef)
      await endBodyEdit($)
      return { text: editing ? `snippets: stopped editing "${editing.title}"; the prompt text is left as is` : 'snippets: nothing was being edited' }
    }
    case 'new': {
      const opened = await openPicker($, { screen: 'list' }, '')
      await startForm($, 'new', null, { slug: rest[0] })
      return opened
    }
    default:
      await $.state.set(heldRef, null)
      return openPicker($, { screen: 'list' }, args)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.state.set(pendingCursorRef, null)
    await $.state.set(bodyEditRef, null)
    await $.state.set(heldRef, null)
    await $.command.register({ name: 'snippets', description: 'Pick, fill and manage saved prompt snippets (short: /sn)', argumentHint: '[query | new | cancel | reload | list | doctor | help]' })
    await $.command.register({ name: 'sn', description: 'Snippets picker (same as /snippets)', argumentHint: '[query | new | cancel | reload | list | doctor | help]' })
    const library = await reload($)
    if (library.errors.length > 0) $.ui.toast(`snippets: ${library.errors.length} snippet file(s) skipped, run /sn doctor`)
    return next(e)
  })

  on('command.run', { command: 'sn' }, async ($, e) => runCommand($, e.args.trim()))
  on('command.run', { command: 'snippets' }, async ($, e) => runCommand($, e.args.trim()))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)
      return <Text>Snippets needs a keyboard surface; open it in the terminal or desktop app.</Text>
    }
    return renderPane($, e)
  })

  on('ui.close', async ($, e, next) => {
    const r = await next(e)
    if (e.id === PANE) await restoreHeld($, `close by ${e.origin.kind}`)
    return r
  })

  on('ui.focus', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    const key = e.element ?? ''
    if (key.startsWith('r:')) {
      const { value: view } = await $.state.get(viewRef)
      if (!view || view.screen === 'list') await $.state.set(focusedRef, key.slice(2))
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const { value: holding } = await $.state.get(heldRef)
    if (holding && e.origin.kind === 'composer' && !e.text.trimStart().startsWith('/')) {
      $.ui.log('trigger: blocked a composer submit while a draft is held', { to: 'debug' })
      return { drop: 'snippets: the picker is holding your draft; finish there, or press Esc in the picker to get the draft back. Nothing was sent.' }
    }
    const { value: editing } = await $.state.get(bodyEditRef)
    if (!editing || e.origin.kind !== 'composer' || e.text.trimStart().startsWith('/')) return next(e)
    const s = (await getLibrary($))?.all.find(x => x.path === editing.path)
    if (!s) {
      await endBodyEdit($)
      return { drop: `snippets: "${editing.title}" is gone (${editing.path}); your text was not sent. Run /sn reload, or press Enter again to send it.` }
    }
    const r = await saveDraft($, 'edit', s.path, { ...draftFrom(s, 'edit'), body: e.text })
    if (!r.ok) return { drop: `snippets: not saved: ${r.error}. Your text was not sent; /sn cancel stops editing.` }
    await endBodyEdit($)
    await $.prompt.fill({ text: '', mode: 'replace' })
    return { drop: `snippets: saved the body of "${r.saved.title}" (${r.saved.path}); nothing was sent to Claude.` }
  })

  on('prompt.edit', async ($, e, next) => {
    const isTrigger = e.inputText === TRIGGER.slice(-1) && e.start === e.end && e.start >= TRIGGER.length - 1 && e.text.slice(e.start - (TRIGGER.length - 1), e.start) === TRIGGER.slice(0, -1)
    if (isTrigger) {
      const { value: editing } = await $.state.get(bodyEditRef)
      if (!editing) {
        const cut = e.start - (TRIGGER.length - 1)
        await $.state.set(pendingCursorRef, null)
        await $.state.set(heldRef, { text: e.text.slice(0, cut) + e.text.slice(e.end), cursor: cut })
        const opened = await openPicker($, { screen: 'list' }, '')
        $.ui.log(`trigger: held ${cut}/${e.text.length}, first open ${opened.text ?? 'placed'}`, { to: 'debug' })
        $.clock.after(0, () => { void focusFromTrigger($) })
        return { text: '', cursor: 0 }
      }
    }
    const pending = await $.state.get(pendingCursorRef)
    if (pending.value) {
      const claimed = await $.state.set(pendingCursorRef, null, { ifVersion: pending.version })
      const redirected = claimed.isSet ? redirectEdit(pending.value, e) : undefined
      if (redirected) return { text: redirected.text, cursor: redirected.cursor }
    }
    const result = await next(e)
    if (result.text === '') {
      const { value: editing } = await $.state.get(bodyEditRef)
      if (editing) await endBodyEdit($)
    }
    return result
  })
}
