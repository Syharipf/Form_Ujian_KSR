import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { finalizeExpired } from '@/lib/attempts'
import { db, must } from '@/lib/db'
import type { Session } from '@/lib/exam'
import { compareScores, type ScoreRow } from '@/lib/report'

async function scores(sessionId: string): Promise<ScoreRow[]> {
  await finalizeExpired(sessionId)
  return must(await db().from('attempts').select('name, nim, score').eq('session_id', sessionId))
}

const show = (n: number | null) => (n === null ? '–' : n)

export default async function ComparePage(props: PageProps<'/admin/compare'>) {
  await requireAdmin()
  const { pre, post } = await props.searchParams
  const sessions: Session[] = must(await db().from('exam_sessions').select('*').order('created_at', { ascending: false }))
  const known = (v: unknown): v is string => typeof v === 'string' && sessions.some((s) => s.id === v)
  const result = known(pre) && known(post) ? compareScores(await scores(pre), await scores(post)) : null

  const picker = (name: 'pre' | 'post', value: unknown) => (
    <label className="grid gap-1 text-sm">
      {name === 'pre' ? 'Pre-test' : 'Post-test'}
      <select name={name} defaultValue={typeof value === 'string' ? value : ''} required className="rounded border border-line-strong bg-surface p-2">
        <option value="" disabled>
          Pilih sesi
        </option>
        {sessions
          .filter((s) => s.kind === name)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} ({s.code})
            </option>
          ))}
      </select>
    </label>
  )

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4">
      <header>
        <Link href="/admin" className="text-sm underline">
          ← Semua sesi
        </Link>
        <h1 className="mt-1 text-xl font-bold">Bandingkan pre-test vs post-test</h1>
      </header>

      <form className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        {picker('pre', pre)}
        {picker('post', post)}
        <button className="rounded bg-red-600 px-4 py-2 font-semibold text-white">Bandingkan</button>
      </form>

      {result && (
        <>
          <p className="text-sm">
            Rata-rata pre: <b>{show(result.avgPre)}</b> · post: <b>{show(result.avgPost)}</b> · peningkatan: <b>{show(result.avgDelta)}</b>
          </p>
          <div className="overflow-x-auto rounded border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-subtle text-left">
                <tr>
                  <th className="p-2">Nama</th>
                  <th className="p-2">NIM</th>
                  <th className="p-2">Pre</th>
                  <th className="p-2">Post</th>
                  <th className="p-2">Selisih</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.nim} className="border-t border-line">
                    <td className="p-2">{r.name}</td>
                    <td className="p-2">{r.nim}</td>
                    <td className="p-2">{show(r.pre)}</td>
                    <td className="p-2">{show(r.post)}</td>
                    <td className={`p-2 ${r.delta !== null && r.delta < 0 ? 'text-danger' : ''}`}>
                      {r.delta === null ? '–' : r.delta > 0 ? `+${r.delta}` : r.delta}
                    </td>
                  </tr>
                ))}
                {!result.rows.length && (
                  <tr>
                    <td colSpan={5} className="p-3 text-muted">
                      Belum ada peserta.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  )
}
