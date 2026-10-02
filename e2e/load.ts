// Load test: N participants join, answer every question and submit at the same moment, then fetch
// their result together (what happens when a whole class starts on the committee's signal).
//
// Real deployment: create a test session with questions, open it, then
//   BASE=https://ujiksr.vercel.app CODE=ABC123 N=150 bun e2e/load.ts
// press "Mulai ujian" in /admin once everyone has joined, and delete that session afterwards, which
// removes the fake participants.
// Without CODE it runs against the local `bun run e2e` stack and sets the session up itself.
import { chromium } from 'playwright-core'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const N = Number(process.env.N ?? 150)
const RUN = Date.now().toString(36)

type View = { status: string; questions: { id: string; options: string[] }[]; score?: number; error?: string }

async function api(path: string, body?: object) {
  const start = performance.now()
  try {
    const res = await fetch(`${BASE}${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {})
    return { ok: res.ok, status: res.status, data: (await res.json()) as View & { id: string }, ms: performance.now() - start }
  } catch (e) {
    return { ok: false, status: 0, data: { error: String(e) } as View & { id: string }, ms: performance.now() - start }
  }
}
type Result = Awaited<ReturnType<typeof api>>

function report(phase: string, results: Result[]) {
  const ms = results.map((r) => r.ms).sort((a, b) => a - b)
  const at = (p: number) => Math.round(ms[Math.min(ms.length - 1, Math.floor(p * ms.length))])
  const failed = results.filter((r) => !r.ok)
  console.log(`${phase.padEnd(28)} ${results.length - failed.length}/${results.length} ok   p50 ${at(0.5)} ms   p95 ${at(0.95)} ms   max ${at(1)} ms`)
  for (const f of failed.slice(0, 3)) console.log(`   ✗ ${f.status} ${f.data.error}`)
}

// Local stack only: log in as admin and create an open total-mode session with the sample questions.
async function localSession() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium-browser' })
  const page = await browser.newPage()
  await page.goto(`${BASE}/admin/login`)
  await page.fill('input[name=password]', process.env.ADMIN_PASSWORD ?? 'rahasia-e2e')
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await page.waitForURL(`${BASE}/admin`)
  await page.fill('input[name=title]', `Uji beban ${RUN}`)
  await page.selectOption('select[name=timer_mode]', 'total')
  await page.getByRole('button', { name: 'Buat sesi', exact: true }).click()
  await page.waitForURL(/\/admin\/sessions\//)
  const code = (await page.locator('text=/kode [A-Z0-9]{6}/').innerText()).match(/kode ([A-Z0-9]{6})/)![1]
  await page.click('summary:has-text("Upload CSV")')
  await page.setInputFiles('input[type=file]', new URL('../public/contoh-soal.csv', import.meta.url).pathname)
  await page.click('text=Upload & ganti semua soal')
  await page.getByText('soal tersimpan').waitFor()
  await page.click('text=Buka sesi')
  await page.getByText('Lobi dibuka —').waitFor()
  const start = async () => {
    await page.reload()
    page.once('dialog', (dlg) => dlg.accept())
    await page.getByRole('button', { name: 'Mulai ujian', exact: true }).click()
    await page.getByText('Soal muncul di HP peserta dalam').waitFor()
  }
  const close = async () => {
    await page.click('text=Tutup sesi')
    await page.getByText('Sesi ditutup —').waitFor()
    await browser.close()
  }
  return { code, start, close }
}

const local = process.env.CODE ? null : await localSession()
const code = process.env.CODE ?? local!.code
console.log(`${N} participants → ${BASE} session ${code}\n`)

const joins = await Promise.all(Array.from({ length: N }, (_, i) => api('/api/attempts', { code, name: `Beban ${i + 1}`, nim: `LOAD-${RUN}-${i + 1}`, prodi: 'Uji beban' })))
report('join', joins)
const ids = joins.filter((r) => r.ok).map((r) => r.data.id)

// Everyone waits in the lobby until the committee starts the exam, then opens it at the same moment.
if (local) await local.start()
else console.log('Press "Mulai ujian" in /admin.')
while (true) {
  const { data } = await api(`/api/attempts/${ids[0]}`)
  if (data.status !== 'waiting') break
  await new Promise((r) => setTimeout(r, 1000))
}
const opens = await Promise.all(ids.map((id) => api(`/api/attempts/${id}`)))
report('open exam', opens)

// Everyone answers every question, one request at a time each like the exam page's queue. Total mode
// lists all questions at once; per-question mode shows the next one in each answer's response.
const answers: Result[] = []
await Promise.all(
  opens.map(async (open, i) => {
    const done = new Set<string>()
    let view = open.data
    while (view.status === 'active') {
      const q = view.questions?.find((x) => !done.has(x.id))
      if (!q) break
      done.add(q.id)
      const res = await api(`/api/attempts/${ids[i]}/answer`, { question_id: q.id, choice: (i + done.size) % q.options.length })
      answers.push(res)
      if (!res.ok) break
      view = res.data
    }
  }),
)
report('answer (every question)', answers)

report('submit', await Promise.all(ids.map((id) => api(`/api/attempts/${id}/submit`, {}))))

if (local) {
  await local.close() // scores are released once the session is closed and nobody is working
  const results = await Promise.all(ids.map((id) => api(`/api/attempts/${id}`)))
  report('result, all at once', results)
  console.log(`\nscores visible: ${results.filter((r) => typeof r.data.score === 'number').length}/${ids.length}`)
} else {
  console.log('\nClose the session in /admin, check the scores, then delete the test session.')
}
