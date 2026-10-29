import '@tanstack/react-start/server-only'
import { randomInt } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '~/server/db/client'
import { rows } from '~/server/db/query'
import { env } from '~/server/env'
import { generateErpOid } from '~/server/oid'
import type { Id } from '~/lib/core/types'

/** system_main key of the dashboard account mapping (convention O7). */
export const MAPPING_KEY = 'DASHBOARD_ACCOUNT_MAPPING'

export type SystemMainMappingRow = {
  sysmainId: Id
  valueprop: string | null
}

/** `name` is overridable only so integration tests can use their own row instead of the real one. */
export async function getMappingRow(name: string = MAPPING_KEY): Promise<SystemMainMappingRow | null> {
  const result = await rows<SystemMainMappingRow>(sql`
    SELECT sysmain_id AS sysmainId, valueprop AS valueprop
    FROM system_main
    WHERE name = ${name}
    LIMIT 1
  `)
  return result[0] ?? null
}

export async function upsertMapping(jsonString: string, name: string = MAPPING_KEY): Promise<Id> {
  const existing = await getMappingRow(name)
  const sysmainId =
    existing?.sysmainId ??
    generateErpOid(env.ERP_APP_ID_INDEX, Date.now(), randomInt(0, 9))

  await db.execute(sql`
    INSERT INTO system_main (sysmain_id, name, valueprop, valtype, distype, groupprop, note, company_id, active)
    VALUES (${sysmainId}, ${name}, ${jsonString}, 'STRING', '', 'Application', 'Finance Dashboard account mapping', 0, 1)
    ON DUPLICATE KEY UPDATE valueprop = VALUES(valueprop)
  `)

  return sysmainId
}
