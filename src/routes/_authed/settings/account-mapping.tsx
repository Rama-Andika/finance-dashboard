import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Notice } from '~/components/neraca/Notice'
import { Button } from '~/components/neraca/Button'
import { Tabs } from '~/components/neraca/Tabs'
import { CoaTreePicker } from '~/components/settings/CoaTreePicker'
import { BasketPreview } from '~/components/settings/BasketPreview'
import { MappingValidationNotices } from '~/components/settings/MappingValidationNotices'
import { useAccountMappingEditor } from '~/components/settings/useAccountMappingEditor'
import type { BasketKey } from '~/lib/core/types'

export const Route = createFileRoute('/_authed/settings/account-mapping')({
  component: AccountMappingPage,
})

const BASKET_TABS: Array<{ id: BasketKey; labelKey: string }> = [
  { id: 'cash', labelKey: 'settings.baskets.cash' },
  { id: 'bank', labelKey: 'settings.baskets.bank' },
  { id: 'deposit', labelKey: 'settings.baskets.deposit' },
  { id: 'inTransit', labelKey: 'settings.baskets.inTransit' },
  { id: 'fixedCost', labelKey: 'settings.baskets.fixedCost' },
]

function AccountMappingPage() {
  const { t } = useTranslation()
  const editor = useAccountMappingEditor(Route.useSearch())
  const { tree } = editor

  if (editor.isLoading || !tree) {
    return (
      <div className="space-y-4">
        <div className="py-12 text-center text-sm text-ink-muted">{t('common.loading')}</div>
      </div>
    )
  }

  const tabsConfig = BASKET_TABS.map((tab) => ({
    id: tab.id,
    label: t(tab.labelKey),
  }))

  return (
    <div className="space-y-6">
      {/* Page Description */}
      <p className="text-sm text-ink-muted">{t('settings.description')}</p>

      {/* Default or Corrupted Notices */}
      {editor.isDefault && <Notice tone="warning" title={t('settings.isDefaultNotice')} />}
      {editor.corrupted && <Notice tone="danger" title={t('settings.corruptedNotice')} />}

      {/* Tabs */}
      <Tabs
        tabs={tabsConfig}
        value={editor.activeBasket}
        onChange={(id) => editor.setActiveBasket(id as BasketKey)}
      />

      {/* Two Column Layout: CoaTreePicker + BasketPreview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7">
          <CoaTreePicker tree={tree} include={editor.activeInclude} onToggle={editor.toggle} />
        </div>

        <div className="lg:col-span-5">
          <BasketPreview tree={tree} accountIds={editor.activeResolvedIds} />
        </div>
      </div>

      <MappingValidationNotices validation={editor.validation} tree={tree} saveSuccess={editor.saveSuccess} />

      {/* Actions Footer */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        <Button
          type="button"
          variant="primary"
          disabled={editor.isSaving || editor.validation.blocking.length > 0}
          onClick={editor.save}
        >
          {editor.isSaving ? t('settings.saving') : t('settings.save')}
        </Button>
      </div>
    </div>
  )
}
