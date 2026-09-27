import Form from 'next/form'
import Link from 'next/link'
import LinkPending from '@/app/link-pending'
import SubmitButton from '@/app/submit-button'
import { requireAdmin } from '@/lib/admin-auth'
import { finalizeExpired } from '@/lib/attempts'
import { db, must } from '@/lib/db'
import { formatDate, type Session } from '@/lib/exam'
import { compareScores, type ScoreRow } from '@/lib/report'

async function scores(sessionId: string): Promise<ScoreRow[]> {
  await finalizeExpired(sessionId)
  return must(await db().from('attempts').select('name, nim, score').eq('session_id', sessionId))
}

const show = (n: number | null) => (n === null ? '–' : n)

export default async function ComparePage(props: PageProps<'/admin/compare'>) {
  await requireAdmin()
  const { pre, post } = await props.searchParams
  const sessions: Session[] = must(await db().from('exam_sessions').select('*').order('held_on', { ascending: false }).order('created_at', { ascending: false }))
  const known = (v: unknown): v is string => typeof v === 'string' && sessions.some((s) => s.id === v)
  const result = known(pre) && known(post) ? compareScores(await scores(pre), await scores(post)) : null

  const picker = (name: 'pre' | 'post', value: unknown) => (
    <label className="grid min-w-0 gap-1.5 text-sm font-semibold">
      {name === 'pre' ? 'Pre-test' : 'Post-test'}
      <select name={name} defaultValue={typeof value === 'string' ? value : ''} required className="field w-full min-w-0 font-normal">
        <option value="" disabled>
          Pilih sesi
        </option>
        {sessions
          .filter((s) => s.kind === name)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} ({formatDate(s.held_on)} · {s.code})
            </option>
          ))}
      </select>
    </label>
  )

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 pb-12">
      <header className="pt-2">
        <Link href="/admin" className="text-sm font-semibold text-muted hover:text-fg">
          ← Semua sesi <LinkPending />
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Bandingkan pre-test vs post-test</h1>
      </header>

      <Form action="/admin/compare" className="card grid items-end gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:p-6">
        {picker('pre', pre)}
        {picker('post', post)}
        <SubmitButton className="btn btn-primary">Bandingkan</SubmitButton>
      </Form>

      {result && (
        <>
          <dl className="grid grid-cols-3 gap-3">
            {[
              ['Rata-rata pre', result.avgPre],
              ['Rata-rata post', result.avgPost],
              ['Peningkatan', result.avgDelta],
            ].map(([label, value]) => (
              <div key={label} className="card p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
                <dd className="mt-1 text-2xl font-extrabold tabular-nums">{show(value as number | null)}</dd>
              </div>
            ))}
          </dl>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-subtle text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="p-3">Nama</th>
                  <th className="p-3">NIM</th>
                  <th className="p-3">Pre</th>
                  <th className="p-3">Post</th>
                  <th className="p-3">Selisih</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.nim} className="border-t border-line">
                    <td className="p-3">{r.name}</td>
                    <td className="p-3">{r.nim}</td>
                    <td className="p-3">{show(r.pre)}</td>
                    <td className="p-3">{show(r.post)}</td>
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
