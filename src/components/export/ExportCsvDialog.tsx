import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '~/components/ui/dialog'
import { Button } from '~/components/neraca/Button'
import { buildCsv, type CsvColumn, type CsvFormat } from '~/lib/format/csv'

const STORAGE_KEY = 'nr-csv-format'

export function getSavedCsvFormat(): CsvFormat {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'comma-dot' || saved === 'semicolon-comma') {
      return saved
    }
  } catch {
    // ignore
  }
  return 'semicolon-comma' // Default for Indonesian Excel
}

export function saveCsvFormat(format: CsvFormat) {
  try {
    localStorage.setItem(STORAGE_KEY, format)
  } catch {
    // ignore
  }
}

export function formatExportFilename(route: string, entity: string, preset: string, dateStr?: string) {
  const d = dateStr || new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const safeEntity = (entity || 'all').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 30)
  return `${route}_${safeEntity}_${preset}_${d}.csv`
}

export interface ExportCsvDialogProps<T> {
  open: boolean
  onOpenChange: (open: boolean) => void
  rows: T[]
  columns: CsvColumn<T>[]
  filename: string
}

export function ExportCsvDialog<T>({
  open,
  onOpenChange,
  rows,
  columns,
  filename,
}: ExportCsvDialogProps<T>) {
  const { t } = useTranslation()
  const [format, setFormat] = useState<CsvFormat>(getSavedCsvFormat)

  const handleDownload = () => {
    saveCsvFormat(format)
    const csvContent = buildCsv(rows, columns, format)
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-surface text-ink border-line">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Download className="w-5 h-5 text-forest" />
            {t('export.title', 'Ekspor ke CSV')}
          </DialogTitle>
          <DialogDescription className="text-sm text-ink-muted">
            {t(
              'export.description',
              'Pilih format pemisah yang sesuai dengan perangkat lunak spreadsheet Anda.',
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-3">
          <label
            className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition ${
              format === 'semicolon-comma'
                ? 'border-forest bg-forest/5 shadow-xs'
                : 'border-line hover:border-line-strong hover:bg-canvas/50'
            }`}
          >
            <input
              type="radio"
              name="csvFormat"
              value="semicolon-comma"
              checked={format === 'semicolon-comma'}
              onChange={() => setFormat('semicolon-comma')}
              className="mt-0.5 text-forest focus:ring-forest"
            />
            <div className="space-y-0.5">
              <span className="text-sm font-medium block">
                {t('export.semicolonComma', 'Titik koma (;) + koma desimal')}
              </span>
              <span className="text-xs text-ink-muted block">
                Standar Excel Microsoft di Indonesia & Eropa (1.250,50)
              </span>
            </div>
          </label>

          <label
            className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition ${
              format === 'comma-dot'
                ? 'border-forest bg-forest/5 shadow-xs'
                : 'border-line hover:border-line-strong hover:bg-canvas/50'
            }`}
          >
            <input
              type="radio"
              name="csvFormat"
              value="comma-dot"
              checked={format === 'comma-dot'}
              onChange={() => setFormat('comma-dot')}
              className="mt-0.5 text-forest focus:ring-forest"
            />
            <div className="space-y-0.5">
              <span className="text-sm font-medium block">
                {t('export.commaDot', 'Koma (,) + titik desimal')}
              </span>
              <span className="text-xs text-ink-muted block">
                Standar Internasional & Google Sheets (1,250.50)
              </span>
            </div>
          </label>
        </div>

        <DialogFooter className="flex sm:justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('export.cancel', 'Batal')}
          </Button>
          <Button variant="primary" icon={Download} onClick={handleDownload}>
            {t('export.download', 'Unduh CSV')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ExportCsvButton<T>({
  rows,
  columns,
  filename,
  variant = 'secondary',
  className,
}: {
  rows: T[]
  columns: CsvColumn<T>[]
  filename: string
  variant?: 'primary' | 'secondary' | 'accent' | 'ghost'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()

  return (
    <>
      <Button
        variant={variant}
        icon={Download}
        className={className}
        onClick={() => setOpen(true)}
      >
        {t('metric.exportCsv', 'Ekspor CSV')}
      </Button>

      <ExportCsvDialog
        open={open}
        onOpenChange={setOpen}
        rows={rows}
        columns={columns}
        filename={filename}
      />
    </>
  )
}
