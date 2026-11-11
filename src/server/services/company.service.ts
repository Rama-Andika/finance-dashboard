import '@tanstack/react-start/server-only'
import { companyDisplayName } from '~/lib/core/company-name'
import { memo } from '~/server/cache'
import { readCompanyNameRaw } from '~/server/repo/master-data/company.repo'

const TEN_MINUTES = 10 * 60 * 1000

/** What the screen needs to know about the company of this ERP database. */
export type CompanyInfo = { name: string | null }

/** The company name for the sidebar and the browser tab title; read at most once per ten minutes. */
export function getCompanyInfo(): Promise<CompanyInfo> {
  return memo('company:name', TEN_MINUTES, async () => ({ name: companyDisplayName(await readCompanyNameRaw()) }))
}
