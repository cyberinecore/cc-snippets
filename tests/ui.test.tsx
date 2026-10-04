import { describe, expect, mock, test } from 'claude-code/testing'
import type { On, PromptEditInput, PromptEditResult } from 'claude-code'

const PLUGIN = 'cyberine-snippets'
const PANE = 'snippets'
const ROOT = '/snip'

const FIXTURES: Record<string, string> = {
  [`${ROOT}/review-diff.md`]: '---\ntitle: Review current diff\ndesc: Merge blockers only, file:line\ntags: [review, git]\n---\nReview the diff against {{base:main}} and report only merge blockers for {{scope}}.{{cursor}}\n',
  [`${ROOT}/multi-line.md`]: '---\ntitle: Plan before coding\ntags: [plan]\n---\nBefore writing code:\n1. Restate the goal.\n2. List the files.\n',
  [`${ROOT}/sub/write-tests.md`]: '---\ntitle: Write tests\ntags:\n  - test\nmode: submit\n---\nWrite failing tests first.\n',
  [`${ROOT}/broken.md`]: '---\ndesc: no title here\n---\nbody\n',
}

type World = { files: Map<string, { text: string; mtimeMs: number }>; fills: string[]; submits: string[]; box: { text: string; cursor: number }; opens: number; focuses: string[] }

function world(on: On, options: { isPlaced?: boolean; env?: Record<string, string>; project?: string } = {}): World {
  const w: World = { files: new Map(), fills: [], submits: [], box: { text: '', cursor: 0 }, opens: 0, focuses: [] }
  let tick = 1
  for (const [p, text] of Object.entries(FIXTURES)) w.files.set(p, { text, mtimeMs: tick++ })
  const isDir = (p: string) => [...w.files.keys()].some(f => f.startsWith(`${p}/`))
  mock.env(on, options.env ?? { HOME: '/home/test', CYBERINE_SNIPPETS_DIR: ROOT })
  mock.store(on)
  on('fs.exists', async ($, e) => ({ value: w.files.has(e.path) || isDir(e.path) }))
  on('fs.list', async ($, e) => {
    const names = new Map<string, 'file' | 'dir'>()
    for (const f of w.files.keys()) {
      if (!f.startsWith(`${e.path}/`)) continue
      const [head = '', ...rest] = f.slice(e.path.length + 1).split('/')
      names.set(head, rest.length > 0 ? 'dir' : 'file')
    }
    return { value: [...names].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: kind === 'file' ? (w.files.get(`${e.path}/${name}`)?.mtimeMs ?? 0) : 0, isLink: false })) }
  })
  on('fs.read', async ($, e) => {
    const f = w.files.get(e.path)
    return f ? { value: f.text } : { deny: `ENOENT ${e.path}` }
  })
  on('fs.stat', async ($, e) => {
    const f = w.files.get(e.path)
    return f ? { value: { kind: 'file' as const, size: f.text.length, mtimeMs: f.mtimeMs, isLink: false } } : { deny: `ENOENT ${e.path}` }
  })
  on('fs.write', async ($, e) => {
    w.files.set(e.path, { text: e.text, mtimeMs: tick++ })
    return { value: undefined }
  })
  on('process.run', async ($, e) => {
    if (e.argv[0] === 'rm') w.files.delete(e.argv[e.argv.length - 1] ?? '')
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.repo', async () => ({ value: null }))
  on('session.root', async () => ({ value: options.project ?? '' }))
  on('ui.open', async () => {
    w.opens++
    return { value: options.isPlaced === false ? { isPlaced: false as const, reason: 'narrow terminal' } : { isPlaced: true as const } }
  })
  on('ui.close', async () => ({ value: undefined }))
  on('ui.focus', async ($, e) => {
    const target = 'key' in e && typeof e.key === 'string' ? e.key : e.element
    if (target) w.focuses.push(target)
    return {}
  })
  on('ui.status', async () => ({ value: undefined }))
  on('ui.log', async () => ({ value: undefined }))
  on('ui.toast', async () => ({ value: undefined }))
  on('prompt.read', async () => ({ value: { ...w.box } }))
  on('prompt.fill', async ($, e) => {
    w.fills.push(e.text)
    w.box = { text: e.text, cursor: e.text.length }
    return { isFilled: true }
  })
  on('prompt.submit', async ($, e) => {
    w.submits.push(e.text)
    return { text: e.text }
  })
  return w
}

type EditCall = { edit: (e: PromptEditInput) => Promise<PromptEditResult> }
const editOf = (p: unknown) => (p as EditCall).edit

const run = (args: string) => ({ command: 'sn', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 150 } })

const paneProps = (bodyColumns: number, placement: 'dock' | 'inline') => ({
  title: 'Snippets',
  isFocused: true,
  bodyColumns,
  placement,
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
})

describe('picker', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`lists snippets, skips the broken file, search narrows, Enter opens the form (${surface})`, async ($, on) => {
      world(on)
      const loaded = await $.command.run(run('reload'))
      expect(loaded.text).toMatch(/3 snippet\(s\) loaded, 1 skipped/)
      await $.command.run(run(''))
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: PANE, props: paneProps(60, 'dock') })
      expect((await ui.find({ type: 'Text', text: /^\d+\/\d+/ }))?.text).toMatch(/^3\/3/)
      await ui.input({ key: 'q', text: 'review', kind: 'change' })
      expect((await ui.find({ type: 'Text', text: /^\d+\/\d+/ }))?.text).toMatch(/^1\/3/)
      await ui.input({ key: 'q', text: 'review' })
      expect(await ui.find({ key: 'v:base' })).toBeDefined()
      expect(await ui.find({ key: 'v:scope' })).toBeDefined()
      await ui.unmount()
    })

    test(`placeholders fill with defaults and typed values (${surface})`, async ($, on) => {
      const w = world(on)
      await $.command.run(run('review'))
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: PANE, props: paneProps(120, 'inline') })
      await ui.press({ key: `r:${ROOT}/review-diff.md` })
      await ui.input({ key: 'v:scope', text: 'auth', kind: 'change' })
      await ui.press({ key: 'apply' })
      expect(w.fills).toEqual(['Review the diff against main and report only merge blockers for auth.'])
      await ui.unmount()
    })

    test(`a submit-mode snippet is sent, not filled (${surface})`, async ($, on) => {
      const w = world(on)
      await $.command.run(run('tests'))
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: PANE, props: paneProps(60, 'dock') })
      await ui.press({ key: `r:${ROOT}/sub/write-tests.md` })
      expect(w.submits).toEqual(['Write failing tests first.'])
      expect(w.fills).toHaveLength(0)
      await ui.unmount()
    })
  }
})

describe('page size', () => {
  test('inline panes size pages from the requested rows, not the last drawn height', async ($, on) => {
    const w = world(on)
    for (let i = 0; i < 12; i++) w.files.set(`${ROOT}/extra-${i}.md`, { text: `---\ntitle: Extra ${i}\n---\nbody ${i}\n`, mtimeMs: 100 + i })
    await $.command.run(run(''))
    const tiny = { ...paneProps(60, 'inline'), scroll: { offset: 0, bodyRows: 3 } }
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: tiny })
    expect((await ui.findAll({ type: "Button" })).filter(b => (b.key ?? "").startsWith("r:"))).toHaveLength(10)
    await ui.unmount()
  })

  test('an inline pane the host draws shorter than the picker shrinks the page until it fits, so arrows move focus', async ($, on) => {
    const w = world(on)
    const clock = mock.clock(on)
    for (let i = 0; i < 12; i++) w.files.set(`${ROOT}/extra-${i}.md`, { text: `---\ntitle: Extra ${i}\n---\nbody ${i}\n`, mtimeMs: 100 + i })
    await $.command.run(run(''))
    const clamped = { ...paneProps(72, 'inline'), scroll: { offset: 0, bodyRows: 13 } }
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: clamped, viewport: { columns: 76, rows: 46 } })
    const resultRows = async () => (await ui.findAll({ type: 'Button' })).filter(b => (b.key ?? '').startsWith('r:')).length
    expect(await resultRows()).toBe(10)
    await ui.redraw()
    await clock.advance(1)
    await ui.redraw()
    expect(await resultRows()).toBe(5)
    expect(await ui.find({ key: 'new' })).toBeDefined()
    await ui.redraw({ ...clamped, scroll: { offset: 0, bodyRows: 20 } })
    await clock.advance(1)
    await ui.redraw({ ...clamped, scroll: { offset: 0, bodyRows: 20 } })
    expect(await resultRows()).toBe(10)
    await ui.unmount()
  })

  test('a frame that shrank to a short tree is not taken as the limit when the next tree is taller', async ($, on) => {
    const w = world(on)
    const clock = mock.clock(on)
    for (let i = 0; i < 12; i++) w.files.set(`${ROOT}/extra-${i}.md`, { text: `---\ntitle: Extra ${i}\n---\nbody ${i}\n`, mtimeMs: 100 + i })
    await $.command.run(run(''))
    const roomy = { ...paneProps(72, 'inline'), scroll: { offset: 0, bodyRows: 30 } }
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: roomy, viewport: { columns: 76, rows: 60 } })
    const resultRows = async () => (await ui.findAll({ type: 'Button' })).filter(b => (b.key ?? '').startsWith('r:')).length
    await ui.input({ key: 'q', text: 'zzzq', kind: 'change' })
    expect(await resultRows()).toBe(0)
    const shrunk = { ...roomy, scroll: { offset: 0, bodyRows: 5 } }
    await ui.redraw(shrunk)
    await ui.input({ key: 'q', text: '', kind: 'change' })
    await clock.advance(1)
    await ui.redraw(shrunk)
    expect(await resultRows()).toBe(10)
    await ui.unmount()
  })

  test('a short inline body keeps the list whole in compact form: no hint, paging in the tools row', async ($, on) => {
    const w = world(on)
    const clock = mock.clock(on)
    for (let i = 0; i < 12; i++) w.files.set(`${ROOT}/extra-${i}.md`, { text: `---\ntitle: Extra ${i}\n---\nbody ${i}\n`, mtimeMs: 100 + i })
    await $.command.run(run(''))
    const tiny = { ...paneProps(72, 'inline'), scroll: { offset: 0, bodyRows: 5 } }
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: tiny, viewport: { columns: 76, rows: 20 } })
    await ui.redraw()
    await clock.advance(1)
    await ui.redraw()
    const resultRows = (await ui.findAll({ type: 'Button' })).filter(b => (b.key ?? '').startsWith('r:')).length
    expect(resultRows).toBeGreaterThanOrEqual(1)
    expect(await ui.find({ key: 'hint' })).toBeUndefined()
    expect(await ui.find({ key: 'pager' })).toBeUndefined()
    expect(await ui.find({ key: 'next' })).toBeDefined()
    expect(await ui.find({ key: 'new' })).toBeDefined()
    await ui.unmount()
  })

  test('details of a long snippet in a short inline body keep the title and actions and cut the body', async ($, on) => {
    const w = world(on)
    const clock = mock.clock(on)
    const body = Array.from({ length: 30 }, (_, i) => 'long line ' + String(i + 1)).join('\n')
    w.files.set(`${ROOT}/aaa-long.md`, { text: `---\ntitle: Aaa long body\n---\n${body}\n`, mtimeMs: 999 })
    await $.command.run(run('aaa'))
    const clamped = { ...paneProps(72, 'inline'), scroll: { offset: 0, bodyRows: 13 } }
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: clamped, viewport: { columns: 76, rows: 46 } })
    await ui.press({ key: 'details' })
    await ui.redraw()
    await clock.advance(1)
    await ui.redraw()
    const all = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
    expect(all).toMatch(/Aaa long body/)
    expect(all).toMatch(/more line\(s\)/)
    expect(all).not.toMatch(/long line 30/)
    expect(await ui.find({ key: 'apply' })).toBeDefined()
    expect(await ui.find({ key: 'back' })).toBeDefined()
    await ui.unmount()
  })

  test('trash pages by the rows the pane has', async ($, on) => {
    const w = world(on)
    for (let i = 0; i < 12; i++) w.files.set(`${ROOT}/.trash/gone-${i}.20260101T00000${i}.md`, { text: `---\ntitle: Gone ${i}\n---\nx\n`, mtimeMs: 200 + i })
    await $.command.run(run('trash'))
    const short = { ...paneProps(80, 'dock'), scroll: { offset: 0, bodyRows: 8 } }
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: short })
    const rows = async () => (await ui.findAll({ type: 'Button' })).filter(b => (b.key ?? '').startsWith('t:')).length
    expect(await rows()).toBe(5)
    const shownText = async () => (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
    expect(await shownText()).toMatch(/page 1\/3/)
    await ui.press({ key: 'trash-next' })
    expect(await shownText()).toMatch(/page 2\/3/)
    expect(await ui.find({ key: 'trash-prev' })).toBeDefined()
    await ui.unmount()
  })

  test('/sn rows sets the results per page, refuses out-of-range values and survives a reload', async ($, on) => {
    const w = world(on)
    for (let i = 0; i < 20; i++) w.files.set(`${ROOT}/extra-${i}.md`, { text: `---\ntitle: Extra ${i}\n---\nbody ${i}\n`, mtimeMs: 100 + i })
    expect((await $.command.run(run('rows'))).text).toMatch(/10 results per page/)
    expect((await $.command.run(run('rows 2'))).text).toMatch(/whole number from 3 to 30/)
    expect((await $.command.run(run('rows 31'))).text).toMatch(/whole number from 3 to 30/)
    expect((await $.command.run(run('rows 12'))).text).toMatch(/12 results per page/)
    await $.command.run(run('reload'))
    await $.command.run(run(''))
    const tall = { ...paneProps(150, 'dock'), scroll: { offset: 0, bodyRows: 40 } }
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: tall })
    expect((await ui.findAll({ type: 'Button' })).filter(b => (b.key ?? '').startsWith('r:'))).toHaveLength(12)
    await ui.unmount()
  })
})

describe('layout', () => {
  test('rows show title, mode, slug and a source letter; the focused body previews below', async ($, on) => {
    world(on)
    await $.command.run(run('plan'))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(70, 'dock') })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(texts.some(t => t.trim() === 'multi-line')).toBe(true)
    expect(texts.some(t => t.trim() === 'G')).toBe(true)
    expect(texts.some(t => t.startsWith('fill'))).toBe(true)
    expect(texts).toContain('Before writing code:')
    await ui.unmount()
  })
})

describe('short docked pane', () => {
  test('with 8 body rows the list keeps at least 3 rows and the bottom row; the preview drops', async ($, on) => {
    const w = world(on)
    for (let i = 0; i < 12; i++) w.files.set(`${ROOT}/extra-${i}.md`, { text: `---\ntitle: Extra ${i}\n---\nbody ${i}\n`, mtimeMs: 100 + i })
    await $.command.run(run(''))
    const short = { ...paneProps(150, 'dock'), scroll: { offset: 0, bodyRows: 8 } }
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: short })
    const rows = (await ui.findAll({ type: 'Button' })).filter(b => (b.key ?? '').startsWith('r:'))
    expect(rows.length).toBeGreaterThanOrEqual(3)
    expect(await ui.find({ key: 'new' })).toBeDefined()
    expect((await ui.findAll({ type: 'Text' })).some(t => t.text.startsWith('\u2500'))).toBe(false)
    await ui.unmount()
  })
})

describe('long titles', () => {
  test('a long title is cut to its column and the slug keeps its full width', async ($, on) => {
    const w = world(on)
    w.files.set(`${ROOT}/long-title.md`, { text: '---\ntitle: Refactor the authentication module so access tokens refresh before they expire\n---\nb\n', mtimeMs: 500 })
    await $.command.run(run('long'))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(60, 'dock') })
    const row = await ui.find({ key: `r:${ROOT}/long-title.md` })
    expect((row?.text ?? '').length).toBeLessThanOrEqual(60)
    expect(row?.text ?? '').toEndWith('\u2026')
    expect((await ui.findAll({ type: 'Text' })).some(t => t.text.trim() === 'long-title')).toBe(true)
    await ui.unmount()
  })
})

describe('manage', () => {
  test('new snippet is created as a file and opens in detail', async ($, on) => {
    const w = world(on)
    await $.command.run(run('new'))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(60, 'dock') })
    await ui.input({ key: 'f:title', text: 'Hello world', kind: 'change' })
    await ui.input({ key: 'f:slug', text: 'hello', kind: 'change' })
    await ui.input({ key: 'f:tags', text: 'a, b', kind: 'change' })
    await ui.input({ key: 'f:body', text: 'Say hi to {{who:you}}', kind: 'change' })
    await ui.press({ key: 'save' })
    expect(w.files.get(`${ROOT}/hello.md`)?.text).toBe('---\ntitle: Hello world\ntags: [a, b]\n---\nSay hi to {{who:you}}\n')
    expect(await ui.find({ key: 'edit-info' })).toBeDefined()
    await ui.unmount()
  })

  test('a new snippet derives its slug from the title while the slug is untouched', async ($, on) => {
    const w = world(on)
    await $.command.run(run('new'))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(60, 'dock') })
    await ui.input({ key: 'f:title', text: 'Summarize PR', kind: 'change' })
    expect((await ui.find({ key: 'f:slug' }))?.props.value).toBe('summarize-pr')
    await ui.input({ key: 'f:body', text: 'Summarize the PR.', kind: 'change' })
    await ui.press({ key: 'save' })
    expect(w.files.get(`${ROOT}/summarize-pr.md`)?.text).toBe('---\ntitle: Summarize PR\n---\nSummarize the PR.\n')
    await ui.unmount()
  })

  test('Edit info keeps the slug when the title changes', async ($, on) => {
    const w = world(on)
    await $.command.run(run('plan'))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(60, 'dock') })
    await ui.press({ key: 'details' })
    await ui.press({ key: 'edit-info' })
    await ui.input({ key: 'f:title', text: 'Plan first', kind: 'change' })
    expect((await ui.find({ key: 'f:title' }))?.props.value).toBe('Plan first')
    expect((await ui.find({ key: 'f:slug' }))?.props.value).toBe('multi-line')
    await ui.press({ key: 'save' })
    expect(w.files.get(`${ROOT}/multi-line.md`)?.text).toMatch(/^---\ntitle: Plan first\n/)
    await ui.unmount()
  })

  test('a slug that already exists is refused, nothing is overwritten', async ($, on) => {
    const w = world(on)
    await $.command.run(run('new'))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(60, 'dock') })
    await ui.input({ key: 'f:title', text: 'Clash', kind: 'change' })
    await ui.input({ key: 'f:slug', text: 'review-diff', kind: 'change' })
    await ui.press({ key: 'save' })
    expect((await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')).toMatch(/already exists/)
    expect(w.files.get(`${ROOT}/review-diff.md`)?.text).toBe(FIXTURES[`${ROOT}/review-diff.md`])
    await ui.unmount()
  })

  test('delete moves the file into .trash', async ($, on) => {
    const w = world(on)
    await $.command.run(run('plan'))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(60, 'dock') })
    await ui.press({ key: 'details' })
    await ui.press({ key: 'del' })
    await ui.press({ key: 'confirm' })
    expect(w.files.has(`${ROOT}/multi-line.md`)).toBe(false)
    expect([...w.files.keys()].some(p => p.startsWith(`${ROOT}/.trash/multi-line.`))).toBe(true)
    await ui.unmount()
  })

  test('delete from the list asks yes or no and returns to the list', async ($, on) => {
    const w = world(on)
    await $.command.run(run('plan'))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(60, 'dock') })
    await ui.press({ key: 'list-del' })
    await ui.press({ key: 'cancel' })
    expect(await ui.find({ key: 'q' })).toBeDefined()
    expect(w.files.has(`${ROOT}/multi-line.md`)).toBe(true)
    await ui.press({ key: 'list-del' })
    await ui.press({ key: 'confirm' })
    expect(w.files.has(`${ROOT}/multi-line.md`)).toBe(false)
    expect(await ui.find({ key: 'q' })).toBeDefined()
    await ui.unmount()
  })

  test('opening the picker after files changed on disk offers a reload', async ($, on) => {
    const w = world(on)
    await $.command.run(run(''))
    w.files.set(`${ROOT}/added.md`, { text: '---\ntitle: Added outside\n---\nhello\n', mtimeMs: 500 })
    w.files.delete(`${ROOT}/multi-line.md`)
    await $.command.run(run(''))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(60, 'dock') })
    expect(await ui.find({ key: 'stale-reload' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^\d+\/\d+/ }))?.text).toMatch(/^3\/3/)
    await ui.press({ key: 'stale-reload' })
    expect(await ui.find({ key: 'stale-reload' })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^\d+\/\d+/ }))?.text).toMatch(/reloaded 3/)
    expect((await ui.find({ type: 'Text', text: /^\d+\/\d+/ }))?.text).toMatch(/^3\/3/)
    expect(await ui.find({ key: `r:${ROOT}/added.md` })).toBeDefined()
    expect(await ui.find({ key: `r:${ROOT}/multi-line.md` })).toBeUndefined()
    await ui.unmount()
  })

  test('opening the picker with nothing changed on disk does not offer a reload', async ($, on) => {
    world(on)
    await $.command.run(run(''))
    await $.command.run(run(''))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(60, 'dock') })
    expect(await ui.find({ key: 'stale-reload' })).toBeUndefined()
    expect(await ui.find({ key: 'reload' })).toBeDefined()
    await ui.unmount()
  })

  test('a file changed on disk since loading is not overwritten by Edit info', async ($, on) => {
    const w = world(on)
    await $.command.run(run('plan'))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(60, 'dock') })
    await ui.press({ key: 'details' })
    await ui.press({ key: 'edit-info' })
    w.files.set(`${ROOT}/multi-line.md`, { text: '---\ntitle: Changed elsewhere\n---\nnew\n', mtimeMs: 999 })
    await ui.input({ key: 'f:title', text: 'Mine', kind: 'change' })
    await ui.press({ key: 'save' })
    expect((await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')).toMatch(/changed on disk/)
    expect(w.files.get(`${ROOT}/multi-line.md`)?.text).toMatch(/Changed elsewhere/)
    await ui.unmount()
  })

  test('editing a body in the prompt and pressing Enter saves it instead of sending it', async ($, on) => {
    const w = world(on)
    await $.command.run(run('plan'))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(60, 'dock') })
    await ui.press({ key: 'details' })
    await ui.press({ key: 'edit-body' })
    expect(w.fills[0]).toMatch(/^Before writing code:/)
    const r = await $.prompt.submit({ text: 'Rewritten body\nline 2', wait: false, origin: { kind: 'composer' } })
    expect(r.drop).toMatch(/saved the body of "Plan before coding"/)
    expect(w.submits).toHaveLength(0)
    expect(w.files.get(`${ROOT}/multi-line.md`)?.text).toBe('---\ntitle: Plan before coding\ntags: [plan]\n---\nRewritten body\nline 2\n')
    const after = await $.prompt.submit({ text: 'a normal prompt', wait: false, origin: { kind: 'composer' } })
    expect(after.drop).toBeUndefined()
    await ui.unmount()
  })
})

describe('insert at the caret with ;;', () => {
  const typeTrigger = (text: string, at: number) => ({ origin: { kind: 'composer' as const }, text, cursor: at, start: at, end: at, inputText: ';' })

  test('typing ;; holds the draft, opens the picker, and the snippet lands where ;; was', async ($, on) => {
    const w = world(on)
    const clock = mock.clock(on)
    on('prompt.edit', async ($, e) => ({ text: e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end), cursor: e.start + e.inputText.length }))
    await $.command.run(run('reload'))
    w.box = { text: 'fix ;tail', cursor: 5 }
    const cleared = await editOf($.prompt)(typeTrigger('fix ;tail', 5))
    expect(cleared.text).toBe('')
    await clock.advance(1)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(60, 'dock') })
    await ui.press({ key: `r:${ROOT}/multi-line.md` })
    expect(w.fills[w.fills.length - 1]).toBe('fix Before writing code:\n1. Restate the goal.\n2. List the files.tail')
    await ui.unmount()
  })

  test('when the picker cannot open, the held draft goes back unchanged', async ($, on) => {
    const w = world(on, { isPlaced: false })
    const clock = mock.clock(on)
    on('prompt.edit', async ($, e) => ({ text: e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end), cursor: e.start + e.inputText.length }))
    await $.command.run(run('reload'))
    await editOf($.prompt)(typeTrigger('keep ;this', 6))
    await clock.advance(1)
    expect(w.fills[w.fills.length - 1]).toBe('keep this')
  })

  test('a submit-mode snippet picked from ;; is inserted, not sent', async ($, on) => {
    const w = world(on)
    const clock = mock.clock(on)
    on('prompt.edit', async ($, e) => ({ text: e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end), cursor: e.start + e.inputText.length }))
    await $.command.run(run('reload'))
    await editOf($.prompt)(typeTrigger('a ;b', 3))
    await clock.advance(1)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(60, 'dock') })
    await ui.press({ key: `r:${ROOT}/sub/write-tests.md` })
    expect(w.submits).toHaveLength(0)
    expect(w.fills[w.fills.length - 1]).toBe('a Write failing tests first.b')
    await ui.unmount()
  })

  test('Save this draft as a snippet: form prefilled, file written globally, draft restored', async ($, on) => {
    const w = world(on)
    const clock = mock.clock(on)
    on('prompt.edit', async ($, e) => ({ text: e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end), cursor: e.start + e.inputText.length }))
    await $.command.run(run('reload'))
    const draft = 'Fix the flaky login test. Keep it small.\nline 2;'
    await editOf($.prompt)(typeTrigger(draft, draft.length))
    await clock.advance(1)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(60, 'dock') })
    await ui.press({ key: 'save-draft' })
    expect((await ui.find({ key: 'f:title' }))?.props.value).toBe('Fix the flaky login test')
    expect((await ui.find({ key: 'f:slug' }))?.props.value).toBe('fix-the-flaky-login-test')
    await ui.press({ key: 'save' })
    expect(w.files.get(`${ROOT}/fix-the-flaky-login-test.md`)?.text).toBe('---\ntitle: Fix the flaky login test\n---\nFix the flaky login test. Keep it small.\nline 2\n')
    expect(w.fills[w.fills.length - 1]).toBe('Fix the flaky login test. Keep it small.\nline 2')
    await ui.unmount()
  })

  test('the save-draft row is absent when no draft is held', async ($, on) => {
    world(on)
    await $.command.run(run(''))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(60, 'dock') })
    expect(await ui.find({ key: 'save-draft' })).toBeUndefined()
    await ui.unmount()
  })

  test('a placeholder snippet picked from ;; reclaims the keyboard for its form, and composer submits are held back', async ($, on) => {
    const w = world(on)
    const clock = mock.clock(on)
    on('prompt.edit', async ($, e) => ({ text: e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end), cursor: e.start + e.inputText.length }))
    await $.command.run(run('reload'))
    await editOf($.prompt)(typeTrigger('explain ;now', 9))
    await clock.advance(1)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(60, 'dock') })
    const opensBefore = w.opens
    await ui.press({ key: `r:${ROOT}/review-diff.md` })
    expect(w.opens).toBeGreaterThan(opensBefore)
    const sent = await $.prompt.submit({ text: 'src/auth/session.ts', wait: false, origin: { kind: 'composer' } })
    expect(sent.drop).toMatch(/holding your draft/)
    expect(w.submits).toHaveLength(0)
    await ui.input({ key: 'v:scope', text: 'auth', kind: 'change' })
    await ui.press({ key: 'apply' })
    expect(w.fills[w.fills.length - 1]).toBe('explain Review the diff against main and report only merge blockers for auth.now')
    await ui.unmount()
  })

  test('a single ; types normally', async ($, on) => {
    world(on)
    on('prompt.edit', async ($, e) => ({ text: e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end), cursor: e.start + e.inputText.length }))
    const r = await editOf($.prompt)({ origin: { kind: 'composer' }, text: 'a b', cursor: 1, start: 1, end: 1, inputText: ';' })
    expect(r.text).toBe('a; b')
  })
})

describe('commands', () => {
  test('/snippets is the full name of /sn and runs the same subcommands', async ($, on) => {
    world(on)
    await $.command.run({ ...run('reload'), command: 'snippets' })
    const viaFull = await $.command.run({ ...run('list'), command: 'snippets' })
    const viaShort = await $.command.run(run('list'))
    expect(viaFull.text).toMatch(/review-diff - Review current diff/)
    expect(viaFull.text).toBe(viaShort.text)
  })

  test('/sn doctor names the broken file and /sn list prints slugs', async ($, on) => {
    world(on)
    await $.command.run(run('reload'))
    expect((await $.command.run(run('doctor'))).text).toMatch(/broken\.md: frontmatter has no title/)
    expect((await $.command.run(run('list'))).text).toMatch(/review-diff - Review current diff/)
  })
})

describe('v0.2 organize and speed', () => {
  const texts = async (ui: { findAll: (q: { type: string }) => Promise<Array<{ text: string }>> }) => (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')

  test('Move puts a snippet into a subfolder and removes the original', async ($, on) => {
    const w = world(on)
    await $.command.run(run('plan'))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(80, 'dock') })
    await ui.press({ key: 'details' })
    await ui.press({ key: 'move' })
    await ui.input({ key: 'm:folder', text: 'team/daily', kind: 'change' })
    await ui.press({ key: 'm:save' })
    expect(w.files.has(`${ROOT}/multi-line.md`)).toBe(false)
    expect(w.files.get(`${ROOT}/team/daily/multi-line.md`)?.text).toBe(FIXTURES[`${ROOT}/multi-line.md`])
    expect(await ui.find({ key: 'edit-info' })).toBeDefined()
    await ui.unmount()
  })

  test('Move refuses a folder that climbs out or starts with a dot', async ($, on) => {
    const w = world(on)
    await $.command.run(run('plan'))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(80, 'dock') })
    await ui.press({ key: 'details' })
    await ui.press({ key: 'move' })
    await ui.input({ key: 'm:folder', text: '../out', kind: 'change' })
    await ui.press({ key: 'm:save' })
    expect(await texts(ui)).toMatch(/Folder: names of letters/)
    await ui.input({ key: 'm:folder', text: 'ok', kind: 'change' })
    expect(await texts(ui)).not.toMatch(/Folder: names of letters/)
    expect(w.files.has(`${ROOT}/multi-line.md`)).toBe(true)
    await ui.unmount()
  })

  test('Move starts at the top level even from a subfolder', async ($, on) => {
    const w = world(on)
    await $.command.run(run('tests'))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(80, 'dock') })
    await ui.press({ key: 'details' })
    await ui.press({ key: 'move' })
    expect((await ui.find({ key: 'm:folder' }))?.props.value).toBe('')
    expect(await texts(ui)).toMatch(/folder sub/)
    await ui.press({ key: 'm:save' })
    expect(w.files.has(`${ROOT}/write-tests.md`)).toBe(true)
    expect(w.files.has(`${ROOT}/sub/write-tests.md`)).toBe(false)
    await ui.unmount()
  })

  test('Move switches a global snippet to the project folder', async ($, on) => {
    const w = world(on, { project: '/proj' })
    await $.command.run(run('plan'))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(80, 'dock') })
    await ui.press({ key: 'details' })
    await ui.press({ key: 'move' })
    await ui.press({ key: 'm:source' })
    await ui.press({ key: 'm:save' })
    expect(w.files.has(`${ROOT}/multi-line.md`)).toBe(false)
    expect(w.files.has('/proj/.claude/snippets/multi-line.md')).toBe(true)
    await ui.unmount()
  })

  test('/sn trash restores a deleted snippet and refuses to overwrite', async ($, on) => {
    const w = world(on)
    await $.command.run(run('plan'))
    let ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(80, 'dock') })
    await ui.press({ key: 'list-del' })
    await ui.press({ key: 'confirm' })
    await ui.unmount()
    const trashed = [...w.files.keys()].find(p => p.startsWith(`${ROOT}/.trash/multi-line.`)) ?? ''
    expect(trashed).not.toBe('')
    w.files.set(`${ROOT}/multi-line.md`, { text: '---\ntitle: Taken\n---\nx\n', mtimeMs: 900 })
    await $.command.run(run('trash'))
    ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(80, 'dock') })
    expect(await texts(ui)).toMatch(/Trash: 1 file/)
    await ui.press({ key: `t:${trashed}` })
    expect(await texts(ui)).toMatch(/already exists/)
    w.files.delete(`${ROOT}/multi-line.md`)
    await ui.press({ key: `t:${trashed}` })
    expect(w.files.get(`${ROOT}/multi-line.md`)?.text).toBe(FIXTURES[`${ROOT}/multi-line.md`])
    expect(w.files.has(trashed)).toBe(false)
    expect(await texts(ui)).toMatch(/restored multi-line/)
    await ui.unmount()
  })

  test('the first nine rows carry digit hotkeys', async ($, on) => {
    const w = world(on)
    for (let i = 0; i < 12; i++) w.files.set(`${ROOT}/extra-${i}.md`, { text: `---\ntitle: Extra ${i}\n---\nbody ${i}\n`, mtimeMs: 100 + i })
    await $.command.run(run(''))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(80, 'dock') })
    const rows = (await ui.findAll({ type: 'Button' })).filter(b => (b.key ?? '').startsWith('r:'))
    expect(rows.length).toBeGreaterThan(9)
    expect(rows.slice(0, 9).map(b => b.props.hotkey)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
    expect(rows[9]?.props.hotkey).toBeUndefined()
    await ui.unmount()
  })

  test('the tools row comes after the results so Tab reaches the top hit first', async ($, on) => {
    world(on)
    await $.command.run(run(''))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(80, 'dock') })
    const keys = (await ui.findAll({ type: 'Button' })).map(b => b.key ?? '')
    const firstRow = keys.findIndex(k => k.startsWith('r:'))
    expect(firstRow).toBeGreaterThanOrEqual(0)
    expect(firstRow).toBeLessThan(keys.indexOf('new'))
    expect(keys.indexOf('new')).toBeGreaterThan(keys.findLastIndex(k => k.startsWith('r:')))
    await ui.unmount()
  })

  test('Pin writes pin: true and puts the snippet first', async ($, on) => {
    const w = world(on)
    await $.command.run(run('tests'))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(80, 'dock') })
    await ui.press({ key: 'details' })
    await ui.press({ key: 'pin' })
    expect(w.files.get(`${ROOT}/sub/write-tests.md`)?.text).toBe('---\ntitle: Write tests\ntags: [test]\nmode: submit\npin: true\n---\nWrite failing tests first.\n')
    expect(await texts(ui)).toMatch(/pinned/)
    await ui.press({ key: 'back' })
    await ui.input({ key: 'q', text: '', kind: 'change' })
    const rows = (await ui.findAll({ type: 'Button' })).filter(b => (b.key ?? '').startsWith('r:'))
    expect(rows[0]?.key).toBe(`r:${ROOT}/sub/write-tests.md`)
    await ui.unmount()
  })

  test('p pins the focused row from the list, k and j reorder pinned rows, and the order survives a reload', async ($, on) => {
    const w = world(on)
    await $.command.run(run(''))
    let ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(150, 'dock') })
    const rowKeys = async () => (await ui.findAll({ type: 'Button' })).map(b => b.key ?? '').filter(k => k.startsWith('r:'))
    const order = async () => (await rowKeys()).map(k => k.slice(2).split('#refocus-')[0])
    const tests = `${ROOT}/sub/write-tests.md`
    const review = `${ROOT}/review-diff.md`
    await ui.input({ key: 'q', text: 'write', kind: 'change' })
    expect(await ui.find({ key: 'pin-up' })).toBeUndefined()
    await ui.press({ key: 'list-pin' })
    await ui.input({ key: 'q', text: 'review', kind: 'change' })
    await ui.press({ key: 'list-pin' })
    expect(w.files.get(tests)?.text).toMatch(/pin: true/)
    expect(w.files.get(review)?.text).toMatch(/pin: true/)
    await ui.input({ key: 'q', text: '', kind: 'change' })
    expect((await order()).slice(0, 2)).toEqual([tests, review])
    const keyBefore = (await rowKeys())[0]
    await ui.press({ key: 'pin-down' })
    expect((await order()).slice(0, 2)).toEqual([review, tests])
    const movedKey = (await rowKeys())[1]
    expect(movedKey).not.toBe(keyBefore)
    await ui.press({ key: 'pin-down' })
    expect((await order()).slice(0, 2)).toEqual([review, tests])
    await ui.press({ key: 'pin-up' })
    expect((await order()).slice(0, 2)).toEqual([tests, review])
    await ui.press({ key: 'pin-down' })
    await ui.unmount()
    await $.command.run(run('reload'))
    await $.command.run(run(''))
    ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(150, 'dock') })
    expect((await order()).slice(0, 2)).toEqual([review, tests])
    await ui.press({ key: 'list-pin' })
    expect(w.files.get(review)?.text).not.toMatch(/pin: true/)
    await ui.input({ key: 'q', text: '', kind: 'change' })
    expect((await order())[0]).toBe(tests)
    expect((await order())[1]).not.toBe(review)
    await ui.unmount()
  })

  test('placeholder values from the last use prefill the form', async ($, on) => {
    world(on)
    await $.command.run(run('review'))
    let ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(80, 'dock') })
    await ui.press({ key: `r:${ROOT}/review-diff.md` })
    await ui.input({ key: 'v:scope', text: 'auth', kind: 'change' })
    await ui.press({ key: 'apply' })
    await ui.unmount()
    await $.command.run(run('review'))
    ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(80, 'dock') })
    await ui.press({ key: `r:${ROOT}/review-diff.md` })
    expect((await ui.find({ key: 'v:scope' }))?.props.value).toBe('auth')
    expect((await ui.find({ key: 'v:base' }))?.props.value).toBe('main')
    await ui.unmount()
  })

  test('/sn <slug>! applies at once, asks for placeholders, and falls back to the picker', async ($, on) => {
    const w = world(on)
    const r = await $.command.run(run('multi-line!'))
    expect(r.text).toBeUndefined()
    expect(w.fills).toEqual(['Before writing code:\n1. Restate the goal.\n2. List the files.'])
    await $.command.run(run('review-diff!'))
    let ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(80, 'dock') })
    expect(await ui.find({ key: 'v:scope' })).toBeDefined()
    await ui.unmount()
    await $.command.run(run('nothing-here!'))
    ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(80, 'dock') })
    expect((await ui.find({ key: 'q' }))?.props.value).toBe('nothing-here')
    await ui.unmount()
  })

  test('{{date}} and {{time}} fill themselves without a form', async ($, on) => {
    const w = world(on)
    w.files.set(`${ROOT}/stamp.md`, { text: '---\ntitle: Stamp\n---\nOn {{date}} at {{time}}.\n', mtimeMs: 700 })
    await $.command.run(run('stamp!'))
    expect(w.fills[0]).toMatch(/^On \d{4}-\d{2}-\d{2} at \d{2}:\d{2}\.$/)
  })

  test('Next, Prev, Tag and Source take a fresh key after a press so the focus lands back on them once the list redraws', async ($, on) => {
    const w = world(on)
    for (let i = 0; i < 12; i++) w.files.set(`${ROOT}/extra-${i}.md`, { text: `---\ntitle: Extra ${i}\n---\nbody ${i}\n`, mtimeMs: 100 + i })
    await $.command.run(run(''))
    const short = { ...paneProps(100, 'dock'), scroll: { offset: 0, bodyRows: 14 } }
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: short })
    const keyOf = async (base: string) => (await ui.findAll({ type: 'Button' })).map(b => b.key ?? '').find(k => k === base || k.startsWith(base + '#refocus-'))
    const pager = async () => (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '').find(t => /page \d+\/\d+/.test(t))
    expect(await pager()).toMatch(/page 1\//)
    const nextBefore = await keyOf('next')
    await ui.press({ key: nextBefore ?? 'next' })
    expect(await pager()).toMatch(/page 2\//)
    const nextAfter = await keyOf('next')
    expect(nextAfter).not.toBe(nextBefore)
    await ui.press({ key: nextAfter ?? 'next' })
    expect(await pager()).toMatch(/page 3\//)
    const tagBefore = await keyOf('tag')
    await ui.press({ key: tagBefore ?? 'tag' })
    expect((await ui.find({ key: await keyOf('tag') ?? 'tag' }))?.text).not.toMatch(/Tag: all/)
    expect(await keyOf('tag')).not.toBe(tagBefore)
    const srcBefore = await keyOf('src')
    await ui.press({ key: srcBefore ?? 'src' })
    expect(await keyOf('src')).not.toBe(srcBefore)
    await ui.unmount()
  })

  test('New, Delete and Move keep their actions on the heading row, above the fields, so a short pane still reaches them', async ($, on) => {
    world(on)
    await $.command.run(run(''))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(100, 'dock') })
    const order = async () => (await ui.findAll({})).map(n => n.key ?? '').filter(k => k !== '')
    await ui.press({ key: 'new' })
    let keys = await order()
    expect(keys.indexOf('save')).toBeGreaterThanOrEqual(0)
    expect(keys.indexOf('save')).toBeLessThan(keys.indexOf('f:title'))
    expect(keys.indexOf('cancel')).toBeLessThan(keys.indexOf('f:title'))
    expect(keys.indexOf('f:mode')).toBeGreaterThan(keys.indexOf('f:title'))
    await ui.press({ key: 'cancel' })
    await ui.press({ key: 'list-del' })
    keys = await order()
    expect(keys.slice(0, 4)).toEqual(['head', 'h-box', 'cancel', 'confirm'])
    expect(keys).not.toContain('acts')
    await ui.unmount()
  })

  test('the Sort button switches between used and recent and remembers it', async ($, on) => {
    world(on)
    await $.command.run(run(''))
    let ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(80, 'dock') })
    expect((await ui.find({ key: 'sort' }))?.text).toMatch(/Sort: used/)
    await ui.press({ key: 'sort' })
    expect((await ui.find({ key: 'sort' }))?.text).toMatch(/Sort: recent/)
    await ui.unmount()
    await $.command.run(run('reload'))
    await $.command.run(run(''))
    ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(80, 'dock') })
    expect((await ui.find({ key: 'sort' }))?.text).toMatch(/Sort: recent/)
    await ui.unmount()
  })

  test('without CYBERINE_SNIPPETS_DIR the global folder is ~/.claude/snippets', async ($, on) => {
    world(on, { env: { HOME: '/home/test' } })
    const r = await $.command.run(run('doctor'))
    expect(r.text).toMatch(/global dir: \/home\/test\/\.claude\/snippets/)
  })
})
