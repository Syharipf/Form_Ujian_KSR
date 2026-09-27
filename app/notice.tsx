import Brand from './brand'

export default function Notice({ title, body, children }: Readonly<{ title: string; body?: string; children?: React.ReactNode }>) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-5">
      <Brand />
      <div className="card flex flex-col gap-2 p-6 text-center">
        <h1 className="text-xl font-bold text-balance">{title}</h1>
        {body && <p className="text-secondary text-pretty">{body}</p>}
        {children}
      </div>
    </main>
  )
}
