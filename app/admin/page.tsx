import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { db, must } from '@/lib/db'
import type { Session } from '@/lib/exam'
import { createSession, logout } from './actions'
import SessionForm from './session-form'
import SetupError from './setup-error'

export default async function AdminHome() {
  await requireAdmin()
  let sessions: Session[]
  try {
    sessions = must(await db().from('exam_sessions').select('*').order('created_at', { ascending: false }))
  } catch (error) {
    return <SetupError error={error} />
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Admin Ujian KSR PMI Telkom</h1>
        <form action={logout}>
          <button className="text-sm underline">Keluar</button>
        </form>
      </header>

      <section>
        <h2 className="mb-2 font-semibold">Sesi ujian</h2>
        <ul className="divide-y divide-line rounded border border-line bg-surface">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link href={`/admin/sessions/${s.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-page">
                <span>
                  {s.title}{' '}
                  <span className="text-sm text-muted">
                    ({s.kind === 'pre' ? 'Pre' : 'Post'} · {s.code})
                  </span>
                </span>
                <span className={`text-sm ${s.is_open ? 'text-ok' : 'text-muted'}`}>{s.is_open ? 'Dibuka' : 'Ditutup'}</span>
              </Link>
            </li>
          ))}
          {!sessions.length && <li className="p-3 text-muted">Belum ada sesi.</li>}
        </ul>
        <Link href="/admin/compare" className="mt-2 inline-block text-sm underline">
          Bandingkan pre-test vs post-test →
        </Link>
      </section>

      <section className="rounded border border-line bg-surface p-4">
        <h2 className="mb-3 font-semibold">Buat sesi baru</h2>
        <SessionForm action={createSession} submitLabel="Buat sesi" />
      </section>
    </main>
  )
}
