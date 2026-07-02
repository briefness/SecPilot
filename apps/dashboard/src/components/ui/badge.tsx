import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-ring',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground border-border',
        critical:
          'border-risk-critical/30 bg-risk-critical/10 text-risk-critical',
        high:
          'border-risk-high/30 bg-risk-high/10 text-risk-high',
        medium:
          'border-risk-medium/30 bg-risk-medium/10 text-risk-medium',
        low:
          'border-risk-low/30 bg-risk-low/10 text-risk-low',
        info:
          'border-risk-info/30 bg-risk-info/10 text-risk-info',
        success:
          'border-risk-low/30 bg-risk-low/10 text-risk-low',
        warning:
          'border-risk-medium/30 bg-risk-medium/10 text-risk-medium',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
