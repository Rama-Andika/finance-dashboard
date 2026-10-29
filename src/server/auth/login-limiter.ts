import '@tanstack/react-start/server-only'
import { createRateLimiter } from './rate-limit'

export const loginLimiter = createRateLimiter({ max: 5, windowMs: 60_000 })
