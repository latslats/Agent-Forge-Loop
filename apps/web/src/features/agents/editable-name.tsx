import { useEffect, useRef, useState } from 'react'

/**
 * Click the name to edit it. Blur or Enter saves and Escape cancels. An empty or unchanged name
 * is ignored.
 */
export function EditableName({
  name,
  onRename,
}: {
  name: string
  onRename: (name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  // Escape sets this, then blurs. commit runs inside that blur, before React re-renders,
  // so a state flag would not be visible to it yet.
  const cancelled = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const start = () => {
    cancelled.current = false
    setDraft(name)
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (!cancelled.current && next && next !== name) onRename(next)
  }

  if (!editing) {
    return (
      <h1>
        <button
          type="button"
          onClick={start}
          title={`${name} (click to rename)`}
          className="-mx-1 block max-w-full truncate rounded-control px-1 text-left text-xl leading-tight font-semibold tracking-tight hover:bg-sunken"
        >
          {name}
        </button>
      </h1>
    )
  }

  return (
    <input
      ref={inputRef}
      aria-label="Agent name"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          cancelled.current = true
          event.currentTarget.blur()
        }
      }}
      className="h-9 w-full min-w-0 rounded-control border border-graphite bg-panel px-2 text-xl font-semibold tracking-tight text-ink focus:border-accent"
    />
  )
}
