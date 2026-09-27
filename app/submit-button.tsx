'use client'

import { useFormStatus } from 'react-dom'
import { PendingLabel } from './pending'

// Submit button for server-action forms: disabled while the action runs, spinner if it takes a while.
// `confirm` asks first (e.g. before deleting) and cancels the submit on "no".
export default function SubmitButton({
  className = '',
  confirm,
  children,
}: Readonly<{ className?: string; confirm?: string; children: React.ReactNode }>) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      onClick={confirm ? (e) => !window.confirm(confirm) && e.preventDefault() : undefined}
      className={`relative ${className}`}
    >
      <PendingLabel pending={pending}>{children}</PendingLabel>
    </button>
  )
}
