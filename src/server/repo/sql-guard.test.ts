import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('SQL Guard - MySQL 5.7 static compatibility checker', () => {
  const repoDir = path.resolve(__dirname)

  it('scans all repository files and enforces strict SQL rules', () => {
    if (!fs.existsSync(repoDir)) {
      return
    }

    const files = fs
      .readdirSync(repoDir)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))

    const violations: { file: string; rule: string; match: string }[] = []

    for (const file of files) {
      const fullPath = path.join(repoDir, file)
      const content = fs.readFileSync(fullPath, 'utf8')

      // CTE check (G1)
      if (/\bWITH\s+(RECURSIVE\s+)?\w+\s+AS\s*\(/i.test(content)) {
        violations.push({ file, rule: 'G1 (CTE)', match: 'WITH ... AS (' })
      }

      // Window functions (G1)
      if (/\bOVER\s*\(/i.test(content)) {
        violations.push({ file, rule: 'G1 (OVER)', match: 'OVER (' })
      }
      if (/\bLATERAL\b/i.test(content)) {
        violations.push({ file, rule: 'G1 (LATERAL)', match: 'LATERAL' })
      }
      if (/\bREGEXP_(REPLACE|SUBSTR|INSTR|LIKE)\b/i.test(content)) {
        violations.push({ file, rule: 'G1 (REGEXP 8.0 function)', match: 'REGEXP_*' })
      }
      if (/\bROW_NUMBER\b|\bRANK\s*\(|\bLAG\s*\(|\bLEAD\s*\(/i.test(content)) {
        violations.push({ file, rule: 'G1 (Window function)', match: 'ROW_NUMBER/RANK/LAG/LEAD' })
      }

      // Alias upsert 8.0 (G3)
      if (/\)\s*AS\s+new\b/i.test(content)) {
        violations.push({ file, rule: 'G3 (MySQL 8.0 upsert alias)', match: ') AS new' })
      }

      // SELECT * forbidden (G27)
      if (/SELECT\s+\*/i.test(content)) {
        violations.push({ file, rule: 'G27 (SELECT *)', match: 'SELECT *' })
      }

      // sql.raw forbidden (G6)
      if (/sql\.raw\s*\(/.test(content)) {
        violations.push({ file, rule: 'G6 (sql.raw)', match: 'sql.raw(' })
      }

      // password column check (only allowed in auth.repo.ts) (G27)
      if (file !== 'auth.repo.ts' && /\bpassword\b/i.test(content)) {
        violations.push({ file, rule: 'G27 (password column outside auth.repo.ts)', match: 'password' })
      }

      // sensitive columns check (G28)
      const sensitiveMatch = content.match(/\b(nomor_rekening|no_rek|npwp|no_npwp|id_number|bank_account_number)\b/i)
      if (sensitiveMatch) {
        violations.push({ file, rule: 'G28 (Sensitive vendor/customer columns)', match: sensitiveMatch[0] })
      }

      // write operations check (only allowed in settings.repo.ts) (G9)
      if (file !== 'settings.repo.ts') {
        const writeMatch = content.match(/\b(UPDATE|DELETE|INSERT)\b/i)
        if (writeMatch) {
          violations.push({ file, rule: 'G9 (Write query outside settings.repo.ts)', match: writeMatch[0] })
        }
      }

      // DDL operations check (G8)
      const ddlMatch = content.match(/\b(DROP|ALTER|CREATE|TRUNCATE|RENAME)\b\s+(TABLE|INDEX|DATABASE)\b/i)
      if (ddlMatch) {
        violations.push({ file, rule: 'G8 (DDL query)', match: ddlMatch[0] })
      }
    }

    expect(violations).toEqual([])
  })
})
