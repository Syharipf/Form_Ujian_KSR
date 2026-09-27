export default function Notice({ title, body, children }: Readonly<{ title: string; body?: string; children?: React.ReactNode }>) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-2 p-6 text-center">
      <h1 className="text-xl font-bold">{title}</h1>
      {body && <p className="text-secondary">{body}</p>}
      {children}
    </main>
  )
}
