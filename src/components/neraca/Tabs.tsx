import { cn } from '~/lib/cn'

export interface TabItem<Id extends string = string> {
  id: Id
  label: string
}

export interface TabsProps<Id extends string = string> {
  tabs: TabItem<Id>[]
  value: Id
  onChange: (id: Id) => void
  className?: string
}

export function Tabs<Id extends string = string>({ tabs, value, onChange, className }: TabsProps<Id>) {
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
