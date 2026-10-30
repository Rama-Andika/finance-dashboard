import { createLogger } from '~/server/log'

/** Log lines of the snapshot builders and the scheduler, all prefixed with "dash:". */
export const dashLog = createLogger('dash')
