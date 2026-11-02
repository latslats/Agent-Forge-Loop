import { type InsightsModelRow, MODEL_LABELS, ModelId } from '@agentforgeloop/shared'
import { Card } from '../../components/ui/card.tsx'
import { money } from '../../lib/format.ts'

const modelLabel = (model: string): string => {
  const parsed = ModelId.safeParse(model)
  return parsed.success ? MODEL_LABELS[parsed.data] : model
}

export function ModelTable({ rows }: { rows: InsightsModelRow[] }) {
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold">Models</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No model calls in this window yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th scope="col" className="pb-2 font-medium">
                Model
              </th>
              <th scope="col" className="pb-2 pl-3 text-right font-medium">
                Calls
              </th>
              <th scope="col" className="pb-2 pl-3 text-right font-medium">
                Spend
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((row) => (
              <tr key={row.model} className="border-b border-line last:border-0">
                <td className="py-2 pr-3">
                  <p className="font-medium">{modelLabel(row.model)}</p>
                  <p className="font-mono text-xs text-muted">{row.model}</p>
                </td>
                <td className="py-2 pl-3 text-right">{row.calls}</td>
                <td className="py-2 pl-3 text-right">{money(row.spendUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}
