import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import type { CoaRow } from '~/lib/finance/coa-tree'

export async function listCoa(): Promise<CoaRow[]> {
  const result = await rows<{
    coaId: string
    parentId: string
    code: string
    name: string
    status: string
    level: number
    accountGroup: string
    subAccountGroup: string
    saldoNormal: string
  }>(sql`
    SELECT coa_id AS coaId, acc_ref_id AS parentId, code, name, status, level,
           account_group AS accountGroup, sub_account_group AS subAccountGroup, saldo_normal AS saldoNormal
    FROM coa
    ORDER BY code, coa_id
  `)

  return result.map((r) => ({
    coaId: String(r.coaId),
    parentId: String(r.parentId ?? '0'),
    code: r.code || '',
    name: r.name || '',
    status: r.status === 'HEADER' ? 'HEADER' : 'POSTABLE',
    level: Number(r.level || 0),
    accountGroup: r.accountGroup as CoaRow['accountGroup'],
    subAccountGroup: r.subAccountGroup || '',
    saldoNormal: r.saldoNormal === 'CREDIT' ? 'CREDIT' : 'DEBET',
  }))
}
