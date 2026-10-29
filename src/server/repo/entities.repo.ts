import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import type { Entity, Id } from '~/lib/finance/types'

export type EntitySegment = { segmentId: Id; columnName: string }

export async function getEntitySegment(): Promise<EntitySegment> {
  const result = await rows<EntitySegment>(sql`
    SELECT segment_id AS segmentId, column_name AS columnName
    FROM segment
    WHERE \`count\` = 1
  `)
  if (result.length !== 1) {
    throw new Error(`Expected exactly 1 entity segment with count=1, got ${result.length}`)
  }
  const seg = result[0]!
  if (!/^segment([1-9]|1[0-5])_id$/.test(seg.columnName)) {
    throw new Error(`Invalid entity segment column_name: ${seg.columnName}`)
  }
  return seg
}

type EntityRow = {
  locationId: Id
  code: string
  name: string
  isActive: number | string
  segmentDetailId: Id | null
}

export async function listEntities(segmentId: Id): Promise<Entity[]> {
  const result = await rows<EntityRow>(sql`
    SELECT pl.location_id AS locationId, pl.code AS code, pl.name AS name, pl.is_active AS isActive,
           sd.segment_detail_id AS segmentDetailId
    FROM pos_location pl
    LEFT JOIN segment_detail sd ON sd.location_id = pl.location_id AND sd.segment_id = ${segmentId}
    ORDER BY pl.name, pl.location_id
  `)

  const map = new Map<Id, Entity>()
  for (const r of result) {
    const existing = map.get(r.locationId)
    if (existing) {
      if (r.segmentDetailId && !existing.segmentDetailIds.includes(r.segmentDetailId)) {
        existing.segmentDetailIds.push(r.segmentDetailId)
      }
    } else {
      map.set(r.locationId, {
        locationId: r.locationId,
        code: r.code,
        name: r.name,
        isActive: Number(r.isActive) === 1,
        segmentDetailIds: r.segmentDetailId ? [r.segmentDetailId] : [],
      })
    }
  }

  return Array.from(map.values())
}
