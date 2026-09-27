'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { clock } from '@/lib/exam'

const REFRESH_MS = 10_000

// Re-render the server page so new participants, scores and violations show up without a reload.
// Skipped while the tab is hidden.
export function AutoRefresh() {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => document.hidden || router.refresh(), REFRESH_MS)
    return () => clearInterval(t)
  }, [router])
  return null
}

// Ticks down to `until` on the server's clock (the admin's device clock may be off).
export function Countdown({ until, serverNow }: Readonly<{ until: number; serverNow: number }>) {
  const [left, setLeft] = useState(until - serverNow)
  useEffect(() => {
    const offset = serverNow - Date.now()
    const t = setInterval(() => setLeft(until - (Date.now() + offset)), 250)
    return () => clearInterval(t)
  }, [until, serverNow])
  return <span className="font-mono font-semibold text-fg">{clock(Math.max(0, left))}</span>
}
