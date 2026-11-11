import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { getCompanyInfo, type CompanyInfo } from '~/server/services/company.service'

export type { CompanyInfo }

/** The company name of the ERP database, for the sidebar and the browser tab title. Signed-in users only. */
export const getCompanyInfoFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async (): Promise<CompanyInfo> => getCompanyInfo())
