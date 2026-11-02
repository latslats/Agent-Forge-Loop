import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import type { Extension } from '@codemirror/state'
import CodeMirror from '@uiw/react-codemirror'
import { useMemo } from 'react'

type Language = 'markdown' | 'json' | 'javascript'

const LANGUAGES: Record<Language, () => Extension> = { markdown, json, javascript }

/** A compact CodeMirror editor that takes its colours from our theme tokens. */
export function CodeEditor({
  id,
  value,
  onChange,
  language,
  height,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  language: Language
  height: string
}) {
  const extensions = useMemo(() => [LANGUAGES[language]()], [language])
  return (
    <div className="canvas-code overflow-hidden rounded-control border border-graphite transition-colors duration-150 focus-within:border-accent">
      <CodeMirror
        id={id}
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme="none"
        height={height}
        basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
      />
    </div>
  )
}
