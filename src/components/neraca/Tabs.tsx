import { cn } from '~/lib/cn'

export interface TabItem {
  id: string
  label: string
}

export interface TabsProps {
  tabs: TabItem[]
  value: string
  onChange: (id: string) => void
  className?: string
}

export function Tabs({ tabs, value, onChange, className }: TabsProps) {
  return (
    <div className={cn('nr-tabs', className)} role="tablist">
      {tabs.map((tab) => {
        const isSelected = tab.id === value
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onChange(tab.id)}
            className="nr-tab"
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
