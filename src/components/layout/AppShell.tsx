import { useState, type ReactNode } from 'react'
import { useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { SidebarNav } from '~/components/neraca/SidebarNav'
import { TopBar } from '~/components/neraca/TopBar'
import { MobileDrawer } from '~/components/layout/MobileDrawer'
import { DrillSheet } from '~/components/drill/DrillSheet'
import { DataChecksPanel } from '~/components/data-checks/DataChecksPanel'
import { dataChecksOptions } from '~/queries/data-checks.queries'

export interface AppShellProps {
  children: ReactNode
  user?: { userId: string; name: string } | null
}

export function AppShell({ children, user }: AppShellProps) {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [dataChecksOpen, setDataChecksOpen] = useState(false)

  const search = useSearch({ strict: false }) as any
  const queryInput = {
    entity: (search?.entity ?? 'all') as string,
    preset: (search?.preset ?? 'this-month') as any,
    p13: Boolean(search?.p13),
  }

  const { data: checks } = useQuery({
    ...dataChecksOptions(queryInput),
    enabled: Boolean(user),
  })

  return (
    <div className="min-h-screen bg-canvas text-ink flex">
      {/* Desktop & Tablet Sidebar */}
      <aside className="hidden md:flex flex-none flex-col p-4 pr-0 sticky top-0 h-screen w-16 lg:w-(--sidebar-width) transition-all">
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
