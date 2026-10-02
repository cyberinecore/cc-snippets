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

type World = { files: Map<string, { text: string; mtimeMs: number }>; fills: string[]; submits: string[]; box: { text: string; cursor: number } }

function world(on: On, options: { isPlaced?: boolean } = {}): World {
  const w: World = { files: new Map(), fills: [], submits: [], box: { text: '', cursor: 0 } }
  let tick = 1
  for (const [p, text] of Object.entries(FIXTURES)) w.files.set(p, { text, mtimeMs: tick++ })
  const isDir = (p: string) => [...w.files.keys()].some(f => f.startsWith(`${p}/`))
  mock.env(on, { HOME: '/home/test', CYBERINE_SNIPPETS_DIR: ROOT })
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
    const [cmd, ...args] = e.argv
    if (cmd === 'mv' && args[0] === '-n') {
      const [, from = '', to = ''] = args
      const f = w.files.get(from)
      if (f && !w.files.has(to)) {
        w.files.delete(from)
        w.files.set(to, f)
      }
    }
    if (cmd === 'rm') w.files.delete(args[args.length - 1] ?? '')
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.repo', async () => ({ value: null }))
  on('session.root', async () => ({ value: '' }))
  on('ui.open', async () => ({ value: options.isPlaced === false ? { isPlaced: false as const, reason: 'narrow terminal' } : { isPlaced: true as const } }))
  on('ui.close', async () => ({ value: undefined }))
  on('ui.focus', async () => ({}))
  on('ui.status', async () => ({ value: undefined }))
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
      expect((await ui.find({ type: 'Text', text: /^Results / }))?.text).toMatch(/Results 3/)
      await ui.input({ key: 'q', text: 'review', kind: 'change' })
      expect((await ui.find({ type: 'Text', text: /^Results / }))?.text).toMatch(/Results 1/)
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

  test('a single ; types normally', async ($, on) => {
    world(on)
    on('prompt.edit', async ($, e) => ({ text: e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end), cursor: e.start + e.inputText.length }))
    const r = await editOf($.prompt)({ origin: { kind: 'composer' }, text: 'a b', cursor: 1, start: 1, end: 1, inputText: ';' })
    expect(r.text).toBe('a; b')
  })
})

describe('commands', () => {
  test('/sn doctor names the broken file and /sn list prints slugs', async ($, on) => {
    world(on)
    await $.command.run(run('reload'))
    expect((await $.command.run(run('doctor'))).text).toMatch(/broken\.md: frontmatter has no title/)
    expect((await $.command.run(run('list'))).text).toMatch(/review-diff - Review current diff/)
  })
})
