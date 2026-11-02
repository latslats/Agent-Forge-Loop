import { Ellipsis, Trash } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { Button } from '../../components/ui/button.tsx'

export function AgentMenu({ onDelete }: { onDelete: () => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" aria-label="More actions" className="px-2">
          <Ellipsis className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-40 rounded-control border border-line bg-panel p-1 shadow-lg"
        >
          <DropdownMenu.Item
            onSelect={onDelete}
            className="flex h-8 cursor-default items-center gap-2 rounded-control px-2 text-sm text-danger outline-none data-[highlighted]:bg-sunken"
          >
            <Trash className="size-4" aria-hidden="true" />
            Delete agent
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
