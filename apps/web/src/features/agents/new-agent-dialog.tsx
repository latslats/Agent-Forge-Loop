import { useState } from 'react'
import { Dialog } from '../../components/ui/dialog.tsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs.tsx'
import { BlankAgentForm } from './blank-agent-form.tsx'
import { DescribeAgentForm } from './describe-agent-form.tsx'
import { TemplateAgentList } from './template-agent-list.tsx'

type Tab = 'describe' | 'blank' | 'template'

export function NewAgentDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New agent"
      description="Describe it, start blank, or start from a template."
    >
      {/* The tabs live inside the dialog content, so their state resets each time it opens. */}
      <NewAgentTabs onDone={() => onOpenChange(false)} />
    </Dialog>
  )
}

function NewAgentTabs({ onDone }: { onDone: () => void }) {
  const [tab, setTab] = useState<Tab>('describe')
  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
      <TabsList>
        <TabsTrigger value="describe">Describe</TabsTrigger>
        <TabsTrigger value="blank">Blank</TabsTrigger>
        <TabsTrigger value="template">Template</TabsTrigger>
      </TabsList>
      <TabsContent value="describe" className="pt-4">
        <DescribeAgentForm onDone={onDone} />
      </TabsContent>
      <TabsContent value="blank" className="pt-4">
        <BlankAgentForm onDone={onDone} />
      </TabsContent>
      <TabsContent value="template" className="pt-4">
        <TemplateAgentList onDone={onDone} />
      </TabsContent>
    </Tabs>
  )
}
