import { describe, expect, test } from 'claude-code/testing'
import type { Snippet } from '../types'
import { cleanFolder, folderOf, isUnder, joinPath, mergeSources, parseFrontmatter, parseSnippet, serializeSnippet, slugFromPath, slugify, titleFromDraft, trashSlug } from '../src/model'
import { clockValues, placeholdersOf, renderBody } from '../src/placeholders'
import { rank, reorderPinned } from '../src/search'
import { cellWidth, fit, padStartCells, plainLine, rowColumns, textRows, wrappedRows } from '../src/look'
import { insertAt, redirectEdit } from '../src/caret'

const snip = (over: Partial<Snippet>): Snippet => ({
  slug: 'x',
  title: 'X',
  desc: '',
  tags: [],
  mode: 'fill',
  body: '',
  path: '/g/x.md',
  source: 'global',
  mtimeMs: 0,
  pinned: false,
  ...over,
})

describe('frontmatter parsing', () => {
  test('reads title, desc, inline tags, mode and body', async () => {
    const r = parseSnippet('/g/review-diff.md', '---\ntitle: Review diff\ndesc: "Merge blockers: only"\ntags: [review, git]\nmode: submit\n---\nReview the diff.\n', 'global')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.snippet).toMatchObject({ slug: 'review-diff', title: 'Review diff', desc: 'Merge blockers: only', tags: ['review', 'git'], mode: 'submit', body: 'Review the diff.' })
  })

  test('reads block-list tags and ignores comments', async () => {
    expect(parseFrontmatter('title: T\n# note\ntags:\n  - a\n  - "b c"')).toEqual({ title: 'T', tags: ['a', 'b c'] })
  })

  test('slug defaults to the file name without .md', async () => {
    expect(slugFromPath('/a/b/explain-file.md')).toBe('explain-file')
    const r = parseSnippet('/a/b/explain-file.md', '---\ntitle: Explain\n---\nbody', 'global')
    expect(r.ok && r.snippet.slug).toBe('explain-file')
  })

  test('explicit slug wins over the file name', async () => {
    const r = parseSnippet('/a/file.md', '---\ntitle: T\nslug: other\n---\nb', 'project')
    expect(r.ok && r.snippet.slug).toBe('other')
  })

  test('a file without frontmatter or title is an error, not a throw', async () => {
    const a = parseSnippet('/a/none.md', 'just text', 'global')
    expect(a.ok).toBe(false)
    const b = parseSnippet('/a/notitle.md', '---\ndesc: d\n---\nb', 'global')
    expect(!b.ok && b.error.reason).toMatch(/title/)
    const c = parseSnippet('/a/badmode.md', '---\ntitle: T\nmode: run\n---\nb', 'global')
    expect(!c.ok && c.error.reason).toMatch(/mode/)
    const d = parseSnippet('/a/garbage.md', '---\ntitle: T\n:::\n---\nb', 'global')
    expect(d.ok).toBe(false)
  })

  test('serialize then parse round-trips', async () => {
    const s = { slug: 'r', title: 'Round: trip', desc: 'd', tags: ['a', 'b'], mode: 'submit' as const, body: 'line 1\n{{who:me}}' }
    const r = parseSnippet('/g/r.md', serializeSnippet(s, 'r'), 'global')
    expect(r.ok && r.snippet).toMatchObject(s)
  })
})

describe('project over global', () => {
  test('a project snippet replaces the global one with the same slug', async () => {
    const g = snip({ slug: 'a', title: 'Global A', source: 'global' })
    const p = snip({ slug: 'a', title: 'Project A', source: 'project', path: '/p/a.md' })
    const other = snip({ slug: 'b', title: 'B' })
    const { snippets, duplicates } = mergeSources([g, other], [p])
    expect(snippets.map(s => s.title)).toEqual(['B', 'Project A'])
    expect(duplicates).toHaveLength(0)
  })

  test('two files with one slug in the same source are reported', async () => {
    const { duplicates } = mergeSources([snip({ slug: 'a', path: '/g/a.md' }), snip({ slug: 'a', path: '/g/sub/a.md' })], [])
    expect(duplicates).toHaveLength(1)
  })
})

describe('placeholders', () => {
  test('lists names once, keeps the first non-empty default, skips cursor', async () => {
    expect(placeholdersOf('{{a}} {{b:two}} {{a:one}} {{cursor}}')).toEqual([
      { name: 'a', default: 'one' },
      { name: 'b', default: 'two' },
    ])
  })

  test('renders values, falls back to defaults, places the cursor', async () => {
    const r = renderBody('Hi {{name:you}}, see {{file}}.{{cursor}} Bye', { file: 'a.ts' })
    expect(r.text).toBe('Hi you, see a.ts. Bye')
    expect(r.cursor).toBe('Hi you, see a.ts.'.length)
  })

  test('no cursor token leaves cursor undefined', async () => {
    expect(renderBody('plain', {}).cursor).toBeUndefined()
  })
})

describe('search ranking', () => {
  const list = [
    snip({ slug: 'write-tests', title: 'Write tests', desc: 'failing first', tags: ['test'] }),
    snip({ slug: 'review-diff', title: 'Review current diff', desc: 'merge blockers', tags: ['git'] }),
    snip({ slug: 'explain', title: 'Explain a file', desc: 'review style walk' }),
  ]

  test('slug prefix beats a desc hit', async () => {
    expect(rank(list, 'rev').map(s => s.slug)).toEqual(['review-diff', 'explain'])
  })

  test('every token must match', async () => {
    expect(rank(list, 'review git').map(s => s.slug)).toEqual(['review-diff'])
    expect(rank(list, 'zzz')).toHaveLength(0)
  })

  test('empty query orders by usage, then title', async () => {
    expect(rank(list, '', { explain: 3, 'write-tests': 1 }).map(s => s.slug)).toEqual(['explain', 'write-tests', 'review-diff'])
  })

  test('pinned snippets follow the saved pin order, unlisted pins after them, then the rest', async () => {
    const pins = [
      snip({ slug: 'a', title: 'A', path: '/g/a.md', pinned: true }),
      snip({ slug: 'b', title: 'B', path: '/g/b.md', pinned: true }),
      snip({ slug: 'c', title: 'C', path: '/g/c.md', pinned: true }),
      snip({ slug: 'd', title: 'D', path: '/g/d.md' }),
    ]
    expect(rank(pins, '', { d: 9 }, { pinOrder: ['/g/c.md', '/g/a.md'] }).map(s => s.slug)).toEqual(['c', 'a', 'b', 'd'])
    expect(rank(pins, '', {}, { pinOrder: ['/g/d.md'] }).map(s => s.slug)).toEqual(['a', 'b', 'c', 'd'])
  })

  test('reorderPinned moves a path past its visible neighbour and stops at the ends', async () => {
    const full = ['/a', '/b', '/c', '/d']
    expect(reorderPinned(full, full, '/c', -1)).toEqual(['/a', '/c', '/b', '/d'])
    expect(reorderPinned(full, full, '/a', 1)).toEqual(['/b', '/a', '/c', '/d'])
    expect(reorderPinned(full, ['/a', '/d'], '/d', -1)).toEqual(['/d', '/a', '/b', '/c'])
    expect(reorderPinned(full, full, '/a', -1)).toBeNull()
    expect(reorderPinned(full, full, '/d', 1)).toBeNull()
  })
})

describe('insert at caret', () => {
  test('inserts at the caret and lands after the insert', async () => {
    expect(insertAt({ text: 'ab', cursor: 1 }, 'XY', undefined)).toEqual({ text: 'aXYb', caret: 3 })
  })

  test('lands on the cursor token when given', async () => {
    expect(insertAt({ text: 'ab', cursor: 2 }, 'XY', 1)).toEqual({ text: 'abXY', caret: 3 })
  })

  test('first keystroke after a fill lands at the pending cursor', async () => {
    const pending = { text: 'fix ( ) now', cursor: 5, at: 11 }
    expect(redirectEdit(pending, { text: pending.text, start: 11, end: 11, inputText: 'z' })).toEqual({ text: 'fix (z ) now', cursor: 6 })
    expect(redirectEdit(pending, { text: pending.text, start: 10, end: 11, inputText: '' })).toEqual({ text: 'fix  ) now', cursor: 4 })
    expect(redirectEdit(pending, { text: 'other', start: 5, end: 5, inputText: 'z' })).toBeUndefined()
  })

  test('redirect works when the fill landed before an existing suffix', async () => {
    const planned = insertAt({ text: 'ab', cursor: 1 }, 'XY', 1)
    expect(planned).toEqual({ text: 'aXYb', caret: 2 })
    const pending = { text: 'aXYb', cursor: 2, at: 3 }
    expect(redirectEdit(pending, { text: 'aXYb', start: 3, end: 3, inputText: 'z' })).toEqual({ text: 'aXzYb', cursor: 3 })
  })
})

describe('frontmatter quoting round-trips', () => {
  test('quotes, backslashes and colons survive serialize then parse', async () => {
    const s = { slug: 'q', title: 'Say "hello": C:\\work', desc: "it's: fine", tags: ['design,review', 'plain', 'with space'], mode: 'fill' as const, body: 'b' }
    const r = parseSnippet('/g/q.md', serializeSnippet(s, 'q'), 'global')
    expect(r.ok && r.snippet).toMatchObject(s)
  })

  test('single-quoted values decode doubled apostrophes', async () => {
    expect(parseFrontmatter("title: 'it''s'")).toEqual({ title: "it's" })
  })

  test('quoted commas stay inside one tag', async () => {
    expect(parseFrontmatter('title: T\ntags: ["a,b", c]')).toEqual({ title: 'T', tags: ['a,b', 'c'] })
  })

  test('CRLF files parse and normalize the body', async () => {
    const r = parseSnippet('/g/crlf.md', '---\r\ntitle: T\r\n---\r\nline 1\r\nline 2\r\n', 'global')
    expect(r.ok && r.snippet.body).toBe('line 1\nline 2')
  })
})

describe('placeholder safety', () => {
  test('__proto__ as a placeholder name uses its default', async () => {
    const values: Record<string, string> = Object.create(null) as Record<string, string>
    expect(renderBody('{{__proto__:dflt}}', values).text).toBe('dflt')
    expect(renderBody('{{__proto__:dflt}}', {}).text).toBe('dflt')
  })
})

describe('merge keeps every file', () => {
  test('all lists shadowed globals too', async () => {
    const g = snip({ slug: 'a', source: 'global', path: '/g/a.md' })
    const p = snip({ slug: 'a', source: 'project', path: '/p/a.md' })
    const { all, snippets } = mergeSources([g], [p])
    expect(all).toHaveLength(2)
    expect(snippets).toHaveLength(1)
  })
})

describe('slug from title', () => {
  test('lower-case words joined by dashes, accents stripped', async () => {
    expect(slugify('Summarize PR')).toBe('summarize-pr')
    expect(slugify('  Review: the diff (v2)!  ')).toBe('review-the-diff-v2')
    expect(slugify('Tóm tắt PR đầu tiên')).toBe('tom-tat-pr-dau-tien')
    expect(slugify('***')).toBe('')
  })
})

describe('title from a draft', () => {
  test('first non-empty line, first sentence, no trailing punctuation', async () => {
    expect(titleFromDraft('\n  Fix the login bug. Then run tests.\nmore')).toBe('Fix the login bug')
    expect(titleFromDraft('## Review: the diff')).toBe('Review: the diff')
    expect(titleFromDraft('- list item, first')).toBe('list item, first')
  })

  test('long lines are cut on a word boundary at about 60 characters', async () => {
    const t = titleFromDraft('word '.repeat(40))
    expect(t.length).toBeLessThanOrEqual(60)
    expect(t).toEndWith('word')
  })
})

describe('prefix naming', () => {
  test('a slug segment prefix outranks a title word match', async () => {
    const list = [
      snip({ slug: 'notes-ci', title: 'Release notes', path: '/g/1.md' }),
      snip({ slug: 'generic-ci-policy', title: 'Generic CI policy', path: '/g/2.md' }),
      snip({ slug: 'cleanup', title: 'Code cleanup in CI', path: '/g/3.md' }),
    ]
    expect(rank(list, 'ci').map(s => s.slug)).toEqual(['generic-ci-policy', 'notes-ci', 'cleanup'])
  })
})

describe('row columns', () => {
  test('fit cuts with an ellipsis only when needed', async () => {
    expect(fit('short', 10)).toBe('short')
    expect(fit('abcdefghij', 5)).toBe('abcd\u2026')
  })

  test('title takes what mode, slug and letter leave', async () => {
    const c = rowColumns(70, ['review-diff', 'pr'])
    expect(c.slug).toBe(11)
    expect(c.showMode).toBe(true)
    expect(c.title + c.slug + 6 + 1 + 6 + 1).toBeLessThanOrEqual(70)
    expect(rowColumns(50, ['x']).showMode).toBe(false)
  })
})

describe('cell width', () => {
  test('CJK and emoji take two cells, Vietnamese and combining marks do not widen', async () => {
    expect(cellWidth('abc')).toBe(3)
    expect(cellWidth('Tiếng Việt')).toBe(10)
    expect(cellWidth('e\u0301')).toBe(1)
    expect(cellWidth('\u4e2d\u6587')).toBe(4)
    expect(cellWidth('\u{1f600}')).toBe(2)
  })

  test('fit and padding count cells, not UTF-16 units', async () => {
    expect(fit('\u4e2d\u6587\u6807\u7b7e', 5)).toBe('\u4e2d\u6587\u2026')
    expect(cellWidth(fit('\u4e2d\u6587\u6807\u7b7e', 5))).toBeLessThanOrEqual(5)
    expect(padStartCells('\u4e2d', 4)).toBe('  \u4e2d')
  })

  test('textRows wraps each line by cell width', async () => {
    expect(textRows('abcdef', 3)).toBe(2)
    expect(textRows('ab\ncd', 10)).toBe(2)
    expect(textRows('\u4e2d\u6587\u6807', 4)).toBe(2)
  })
})

describe('wrapped rows', () => {
  test('labels wrap to a new row when the next one with its gap passes the width', async () => {
    expect(wrappedRows([], 40, 2)).toBe(0)
    expect(wrappedRows(['abcd', 'efgh'], 10, 2)).toBe(1)
    expect(wrappedRows(['abcd', 'efgh'], 9, 2)).toBe(2)
    expect(wrappedRows(['abcdefghijkl', 'x'], 10, 2)).toBe(2)
    expect(wrappedRows(['\u4e2d\u6587\u4e2d\u6587', 'ab'], 10, 2)).toBe(2)
    expect(wrappedRows(['a'.repeat(25)], 10, 2)).toBe(3)
  })
})

describe('preview text', () => {
  test('markdown markers are dropped from preview lines', async () => {
    expect(plainLine('**Generic CI policy for new projects**')).toBe('Generic CI policy for new projects')
    expect(plainLine('## Default behavior:')).toBe('Default behavior:')
    expect(plainLine('> use `npm test` first')).toBe('use npm test first')
  })
})

describe('write guard', () => {
  test('only paths strictly inside a snippet root pass', async () => {
    expect(isUnder('/h/.claude/snippets', '/h/.claude/snippets/a.md')).toBe(true)
    expect(isUnder('/h/.claude/snippets/', '/h/.claude/snippets/sub/.trash/a.md')).toBe(true)
    expect(isUnder('/h/.claude/snippets', '/h/.claude/snippets')).toBe(false)
    expect(isUnder('/h/.claude/snippets', '/h/.claude/snippets-evil/a.md')).toBe(false)
    expect(isUnder('/h/.claude/snippets', '/h/.claude/snippets/../settings.json')).toBe(false)
    expect(isUnder(null, '/x/a.md')).toBe(false)
  })
})

describe('v0.2 helpers', () => {
  test('pin: true parses and serializes', async () => {
    const r = parseSnippet('/g/a.md', '---\ntitle: A\npin: true\n---\nbody', 'global')
    expect(r.ok && r.snippet.pinned).toBe(true)
    expect(serializeSnippet({ slug: 'a', title: 'A', desc: '', tags: [], mode: 'fill', body: 'body', pinned: true }, 'a')).toBe('---\ntitle: A\npin: true\n---\nbody\n')
  })

  test('folder helpers keep paths inside the root', async () => {
    expect(cleanFolder(' team/daily/ ')).toBe('team/daily')
    expect(cleanFolder('')).toBe('')
    expect(cleanFolder('../x')).toBeNull()
    expect(cleanFolder('a/.hidden')).toBeNull()
    expect(cleanFolder('a b')).toBeNull()
    expect(folderOf('/r', '/r/a/b/x.md')).toBe('a/b')
    expect(folderOf('/r/', '/r/x.md')).toBe('')
    expect(joinPath('/r', '', 'x.md')).toBe('/r/x.md')
    expect(joinPath('/r', 'a/b', 'x.md')).toBe('/r/a/b/x.md')
  })

  test('trashSlug strips the delete stamp and keeps dots in the slug', async () => {
    expect(trashSlug('multi-line.2026-10-02T10-11-12-123Z.md')).toBe('multi-line')
    expect(trashSlug('v1.2.notes.2026-10-02T10-11-12-123Z.md')).toBe('v1.2.notes')
    expect(trashSlug('plain.md')).toBe('plain')
  })

  test('date and time are built in, never asked, and filled from the clock', async () => {
    expect(placeholdersOf('{{date}} {{time}} {{who}}').map(p => p.name)).toEqual(['who'])
    const clock = clockValues(new Date(2026, 0, 5, 7, 3))
    expect(clock).toEqual({ date: '2026-01-05', time: '07:03' })
    expect(renderBody('On {{date}} at {{time}} for {{who}}', { who: 'me' }, clock).text).toBe('On 2026-01-05 at 07:03 for me')
  })

  test('pinned snippets rank first after the search score, recent sort orders by last use', async () => {
    const list = [snip({ slug: 'a', title: 'A' }), snip({ slug: 'b', title: 'B', pinned: true }), snip({ slug: 'c', title: 'C' })]
    expect(rank(list, '').map(s => s.slug)).toEqual(['b', 'a', 'c'])
    const usage = { a: 5, c: 1 }
    const recent = { a: 10, c: 20 }
    expect(rank(list, '', usage, { recent, by: 'used' }).map(s => s.slug)).toEqual(['b', 'a', 'c'])
    expect(rank(list, '', usage, { recent, by: 'recent' }).map(s => s.slug)).toEqual(['b', 'c', 'a'])
  })
})
