import { NOTES_PLACEHOLDER } from './release-rules.mjs'

/**
 * The text of a new finance notes file (docs/releases/vX.Y.Z.md). Indonesian, because finance reads it. The release script
 * writes it, a person fills it in, and the release script refuses to release while the placeholder is still there.
 * @param {{
 *   tag: string,
 *   today: string,
 *   flaggedMajor: boolean,
 *   features: string[],
 *   fixes: string[],
 *   formula: string[],
 *   breaking: string[],
 * }} input the lists hold commit subjects
 * @returns {string}
 */
export function buildNotesSkeleton({ tag, today, flaggedMajor, features, fixes, formula, breaking }) {
  /** @param {string[]} items @param {string} empty */
  const list = (items, empty) => (items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : empty)
  const lines = [
    `# Catatan rilis ${tag}`,
    '',
    `Tanggal: ${today}`,
    '',
    '## Ringkasan',
    '',
    `${NOTES_PLACEHOLDER}: tulis dua atau tiga kalimat tentang rilis ini, dalam bahasa yang dimengerti tim finance.`,
    '',
    '## Perubahan angka',
    '',
    '<!-- Tulis angka mana yang berubah, di halaman mana, dan mengapa. Bila tidak ada angka yang berubah, tulis kalimat itu. -->',
    `${NOTES_PLACEHOLDER}: isi bagian ini. Hapus baris ini setelah diisi.`,
    '',
    'Commit yang ditandai mengubah rumus (footer Formula-Change):',
    '',
    list(formula, '- (tidak ada)'),
    '',
  ]
  if (breaking.length > 0 || flaggedMajor) {
    lines.push(
      '## Tindakan operator',
      '',
      '<!-- Rilis ini berisi perubahan yang menuntut tindakan: migrasi yang tidak bisa dibatalkan, variabel env baru yang wajib, atau syarat server atau ERP yang berubah. -->',
      `${NOTES_PLACEHOLDER}: tulis langkah yang harus dilakukan operator sebelum dan sesudah memasang rilis ini.`,
      '',
      'Commit yang ditandai perubahan besar:',
      '',
      list(breaking, '- (tidak ada)'),
      '',
    )
  }
  lines.push(
    '## Fitur baru',
    '',
    list(features, '- (tidak ada)'),
    '',
    '## Perbaikan',
    '',
    list(fixes, '- (tidak ada)'),
    '',
  )
  return lines.join('\n')
}
