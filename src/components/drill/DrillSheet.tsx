import { translateCfLabel } from '~/lib/finance/cash/cashflow-labels'
import { useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Sheet, SheetContent, SheetTitle } from '~/components/ui/sheet'
import { useDrillData, parseDrill, type DrillSearchParams } from './useDrillData'
import { useDrillNavigation } from './useDrillNavigation'
import { DrillBody, DrillSheetHeader, useRestoreFocus } from './DrillSheetParts'
import { useLang } from '~/components/layout/use-lang'

export function DrillSheet() {
  const search = useSearch({ strict: false }) as DrillSearchParams
  const { t } = useTranslation()
  const lang = useLang()

  const drill = parseDrill(search.drill)
  const isOpen = Boolean(drill && drill.metric && drill.steps.length)

  useRestoreFocus(isOpen)
  const { data, allRows, hasMore, loadMore, isLoading, isFetching, error, refetch } = useDrillData(search, drill, isOpen)
  const nav = useDrillNavigation(drill, data?.nextKind)

  if (!isOpen || !drill) return null

  const metricRootTitle = t(`drill.metric.${drill.metric}`, { defaultValue: drill.metric })
  const title = data ? t(data.titleKey, { label: translateCfLabel(t, data.titleLabel) }) : metricRootTitle

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && nav.close()}>
      <SheetContent
        side="right"
        data-drill-sheet
        showCloseButton={false}
        className="w-full sm:max-w-2xl md:max-w-3xl p-0 flex flex-col gap-0 border-l border-line bg-surface overflow-hidden"
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>

        <DrillSheetHeader
          title={title}
          rootTitle={metricRootTitle}
          steps={drill.steps}
          onBack={nav.back}
          onClose={nav.close}
          onGoToSteps={nav.goToSteps}
        />

        <div className="nr-sheet-body">
          <DrillBody
            data={data}
            allRows={allRows}
            isLoading={isLoading}
            isFetching={isFetching}
            error={error}
            hasMore={hasMore}
            lang={lang}
            onRetry={() => void refetch()}
            onLoadMore={loadMore}
            onRowClick={nav.drillInto}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
