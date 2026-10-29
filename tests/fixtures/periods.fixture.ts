import type { Period } from '~/lib/core/types'

export const mockPeriods: Period[] = []

// Generate 2024, 2025, 2026 monthly periods
const years = [2024, 2025, 2026]
let idCounter = 1

for (const y of years) {
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0')
    const lastDay = new Date(y, m, 0).getDate()
    const dd = String(lastDay).padStart(2, '0')
    const startDate = `${y}-${mm}-01`
    const endDate = `${y}-${mm}-${dd}`
    const isOpen = y === 2026 && m >= 10

    mockPeriods.push({
      periodeId: String(idCounter++),
      name: `${mm}/${y}`,
      startDate,
      endDate,
      status: isOpen ? 'Open' : 'Closed',
      type: 0,
      tableName: y < 2026 ? `gl_${y}` : 'gl',
    })
  }

  // Period 13 for 2025 and 2026
  if (y === 2025 || y === 2026) {
    mockPeriods.push({
      periodeId: String(idCounter++),
      name: `Adj/${y}`,
      startDate: `${y}-12-01`,
      endDate: `${y}-12-31`,
      status: y === 2025 ? 'Closed' : 'Open',
      type: 1, // Period 13
      tableName: y === 2025 ? 'gl_2025' : 'gl',
    })
  }
}
