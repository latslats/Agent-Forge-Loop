export function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="mt-1 max-h-72 overflow-auto rounded-control bg-sunken p-2 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}
