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
}

export type View =
  | { screen: 'list' }
  | { screen: 'detail'; path: string }
  | { screen: 'fill'; path: string; mode: SnippetMode }
  | { screen: 'form'; op: FormOp; path: string | null; fromDraft?: boolean }
  | { screen: 'delete'; path: string }

export type FormOp = 'new' | 'edit' | 'duplicate'

export type Draft = {
  title: string
  slug: string
  desc: string
  tags: string
  mode: SnippetMode
  source: SnippetSource
  body: string
}

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
      focused: string | null
      view: View
      values: Record<string, string>
      draft: Draft | null
      formError: string
      pendingCursor: PendingCursor | null
      bodyEdit: BodyEdit | null
      held: HeldDraft | null
    }
  }
}
