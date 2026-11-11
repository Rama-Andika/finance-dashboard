import { queryOptions } from '@tanstack/react-query'
import { getCompanyInfoFn } from '~/functions/company.fn'
import { qk } from '~/queries/keys'

/** The company name hardly ever changes, so one answer is reused for ten minutes. */
const COMPANY_INFO_STALE_MS = 10 * 60_000

export const companyInfoOptions = () =>
  queryOptions({
    queryKey: qk.companyInfo(),
    queryFn: () => getCompanyInfoFn(),
    staleTime: COMPANY_INFO_STALE_MS,
  })
