import SubmitButton from '@/app/submit-button'
import { login } from '../actions'

export default async function LoginPage(props: PageProps<'/admin/login'>) {
  const { error } = await props.searchParams
  return (
    <main className="mx-auto flex min-h-[80dvh] max-w-sm flex-col justify-center p-5">
      <form action={login} className="card space-y-4 p-6">
        <div>
          <h1 className="text-xl font-bold">Masuk sebagai panitia</h1>
          <p className="text-sm text-muted">Kelola sesi, soal, dan nilai peserta.</p>
        </div>
        <label className="grid gap-1.5 text-sm font-semibold">
          <span>Password</span>
          <input type="password" name="password" required className="field font-normal" />
        </label>
        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
            Password salah.
          </p>
        )}
        <SubmitButton className="btn btn-primary w-full">Masuk</SubmitButton>
      </form>
    </main>
  )
}
