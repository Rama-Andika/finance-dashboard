import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SidebarNav } from '~/components/neraca/SidebarNav'
import { TopBar } from '~/components/neraca/TopBar'
import { MobileDrawer } from '~/components/layout/MobileDrawer'
import { DrillSheet } from '~/components/drill/DrillSheet'
import { DataChecksPanel } from '~/components/data-checks/DataChecksPanel'
import { useGlobalMetricInput } from '~/components/layout/useGlobalMetricInput'
import { dataChecksOptions } from '~/queries/data-checks.queries'

export interface AppShellProps {
  children: ReactNode
  user?: { userId: string; name: string } | null
}

export function AppShell({ children, user }: AppShellProps) {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [dataChecksOpen, setDataChecksOpen] = useState(false)

  const queryInput = useGlobalMetricInput()

  // The Data Checks run several heavy metrics, so they are only loaded once the panel is opened.
  const { data: checks } = useQuery({
    ...dataChecksOptions(queryInput),
    enabled: Boolean(user) && dataChecksOpen,
  })

  return (
    <div className="min-h-screen bg-canvas text-ink flex">
      {/* Desktop & Tablet Sidebar */}
      <aside className="hidden md:flex flex-none flex-col p-4 md:p-6 md:pr-0 sticky top-0 h-screen transition-all">
        <SidebarNav isTabletCollapsed />
      </aside>

      {/* Mobile Drawer */}
      <MobileDrawer
        open={mobileDrawerOpen}
        onOpenChange={setMobileDrawerOpen}
      />

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col p-4 md:p-6 max-w-(--content-max) mx-auto gap-4 md:gap-6">
        <TopBar
          user={user}
          onOpenMobileMenu={() => setMobileDrawerOpen(true)}
          onOpenDataChecks={() => setDataChecksOpen(true)}
          dataChecksCount={checks?.length ?? 0}
        />
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>

      {/* Global Drill-Down Sheet */}
      <DrillSheet />

      {/* Data Checks Side Sheet */}
      <DataChecksPanel
        open={dataChecksOpen}
        onOpenChange={setDataChecksOpen}
      />
    </div>
  )
}
