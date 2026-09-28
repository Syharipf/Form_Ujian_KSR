import { headers } from 'next/headers'
import { connection } from 'next/server'
import Notice from '@/app/notice'
import { db, must } from '@/lib/db'
import { isOpen, type Session } from '@/lib/exam'
import JoinForm from './join-form'
import ResultLink from './result-link'

export default async function SessionPage(props: PageProps<'/s/[code]'>) {
  await connection() // open/closed state must be read on every request
  const code = decodeURIComponent((await props.params).code).trim().toUpperCase()
  const session: Session | null = must(await db().from('exam_sessions').select('*').eq('code', code).maybeSingle())
  if (!session) return <Notice title="Sesi tidak ditemukan" body="Periksa lagi QR atau kode dari panitia." />
  if (!isOpen(session)) {
    return (
      <Notice title={session.title} body="Sesi ini belum dibuka atau sudah ditutup.">
        <div className="mt-4">
          <ResultLink code={session.code} />
        </div>
      </Notice>
    )
  }
  return (
    <JoinForm
      host={(await headers()).get('host') ?? ''}
      session={{
        code: session.code,
        title: session.title,
        kind: session.kind,
        timer_mode: session.timer_mode,
        duration_sec: session.duration_sec,
        per_question_sec: session.per_question_sec,
        max_violations: session.max_violations,
      }}
    />
  )
}
