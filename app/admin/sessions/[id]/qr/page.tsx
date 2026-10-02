import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import Brand from '@/app/brand'
import { requireAdmin } from '@/lib/admin-auth'
import { UUID } from '@/lib/attempts'
import { db, must } from '@/lib/db'
import { formatDate, hasStarted, isOpen, type Session } from '@/lib/exam'
import { AutoRefresh, Countdown, FullscreenButton } from '../live'

// Share-screen / projector view: only what participants need to join. The session page itself must
// not be shared, since its question list shows the answer key.
export default async function QrDisplayPage(props: PageProps<'/admin/sessions/[id]/qr'>) {
  await requireAdmin()
  const { id } = await props.params
  if (!UUID.test(id)) notFound()
  const session: (Pick<Session, 'title' | 'code' | 'kind' | 'held_on' | 'is_open' | 'closes_at' | 'started_at'> & { attempts: { count: number }[] }) | null = must(
    await db().from('exam_sessions').select('title, code, kind, held_on, is_open, closes_at, started_at, attempts(count)').eq('id', id).maybeSingle(),
  )
  if (!session) notFound()
  // eslint-disable-next-line react-hooks/purity -- server component, rendered once per request
  const serverNow = Date.now()
  const open = isOpen(session, serverNow)
  const joined = session.attempts[0]?.count ?? 0

  const h = await headers()
  const host = h.get('host') ?? ''
  const link = `${h.get('x-forwarded-proto') ?? 'http'}://${host}/s/${session.code}`
  // SVG stays sharp at any projector size.
  const qr = `data:image/svg+xml,${encodeURIComponent(await QRCode.toString(link, { type: 'svg', margin: 1 }))}`

  return (
    <main className="fixed inset-0 z-50 flex flex-col gap-6 overflow-auto bg-page p-6 sm:p-10">
      <AutoRefresh />
      <div className="flex items-center justify-between gap-4">
        <Brand />
        <div className="hide-in-fullscreen shrink-0">
          <FullscreenButton />
        </div>
      </div>
      <div className="m-auto grid items-center gap-8 text-center lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-16 lg:text-left">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL, nothing to optimize */}
        <img src={qr} alt={`QR ${link}`} className="mx-auto aspect-square w-[min(80vw,60vh)] rounded-3xl bg-white p-3 shadow-lg ring-1 ring-line" />
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-lg font-semibold text-muted">
              {formatDate(session.held_on)} · {session.kind === 'pre' ? 'Pre-test' : 'Post-test'}
            </p>
            <h1 className="text-3xl font-extrabold tracking-tight text-balance lg:text-5xl">{session.title}</h1>
          </div>
          <div className="space-y-1">
            <p className="text-lg text-secondary lg:text-2xl">
              Scan QR, atau buka <b className="text-fg">{host}</b> dan masukkan kode:
            </p>
            <p className="font-mono text-6xl font-extrabold tracking-[0.15em] text-primary lg:text-8xl">{session.code}</p>
          </div>
          <p className={`badge text-base ${open ? 'bg-ok-soft text-ok' : 'bg-subtle text-muted'}`}>
            {!open
              ? session.is_open || session.started_at ? 'Sesi sudah ditutup' : 'Sesi belum dibuka'
              : !session.started_at
                ? `Silakan masuk — ${joined} peserta menunggu, ujian dimulai serentak`
                : !hasStarted(session, serverNow)
                  ? 'Ujian segera dimulai'
                  : 'Ujian berjalan — yang telat dapat sisa waktu'}
          </p>
          {open && session.closes_at && hasStarted(session, serverNow) && (
            <p className="text-lg text-secondary lg:text-2xl">
              Sisa waktu <Countdown until={Date.parse(session.closes_at)} serverNow={serverNow} />
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
