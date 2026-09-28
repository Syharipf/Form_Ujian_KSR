import Link from 'next/link'
import LinkPending from '@/app/link-pending'
import SubmitButton from '@/app/submit-button'
import { requireAdmin } from '@/lib/admin-auth'
import { db, must } from '@/lib/db'
import { formatDate, isOpen, type Session } from '@/lib/exam'
import { createSession, logout } from './actions'
import SessionForm from './session-form'
import SetupError from './setup-error'

export default async function AdminHome() {
  await requireAdmin()
  let sessions: Session[]
  try {
    sessions = must(await db().from('exam_sessions').select('*').order('held_on', { ascending: false }).order('created_at', { ascending: false }))
  } catch (error) {
    return <SetupError error={error} />
  }

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-4 pb-12">
      <header className="flex items-center justify-between gap-3 pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Sesi ujian</h1>
        <form action={logout}>
          <SubmitButton className="btn btn-secondary text-sm">Keluar</SubmitButton>
        </form>
      </header>

      <section className="space-y-3">
        <ul className="card divide-y divide-line overflow-hidden">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link href={`/admin/sessions/${s.id}`} className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-subtle">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{s.title}</span>
                  <span className="text-sm text-muted">
                    {formatDate(s.held_on)} · {s.kind === 'pre' ? 'Pre-test' : 'Post-test'} · kode <code className="font-semibold">{s.code}</code>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={`badge ${isOpen(s) ? 'bg-ok-soft text-ok' : 'bg-subtle text-muted'}`}>{isOpen(s) ? 'Dibuka' : 'Ditutup'}</span>
                  <LinkPending />
                </span>
              </Link>
            </li>
          ))}
          {!sessions.length && <li className="p-6 text-center text-muted">Belum ada sesi. Buat sesi pertama di bawah.</li>}
        </ul>
        <Link href="/admin/compare" className="btn btn-secondary text-sm">
          Bandingkan pre-test vs post-test <LinkPending />
        </Link>
      </section>

      <section className="card p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-bold">Buat sesi baru</h2>
        <SessionForm action={createSession} submitLabel="Buat sesi" />
      </section>
    </main>
  )
}
