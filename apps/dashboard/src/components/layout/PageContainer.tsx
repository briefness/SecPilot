import { cn } from '@/lib/utils'

interface PageContainerProps {
  title?: string
  description?: string
  children: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

export default function PageContainer({
  title,
  description,
  children,
  actions,
  className,
}: PageContainerProps) {
  return (
    <div className={cn('space-y-6 animate-fade-in', className)}>
      {title && (
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            {description && (
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
