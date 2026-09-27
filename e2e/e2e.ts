// End-to-end run against the local stand-in (PGlite + PostgREST) and `next dev` on :3100.
// Start everything with `bun run e2e` (see e2e/run.sh).
import { chromium, devices, type Browser, type Page, type Route } from 'playwright-core'
import assert from 'node:assert/strict'

const BASE = 'http://localhost:3100'
const CSV = new URL('../public/contoh-soal.csv', import.meta.url).pathname
// question fragment → correct option, matching public/contoh-soal.csv
const KEY: [string, string][] = [
  ['KSR?', 'Korps Sukarela'],
  ['tidak sadar', 'Posisi pemulihan'],
  ['luka bakar', 'Benar'],
  ['Tourniquet', 'Salah'],
]
const answerFor = (text: string) => KEY.find(([q]) => text.includes(q))![1]
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const log = (m: string) => console.log('✓', m)

async function admin(browser: Browser) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(`${BASE}/admin`)
  assert.match(page.url(), /\/admin\/login/)
  await page.fill('input[name=password]', 'salah')
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await page.waitForURL(/error=1/)
  await page.getByText('Password salah.').waitFor()
  await page.fill('input[name=password]', 'rahasia-e2e')
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await page.waitForURL(`${BASE}/admin`)
  log('admin login rejects wrong password, accepts right one')
  return page
}

async function createSession(page: Page, title: string, kind: 'pre' | 'post', mode: 'total' | 'per_question', perQuestion = 45) {
  await page.goto(`${BASE}/admin`)
  await page.fill('input[name=title]', title)
  await page.selectOption('select[name=kind]', kind)
  await page.selectOption('select[name=timer_mode]', mode)
  await page.fill('input[name=duration_min]', '10')
  await page.fill('input[name=per_question_sec]', String(perQuestion))
  await page.getByRole('button', { name: 'Buat sesi', exact: true }).click()
  await page.waitForURL(/\/admin\/sessions\//)
  const code = (await page.locator('text=/kode [A-Z0-9]{6}/').innerText()).match(/kode ([A-Z0-9]{6})/)![1]
  await page.click('summary:has-text("Upload CSV")')
  await page.setInputFiles('input[type=file]', CSV)
  await page.click('text=Upload & ganti semua soal')
  await page.getByText('4 soal tersimpan').waitFor()
  await page.click('text=Buka sesi')
  await page.getByText('Sesi dibuka —').waitFor()
  assert.ok(await page.locator('img[alt^="QR http"]').isVisible())
  log(`session ${title} (${mode}) created, 4 questions uploaded, opened, QR shown → ${code}`)
  return { code, url: page.url().split('?')[0] }
}

async function participant(browser: Browser, code: string, name: string, nim: string) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] })
  const page = await ctx.newPage()
  const views: string[] = []
  page.on('response', async (r) => {
    if (r.url().includes('/api/attempts/')) views.push(await r.text().catch(() => ''))
  })
  await page.goto(`${BASE}/s/${code}`)
  await page.fill('input[name=name]', name)
  await page.fill('input[name=nim]', nim)
  await page.click('text=Mulai ujian')
  await page.waitForURL(/\/exam\//)
  await page.getByText(/Pelanggaran 0\//).waitFor()
  return { page, views }
}

async function pick(page: Page, text: string) {
  await page.locator('main button', { hasText: new RegExp(`^(?:[A-E]\\.\\s?)?${text}$`) }).first().click()
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium-browser' })
try {
  const adminPage = await admin(browser)

  // --- total mode ---------------------------------------------------------
  const pre = await createSession(adminPage, 'Pre-test E2E', 'pre', 'total')

  const a = await participant(browser, pre.code, 'Ani', '1001')
  assert.equal(await a.page.evaluate(() => document.fullscreenElement !== null), true)
  log('participant enters fullscreen on start')
  const questions = a.page.locator('main section')
  assert.equal(await questions.count(), 4)
  // Scope each pick to its question: "Benar"/"Salah" appear in both true/false questions.
  for (const [question, answer] of KEY) {
    await a.page.locator('main section').filter({ hasText: question }).getByRole('button', { name: new RegExp(`^(?:[A-E]\\.\\s?)?${answer}$`) }).click()
  }
  // no pause: submit must queue behind the in-flight answers
  await a.page.click('text=Kumpulkan jawaban')
  await a.page.getByText('4 dari 4 soal terjawab').waitFor()
  await a.page.getByRole('button', { name: 'Kumpulkan', exact: true }).click()
  await a.page.getByText('Jawaban terkirim').waitFor()
  await a.page.getByText('Selamat, kamu sudah selesai!').waitFor()
  assert.ok((await a.page.locator('.confetti').count()) > 0)
  assert.ok(a.views.length > 0 && a.views.every((v) => !v.includes('answer_index') && !v.includes('"score"')))
  log('total mode: answer all, confirm, submit, celebration shown; API never sent answer key or score')

  // violations → auto-submit
  const b = await participant(browser, pre.code, '=HYPERLINK("http://x")', '1002')
  await pick(b.page, 'Korps Sukarela')
  for (let i = 1; i <= 2; i++) {
    await b.page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await b.page.getByText(`Pelanggaran ${i} dari 3`).waitFor()
    await b.page.click('text=Saya mengerti, lanjutkan')
    await sleep(2100)
  }
  // leaving the tab: visibilitychange + blur together count once
  await b.page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('blur'))
  })
  await b.page.getByText('Jawaban terkirim').waitFor()
  await b.page.getByText('Ujian dikumpulkan otomatis').waitFor()
  assert.equal(await b.page.locator('.confetti').count(), 0)
  log('violations 1-2 show warning overlay, 3rd auto-submits (no celebration)')

  // reopen counts as violation
  const c = await participant(browser, pre.code, 'Cici', '1003')
  await c.page.reload()
  await c.page.getByText('Pelanggaran 1 dari 3').waitFor()
  await c.page.getByText('Layar ujian terkunci').or(c.page.getByText('Peringatan')).first().waitFor()
  log('reloading the exam counts as a "reopen" violation and locks the screen')
  // resume link on the join page
  await c.page.goto(`${BASE}/s/${pre.code}`)
  await c.page.getByText('Lanjutkan ujian').waitFor()
  log('join page offers "Lanjutkan ujian" for an unfinished attempt')

  const d = await participant(browser, pre.code, 'Dodi', '1004')
  const prevented = await d.page.evaluate(() =>
    ['contextmenu', 'copy', 'selectstart'].map((t) => {
      const ev = new Event(t, { cancelable: true, bubbles: true })
      document.querySelector('main')!.dispatchEvent(ev)
      return ev.defaultPrevented
    }),
  )
  assert.deepEqual(prevented, [true, true, true])
  const css = await d.page.evaluate(() => getComputedStyle(document.querySelector('.no-select')!).userSelect)
  assert.equal(css, 'none')
  assert.ok(await d.page.locator('div[aria-hidden][style*="data:image/svg+xml"]').count())
  log('exam page blocks context menu / copy / selection and shows the watermark')

  // --- admin results ------------------------------------------------------
  await adminPage.goto(pre.url)
  const row = (name: string) => adminPage.locator('tbody tr', { hasText: name })
  assert.match(await row('Ani').innerText(), /1001\s+100\s+0\s+Selesai/)
  assert.match(await row('HYPERLINK').innerText(), /1002\s+25\s+3\s+Auto-submit \(pelanggaran\)/)
  await row('HYPERLINK').locator('summary').click()
  assert.match(await row('HYPERLINK').innerText(), /hilang fokus/)
  assert.match(await row('Cici').innerText(), /Mengerjakan/)
  log('admin results show score, violation count/log and status')

  const csv = await (await adminPage.request.get(`${pre.url}/export`)).text()
  assert.match(csv, /Ani,1001,100,0,selesai/)
  assert.match(csv, /"'=HYPERLINK\(""http:\/\/x""\)",1002,25,3/)
  const anon = await (await browser.newContext()).request.get(`${pre.url}/export`)
  assert.equal(anon.status(), 401)
  log('CSV export works, escapes formula names, requires admin')

  // question editing is locked while participants exist; reset one participant
  await adminPage.getByText('Soal terkunci karena sudah ada peserta').waitFor()
  assert.equal(await adminPage.locator('input[type=file], summary:has-text("Tambah soal")').count(), 0)
  adminPage.once('dialog', (dlg) => dlg.accept())
  await row('Cici').getByText('Reset').click()
  await adminPage.getByText('Peserta direset').waitFor()
  assert.equal(await row('Cici').count(), 0)
  log('question editing locked while attempts exist; single reset works')

  // --- per-question mode ----------------------------------------------------
  const post = await createSession(adminPage, 'Post-test E2E', 'post', 'per_question', 5)
  const p = await participant(browser, post.code, 'Ani', '1001')
  await p.page.getByText('Soal 1 dari 4').waitFor()
  assert.ok(await p.page.getByText('Jawab & lanjut').isDisabled())
  const firstText = await p.page.locator('main p.font-medium').innerText()
  await pick(p.page, answerFor(firstText))
  await p.page.click('text=Jawab & lanjut')
  await p.page.getByText('Soal 2 dari 4').waitFor()
  log('per-question: answer advances to the next question')
  await p.page.getByText('Soal 3 dari 4').waitFor({ timeout: 12_000 })
  log('per-question: unanswered question is skipped when its timer runs out')
  for (const n of [3, 4]) {
    const text = await p.page.locator('main p.font-medium').innerText()
    await pick(p.page, answerFor(text))
    await p.page.click(n === 4 ? 'text=Jawab & selesai' : 'text=Jawab & lanjut')
    if (n === 3) await p.page.getByText('Soal 4 dari 4').waitFor()
  }
  await p.page.getByText('Jawaban terkirim').waitFor()
  await p.page.getByText('Nilai akan muncul di halaman ini').waitFor()
  log('per-question: last answer finishes the exam; score is withheld while the session is open')

  await adminPage.goto(post.url)
  assert.match(await row('Ani').innerText(), /1001\s+75\s+0\s+Selesai/)
  log('per-question score 75 (skipped question counted wrong)')

  // --- compare --------------------------------------------------------------
  const preId = pre.url.split('/').pop()
  const postId = post.url.split('/').pop()
  await adminPage.goto(`${BASE}/admin/compare?pre=${preId}&post=${postId}`)
  assert.match(await adminPage.locator('tbody tr', { hasText: 'Ani' }).innerText(), /1001\s+100\s+75\s+-25/)
  log('compare page joins pre/post by NIM with delta')

  // --- closed session and score release -------------------------------------------
  // Budi is still working (per-question, 4 × 5 s) when the session closes, so scores stay hidden.
  const late = await participant(browser, post.code, 'Budi', '1004')
  await adminPage.goto(post.url)
  await adminPage.click('text=Tutup sesi')
  await adminPage.getByText('Sesi ditutup —').waitFor()
  await adminPage.getByText('1 peserta masih mengerjakan').waitFor()
  await p.page.reload()
  await p.page.getByText('Nilai akan muncul di halaman ini').waitFor()
  assert.ok(p.views.every((v) => !v.includes('"score"')))

  // Budi answers whatever question is current until done (a slow step may let one time out).
  while (!(await late.page.getByText('Jawaban terkirim').or(late.page.getByText('Nilaimu')).isVisible())) {
    await late.page.locator('main button').first().click({ timeout: 2000 }).catch(() => {})
    await late.page.locator('main button', { hasText: /^Jawab & / }).click({ timeout: 2000 }).catch(() => {})
  }
  await late.page.getByText('Nilaimu').waitFor() // the last one to finish sees the score right away
  await p.page.reload()
  await p.page.getByText('Nilaimu').waitFor()
  assert.equal(await p.page.locator('main p.text-6xl').innerText(), '75')
  await p.page.getByText('Kerja bagus!').waitFor()
  assert.ok((await p.page.locator('.confetti').count()) > 0)
  await adminPage.reload()
  await adminPage.getByText('Nilai sudah terlihat oleh peserta').waitFor()
  log('score is shown only after the session is closed and the last participant finishes')

  const closed = await (await browser.newContext()).newPage()
  await closed.goto(`${BASE}/s/${post.code}`)
  await closed.getByText('Sesi ini belum dibuka atau sudah ditutup.').waitFor()
  assert.equal(await closed.getByText('Lihat nilai ujianmu').count(), 0)
  const api = await closed.request.post(`${BASE}/api/attempts`, { data: { code: post.code, name: 'X', nim: '9' } })
  assert.equal(api.status(), 403)
  log('closed session refuses new participants (page and API)')

  await p.page.goto(`${BASE}/s/${post.code}`)
  await p.page.click('text=Lihat nilai ujianmu')
  await p.page.getByText('Nilaimu').waitFor()
  log('the join page links a finished participant back to their score')

  // --- manual questions ----------------------------------------------------------
  await adminPage.goto(`${BASE}/admin`)
  await adminPage.fill('input[name=title]', 'Manual E2E')
  await adminPage.getByRole('button', { name: 'Buat sesi', exact: true }).click()
  await adminPage.waitForURL(/\/admin\/sessions\//)
  const addForm = adminPage.locator('details:has(summary:has-text("Tambah soal manual")) form')
  await addForm.locator('textarea[name=question]').fill('Warna bendera PMI?')
  await addForm.locator('input[name=a]').fill('Merah putih')
  await addForm.locator('input[name=b]').fill('Biru')
  await addForm.locator('input[name=c]').fill('Hijau')
  await addForm.locator('select[name=answer]').selectOption('C')
  await addForm.locator('button').click()
  await adminPage.getByText('Soal ditambahkan').waitFor()
  await adminPage.click('summary:has-text("Tambah soal manual")')
  await addForm.locator('select[name=type]').selectOption('tf')
  assert.equal(await addForm.locator('input[name=a]').count(), 0)
  await addForm.locator('textarea[name=question]').fill('PMI berdiri tahun 1945.')
  await addForm.locator('select[name=answer]').selectOption('B')
  await addForm.locator('button').click()
  await adminPage.getByText('Soal (2)').waitFor()
  assert.match(await adminPage.locator('ol > li').first().innerText(), /C\. Hijau ✓/)
  assert.match(await adminPage.locator('ol > li').nth(1).innerText(), /Benar ✓/)
  log('manual form adds multiple-choice and true/false questions with the right key')

  const first = adminPage.locator('ol > li').first()
  await first.locator('summary:has-text("Edit")').click()
  await first.locator('input[name=a]').fill('Merah')
  await first.locator('select[name=answer]').selectOption('A')
  await first.getByRole('button', { name: 'Simpan soal', exact: true }).click()
  await adminPage.getByText('Soal diperbarui').waitFor()
  assert.match(await adminPage.locator('ol > li').first().innerText(), /A\. Merah ✓/)
  adminPage.once('dialog', (dlg) => dlg.accept())
  await adminPage.locator('ol > li').nth(1).getByText('Hapus').click()
  await adminPage.getByText('Soal dihapus').waitFor()
  await adminPage.getByText('Soal (1)').waitFor()
  log('manual edit changes the answer key; delete removes a question')

  await adminPage.click('summary:has-text("Upload CSV")')
  await adminPage.setInputFiles('input[type=file]', { name: 'soal.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('PK\x03\x04 not really a zip') })
  adminPage.once('dialog', (dlg) => dlg.accept())
  await adminPage.click('text=Upload & ganti semua soal')
  await adminPage.getByText('Ini file Excel, bukan CSV').waitFor()
  await adminPage.getByText('Soal (1)').waitFor()
  log('Excel file is rejected with a clear message and keeps existing questions')

  // --- theme toggle --------------------------------------------------------------
  const theme = () => adminPage.evaluate(() => document.documentElement.dataset.theme ?? 'system')
  const surface = () => adminPage.evaluate(() => getComputedStyle(document.body).backgroundColor)
  await adminPage.emulateMedia({ colorScheme: 'light' })
  const lightBg = await surface()
  const toggle = adminPage.getByRole('button', { name: /^Tema:/ })
  await toggle.click() // Otomatis → Terang
  await toggle.click() // Terang → Gelap
  assert.equal(await theme(), 'dark')
  assert.notEqual(await surface(), lightBg)
  await adminPage.reload()
  assert.equal(await theme(), 'dark')
  assert.notEqual(await surface(), lightBg)
  await adminPage.getByRole('button', { name: /^Tema:/ }).click() // Gelap → Otomatis
  assert.equal(await theme(), 'system')
  assert.equal(await surface(), lightBg)
  log('theme toggle switches to dark, survives reload, and returns to following the device')

  // --- session date + delete ----------------------------------------------------
  await adminPage.goto(`${BASE}/admin`)
  await adminPage.fill('input[name=title]', 'Sesi Hapus E2E')
  await adminPage.fill('input[name=held_on]', '2026-10-05')
  await adminPage.getByRole('button', { name: 'Buat sesi', exact: true }).click()
  await adminPage.waitForURL(/\/admin\/sessions\//)
  await adminPage.getByText(/5 Okt 2026 · Pre-test/).waitFor()
  adminPage.once('dialog', (d) => d.accept())
  await adminPage.getByRole('button', { name: 'Hapus sesi', exact: true }).click()
  await adminPage.waitForURL(`${BASE}/admin`)
  await adminPage.getByText('Sesi Hapus E2E').waitFor({ state: 'detached' }) // URL changes before the new list renders
  assert.ok(await adminPage.getByText('Pre-test E2E').isVisible())
  log('session date is saved and shown; deleting a session removes it from the list')

  // --- pending feedback ------------------------------------------------------------
  // Slow the server down so the delayed spinner has time to appear.
  const slow = (ms: number) => async (route: Route) => {
    await sleep(ms)
    await route.continue().catch(() => {})
  }
  const spinner = (page: Page) => page.locator('button[aria-busy="true"] svg.animate-spin')

  const joiner = await (await browser.newContext({ ...devices['Pixel 7'] })).newPage()
  await joiner.route('**/api/attempts', slow(1500))
  await joiner.goto(`${BASE}/s/${pre.code}`)
  await joiner.fill('input[name=name]', 'Dodi')
  await joiner.fill('input[name=nim]', '1005')
  await joiner.click('text=Mulai ujian')
  await spinner(joiner).waitFor({ state: 'visible' })
  assert.ok(await joiner.locator('button[aria-busy="true"]').isDisabled())
  await joiner.waitForURL(/\/exam\//)
  log('participant start button shows a spinner and is disabled while the request is slow')

  await adminPage.goto(`${BASE}/admin`)
  await adminPage.route(`${BASE}/admin`, (route) => (route.request().method() === 'POST' ? slow(1500)(route) : route.continue()))
  await adminPage.getByRole('button', { name: 'Keluar', exact: true }).click()
  await spinner(adminPage).waitFor({ state: 'visible' })
  await adminPage.waitForURL(/\/admin\/login/)
  log('admin server-action button shows a spinner while the action is slow')

  console.log('\nALL E2E CHECKS PASSED')
} catch (e) {
  // Leave evidence for debugging: a screenshot of every open page.
  let n = 0
  for (const ctx of browser.contexts()) for (const page of ctx.pages()) await page.screenshot({ path: new URL(`.bin/fail-${n++}.png`, import.meta.url).pathname }).catch(() => {})
  throw e
} finally {
  await browser.close()
}
