import { redirect } from 'next/navigation'

async function open(formData: FormData) {
  'use server'
  const code = String(formData.get('code') ?? '').trim().toUpperCase()
  if (code) redirect(`/s/${encodeURIComponent(code)}`)
}

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <p className="text-sm font-semibold text-red-600">KSR PMI Telkom</p>
      <h1 className="text-2xl font-bold">Ujian Pre-test / Post-test</h1>
      <p className="text-slate-600">Scan QR dari panitia, atau masukkan kode sesi.</p>
      <form action={open} className="flex gap-2">
        <input
          name="code"
          required
          maxLength={10}
          placeholder="Kode sesi"
          autoCapitalize="characters"
          className="min-w-0 flex-1 rounded border border-slate-300 p-3 uppercase"
        />
        <button className="rounded bg-red-600 px-5 font-semibold text-white">Masuk</button>
      </form>
    </main>
  )
}
