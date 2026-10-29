export const PRESETS = ['this-month', 'last-month', 'this-quarter', 'ytd', 'last-12m'] as const // F3
export type Preset = (typeof PRESETS)[number]
