import { NextResponse } from 'next/server'
import { ExamError } from './exam'

export async function handle(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json(await fn())
  } catch (e) {
    if (e instanceof ExamError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Terjadi kesalahan server, coba lagi' }, { status: 500 })
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null)
  return body && typeof body === 'object' ? body : {}
}
