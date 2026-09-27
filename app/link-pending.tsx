'use client'

import { useLinkStatus } from 'next/link'
import { Spinner } from './pending'

// Put inside a <Link>: a fixed-size slot that shows a spinner while that navigation is pending.
export default function LinkPending() {
  const { pending } = useLinkStatus()
  return (
    <span aria-hidden className="inline-flex size-4 shrink-0 items-center justify-center align-middle">
      {pending && <Spinner className="pending-spinner size-3.5" />}
    </span>
  )
}
