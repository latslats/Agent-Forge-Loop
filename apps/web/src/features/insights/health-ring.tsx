import { useAgentHealth } from '../../api/insights.ts'
import { Tooltip } from '../../components/ui/tooltip.tsx'
import { healthBand } from './insight-format.ts'

const RADIUS = 7
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** The agent's overall health as a small ring. Nothing shows until the agent has finished runs. */
export function HealthRing({ agentId }: { agentId: string }) {
  const { data } = useAgentHealth(agentId)
  if (!data) return null
  const band = healthBand(data.overall)
  const filled = (data.overall / 100) * CIRCUMFERENCE
  return (
    <Tooltip
      content={`Adherence ${data.adherence} · Autonomy ${data.autonomy} · Efficiency ${data.efficiency}`}
    >
      <button
        type="button"
        aria-label={`Health ${data.overall} of 100, ${band.label}`}
        className="inline-flex items-center gap-1.5 rounded-control font-medium text-ink"
      >
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" className="-rotate-90">
          <circle cx="10" cy="10" r={RADIUS} fill="none" strokeWidth="3" className="stroke-line" />
          <circle
            cx="10"
            cy="10"
            r={RADIUS}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
            className={band.stroke}
          />
        </svg>
        Health {data.overall}
      </button>
    </Tooltip>
  )
}
