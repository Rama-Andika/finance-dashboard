import type { ReactNode } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip'
import { cn } from '~/lib/cn'

export interface FigureTooltipProps {
  full: string
  children: ReactNode
  className?: string
}

export function FigureTooltip({ full, children, className }: FigureTooltipProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild className={className}>
          {children}
        </TooltipTrigger>
        <TooltipContent
          sideOffset={8}
          className={cn(
            'nr-tooltip text-ink bg-surface border border-line shadow-pop rounded-sm px-2.5 py-2 font-normal',
          )}
        >
          <span className="nr-tooltip-row">
            <b className="nr-num font-semibold">{full}</b>
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
