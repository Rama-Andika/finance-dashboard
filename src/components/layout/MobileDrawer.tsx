import { useTranslation } from 'react-i18next'
import { Sheet, SheetContent, SheetTitle } from '~/components/ui/sheet'
import { SidebarNav } from '~/components/neraca/SidebarNav'

export interface MobileDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MobileDrawer({ open, onOpenChange }: MobileDrawerProps) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="p-0 w-64 border-r border-line bg-surface">
        <SheetTitle className="sr-only">{t('ui.shell.mainMenu')}</SheetTitle>
        <SidebarNav onNavigate={() => onOpenChange(false)} className="border-0 rounded-none h-full" />
      </SheetContent>
    </Sheet>
  )
}
