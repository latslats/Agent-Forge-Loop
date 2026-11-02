export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-2.5 text-sm text-muted">
      <span
        aria-hidden="true"
        className="size-4 rounded-full border-2 border-line border-t-accent motion-safe:animate-spin"
      />
      {label}
    </div>
  )
}
