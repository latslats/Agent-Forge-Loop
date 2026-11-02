import { useCallback, useEffect, useRef } from 'react'

/**
 * Returns a function that calls `save` with the latest value once `delayMs` pass without
 * another call. A pending value is saved on unmount, so the last edit is never dropped.
 */
export function useDebouncedSave<T>(save: (value: T) => void, delayMs: number) {
  const saveRef = useRef(save)
  const pending = useRef<{ value: T } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    saveRef.current = save
  })

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const current = pending.current
    pending.current = null
    if (current) saveRef.current(current.value)
  }, [])

  useEffect(() => flush, [flush])

  return useCallback(
    (value: T) => {
      pending.current = { value }
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, delayMs)
    },
    [delayMs, flush],
  )
}
