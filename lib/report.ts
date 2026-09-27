export interface ScoreRow {
  name: string
  nim: string
  score: number | null
}

export interface CompareRow {
  nim: string
  name: string
  pre: number | null
  post: number | null
  delta: number | null
}

const norm = (nim: string) => nim.trim().toUpperCase()

function average(values: (number | null)[]) {
  const nums = values.filter((v): v is number => v !== null)
  return nums.length ? Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 10) / 10 : null
}

// Pre-test vs post-test per participant, matched by NIM (case/whitespace-insensitive).
export function compareScores(pre: ScoreRow[], post: ScoreRow[]) {
  const byNim = new Map<string, CompareRow>()
  const row = (r: ScoreRow) => {
    const key = norm(r.nim)
    if (!byNim.has(key)) byNim.set(key, { nim: r.nim.trim(), name: r.name, pre: null, post: null, delta: null })
    return byNim.get(key)!
  }
  for (const r of pre) row(r).pre = r.score
  for (const r of post) row(r).post = r.score

  const rows = [...byNim.values()]
    .map((r) => ({ ...r, delta: r.pre !== null && r.post !== null ? r.post - r.pre : null }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return {
    rows,
    avgPre: average(rows.map((r) => r.pre)),
    avgPost: average(rows.map((r) => r.post)),
    avgDelta: average(rows.map((r) => r.delta)),
  }
}
