import { defineConfig } from 'drizzle-kit'

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile('.env')
  } catch {
    /* continue to the check below */
  }
}
const url = process.env.DATABASE_URL ?? ''
const host = (() => {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
})()
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  throw new Error('drizzle-kit may only run against a LOCAL database (localhost/127.0.0.1).')
}

export default defineConfig({
  dialect: 'mysql',
  out: './drizzle',
  dbCredentials: { url },
  tablesFilter: [
    'company',
    'pos_location',
    'segment',
    'segment_detail',
    'periode',
    'coa',
    'coa_opening_balance_location',
    'gl',
    'gl_detail',
    'ap_ar_card',
    'ap_ar_card_detail',
    'bank_payment',
    'bank_payment_history',
    'bankpo_payment',
    'bankpo_payment_detail',
    'vendor',
    'customer',
    'cash_flow_group',
    'cash_flow_setup',
    'coa_budget',
    'balance_gl',
    'system_main',
    'sysuser',
  ],
})
