import type { NodeType } from '@agentforgeloop/shared'
import {
  Braces,
  Flag,
  GitBranch,
  type LucideIcon,
  Play,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react'

/** The MIME type a palette item sets when dragged onto the canvas. */
export const NODE_DRAG_TYPE = 'application/agentforgeloop-node'

export type NodeInfo = {
  label: string
  hint: string
  icon: LucideIcon
  /** Tailwind class for the coloured rail on the node card. */
  rail: string
}

export const NODE_INFO: Record<NodeType, NodeInfo> = {
  trigger: {
    label: 'Trigger',
    hint: 'Starts a run: manual, schedule or webhook.',
    icon: Play,
    rail: 'bg-active',
  },
  ai: {
    label: 'AI step',
    hint: 'Prompts a model, with optional tools.',
    icon: Sparkles,
    rail: 'bg-accent',
  },
  code: {
    label: 'Code step',
    hint: 'Reshapes data with a short JavaScript snippet.',
    icon: Braces,
    rail: 'bg-graphite',
  },
  check: {
    label: 'Check',
    hint: 'Tests the input or output against a rule.',
    icon: ShieldCheck,
    rail: 'bg-paused',
  },
  approval: {
    label: 'Approval',
    hint: 'Pauses the run until a person approves.',
    icon: UserCheck,
    rail: 'bg-paused',
  },
  branch: {
    label: 'Branch',
    hint: 'Picks the next step with a condition.',
    icon: GitBranch,
    rail: 'bg-graphite',
  },
  output: {
    label: 'Output',
    hint: 'Returns the final result of the run.',
    icon: Flag,
    rail: 'bg-active',
  },
}
