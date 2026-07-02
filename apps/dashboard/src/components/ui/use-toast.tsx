import * as React from 'react'

type ToastVariant = 'default' | 'destructive'

interface Toast {
  id: string
  title?: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

interface ToastContextValue {
  toasts: Toast[]
  toast: (props: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined)

let count = 0
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return String(count)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = React.useCallback(
    (props: Omit<Toast, 'id'>) => {
      const id = genId()
      const duration = props.duration ?? 3000

      setToasts((prev) => [...prev, { id, ...props }])

      if (duration > 0) {
        setTimeout(() => dismiss(id), duration)
      }
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`
              rounded-lg border p-4 shadow-lg backdrop-blur-sm
              animate-in slide-in-from-right-5 fade-in
              ${t.variant === 'destructive'
                ? 'bg-destructive/95 text-destructive-foreground border-destructive'
                : 'bg-background/95 text-foreground border-border'
              }
            `}
          >
            {t.title && <div className="font-medium text-sm">{t.title}</div>}
            {t.description && (
              <div className="text-sm opacity-90 mt-1">{t.description}</div>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) {
    return {
      toast: (props: Omit<Toast, 'id'>) => {
        console.log('[toast]', props)
      },
      dismiss: () => {},
      toasts: [],
    }
  }
  return ctx
}
