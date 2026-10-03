export type SnippetSource = 'global' | 'project'

export type SnippetMode = 'fill' | 'submit'

export type Snippet = {
  slug: string
  title: string
  desc: string
  tags: string[]
  mode: SnippetMode
  body: string
  path: string
  source: SnippetSource
  mtimeMs: number
  pinned: boolean
}

export type LoadError = { path: string; reason: string }

export type Usage = Record<string, number>

export type PendingCursor = { text: string; cursor: number; at: number }

export type Library = {
  snippets: Snippet[]
  all: Snippet[]
  errors: LoadError[]
  duplicates: string[]
  roots: { global: string; project: string | null }
  loadedAt: number
  fingerprint: string
}

export type View =
  | { screen: 'list' }
  | { screen: 'detail'; path: string }
  | { screen: 'fill'; path: string; mode: SnippetMode }
  | { screen: 'form'; op: FormOp; path: string | null; fromDraft?: boolean }
  | { screen: 'delete'; path: string; back: 'list' | 'detail' }
  | { screen: 'move'; path: string }
  | { screen: 'trash' }

export type FormOp = 'new' | 'edit' | 'duplicate'

export type Draft = {
  title: string
  slug: string
  desc: string
  tags: string
  mode: SnippetMode
  source: SnippetSource
  body: string
  pinned: boolean
}

export type SortBy = 'used' | 'recent'

export type MoveTarget = { source: SnippetSource; folder: string }

export type TrashItem = { path: string; source: SnippetSource; slug: string; title: string; mtimeMs: number }

export type Filter = { source: 'all' | SnippetSource; tag: string }

export type HeldDraft = { text: string; cursor: number }

export type BodyEdit = { slug: string; title: string; path: string }

declare module 'claude-code' {
  interface PluginState {
    'cyberine-snippets': {
      library: Library
      usage: Usage
      query: string
      filter: Filter
      page: number
      pageSize: number
      pinOrder: string[]
      focused: string | null
      view: View
      values: Record<string, string>
      draft: Draft | null
      formError: string
      pendingCursor: PendingCursor | null
      bodyEdit: BodyEdit | null
      held: HeldDraft | null
      stale: boolean
      notice: string
      recent: Usage
      sort: SortBy
      move: MoveTarget | null
      trash: TrashItem[]
    }
  }
}
