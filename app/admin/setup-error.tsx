// Shown instead of a bare Next.js error digest when the admin page can't reach the database,
// so a misconfigured deploy says what is wrong. Only rendered after requireAdmin().
export default function SetupError({ error }: { error: unknown }) {
  const e = (error ?? {}) as { message?: string; code?: string; details?: string; hint?: string }
  const message = e.message || String(error)

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-xl font-bold text-danger">Database belum bisa diakses</h1>
      <p>Login berhasil, tapi server gagal membaca data dari Supabase. Pesan dari server:</p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded border border-danger-line bg-danger-soft p-3 text-sm">
        {message}
        {e.code && `\nKode: ${e.code}`}
        {e.details && `\nDetail: ${e.details}`}
        {e.hint && `\nPetunjuk: ${e.hint}`}
      </pre>
      <div className="rounded border border-line bg-surface p-4 text-sm">
        <h2 className="mb-2 font-semibold">Yang perlu dicek</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <code>SUPABASE_URL</code> dan <code>SUPABASE_SECRET_KEY</code> terisi di Vercel untuk environment <b>Production</b>, lalu
            deployment sudah di-<b>Redeploy</b>.
          </li>
          <li>
            <code>SUPABASE_URL</code> berformat <code>https://xxxx.supabase.co</code> (tanpa <code>/rest/v1</code>) dan menunjuk ke project
            tempat <code>supabase/schema.sql</code> dijalankan.
          </li>
          <li>
            <code>SUPABASE_SECRET_KEY</code> adalah secret key (<code>sb_secret_...</code>) atau <code>service_role</code>, bukan
            publishable/anon key.
          </li>
        </ul>
      </div>
    </main>
  )
}
