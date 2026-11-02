import type { TriggerView } from '@agentforgeloop/shared'
import { Copy } from 'lucide-react'
import { Button } from '../../components/ui/button.tsx'
import { useToast } from '../../components/ui/toast.tsx'

// Shown once a webhook is created: the full URL to copy, and a curl call that uses it.
export function WebhookDetails({ trigger, onDone }: { trigger: TriggerView; onDone: () => void }) {
  const toast = useToast()
  const url = `${window.location.origin}${trigger.webhookUrl ?? ''}`
  const curl = `curl -X POST "${url}" -H "Content-Type: application/json" -d '{"input": "hello"}'`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast('URL copied')
    } catch {
      toast('Could not copy. Select the URL and copy it.')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Send a POST to this URL to start a run. Anyone with the URL can start it, so keep it
        private.
      </p>
      <div className="flex items-start gap-2">
        <code className="min-w-0 flex-1 rounded-control bg-sunken px-3 py-2 font-mono text-xs break-all">
          {url}
        </code>
        <Button variant="secondary" onClick={copy}>
          <Copy className="size-4" aria-hidden="true" />
          Copy
        </Button>
      </div>
      <div className="space-y-1.5">
        <span className="block text-xs font-medium text-muted">Example</span>
        <pre className="rounded-control bg-sunken px-3 py-2.5 font-mono text-xs break-all whitespace-pre-wrap">
          {curl}
        </pre>
        <p className="text-xs text-muted">
          The JSON body is the run input. If it has an input key, only that value is used.
        </p>
      </div>
      <div className="flex justify-end pt-1">
        <Button variant="primary" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  )
}
