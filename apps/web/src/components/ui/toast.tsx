import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react'

type ShowToast = (text: string) => void
type ToastItem = { id: number; text: string }

const ToastContext = createContext<ShowToast | null>(null)
const TOAST_MS = 3500

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const show = useCallback<ShowToast>((text) => {
    nextId.current += 1
    const id = nextId.current
    setItems((current) => [...current, { id, text }])
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id))
    }, TOAST_MS)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col items-end gap-2"
      >
        {items.map((item) => (
          <p
            key={item.id}
            className="rounded-control border border-line bg-panel px-3 py-2 text-sm shadow-lg"
          >
            {item.text}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ShowToast {
  const show = useContext(ToastContext)
  if (!show) throw new Error('useToast must be used inside ToastProvider')
  return show
}
