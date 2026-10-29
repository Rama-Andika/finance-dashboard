import { z } from 'zod'

export const PRESETS = ['this-month', 'last-month', 'this-quarter', 'ytd', 'last-12m'] as const // F3
export const HORIZONS = ['7', '14', '30'] as const // F4
export type Preset = (typeof PRESETS)[number]
export type Horizon = (typeof HORIZONS)[number]

export const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export const globalSearchSchema = z.object({
  entity: z.string().regex(/^[A-Za-z0-9_.~,-]{1,4000}$/).catch('all'), // 'all' or a comma-separated list of location ids (F1)
  preset: z.enum(PRESETS).catch('this-month'),
  p13: z.boolean().catch(false), // "Include period 13" toggle
  // Explicit month range ('YYYY-MM'); when both are set they replace `preset`.
  from: z.string().regex(MONTH_KEY_RE).optional().catch(undefined),
  to: z.string().regex(MONTH_KEY_RE).optional().catch(undefined),
})
export type GlobalSearch = z.infer<typeof globalSearchSchema>

export const metricInputSchema = globalSearchSchema
export type MetricInput = z.infer<typeof metricInputSchema>

export const paymentPlanSearchSchema = z.object({
  horizon: z.enum(HORIZONS).catch('7'),
  inflow: z.boolean().catch(false), // "Include projected inflows" toggle
})
export type PaymentPlanSearch = z.infer<typeof paymentPlanSearchSchema>

export const drillStepSchema = z.object({
  kind: z.enum([
    'section',
    'folder',
    'account',
    'entity',
    'vendor',
    'customer',
    'bucket',
    'day',
    'channel',
    'date',
    'subrow',
    'card',
  ]),
  id: z.string().max(200),
  label: z.string().max(200),
})

export const drillSchema = z.object({
  metric: z.string().max(40),
  steps: z.array(drillStepSchema).max(8),
})
export type DrillStep = z.infer<typeof drillStepSchema>
export type DrillStepKind = DrillStep['kind']
export type DrillState = z.infer<typeof drillSchema>

export const drillSearchSchema = z.object({
  drill: z
    .union([
      drillSchema,
      z.string().transform((val) => {
        try {
          return drillSchema.parse(JSON.parse(val))
        } catch {
          return undefined
        }
      }),
    ])
    .optional()
    .catch(undefined),
})
export type DrillSearch = z.infer<typeof drillSearchSchema>


