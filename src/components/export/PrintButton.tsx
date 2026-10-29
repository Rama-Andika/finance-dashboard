import React from 'react'
import { Printer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '~/components/neraca/Button'

export interface PrintButtonProps {
  className?: string
  variant?: 'primary' | 'secondary' | 'accent' | 'ghost'
  children?: React.ReactNode
}

export function PrintButton({
  className = '',
  variant = 'secondary',
  children,
}: PrintButtonProps) {
  const { t } = useTranslation()

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  return (
    <Button
      variant={variant}
      icon={Printer}
      onClick={handlePrint}
      className={`no-print ${className}`}
    >
      {children || t('metric.print', 'Cetak')}
    </Button>
  )
}
