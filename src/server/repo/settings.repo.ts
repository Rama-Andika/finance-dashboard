import '@tanstack/react-start/server-only'
import { randomInt } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '~/server/db/client'
import { rows } from '~/server/db/query'
import { env } from '~/server/env'
import { generateErpOid } from '~/server/oid'
import type { Id } from '~/lib/finance/types'

export type SystemMainMappingRow = {
  sysmainId: Id
  valueprop: string | null
}

export async function getMappingRow(): Promise<SystemMainMappingRow | null> {
  const result = await rows<SystemMainMappingRow>(sql`
    SELECT sysmain_id AS sysmainId, valueprop AS valueprop
    FROM system_main
    WHERE name = 'DASHBOARD_ACCOUNT_MAPPING'
    LIMIT 1
  `)
  return result[0] ?? null
}

export async function upsertMapping(jsonString: string): Promise<Id> {
  const existing = await getMappingRow()
  const sysmainId =
    existing?.sysmainId ??
    generateErpOid(env.ERP_APP_ID_INDEX, Date.now(), randomInt(0, 9))

  await db.execute(sql`
    INSERT INTO system_main (sysmain_id, name, valueprop, valtype, distype, groupprop, note, company_id, active)
    VALUES (${sysmainId}, 'DASHBOARD_ACCOUNT_MAPPING', ${jsonString}, 'STRING', '', 'Application', 'Finance Dashboard account mapping', 0, 1)
    ON DUPLICATE KEY UPDATE valueprop = VALUES(valueprop)
  `)

  return sysmainId
}
