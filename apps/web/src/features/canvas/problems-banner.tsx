import { X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/button.tsx'

/** Lists what blocks saving. Dismissed until the list changes. */
export function ProblemsBanner({ problems }: { problems: string[] }) {
  const [dismissed, setDismissed] = useState<string | null>(null)
  const unique = [...new Set(problems)]
  const key = unique.join('\n')
  if (unique.length === 0 || dismissed === key) return null
  const count = unique.length
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-control border border-danger/40 bg-panel px-3 py-2.5 text-sm"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-danger">
          Fix {count} {count === 1 ? 'problem' : 'problems'} to save
        </p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">
          {unique.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      </div>
      <Button variant="ghost" size="sm" aria-label="Dismiss" onClick={() => setDismissed(key)}>
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  )
}
