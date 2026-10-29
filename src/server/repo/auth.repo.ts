import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'

export type LoginCandidate = {
  userId: string
  fullName: string
  userStatus: number
  password: string
}

/** The ONLY function allowed to select the `password` column (G27). */
export async function findLoginCandidate(loginId: string): Promise<LoginCandidate | null> {
  const result = await rows<LoginCandidate>(sql`
    SELECT user_id AS userId, full_name AS fullName, user_status AS userStatus, password AS password
    FROM sysuser
    WHERE login_id = ${loginId}
    LIMIT 2
  `)
  return result.length === 1 ? result[0]! : null
}

export async function findUserById(
  userId: string,
): Promise<{ userId: string; fullName: string; userStatus: number } | null> {
  const result = await rows<{ userId: string; fullName: string; userStatus: number }>(sql`
    SELECT user_id AS userId, full_name AS fullName, user_status AS userStatus
    FROM sysuser WHERE user_id = ${userId} LIMIT 1
  `)
  return result[0] ?? null
}

export const LOGIN_ALLOWED_STATUSES = [0, 1, 2] as const
