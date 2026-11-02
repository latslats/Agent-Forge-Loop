import {
  ApprovalRequestedPayload,
  ApprovalResolvedPayload,
  CheckResultPayload,
  ErrorPayload,
  LogPayload,
  ModelCallPayload,
  NodeEndPayload,
  RunEndPayload,
  type RunEvent,
  ToolCallPayload,
  ToolResultPayload,
} from '@agentforgeloop/shared'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { compactNumber, money } from '../../lib/format.ts'
import { JsonBlock } from './json-block.tsx'
import { durationLabel, modelLabel } from './run-format.ts'

type Described = { title: string; detail?: string; danger?: boolean }

/** One line per event, read from its payload. A payload that does not match shows the kind only. */
export function describeEvent(event: RunEvent, labels: ReadonlyMap<string, string>): Described {
  const node = event.nodeId ? (labels.get(event.nodeId) ?? event.nodeId) : null
  switch (event.kind) {
    case 'run_start':
      return { title: 'Run started' }
    case 'node_start':
      return { title: `Started ${node ?? 'step'}` }
    case 'node_end': {
      const payload = NodeEndPayload.safeParse(event.payload)
      if (!payload.success) return { title: node ?? 'Step ended' }
      const status = payload.data.status === 'ok' ? '' : ` · ${payload.data.status}`
      return {
        title: node ?? 'Step ended',
        detail: `${durationLabel(payload.data.durationMs)}${status}`,
        danger: payload.data.status === 'failed',
      }
    }
    case 'model_call': {
      const payload = ModelCallPayload.safeParse(event.payload)
      if (!payload.success) return { title: 'Model call' }
      const { model, inputTokens, outputTokens, costUsd } = payload.data
      return {
        title: `${modelLabel(model)} · ${compactNumber(inputTokens)} → ${compactNumber(outputTokens)} tokens · ${money(costUsd)}`,
      }
    }
    case 'tool_call': {
      const payload = ToolCallPayload.safeParse(event.payload)
      return { title: `Tool call · ${payload.success ? payload.data.tool : 'unknown tool'}` }
    }
    case 'tool_result': {
      const payload = ToolResultPayload.safeParse(event.payload)
      if (!payload.success) return { title: 'Tool result' }
      return {
        title: `Tool result · ${payload.data.tool}`,
        detail: durationLabel(payload.data.durationMs),
        danger: payload.data.isError,
      }
    }
    case 'check_result': {
      const payload = CheckResultPayload.safeParse(event.payload)
      if (!payload.success) return { title: 'Check' }
      return {
        title: `${payload.data.pass ? 'Check passed' : 'Check failed'} · ${payload.data.kind}`,
        detail: payload.data.reason,
        danger: !payload.data.pass,
      }
    }
    case 'approval_requested': {
      const payload = ApprovalRequestedPayload.safeParse(event.payload)
      return {
        title: 'Approval requested',
        detail: payload.success ? payload.data.message : undefined,
      }
    }
    case 'approval_resolved': {
      const payload = ApprovalResolvedPayload.safeParse(event.payload)
      return { title: payload.success ? `Approval ${payload.data.status}` : 'Approval resolved' }
    }
    case 'log': {
      const payload = LogPayload.safeParse(event.payload)
      return { title: payload.success ? payload.data.message : 'Log' }
    }
    case 'error': {
      const payload = ErrorPayload.safeParse(event.payload)
      return { title: payload.success ? payload.data.message : 'Error', danger: true }
    }
    case 'run_end': {
      const payload = RunEndPayload.safeParse(event.payload)
      if (!payload.success) return { title: 'Run ended' }
      return {
        title: `Run ${payload.data.status}`,
        detail: `${money(payload.data.costUsd)} · ${durationLabel(payload.data.durationMs)}`,
        danger: payload.data.status === 'failed',
      }
    }
    default:
      return { title: event.kind }
  }
}

/** The message of each approval_requested event, keyed by approval id. */
export function approvalMessages(events: RunEvent[]): Map<string, string> {
  const messages = new Map<string, string>()
  for (const event of events) {
    const payload = ApprovalRequestedPayload.safeParse(event.payload)
    if (event.kind === 'approval_requested' && payload.success) {
      messages.set(payload.data.approvalId, payload.data.message)
    }
  }
  return messages
}

/** Ids of approvals that already have an approval_resolved event. */
export function resolvedApprovalIds(events: RunEvent[]): Set<string> {
  const ids = new Set<string>()
  for (const event of events) {
    const payload = ApprovalResolvedPayload.safeParse(event.payload)
    if (event.kind === 'approval_resolved' && payload.success) ids.add(payload.data.approvalId)
  }
  return ids
}

/** One feed row. `children` renders under the row, for an approval's buttons. */
export function EventRow({
  event,
  labels,
  showRaw = false,
  children,
}: {
  event: RunEvent
  labels: ReadonlyMap<string, string>
  showRaw?: boolean
  children?: ReactNode
}) {
  const { title, detail, danger } = describeEvent(event, labels)
  return (
    <li className="rounded-control px-2 py-1.5 hover:bg-sunken">
      <p className={cn('text-sm break-words', danger && 'text-danger')}>{title}</p>
      {detail && <p className="text-xs break-words text-muted">{detail}</p>}
      {children}
      {showRaw && (
        <details className="mt-1 text-xs">
          <summary className="cursor-pointer text-muted">Payload</summary>
          <JsonBlock value={event.payload} />
        </details>
      )}
    </li>
  )
}
