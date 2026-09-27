import { login } from '../actions'

export default async function LoginPage(props: PageProps<'/admin/login'>) {
  const { error } = await props.searchParams
  return (
    <main className="mx-auto flex min-h-[80dvh] max-w-sm flex-col justify-center p-6">
      <h1 className="text-xl font-bold">Admin Ujian KSR</h1>
      <form action={login} className="mt-4 space-y-3">
        <input type="password" name="password" required autoFocus placeholder="Password" className="w-full rounded border border-line-strong p-3" />
        {error && <p className="text-sm text-danger">Password salah.</p>}
        <button className="w-full rounded bg-red-600 p-3 font-semibold text-white">Masuk</button>
      </form>
    </main>
  )
}
