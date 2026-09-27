'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'
import LinkPending from '@/app/link-pending'

const noSubscribe = () => () => {}
function stored(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

// Set by the exam page after submitting (`result:<code>` → attempt id), so the participant can
// come back through the same QR/link to see their score once it is released.
export default function ResultLink({ code }: Readonly<{ code: string }>) {
  const id = useSyncExternalStore(noSubscribe, () => stored(`result:${code}`), () => null)
  if (!id) return null
  return (
    <Link href={`/exam/${id}`} className="btn btn-secondary w-full">
      Lihat nilai ujianmu <LinkPending />
    </Link>
  )
}
