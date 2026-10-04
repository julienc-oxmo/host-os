export interface ParsedCsv {
  delimiter: ',' | ';' | '\t'
  headers: string[]
  rows: string[][]
}

export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const first = text.replace(/^﻿/, '').split(/\r?\n/).find((l) => l.trim()) ?? ''
  const count = (d: string) => {
    let n = 0
    let q = false
    for (const ch of first) {
      if (ch === '"') q = !q
      else if (ch === d && !q) n++
    }
    return n
  }
  const c = { ',': count(','), ';': count(';'), '\t': count('\t') }
  return (Object.entries(c).sort((a, b) => b[1] - a[1])[0][0] as ',' | ';' | '\t') ?? ','
}

/** Parseur CSV RFC 4180 (guillemets, retours à la ligne dans les cellules, BOM, séparateur auto). */
export function parseCsv(input: string): ParsedCsv {
  const text = input.replace(/^﻿/, '')
  const delimiter = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else q = false
      } else cell += ch
    } else if (ch === '"') q = true
    else if (ch === delimiter) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      rows.push(row); row = []
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  const clean = rows.filter((r) => r.some((c) => c.trim() !== ''))
  const headers = (clean.shift() ?? []).map((h) => h.trim())
  return { delimiter, headers, rows: clean }
}

export function toCsv(rows: (string | number | null | undefined)[][], delimiter = ','): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return rows.map((r) => r.map(esc).join(delimiter)).join('\n')
}
