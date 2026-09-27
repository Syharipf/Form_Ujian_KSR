export default function Notice({ title, body }: { title: string; body?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-2 p-6 text-center">
      <h1 className="text-xl font-bold">{title}</h1>
      {body && <p className="text-secondary">{body}</p>}
    </main>
  )
}
